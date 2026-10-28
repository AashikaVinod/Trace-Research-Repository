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
  setCrumbs(['Trace', '#/trail'], ...(focus ? [[focus.title]] : []));

  const head = `
    <header class="page-head"><div><h1>Trace</h1>
      <p>Follow a decision back to what people actually did and said, and the photos and notes behind it.</p></div></header>`;

  if (!focus) {
    // Start: one simple question, answered by a list of decisions.
    const decisions = decisionStrength().filter((d) => inProject(byId('design_decision', d.id)));
    view.innerHTML = `${head}
      <section class="card">
        <div class="card-top"><div><h3>What do you want to trace?</h3><p class="card-sub">Pick a decision${projectId ? ` in ${esc(byId('research_project', projectId).title)}` : ''}. To trace anything else, use the “Trace it” button on its page.</p></div></div>
        <ul class="rows">${decisions.map((d) => {
          const sources = trailSources(lineage('design_decision', d.id)).length;
          return `<li><a href="#/trail/design_decision/${d.id}${projectId ? `?project=${projectId}` : ''}" class="stage-design_decision">
            <span class="dot"></span>
            <span class="row-text"><strong>${esc(d.title)}</strong>${meta(esc(byId('research_project', d.project_id).title), plural(d.observations, 'observation'), plural(sources, 'source'))}</span>
            <span class="chev">${icon('chevron-right', 18)}</span></a></li>`;
        }).join('') || '<li class="quiet">No decisions in this project yet.</li>'}</ul>
      </section>`;
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
    </section>`;

  $('#edit-focus').onclick = () => editRecord(focusType, focus);
  drawLines(edges, focusKey);
  new ResizeObserver(() => drawLines(edges, focusKey)).observe($('#trail'));

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
