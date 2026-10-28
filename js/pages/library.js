// Research library: browse, search and filter evidence records; record
// detail with its upstream and downstream links; record forms.
import * as data from '../data-access.js';
import { VOCAB } from '../rules.js';
import { STAGES, STAGE, LINKS, upstreamLinkOf, downstreamLinkOf } from '../evidence.js';
import { replaceQuery } from '../router.js';
import {
  h, icon, button, linkButton, loadingState, errorState, emptyState, formatDate, excerpt, stageBadge,
  statusPill, toneFor, plural, recordHref, trailHref, openDialog, toast, capitalise,
} from '../ui.js';
import { openForm, vocabOptions, toOptions } from '../forms.js';

const DESCRIPTION_LABEL = {
  observation: 'What happened', finding: 'Description', insight: 'Why it matters',
  recommendation: 'What to change', design_decision: 'Rationale',
};
const UPSTREAM_LABEL = {
  finding: 'Supporting observations', insight: 'Supporting findings',
  recommendation: 'Based on insights', design_decision: 'Implements recommendations',
};

/** Type-specific attributes as [label, value, tone] for display. */
function attributes(type, r) {
  switch (type) {
    case 'observation': return [['Sentiment', r.sentiment, toneFor.sentiment[r.sentiment]]];
    case 'finding': return [['Confidence', r.confidence, toneFor.level[r.confidence]]];
    case 'insight': return [['Impact', r.impact, toneFor.level[r.impact]]];
    case 'recommendation': return [['Priority', r.priority, toneFor.level[r.priority]], ['Status', r.status, toneFor.recommendation[r.status]]];
    case 'design_decision': return [['Status', r.status, toneFor.decision[r.status]]];
    default: return [];
  }
}

// ---------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------

export async function openRecordForm(ctx, type, { record = null, projectId = null, sessionId = null, upstreamIds = [] } = {}) {
  let ev;
  try { ev = await data.fetchEvidence(); } catch (e) { toast(e.message, { tone: 'error' }); return null; }
  const stage = STAGE[type];
  const up = upstreamLinkOf(type);
  const ownProject = record?.project_id ?? null;
  const usableProjects = ev.projects.filter((p) => !p.archived_at || p.id === ownProject);
  const fields = [];

  if (type === 'observation') {
    const sessions = ev.sessions
      .filter((s) => usableProjects.some((p) => p.id === s.project_id))
      .filter((s) => !record || s.project_id === ownProject)
      .sort((a, b) => (b.session_date > a.session_date ? 1 : -1));
    fields.push({
      name: 'session_id', label: 'Session', type: 'select', numeric: true,
      options: sessions.map((s) => ({ value: s.id, label: `${s.title} (${ev.projectById.get(s.project_id)?.title})` })),
      help: record ? 'An observation can move only to another session in the same project.' : null,
    });
  } else {
    fields.push({
      name: 'project_id', label: 'Project', type: 'select', numeric: true, disabled: !!record,
      options: toOptions(usableProjects), help: record ? "A record's project can't change after it is created." : null,
    });
  }
  fields.push(
    { name: 'title', label: 'Title', type: 'text' },
    { name: 'description', label: DESCRIPTION_LABEL[type], type: 'textarea', rows: 5 },
  );
  if (type === 'observation') fields.push({ name: 'sentiment', label: 'Sentiment', type: 'select', options: vocabOptions(VOCAB.sentiment) });
  if (type === 'finding') fields.push({ name: 'confidence', label: 'Confidence', type: 'select', options: vocabOptions(VOCAB.level) });
  if (type === 'insight') fields.push({ name: 'impact', label: 'Impact', type: 'select', options: vocabOptions(VOCAB.level) });
  if (type === 'recommendation') {
    fields.push({ name: 'priority', label: 'Priority', type: 'select', half: true, options: vocabOptions(VOCAB.level) },
      { name: 'status', label: 'Status', type: 'select', half: true, options: vocabOptions(VOCAB.recommendation_status) });
  }
  if (type === 'design_decision') {
    fields.push({ name: 'status', label: 'Status', type: 'select', half: true, options: vocabOptions(VOCAB.decision_status) },
      { name: 'decided_on', label: 'Decided on', type: 'date', half: true });
  }
  if (up) {
    const fromStage = STAGE[up.from];
    fields.push({
      name: 'upstream', label: UPSTREAM_LABEL[type], type: 'multi', dependsOn: ['project_id'],
      help: `Only ${fromStage.plural.toLowerCase()} from the same project can be linked.`,
      emptyText: `The selected project has no ${fromStage.plural.toLowerCase()} yet.`,
      options: (v) => ev.records[up.from].filter((r) => r.project_id === v.project_id).map((r) => ({
        value: r.id, label: r.title,
        hint: up.from === 'observation' ? ev.sessionById.get(r.session_id)?.title : excerpt(r.description, 80),
      })),
    });
  }

  const existingUp = record && up ? ev.links[up.table].filter((l) => l[up.toCol] === record.id).map((l) => l[up.fromCol]) : upstreamIds;
  const initial = record
    ? { ...record, upstream: existingUp }
    : { project_id: projectId, session_id: sessionId, sentiment: 'neutral', confidence: 'medium', impact: 'medium', priority: 'medium', status: 'proposed', upstream: upstreamIds };

  const result = await openForm({
    title: record ? `Edit ${stage.label.toLowerCase()}` : `New ${stage.label.toLowerCase()}`,
    table: type,
    initial,
    size: 'lg',
    submitLabel: record ? 'Save changes' : `Create ${stage.label.toLowerCase()}`,
    successMessage: record ? `${stage.label} saved.` : `${stage.label} created.`,
    fields,
    onSubmit: (values) => {
      const { upstream, ...rest } = values;
      return data.saveRecord(type, record?.id ?? null, rest, up ? upstream : undefined);
    },
  });
  if (!result) return null;
  const saved = result.partial ? result.saved : result;
  if (!record && saved?.id) ctx.navigate(`/library/${type}/${saved.id}`);
  else ctx.refresh();
  return saved;
}

/** Asks which kind of record to add, then opens its form. */
export function openNewRecordChooser(ctx, preset = {}) {
  const { close } = openDialog({
    title: 'What are you adding?',
    size: 'sm',
    body: h('div', { class: 'dialog-body choice-grid' }, STAGES.map((s) => h('button', {
      type: 'button', class: 'choice',
      onClick: () => { close(); openRecordForm(ctx, s.type, preset); },
    }, stageBadge(s.type), h('span', { class: 'muted small' }, {
      observation: 'Something seen or heard in a session',
      finding: 'A pattern across observations',
      insight: 'What a finding means',
      recommendation: 'A change the evidence suggests',
      design_decision: 'What the team decided to do',
    }[s.type])))),
  });
}

// ---------------------------------------------------------------------
// List
// ---------------------------------------------------------------------

export async function renderList(ctx) {
  ctx.setContext({ title: 'Research library', crumbs: [{ label: 'Research library' }] });
  ctx.view.replaceChildren(loadingState('Loading research records'));
  let ev;
  try { ev = await data.fetchEvidence(); } catch (e) { if (!ctx.stale()) ctx.view.replaceChildren(errorState(e, ctx.refresh)); return; }
  if (ctx.stale()) return;

  const all = data.flattenRecords(ev).sort((a, b) => (b.created_at > a.created_at ? 1 : b.created_at < a.created_at ? -1 : b.id - a.id));
  const state = {
    q: ctx.query.q || '',
    type: STAGE[ctx.query.type] ? ctx.query.type : '',
    project: ctx.query.project ? Number(ctx.query.project) : '',
  };
  document.getElementById('global-q').value = state.q;

  const search = h('input', { type: 'search', class: 'input search-input', placeholder: 'Search titles and text', 'aria-label': 'Search research records', value: state.q });
  const project = h('select', { class: 'input', 'aria-label': 'Filter by project' },
    h('option', { value: '' }, 'All projects'),
    ev.projects.map((p) => h('option', { value: String(p.id) }, p.archived_at ? `${p.title} (archived)` : p.title)));
  project.value = String(state.project);
  const typeButtons = [{ type: '', label: 'All' }, ...STAGES.map((s) => ({ type: s.type, label: s.plural }))].map((t) => h('button', {
    type: 'button', 'aria-pressed': String(state.type === t.type), dataset: { type: t.type },
    onClick: () => { state.type = t.type; draw(); },
  }, t.label));
  const segmented = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Filter by record type' }, typeButtons);
  const count = h('span', { class: 'result-count', 'aria-live': 'polite' });
  const results = h('div', {});
  const newBtn = button('New record', { icon: 'plus', variant: 'primary' });
  newBtn.addEventListener('click', ctx.guard(() => {
    const preset = { projectId: state.project || null };
    if (state.type) openRecordForm(ctx, state.type, preset); else openNewRecordChooser(ctx, preset);
  }));

  function row(r) {
    const proj = ev.projectById.get(r.project_id);
    const session = r.type === 'observation' ? ev.sessionById.get(r.session_id) : null;
    const isFirst = r.type === 'observation';
    const isLast = r.type === 'design_decision';
    return h('article', { class: 'record-row' },
      h('div', { class: 'stage-cell' }, stageBadge(r.type)),
      h('div', { class: 'record-main' },
        h('a', { class: 'record-title', href: recordHref(r.type, r.id) }, r.title),
        h('p', { class: 'record-text' }, excerpt(r.description, 190)),
        h('div', { class: 'record-meta' },
          proj ? h('a', { href: `#/projects/${proj.id}` }, proj.title) : null,
          session ? h('a', { href: `#/sessions/${session.id}` }, session.title) : null,
          ...attributes(r.type, r).map(([label, value]) => h('span', {}, `${label}: ${value}`)))),
      h('div', { class: 'record-links' },
        isFirst ? null : (r.upCount ? h('span', {}, `${r.upCount} supporting`) : h('span', { class: 'gap-note' }, 'No supporting evidence')),
        isLast ? null : (r.downCount ? h('span', {}, `Feeds ${r.downCount} ${STAGE[downstreamLinkOf(r.type).to].label.toLowerCase()}${r.downCount === 1 ? '' : 's'}`) : h('span', {}, 'Not used yet')),
        h('a', { href: trailHref(r.type, r.id), class: 'small' }, 'Trace')));
  }

  function draw() {
    for (const b of typeButtons) b.setAttribute('aria-pressed', String(b.dataset.type === state.type));
    const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = all.filter((r) => (!state.type || r.type === state.type)
      && (!state.project || r.project_id === state.project)
      && terms.every((t) => `${r.title} ${r.description}`.toLowerCase().includes(t)));
    count.textContent = plural(list.length, 'record');
    replaceQuery({ q: state.q, type: state.type, project: state.project });
    if (!all.length) {
      results.replaceChildren(emptyState({ title: 'The library is empty', body: 'Record an observation in a session to start building evidence.' }));
    } else if (!list.length) {
      results.replaceChildren(emptyState({
        title: 'No records match',
        body: state.q ? `Nothing contains “${state.q}” with the current filters.` : 'Try another project or record type.',
        action: button('Clear filters', { onClick: () => { state.q = ''; state.type = ''; state.project = ''; search.value = ''; project.value = ''; document.getElementById('global-q').value = ''; draw(); } }),
      }));
    } else {
      results.replaceChildren(h('div', { class: 'records' }, list.map(row)));
    }
  }

  let timer;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { state.q = search.value; draw(); }, 120); });
  project.addEventListener('change', () => { state.project = project.value ? Number(project.value) : ''; draw(); });

  ctx.view.replaceChildren(
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, 'Research library'), h('p', { class: 'page-sub' }, 'Every observation, finding, insight, recommendation and design decision, searchable in one place.')),
      h('div', { class: 'page-actions' }, newBtn)),
    h('div', { class: 'toolbar' }, search, project, count),
    h('div', { class: 'toolbar' }, segmented),
    results);
  draw();
}

// ---------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------

function linkedList(items, emptyContent) {
  if (!items.length) return h('div', { class: 'linked-empty' }, emptyContent);
  return h('div', { class: 'linked' }, items.map((r) => h('a', { class: `linked-item stage-${r.type}`, href: recordHref(r.type, r.id) },
    stageBadge(r.type, { withStep: false }), h('span', { class: 'linked-item-title' }, r.title), h('span', { class: 'list-item-text small' }, excerpt(r.description, 110)))));
}

export async function renderDetail(ctx) {
  const { type } = ctx.params;
  const id = Number(ctx.params.id);
  const stage = STAGE[type];
  const crumbsBase = [{ label: 'Research library', href: '#/library' }];
  if (!stage) {
    ctx.setContext({ title: 'Not found', crumbs: [...crumbsBase, { label: 'Not found' }] });
    ctx.view.replaceChildren(emptyState({ title: 'Unknown record type', body: `“${type}” is not a TRACE record type.`, action: linkButton('Back to the library', '#/library') }));
    return;
  }
  ctx.setContext({ title: stage.label, crumbs: [...crumbsBase, { label: stage.plural, href: `#/library?type=${type}` }, { label: 'Loading…' }] });
  ctx.view.replaceChildren(loadingState(`Loading ${stage.label.toLowerCase()}`));
  let d;
  try { d = await data.fetchRecord(type, id); } catch (e) { if (!ctx.stale()) ctx.view.replaceChildren(errorState(e, ctx.refresh)); return; }
  if (ctx.stale()) return;
  if (!d) {
    ctx.setContext({ title: 'Not found', crumbs: [...crumbsBase, { label: 'Not found' }] });
    ctx.view.replaceChildren(emptyState({ title: `${stage.label} not found`, body: `There is no ${stage.label.toLowerCase()} with id ${ctx.params.id}.`, action: linkButton('Back to the library', '#/library') }));
    return;
  }
  const r = d.record;
  const archived = !!d.project?.archived_at;
  ctx.setContext({ title: r.title, crumbs: [...crumbsBase, { label: stage.plural, href: `#/library?type=${type}` }, { label: r.title }] });

  const up = upstreamLinkOf(type);
  const down = downstreamLinkOf(type);
  const nextStage = down ? STAGE[down.to] : null;

  const head = h('header', { class: 'detail-head' },
    h('div', { class: 'pills' }, stageBadge(type), ...attributes(type, r).map(([, v, tone]) => statusPill(v, tone))),
    h('h1', {}, r.title),
    h('div', { class: 'page-actions' },
      button(`Edit ${stage.label.toLowerCase()}`, { icon: 'pencil', onClick: ctx.guard(() => openRecordForm(ctx, type, { record: r })) }),
      linkButton('Open in evidence trail', trailHref(type, id), { icon: 'waypoints', variant: 'ghost' })));

  const upstreamSection = up ? h('section', { class: 'section', 'aria-labelledby': 'up-h' },
    h('div', { class: 'section-head' }, h('h2', { id: 'up-h' }, `Built on (${d.upstream.length})`), h('p', {}, UPSTREAM_LABEL[type])),
    linkedList(d.upstream, [h('p', {}, `No ${STAGE[up.from].plural.toLowerCase()} support this ${stage.label.toLowerCase()} yet.`),
      button(`Link ${STAGE[up.from].plural.toLowerCase()}`, { icon: 'link-2', size: 'sm', onClick: ctx.guard(() => openRecordForm(ctx, type, { record: r })) })])) : null;

  const downstreamSection = down ? h('section', { class: 'section', 'aria-labelledby': 'down-h' },
    h('div', { class: 'section-head' }, h('h2', { id: 'down-h' }, `Leads to (${d.downstream.length})`), h('p', {}, nextStage.plural)),
    linkedList(d.downstream, [h('p', {}, `No ${nextStage.label.toLowerCase()} builds on this yet.`),
      archived ? h('p', { class: 'muted small' }, 'The project is archived, so nothing new can be added.')
        : button(`Add ${nextStage.label.toLowerCase()} based on this`, { icon: 'plus', size: 'sm', onClick: ctx.guard(() => openRecordForm(ctx, nextStage.type, { projectId: r.project_id, upstreamIds: [r.id] })) })]),
    d.downstream.length && !archived ? button(`Add another ${nextStage.label.toLowerCase()}`, { icon: 'plus', variant: 'ghost', size: 'sm', style: 'margin-top:8px', onClick: ctx.guard(() => openRecordForm(ctx, nextStage.type, { projectId: r.project_id, upstreamIds: [r.id] })) }) : null)
    : null;

  const meta = h('dl', { class: 'meta' },
    h('div', {}, h('dt', {}, 'Project'), h('dd', {}, d.project ? h('a', { href: `#/projects/${d.project.id}` }, d.project.title) : '—')),
    d.session ? h('div', {}, h('dt', {}, 'Session'), h('dd', {}, h('a', { href: `#/sessions/${d.session.id}` }, d.session.title), h('div', { class: 'muted' }, formatDate(d.session.session_date)))) : null,
    ...attributes(type, r).map(([label, value]) => h('div', {}, h('dt', {}, label), h('dd', {}, capitalise(value)))),
    type === 'design_decision' ? h('div', {}, h('dt', {}, 'Decided on'), h('dd', {}, r.decided_on ? formatDate(r.decided_on) : 'Not decided yet')) : null,
    h('div', {}, h('dt', {}, 'Created'), h('dd', {}, formatDate(r.created_at))),
    h('div', {}, h('dt', {}, 'Last updated'), h('dd', {}, formatDate(r.updated_at))),
    h('div', {}, h('dt', {}, 'Record id'), h('dd', {}, `${type} #${r.id}`)));

  ctx.view.replaceChildren(head,
    h('div', { class: 'detail-layout' },
      h('div', {}, h('p', { class: 'muted small' }, DESCRIPTION_LABEL[type]), h('p', { class: 'lede' }, r.description), upstreamSection, downstreamSection),
      h('aside', {}, meta)));
}
