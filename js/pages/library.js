// ===================================================================
// Research library: every evidence record, in folder tabs.
// Also the page for one record.
// ===================================================================

function pageLibrary(params, query) {
  setCrumbs(['Evidence']);
  let type = STAGE[query.type] ? query.type : '';
  let projectId = query.project ? Number(query.project) : '';
  let search = query.q || '';
  $('#search-input').value = search;

  let tabs = `<button class="folder-tab" role="tab" data-type="">All evidence <small>${allRecords().length}</small></button>`;
  for (const stage of STAGES) {
    tabs += `<button class="folder-tab stage-${stage.type}" role="tab" data-type="${stage.type}"><i></i>${stage.plural} <small>${data[stage.type].length}</small></button>`;
  }

  view.innerHTML = `
    <header class="page-head">
      <div><h1>Research library</h1><p>Every piece of evidence, from the first observation to the final decision.</p></div>
      <button class="btn btn-dark" id="add">${icon('plus', 16)} Add evidence</button>
    </header>
    <div class="folder-tabs" role="tablist" aria-label="Record type">${tabs}</div>
    <div class="folder-body">
      <div class="toolbar">
        <label class="sr" for="filter">Search records</label>
        <input class="input search-box" id="filter" type="search" placeholder="Search titles and text" value="${esc(search)}">
        <label class="sr" for="project">Project</label>
        <select class="input" id="project">
          <option value="">All projects</option>
          ${data.research_project.map((p) => `<option value="${p.id}">${esc(p.title)}${p.archived_at ? ' (archived)' : ''}</option>`).join('')}
        </select>
        <span class="count" id="count" aria-live="polite"></span>
      </div>
      <div id="results"></div>
    </div>`;
  $('#project').value = String(projectId);

  function draw() {
    setQuery({ type, project: projectId, q: search });
    $$('[data-type]').forEach((tab) => tab.setAttribute('aria-selected', tab.dataset.type === type));
    const words = search.toLowerCase().split(' ').filter((word) => word);
    const list = allRecords()
      .filter((r) => !type || r.type === type)
      .filter((r) => !projectId || r.project_id === projectId)
      .filter((r) => words.every((word) => `${r.title} ${r.description}`.toLowerCase().includes(word)))
      .sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
    $('#count').textContent = plural(list.length, 'record');
    $('#results').innerHTML = list.length
      ? `<div class="doc-grid">${list.map(docCard).join('')}</div>`
      : `<div class="empty"><h2>Nothing matches</h2><p>Try another tab, project or search.</p></div>`;
  }

  $('#add').onclick = () => (type ? editRecord(type, null, { projectId }) : openNewMenu());
  $$('[data-type]').forEach((tab) => { tab.onclick = () => { type = tab.dataset.type; draw(); }; });
  $('#project').onchange = (event) => { projectId = event.target.value ? Number(event.target.value) : ''; draw(); };
  $('#filter').oninput = (event) => { search = event.target.value; draw(); };
  draw();
}

// A record drawn as a small document with a tinted "page" preview.
function docCard(r) {
  const stage = STAGE[r.type];
  const sources = upstream(r.type, r.id).length;
  const uses = downstream(r.type, r.id).length;
  const project = byId('research_project', r.project_id);
  let status;
  if (r.type !== 'observation' && sources === 0) status = '<span class="gap">No supporting evidence</span>';
  else if (r.type !== 'design_decision' && uses === 0) status = '<span class="gap">Not used yet</span>';
  else if (r.type === 'observation') status = `Used in ${plural(uses, 'finding')}`;
  else status = plural(sources, 'source');
  return `<a class="doc stage-${r.type}" href="#/record/${r.type}/${r.id}">
    <div class="doc-page">
      <span class="doc-type"><b>${stage.step}</b>${stage.label}</span>
      <p>${esc(shorten(r.description, 150))}</p>
    </div>
    <div class="doc-info"><strong>${esc(r.title)}</strong>${meta(`${CODE_PREFIX[r.type]}-${String(r.id).padStart(2, '0')}`, esc(project ? project.title : ''), status)}</div>
  </a>`;
}


// "The story so far": the whole chain this record belongs to, written as
// plain lists, the way a researcher would document it.
const STORY_HEADINGS = {
  observation: 'What we saw', finding: 'What we found', insight: 'What it means',
  recommendation: 'What we suggested', design_decision: 'What we decided',
};
function storyBlock(type, record) {
  const trail = lineage(type, record.id);
  let html = '';
  for (const stage of STAGES) {
    const items = trail.byStage[stage.type];
    html += `<div class="story-part stage-${stage.type}">
      <h4>${STORY_HEADINGS[stage.type]} <span class="count">${items.length}</span></h4>
      ${items.length ? `<ul>${items.map((item) => {
        const isThis = stage.type === type && item.id === record.id;
        const photos = sourcesFor(stage.type, item.id);
        const session = stage.type === 'observation' ? byId('research_session', item.session_id) : null;
        return `<li class="${isThis ? 'is-this' : ''}">${recordCode(stage.type, item.id)}
          ${isThis ? `<strong>${esc(item.title)}</strong> <span class="quiet">(this ${stage.label.toLowerCase()})</span>` : `<a href="#/record/${stage.type}/${item.id}">${esc(item.title)}</a>`}
          ${session ? `<span class="quiet"> from ${esc(session.title)}</span>` : ''}
          ${photos.map((p) => `<button class="story-photo" data-open-source="${p.id}" aria-label="Open ${esc(p.title)}"><img src="${esc(p.file_url)}" alt=""></button>`).join('')}</li>`;
      }).join('')}</ul>` : '<p class="quiet">Nothing yet.</p>'}
    </div>`;
  }
  return `<section class="card story row-gap" id="story">
    <div class="card-top"><div><h3>The story so far</h3><p class="card-sub">Everything this ${STAGE[type].label.toLowerCase()} rests on, and everything it led to</p></div>
      <a class="text-link" href="#/trail/${type}/${record.id}">See it as a diagram ${icon('arrow-right', 14)}</a></div>
    <div class="story-parts">${html}</div>
  </section>`;
}


// The details shown beside a record, per type.
function recordFacts(type, r) {
  if (type === 'observation') return [['Sentiment', statusPill(r.sentiment)], ['Session', `<a href="#/sessions/${r.session_id}">${esc(byId('research_session', r.session_id).title)}</a>`]];
  if (type === 'finding') return [['Confidence', statusPill(r.confidence)]];
  if (type === 'insight') return [['Impact', statusPill(r.impact)]];
  if (type === 'recommendation') return [['Priority', statusPill(r.priority)], ['Status', statusPill(r.status)]];
  return [['Status', statusPill(r.status)], ['Decided on', formatDate(r.decided_on)]];
}

function pageRecord(params) {
  const type = params.type;
  const r = STAGE[type] ? byId(type, Number(params.id)) : null;
  if (!r) return notFound('Record', '#/library', 'the library');

  const stage = STAGE[type];
  const prev = previousStage(type);
  const next = nextStage(type);
  const project = byId('research_project', r.project_id);
  setCrumbs(['Evidence', '#/library'], [stage.plural, `#/library?type=${type}`], [r.title]);

  view.innerHTML = `
    <div class="record-layout">
      <article class="paper stage-${type}">
        <span class="doc-type"><b>${stage.step}</b>${stage.label}</span> ${recordCode(type, r.id)}
        <h1>${esc(r.title)}</h1>
        <p class="paper-text">${esc(r.description)}</p>
        <div class="actions">
          <a class="btn btn-dark" href="#/trail/${type}/${r.id}">${icon('waypoints', 15)} Trace it</a>
          <button class="btn" id="edit">${icon('pencil', 15)} Edit${prev ? ' and link' : ''}</button>
          ${next && !project.archived_at ? `<button class="btn" id="add-next">${icon('plus', 15)} Add a ${next.label.toLowerCase()}</button>` : ''}
        </div>
      </article>
      <aside class="card facts">
        <dl>
          <div><dt>Project</dt><dd><a href="#/projects/${project.id}">${esc(project.title)}</a></dd></div>
          ${recordFacts(type, r).map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}
          <div><dt>Added</dt><dd>${formatDate(r.created_at)}</dd></div>
        </dl>
      </aside>
    </div>
    ${storyBlock(type, r)}
    <div class="grid-2 row-gap">${sourcesBlock(type, r.id)}${notesBlock(type, r.id)}</div>`;

  hookAttachments(view);
  $('#edit').onclick = () => editRecord(type, r);
  if ($('#add-next')) $('#add-next').onclick = () => editRecord(next.type, null, { projectId: r.project_id, upIds: [r.id] });
}
