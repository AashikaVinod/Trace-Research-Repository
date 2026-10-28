// Evidence trail: pick a record and see everything it rests on and leads to.
// Lines between cards are drawn from the junction tables (real links).

function pageTrail(params, query) {
  const projectId = query.project ? Number(query.project) : '';
  const inProject = (r) => !projectId || r.project_id === projectId;
  const focusType = params.type;
  const focus = focusType && STAGE[focusType] ? byId(focusType, Number(params.id)) : null;
  setCrumbs(['Evidence trail', '#/trail'], ...(focus ? [[focus.title]] : []));

  const picker = `
    <div class="toolbar">
      <select class="input" id="trail-project" aria-label="Project">
        <option value="">All projects</option>
        ${data.research_project.map((p) => `<option value="${p.id}">${esc(p.title)}</option>`).join('')}
      </select>
      <select class="input grow" id="trail-pick" aria-label="Record to trace">
        <option value="">Choose a record to trace…</option>
        ${STAGES.map((s) => `<optgroup label="${s.plural}">${data[s.type].filter(inProject).map((r) => `<option value="${s.type}/${r.id}">${esc(r.title)}</option>`).join('')}</optgroup>`).join('')}
      </select>
    </div>`;

  const head = `<header class="page-head"><div><h1>Evidence trail</h1>
    <p>Follow any record back to what people actually did and said, and forward to the decisions it shaped.</p></div></header>`;

  if (!focus) {
    // Start screen: complete stories and gaps.
    const complete = data.design_decision.filter(inProject)
      .map((d) => ({ d, trail: lineage('design_decision', d.id) }))
      .filter(({ trail }) => STAGES.every((s) => trail.byStage[s.type].length));
    const gaps = STAGES.slice(0, 4).map((s) => ({ s, items: data[s.type].filter(inProject).filter((r) => !downstream(s.type, r.id).length) }));
    view.innerHTML = `${head}${picker}
      <div class="two-col">
        <section class="card"><div class="card-top"><h3>Decisions with the full story</h3></div>
          ${complete.length ? `<ul class="rows">${complete.map(({ d, trail }) => `<li><a href="#/trail/design_decision/${d.id}">
            <span class="dot stage-design_decision"></span>
            <span><strong>${esc(d.title)}</strong><small>${plural(trail.byStage.observation.length, 'observation')} behind it</small></span>
            ${icon('chevron-right', 16)}</a></li>`).join('')}</ul>` : '<p class="muted pad">No decision is linked all the way back to observations yet.</p>'}
        </section>
        <section class="card"><div class="card-top"><h3>Gaps in the evidence</h3></div>
          <ul class="rows">${gaps.map(({ s, items }) => `<li><a href="${items[0] ? `#/trail/${s.type}/${items[0].id}` : '#/trail'}">
            <span class="dot stage-${s.type}"></span>
            <span><strong>${items.length} ${s.plural.toLowerCase()} not used yet</strong><small>${items.length ? esc(shorten(items.map((i) => i.title).join(', '), 90)) : 'All connected'}</small></span></a></li>`).join('')}</ul>
        </section>
      </div>`;
    hookPicker();
    return;
  }

  const trail = lineage(focusType, focus.id);
  const focusKey = `${focusType}:${focus.id}`;
  const step = STAGE[focusType].step;
  const missing = STAGES.filter((s) => !trail.byStage[s.type].length);
  const observations = trail.byStage.observation;

  view.innerHTML = `${head}${picker}
    <div class="trail-summary">
      ${missing.length ? pill('incomplete story', 'orange') : pill('complete story', 'green')}
      ${focusType !== 'observation' ? `<span>Rests on <strong>${plural(observations.length, 'observation')}</strong> from ${plural(new Set(observations.map((o) => o.session_id)).size, 'session')}.</span>` : ''}
      ${missing.map((s) => `<span class="gap">No ${s.label.toLowerCase()} ${s.step < step ? 'behind' : 'built on'} this yet.</span>`).join('')}
    </div>
    <div class="trail-scroll">
      <div class="trail" id="trail">
        <svg class="trail-lines" id="lines" aria-hidden="true"></svg>
        ${STAGES.map((s) => `<section class="trail-col">
          <h2 class="trail-head stage-${s.type}"><i></i>${s.plural}<span>${trail.byStage[s.type].length}</span></h2>
          ${trail.byStage[s.type].map((r) => `<a class="trail-card stage-${s.type} ${`${s.type}:${r.id}` === focusKey ? 'is-focus' : ''}"
              href="#/trail/${s.type}/${r.id}${projectId ? `?project=${projectId}` : ''}" data-key="${s.type}:${r.id}">
              <strong>${esc(r.title)}</strong><small>${esc(shorten(r.description, 70))}</small></a>`).join('')
            || `<p class="trail-gap">None yet</p>`}
        </section>`).join('')}
      </div>
    </div>
    <section class="card focus-card stage-${focusType}">
      <span class="doc-type"><b>${step}</b>${STAGE[focusType].label}</span>
      <h2>${esc(focus.title)}</h2>
      <p class="paper-text">${esc(focus.description)}</p>
      <div class="actions">
        <a class="btn" href="#/record/${focusType}/${focus.id}">${icon('eye', 15)} Open record</a>
        <button class="btn" id="edit-focus">${icon('pencil', 15)} Edit and link</button>
      </div>
    </section>`;

  $('#trail-pick').value = `${focusType}/${focus.id}`;
  $('#edit-focus').onclick = () => editRecord(focusType, focus);
  hookPicker();
  drawLines(trail.edges, focusKey);
  new ResizeObserver(() => drawLines(trail.edges, focusKey)).observe($('#trail'));

  function hookPicker() {
    $('#trail-project').value = String(projectId);
    $('#trail-project').onchange = (e) => go('/trail' + (e.target.value ? `?project=${e.target.value}` : ''));
    $('#trail-pick').onchange = (e) => { if (e.target.value) go(`/trail/${e.target.value}${projectId ? `?project=${projectId}` : ''}`); };
  }
}

// Draws a curved line from each card to the cards it links to.
function drawLines(edges, focusKey) {
  const board = $('#trail');
  const svg = $('#lines');
  if (!board || !svg) return;
  const box = board.getBoundingClientRect();
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  svg.innerHTML = edges.map(([from, to]) => {
    const a = board.querySelector(`[data-key="${from}"]`)?.getBoundingClientRect();
    const b = board.querySelector(`[data-key="${to}"]`)?.getBoundingClientRect();
    if (!a || !b) return '';
    const x1 = a.right - box.left; const y1 = a.top + a.height / 2 - box.top;
    const x2 = b.left - box.left; const y2 = b.top + b.height / 2 - box.top;
    const mid = (x1 + x2) / 2;
    const strong = from === focusKey || to === focusKey ? 'class="strong"' : '';
    return `<path ${strong} d="M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}"/>`;
  }).join('');
}
