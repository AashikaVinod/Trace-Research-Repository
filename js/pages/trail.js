// ===================================================================
// Evidence trail: the main flow. Pick a decision (or any record) and
// follow it back to the sources it came from: photos, sketches, notes.
// The lines are drawn from the junction tables and the source links.
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
    // Start: one simple question, answered by a list of decisions.
    const decisions = decisionStrength().filter((d) => inProject(byId('design_decision', d.id)));
    view.innerHTML = `${head}
      <section class="card">
        <div class="card-top"><div><h3>What do you want to trace?</h3><p class="card-sub">Pick a decision to follow it back to the sessions, notes and photos it came from.</p></div></div>
        <ul class="rows">${decisions.map((d) => {
          const sources = trailSources(lineage('design_decision', d.id)).length;
          return `<li><a href="#/trail/design_decision/${d.id}${projectId ? `?project=${projectId}` : ''}" class="stage-design_decision">
            <span class="dot"></span>
            <span class="row-text"><strong>${esc(d.title)}</strong>${meta(esc(byId('research_project', d.project_id).title), plural(d.observations, 'observation'), plural(sources, 'source'))}</span>
            <span class="chev">${icon('chevron-right', 18)}</span></a></li>`;
        }).join('') || '<li class="quiet">No decisions in this project yet.</li>'}</ul>
        <p class="card-note" style="margin-top:12px">Or trace any other record with the picker above.</p>
      </section>
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

  // Column 0: the sources (photos, sketches, notes) the trail rests on.
  const sources = trailSources(trail);
  const edges = [...trail.edges, ...sourceEdges(sources, trail)];
  let columns = `<section class="trail-col" aria-label="Sources">
    <h2 class="trail-head"><i style="background:var(--ink-3)"></i>Sources<span>${sources.length}</span></h2>
    ${sources.map((src) => `<button class="trail-card trail-source" data-key="source:${src.id}" data-open-source="${src.id}">
      <img src="${esc(src.file_url)}" alt=""><strong>${esc(src.title)}</strong></button>`).join('') || '<p class="trail-gap">No sources yet</p>'}
  </section>`;
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
      <span>Traced back to <strong>${plural(sources.length, 'source')}</strong> and <strong>${plural(observations.length, 'observation')}</strong> from ${plural(sessionCount, 'session')}.</span>
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
  drawLines(edges, focusKey);
  new ResizeObserver(() => drawLines(edges, focusKey)).observe($('#trail'));

  function hookPickers() {
    $('#trail-project').value = String(projectId);
    $('#trail-project').onchange = (event) => go('/trail' + (event.target.value ? `?project=${event.target.value}` : ''));
    $('#trail-pick').onchange = (event) => {
      if (event.target.value) go(`/trail/${event.target.value}${projectId ? `?project=${projectId}` : ''}`);
    };
  }
}

// Every source attached to a record in the trail, or to a session its
// observations came from.
function trailSources(trail) {
  const found = [];
  for (const stage of STAGES) {
    for (const record of trail.byStage[stage.type]) found.push(...sourcesFor(stage.type, record.id));
  }
  for (const sessionId of new Set(trail.byStage.observation.map((o) => o.session_id))) {
    found.push(...sourcesFor('research_session', sessionId));
  }
  return [...new Map(found.map((src) => [src.id, src])).values()];
}

// Lines from each source to what it belongs to. A session's source links to
// that session's observations in the trail.
function sourceEdges(sources, trail) {
  const edges = [];
  for (const src of sources) {
    const owner = ownerOf(src);
    if (owner.type === 'research_session') {
      for (const o of trail.byStage.observation.filter((o) => o.session_id === owner.id)) edges.push([`source:${src.id}`, `observation:${o.id}`]);
    } else {
      edges.push([`source:${src.id}`, `${owner.type}:${owner.id}`]);
    }
  }
  return edges;
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
