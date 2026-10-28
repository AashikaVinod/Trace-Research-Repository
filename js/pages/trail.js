// ===================================================================
// Evidence trail: pick a record and see everything it rests on and
// everything built on it. The lines are drawn from the junction tables.
// ===================================================================

function pageTrail(params, query) {
  const projectId = query.project ? Number(query.project) : '';
  const inProject = (r) => !projectId || r.project_id === projectId;
  const focusType = params.type;
  const focus = focusType && STAGE[focusType] ? byId(focusType, Number(params.id)) : null;
  setCrumbs(['Evidence trail', '#/trail'], ...(focus ? [[focus.title]] : []));

  let options = '';
  for (const stage of STAGES) {
    options += `<optgroup label="${stage.plural}">`;
    for (const r of data[stage.type].filter(inProject)) options += `<option value="${stage.type}/${r.id}">${esc(r.title)}</option>`;
    options += '</optgroup>';
  }

  const head = `
    <header class="page-head"><div><h1>Evidence trail</h1>
      <p>Follow any record back to what people actually did and said, and forward to the decisions it shaped.</p></div></header>
    <div class="toolbar">
      <label class="sr" for="trail-project">Project</label>
      <select class="input" id="trail-project"><option value="">All projects</option>
        ${data.research_project.map((p) => `<option value="${p.id}">${esc(p.title)}</option>`).join('')}</select>
      <label class="sr" for="trail-pick">Record to trace</label>
      <select class="input grow" id="trail-pick"><option value="">Choose a record to trace…</option>${options}</select>
    </div>`;

  const panel = dbPanel(['WITH RECURSIVE (CTE)', 'UNION ALL', 'View', 'Graph traversal'], `
-- 1. A view turns the four junction tables into one list of edges
create view v_evidence_edge as
  select 'observation' as from_type, observation_id as from_id, 'finding' as to_type, finding_id as to_id from observation_finding
  union all select 'finding', finding_id, 'insight', insight_id from finding_insight
  union all select 'insight', insight_id, 'recommendation', recommendation_id from insight_recommendation
  union all select 'recommendation', recommendation_id, 'design_decision', decision_id from recommendation_decision;

-- 2. A recursive query walks the edges upstream, step by step
with recursive up as (
  select from_type, from_id, 1 as depth from v_evidence_edge where to_type = 'design_decision' and to_id = 1
  union
  select e.from_type, e.from_id, up.depth + 1 from v_evidence_edge e join up on e.to_type = up.from_type and e.to_id = up.from_id
)
select * from up;

-- Try it live: select * from trace_lineage('design_decision', 1);`);

  if (!focus) {
    const decisions = decisionStrength().filter((d) => inProject(byId('design_decision', d.id)));
    const counts = stageCounts(projectId || null);
    view.innerHTML = `${head}
      <div class="grid-main">
        <section class="card"><div class="card-top"><h3>From observation to decision</h3></div>
          <p class="card-note">How many records reach each step. Click a step to see them.</p>
          ${funnelChart(counts, projectId ? `&project=${projectId}` : '')}</section>
        <section class="card"><div class="card-top"><h3>Evidence health</h3></div>
          <div class="rings">
            ${ringStat(completeTrailPercent(), 'var(--ins)', 'Decisions with full evidence', 'Traced back to an observation')}
            ${ringStat(linkedPercent('finding'), 'var(--find)', 'Findings explained', 'Lead to an insight')}
          </div></section>
      </div>
      <div class="grid-2 row-gap">
        <section class="card"><div class="card-top"><h3>Strongest decisions</h3></div>
          <p class="card-note">Ranked by the number of observations behind them. Click one to see its story.</p>
          ${barChart(decisions.slice(0, 6).map((d) => ({ label: shorten(d.title, 44), value: d.observations, stage: 'design_decision', href: `#/trail/design_decision/${d.id}` })))}
        </section>
        <section class="card"><div class="card-top"><h3>Gaps to close</h3></div>
          <ul class="rows">${STAGES.slice(0, 4).map((stage) => {
            const unused = data[stage.type].filter(inProject).filter((r) => downstream(stage.type, r.id).length === 0);
            return `<li><a href="${unused[0] ? `#/trail/${stage.type}/${unused[0].id}` : '#/trail'}" class="stage-${stage.type}">
              <span class="dot"></span>
              <span class="row-text"><strong>${unused.length} ${stage.plural.toLowerCase()} not used yet</strong>${meta(unused.length ? esc(shorten(unused[0].title, 60)) : 'All connected')}</span>
              <span class="chev">${icon('chevron-right', 18)}</span></a></li>`;
          }).join('')}</ul>
        </section>
      </div>
      ${panel}`;
    hookPickers();
    return;
  }

  const trail = lineage(focusType, focus.id);
  const focusKey = `${focusType}:${focus.id}`;
  const step = STAGE[focusType].step;
  const missing = STAGES.filter((s) => trail.byStage[s.type].length === 0);
  const observations = trail.byStage.observation;
  const sessionCount = new Set(observations.map((o) => o.session_id)).size;

  let columns = '';
  for (const stage of STAGES) {
    const cards = trail.byStage[stage.type].map((r) => {
      const isFocus = `${stage.type}:${r.id}` === focusKey;
      return `<a class="trail-card stage-${stage.type} ${isFocus ? 'is-focus' : ''}" data-key="${stage.type}:${r.id}"
        href="#/trail/${stage.type}/${r.id}${projectId ? `?project=${projectId}` : ''}" ${isFocus ? 'aria-current="true"' : ''}>
        <strong>${esc(r.title)}</strong></a>`;
    }).join('');
    columns += `<section class="trail-col" aria-label="${stage.plural}">
      <h2 class="trail-head stage-${stage.type}"><i></i>${stage.plural}<span>${trail.byStage[stage.type].length}</span></h2>
      ${cards || '<p class="trail-gap">None yet</p>'}
    </section>`;
  }

  view.innerHTML = `${head}
    <div class="trail-summary" aria-live="polite">
      ${missing.length ? pill('incomplete story', 'orange') : pill('complete story', 'green')}
      ${focusType !== 'observation' ? `<span>Rests on <strong>${plural(observations.length, 'observation')}</strong> from ${plural(sessionCount, 'session')}.</span>` : ''}
      ${missing.map((s) => `<span class="gap">No ${s.label.toLowerCase()} ${s.step < step ? 'behind' : 'built on'} this yet.</span>`).join('')}
    </div>
    <div class="trail-scroll"><div class="trail" id="trail"><svg class="trail-lines" id="lines" aria-hidden="true"></svg>${columns}</div></div>
    <section class="card focus-card stage-${focusType}">
      <span class="doc-type"><b>${step}</b>${STAGE[focusType].label}</span>
      <h2>${esc(focus.title)}</h2>
      <p class="paper-text">${esc(focus.description)}</p>
      <div class="actions">
        <a class="btn" href="#/record/${focusType}/${focus.id}">${icon('eye', 15)} Open record</a>
        <button class="btn" id="edit-focus">${icon('pencil', 15)} Edit and link</button>
      </div>
    </section>
    ${panel}`;

  $('#trail-pick').value = `${focusType}/${focus.id}`;
  $('#edit-focus').onclick = () => editRecord(focusType, focus);
  hookPickers();
  drawLines(trail.edges, focusKey);
  new ResizeObserver(() => drawLines(trail.edges, focusKey)).observe($('#trail'));

  function hookPickers() {
    $('#trail-project').value = String(projectId);
    $('#trail-project').onchange = (event) => go('/trail' + (event.target.value ? `?project=${event.target.value}` : ''));
    $('#trail-pick').onchange = (event) => {
      if (event.target.value) go(`/trail/${event.target.value}${projectId ? `?project=${projectId}` : ''}`);
    };
  }
}

// Draws a curved line from each card to the cards it links to.
function drawLines(edges, focusKey) {
  const board = $('#trail');
  const svg = $('#lines');
  if (!board || !svg) return;
  const box = board.getBoundingClientRect();
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  let paths = '';
  for (const [from, to] of edges) {
    const start = board.querySelector(`[data-key="${from}"]`);
    const end = board.querySelector(`[data-key="${to}"]`);
    if (!start || !end) continue;
    const a = start.getBoundingClientRect();
    const b = end.getBoundingClientRect();
    const x1 = a.right - box.left;
    const y1 = a.top + a.height / 2 - box.top;
    const x2 = b.left - box.left;
    const y2 = b.top + b.height / 2 - box.top;
    const middle = (x1 + x2) / 2;
    const strong = from === focusKey || to === focusKey ? 'class="strong"' : '';
    paths += `<path ${strong} d="M${x1},${y1} C${middle},${y1} ${middle},${y2} ${x2},${y2}"/>`;
  }
  svg.innerHTML = paths;
}
