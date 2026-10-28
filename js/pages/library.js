// Research library (folder tabs + document cards) and the record page.

function pageLibrary(params, query) {
  setCrumbs(['Research library']);
  let type = STAGE[query.type] ? query.type : '';
  let projectId = query.project ? Number(query.project) : '';
  let search = query.q || '';
  $('#search-input').value = search;

  view.innerHTML = `
    <header class="page-head">
      <div><h1>Research library</h1><p>Every piece of evidence, from first observation to final decision.</p></div>
      <button class="btn btn-dark" id="add">${icon('plus', 16)} Add evidence</button>
    </header>
    <div class="folder">
      <div class="folder-tabs" role="tablist" aria-label="Record type">
        <button class="folder-tab" role="tab" data-type="">All evidence</button>
        ${STAGES.map((s) => `<button class="folder-tab stage-${s.type}" role="tab" data-type="${s.type}"><i></i>${s.plural}</button>`).join('')}
      </div>
      <div class="folder-body">
        <div class="toolbar">
          <input class="input search-box" id="filter" type="search" placeholder="Search titles and text" aria-label="Search records" value="${esc(search)}">
          <select class="input" id="project" aria-label="Project">
            <option value="">All projects</option>
            ${data.research_project.map((p) => `<option value="${p.id}">${esc(p.title)}${p.archived_at ? ' (archived)' : ''}</option>`).join('')}
          </select>
          <span class="count" id="count" aria-live="polite"></span>
        </div>
        <div id="results"></div>
      </div>
    </div>`;
  $('#project').value = String(projectId);

  function draw() {
    setQuery({ type, project: projectId, q: search });
    $$('[data-type]').forEach((t) => t.setAttribute('aria-selected', t.dataset.type === type));
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    const list = allRecords()
      .filter((r) => (!type || r.type === type) && (!projectId || r.project_id === projectId))
      .filter((r) => words.every((w) => `${r.title} ${r.description}`.toLowerCase().includes(w)))
      .sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
    $('#count').textContent = plural(list.length, 'record');
    $('#results').innerHTML = list.length
      ? `<div class="doc-grid">${list.map(docCard).join('')}</div>`
      : `<div class="empty"><h2>Nothing matches</h2><p>Try another tab, project or search.</p></div>`;
  }

  $('#add').onclick = () => (type ? editRecord(type, null, { projectId }) : openNewMenu());
  $$('[data-type]').forEach((t) => { t.onclick = () => { type = t.dataset.type; draw(); }; });
  $('#project').onchange = (e) => { projectId = e.target.value ? Number(e.target.value) : ''; draw(); };
  $('#filter').oninput = (e) => { search = e.target.value; draw(); };
  draw();
}

// A record drawn as a small document: a tinted "page" preview + details.
function docCard(r) {
  const stage = STAGE[r.type];
  const ups = upstream(r.type, r.id).length;
  const downs = downstream(r.type, r.id).length;
  const project = byId('research_project', r.project_id);
  let gap = '';
  if (r.type !== 'observation' && !ups) gap = 'No supporting evidence';
  else if (r.type !== 'design_decision' && !downs) gap = 'Not used yet';
  return `<a class="doc stage-${r.type}" href="#/record/${r.type}/${r.id}">
    <div class="doc-page">
      <span class="doc-type"><b>${stage.step}</b>${stage.label}</span>
      <p>${esc(shorten(r.description, 150))}</p>
    </div>
    <div class="doc-info">
      <strong>${esc(r.title)}</strong>
      <small>${esc(project?.title || '')}</small>
      <span class="doc-links">${r.type !== 'observation' ? `${icon('link-2', 13)} ${ups} in` : ''}${r.type !== 'design_decision' ? ` ${icon('arrow-right', 13)} ${downs} out` : ''}
        ${gap ? `<em>${gap}</em>` : ''}</span>
    </div>
  </a>`;
}

const RECORD_FACTS = {
  observation: (r) => [['Sentiment', statusPill(r.sentiment)], ['Session', `<a href="#/sessions/${r.session_id}">${esc(byId('research_session', r.session_id)?.title)}</a>`]],
  finding: (r) => [['Confidence', statusPill(r.confidence)]],
  insight: (r) => [['Impact', statusPill(r.impact)]],
  recommendation: (r) => [['Priority', statusPill(r.priority)], ['Status', statusPill(r.status)]],
  design_decision: (r) => [['Status', statusPill(r.status)], ['Decided on', formatDate(r.decided_on)]],
};

function pageRecord(params) {
  const type = params.type;
  const r = STAGE[type] && byId(type, Number(params.id));
  if (!r) { setCrumbs(['Research library', '#/library'], ['Not found']); view.innerHTML = `<div class="empty"><h2>Record not found</h2><a class="btn" href="#/library">Back to the library</a></div>`; return; }
  const stage = STAGE[type];
  const prev = previousStage(type);
  const next = nextStage(type);
  const project = byId('research_project', r.project_id);
  const ups = upstream(type, r.id);
  const downs = downstream(type, r.id);
  setCrumbs(['Research library', '#/library'], [stage.plural, `#/library?type=${type}`], [r.title]);

  const linkList = (items) => `<div class="link-list">${items.map((x) => `
    <a class="link-item stage-${x.type}" href="#/record/${x.type}/${x.id}"><span class="dot"></span>
      <span><strong>${esc(x.title)}</strong><small>${esc(shorten(x.description, 90))}</small></span></a>`).join('')}</div>`;

  view.innerHTML = `
    <div class="record-layout">
      <article class="paper stage-${type}">
        <span class="doc-type"><b>${stage.step}</b>${stage.label}</span>
        <h1>${esc(r.title)}</h1>
        <p class="paper-text">${esc(r.description)}</p>
        <div class="actions">
          <button class="btn" id="edit">${icon('pencil', 15)} Edit${prev ? ' and link' : ''}</button>
          <a class="btn" href="#/trail/${type}/${r.id}">${icon('waypoints', 15)} See its evidence trail</a>
        </div>
      </article>
      <aside class="card facts">
        <dl>
          <div><dt>Project</dt><dd><a href="#/projects/${project?.id}">${esc(project?.title)}</a></dd></div>
          ${RECORD_FACTS[type](r).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}
          <div><dt>Added</dt><dd>${formatDate(r.created_at)}</dd></div>
        </dl>
      </aside>
    </div>
    <div class="two-col">
      ${prev ? `<section class="card"><div class="card-top"><h3>Built on (${ups.length})</h3></div>
        ${ups.length ? linkList(ups) : `<p class="muted pad">No ${prev.plural.toLowerCase()} support this yet. Use “Edit and link” to connect some.</p>`}</section>` : ''}
      ${next ? `<section class="card"><div class="card-top"><h3>Leads to (${downs.length})</h3>
        ${project?.archived_at ? '' : `<button class="btn btn-small" id="add-next">${icon('plus', 15)} ${next.label}</button>`}</div>
        ${downs.length ? linkList(downs) : `<p class="muted pad">Nothing builds on this yet. Add a ${next.label.toLowerCase()} based on it.</p>`}</section>` : ''}
    </div>`;

  $('#edit').onclick = () => editRecord(type, r);
  if ($('#add-next')) $('#add-next').onclick = () => editRecord(next.type, null, { projectId: r.project_id, upIds: [r.id] });
}
