// Evidence trail: the lineage of any record, drawn from the database's
// link tables. Click any card to re-centre the trail on it; the browser's
// back button steps back through the records you visited.
import * as data from '../data-access.js';
import { STAGES, STAGE, buildGraph, lineage, isCompleteChain, nodeKey, upstreamLinkOf, downstreamLinkOf } from '../evidence.js';
import { navigate } from '../router.js';
import { h, icon, button, linkButton, loadingState, errorState, emptyState, excerpt, stageBadge, statusPill, plural, recordHref, trailHref, formatDate } from '../ui.js';
import { openRecordForm } from './library.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function cardMeta(n, ev) {
  const r = n.record;
  switch (n.type) {
    case 'observation': return ev.sessionById.get(r.session_id)?.title || '';
    case 'finding': return `${r.confidence} confidence`;
    case 'insight': return `${r.impact} impact`;
    case 'recommendation': return `${r.priority} priority, ${r.status}`;
    case 'design_decision': return r.decided_on ? `${r.status}, ${formatDate(r.decided_on)}` : r.status;
    default: return '';
  }
}

function chainStrip(lin) {
  return h('span', { class: 'chain-strip', 'aria-hidden': 'true' },
    STAGES.map((s) => h('i', { class: `s${s.step}${lin.byStage[s.type].length ? ' on' : ''}` })));
}

function drawLines(board, svg, edges, focusKey) {
  const box = board.getBoundingClientRect();
  svg.setAttribute('viewBox', `0 0 ${Math.max(box.width, 1)} ${Math.max(box.height, 1)}`);
  svg.replaceChildren();
  for (const e of edges) {
    const a = board.querySelector(`[data-key="${e.from}"]`);
    const b = board.querySelector(`[data-key="${e.to}"]`);
    if (!a || !b) continue;
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const x1 = ra.right - box.left; const y1 = ra.top + ra.height / 2 - box.top;
    const x2 = rb.left - box.left; const y2 = rb.top + rb.height / 2 - box.top;
    const dx = Math.max((x2 - x1) / 2, 12);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`);
    if (e.from === focusKey || e.to === focusKey) path.setAttribute('class', 'is-direct');
    svg.append(path);
  }
}

function picker(ev, projectFilter, current) {
  const select = h('select', { class: 'input picker', id: 'trail-picker' },
    h('option', { value: '' }, 'Choose a record to trace…'),
    STAGES.map((s) => h('optgroup', { label: s.plural },
      ev.records[s.type]
        .filter((r) => !projectFilter || r.project_id === projectFilter)
        .map((r) => h('option', { value: nodeKey(s.type, r.id) }, r.title)))));
  select.value = current || '';
  select.addEventListener('change', () => {
    if (!select.value) return;
    const [type, id] = select.value.split(':');
    navigate(`/trail/${type}/${id}`, { project: projectFilter || '' });
  });
  return select;
}

function startView(ev, graph, projectFilter) {
  const inScope = (r) => !projectFilter || r.project_id === projectFilter;
  const complete = ev.records.design_decision.filter(inScope)
    .map((d) => ({ d, lin: lineage(graph, 'design_decision', d.id) }))
    .filter((x) => isCompleteChain(x.lin));

  const gaps = [
    { type: 'observation', text: 'observations not used by any finding' },
    { type: 'finding', text: 'findings without an insight' },
    { type: 'insight', text: 'insights without a recommendation' },
    { type: 'recommendation', text: 'recommendations without a decision' },
  ].map((g) => ({
    ...g,
    items: ev.records[g.type].filter(inScope).filter((r) => graph.nodes.get(nodeKey(g.type, r.id)).down.length === 0),
  }));
  const orphanDecisions = ev.records.design_decision.filter(inScope).filter((r) => graph.nodes.get(nodeKey('design_decision', r.id)).up.length === 0);

  return h('div', { class: 'trail-start' },
    h('section', { 'aria-labelledby': 'cc-h' },
      h('div', { class: 'section-head' }, h('h2', { id: 'cc-h' }, 'Decisions with a complete trail'), h('p', {}, 'Traced back to observations')),
      complete.length ? h('div', { class: 'panel list' }, complete.map(({ d, lin }) => h('a', { class: 'list-item', href: trailHref('design_decision', d.id) },
        h('span', { class: 'list-item-title' }, d.title),
        h('span', { class: 'list-item-meta' }, chainStrip(lin),
          h('span', {}, `${plural(lin.byStage.observation.length, 'observation')} behind it`),
          h('span', {}, ev.projectById.get(d.project_id)?.title || '')))))
        : emptyState({ title: 'No complete trails yet', body: 'Link a design decision back through a recommendation, insight and finding to an observation.' })),
    h('section', { 'aria-labelledby': 'gp-h' },
      h('div', { class: 'section-head' }, h('h2', { id: 'gp-h' }, 'Gaps in the evidence'), h('p', {}, 'Records nothing builds on yet')),
      h('div', { class: 'panel list' },
        gaps.map((g) => h('div', { class: 'list-item' },
          h('span', { class: 'list-item-title' }, stageBadge(g.type, { withStep: false }), `${g.items.length} ${g.text}`),
          g.items.length ? h('span', { class: 'list-item-meta' }, g.items.slice(0, 3).map((r) => h('a', { href: trailHref(g.type, r.id) }, excerpt(r.title, 48))),
            g.items.length > 3 ? h('span', {}, `and ${g.items.length - 3} more`) : null) : null)),
        h('div', { class: 'list-item' },
          h('span', { class: 'list-item-title' }, stageBadge('design_decision', { withStep: false }), `${orphanDecisions.length} decisions with no recommendation behind them`)))));
}

export async function render(ctx) {
  const type = ctx.params.type || null;
  const id = ctx.params.id ? Number(ctx.params.id) : null;
  ctx.setContext({ title: 'Evidence trail', crumbs: [{ label: 'Evidence trail' }] });
  ctx.view.replaceChildren(loadingState('Loading the evidence trail'));
  let ev;
  try { ev = await data.fetchEvidence(); } catch (e) { if (!ctx.stale()) ctx.view.replaceChildren(errorState(e, ctx.refresh)); return; }
  if (ctx.stale()) return;

  const graph = buildGraph(ev.records, ev.links);
  const projectFilter = ctx.query.project ? Number(ctx.query.project) : null;
  const projectSelect = h('select', { class: 'input', id: 'trail-project' },
    h('option', { value: '' }, 'All projects'), ev.projects.map((p) => h('option', { value: String(p.id) }, p.archived_at ? `${p.title} (archived)` : p.title)));
  projectSelect.value = projectFilter ? String(projectFilter) : '';
  projectSelect.addEventListener('change', () => navigate('/trail', { project: projectSelect.value }));

  const controls = h('div', { class: 'trail-controls' },
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'trail-project' }, 'Project'), projectSelect),
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'trail-picker' }, 'Trace a record'), picker(ev, projectFilter, type && id ? nodeKey(type, id) : '')));

  const head = h('div', { class: 'page-head' },
    h('div', {}, h('h1', {}, 'Evidence trail'),
      h('p', { class: 'page-sub' }, 'Follow any record back to the observations it rests on, and forward to the decisions it shaped.')));

  if (!type) {
    ctx.view.replaceChildren(head, controls, startView(ev, graph, projectFilter));
    return;
  }

  const lin = STAGE[type] ? lineage(graph, type, id) : null;
  if (!lin) {
    ctx.view.replaceChildren(head, controls, emptyState({ title: 'Record not found', body: `There is no ${STAGE[type]?.label.toLowerCase() || 'record'} with id ${ctx.params.id}.`, action: linkButton('Start again', '#/trail') }));
    return;
  }
  const focus = lin.focus;
  const focusKey = nodeKey(type, id);
  ctx.setContext({ title: `Trail: ${focus.record.title}`, crumbs: [{ label: 'Evidence trail', href: '#/trail' }, { label: focus.record.title }] });

  // Summary of the lineage
  const obs = lin.byStage.observation;
  const sessions = new Set(obs.map((n) => n.record.session_id));
  const focusStep = STAGE[type].step;
  const missingBefore = STAGES.filter((s) => s.step < focusStep && lin.byStage[s.type].length === 0).pop();
  const missingAfter = STAGES.find((s) => s.step > focusStep && lin.byStage[s.type].length === 0);
  const summary = h('div', { class: 'trail-summary', 'aria-live': 'polite' },
    isCompleteChain(lin) ? statusPill('complete trail', 'mint') : statusPill('incomplete trail', 'orange'),
    type !== 'observation' ? h('span', {}, 'Rests on ', h('strong', {}, plural(obs.length, 'observation')), ` from ${plural(sessions.size, 'session')}.`) : null,
    type !== 'design_decision' ? h('span', {}, 'Shaped ', h('strong', {}, plural(lin.byStage.design_decision.length, 'design decision')), '.') : null,
    missingBefore ? h('span', { class: 'gap-note' }, `No ${missingBefore.label.toLowerCase()} supports this yet.`) : null,
    missingAfter ? h('span', { class: 'gap-note' }, `No ${missingAfter.label.toLowerCase()} builds on this yet.`) : null);

  // Board
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'trail-lines');
  svg.setAttribute('aria-hidden', 'true');
  const board = h('div', { class: 'trail-board', role: 'list', 'aria-label': 'Evidence lineage, from observations to design decisions' });
  board.append(svg);
  for (const s of STAGES) {
    const nodes = lin.byStage[s.type];
    const gapText = s.step < focusStep ? `No ${s.plural.toLowerCase()} behind this` : `No ${s.plural.toLowerCase()} built on this yet`;
    board.append(h('section', { class: `trail-col stage-${s.type}`, role: 'listitem', 'aria-label': `${s.plural}: ${nodes.length}` },
      h('h2', { class: 'trail-col-head' }, h('span', {}, `${s.step}. ${s.plural}`), h('span', { class: 'count' }, String(nodes.length))),
      nodes.length ? nodes.map((n) => {
        const isFocus = nodeKey(n.type, n.id) === focusKey;
        return h('a', {
          class: `trail-card stage-${n.type}${isFocus ? ' is-focus' : ''}`, href: trailHref(n.type, n.id),
          dataset: { key: nodeKey(n.type, n.id) }, 'aria-current': isFocus ? 'true' : null,
          'aria-label': `${STAGE[n.type].label}: ${n.record.title}${isFocus ? ' (selected)' : ''}`,
        },
        h('span', { class: 'trail-card-title' }, n.record.title),
        h('span', { class: 'trail-card-meta' }, cardMeta(n, ev)),
        h('span', { class: 'trail-card-links' }, [n.type !== 'observation' ? `Supported by ${n.up.length}` : null, n.type !== 'design_decision' ? `Feeds ${n.down.length}` : null].filter(Boolean).join('. ')));
      }) : h('p', { class: 'trail-gap' }, gapText)));
  }

  // Focused record details
  const r = focus.record;
  const down = downstreamLinkOf(type);
  const archived = !!ev.projectById.get(r.project_id)?.archived_at;
  const focusPanel = h('section', { class: `trail-focus stage-${type}`, 'aria-labelledby': 'focus-h' },
    h('div', {},
      stageBadge(type),
      h('h2', { id: 'focus-h' }, r.title),
      h('p', { class: 'prose' }, r.description),
      h('p', { class: 'muted small', style: 'margin-top:8px' }, ev.projectById.get(r.project_id)?.title || '')),
    h('div', { class: 'stack', style: 'align-content:start' },
      linkButton('Open record', recordHref(type, id), { icon: 'eye' }),
      button('Edit and link', { icon: 'pencil', onClick: ctx.guard(() => openRecordForm(ctx, type, { record: r })) }),
      down && !archived ? button(`Add ${STAGE[down.to].label.toLowerCase()}`, { icon: 'plus', variant: 'ghost',
        onClick: ctx.guard(() => openRecordForm(ctx, down.to, { projectId: r.project_id, upstreamIds: [id] })) }) : null));

  ctx.view.replaceChildren(head, controls, summary, h('div', { class: 'trail-scroll' }, board), focusPanel);

  const redraw = () => drawLines(board, svg, lin.edges, focusKey);
  requestAnimationFrame(redraw);
  document.fonts?.ready.then(() => { if (!ctx.stale()) redraw(); });
  const ro = new ResizeObserver(() => redraw());
  ro.observe(board);
  ctx.onLeave(() => ro.disconnect());
}
