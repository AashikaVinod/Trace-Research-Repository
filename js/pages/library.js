// ===================================================================
// Research library: every evidence record, in folder tabs.
// Also the page for one record.
// ===================================================================

function pageLibrary(params, query) {
  setCrumbs(['Research library']);
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
    </div>
    ${dbPanel(['UNION ALL', 'View', 'WHERE + ILIKE (search)', 'Index'], `
-- All five record tables combined into one list (view in sql/06_views.sql)
select record_type, id, title from v_evidence_record
where (title ilike '%slot%' or description ilike '%slot%')
  and record_type = 'insight'      -- the tab you pick
  and project_id = 2;              -- the project you pick`,
    'Indexes on project_id (sql/02) keep filtering by project fast as the tables grow.')}`;
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
    <div class="doc-info"><strong>${esc(r.title)}</strong>${meta(esc(project ? project.title : ''), status)}</div>
  </a>`;
}

// A five-part strip showing which step this record is, and whether the
// steps either side of it are linked.
function chainPosition(type, upCount, downCount) {
  const step = STAGE[type].step;
  let html = `<div class="position" aria-label="Step ${step} of 5">`;
  for (const stage of STAGES) {
    let state = '';
    if (stage.step === step) state = 'here';
    else if ((stage.step === step - 1 && upCount) || (stage.step === step + 1 && downCount)) state = 'linked';
    html += `<span class="stage-${stage.type} ${state}">${stage.step}. ${stage.label}</span>`;
  }
  return html + '</div>';
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
  const builtOn = upstream(type, r.id);
  const leadsTo = downstream(type, r.id);
  setCrumbs(['Research library', '#/library'], [stage.plural, `#/library?type=${type}`], [r.title]);

  function linkList(items) {
    return `<div class="link-list">${items.map((x) => `
      <a class="link-item stage-${x.type}" href="#/record/${x.type}/${x.id}"><span class="dot"></span>
        <span><strong>${esc(x.title)}</strong><small>${esc(shorten(x.description, 110))}</small></span></a>`).join('')}</div>`;
  }

  view.innerHTML = `
    <div class="record-layout">
      <article class="paper stage-${type}">
        ${chainPosition(type, builtOn.length, leadsTo.length)}
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
          <div><dt>Project</dt><dd><a href="#/projects/${project.id}">${esc(project.title)}</a></dd></div>
          ${recordFacts(type, r).map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}
          <div><dt>Added</dt><dd>${formatDate(r.created_at)}</dd></div>
        </dl>
      </aside>
    </div>
    <div class="grid-2 row-gap">
      ${prev ? `<section class="card"><div class="card-top"><h3>Built on (${builtOn.length})</h3></div>
        ${builtOn.length ? linkList(builtOn) : `<p class="quiet">No ${prev.plural.toLowerCase()} support this yet. Use “Edit and link” to connect some.</p>`}</section>` : ''}
      ${next ? `<section class="card"><div class="card-top"><h3>Leads to (${leadsTo.length})</h3>
        ${project.archived_at ? '' : `<button class="btn btn-small" id="add-next">${icon('plus', 15)} ${next.label}</button>`}</div>
        ${leadsTo.length ? linkList(leadsTo) : `<p class="quiet">Nothing builds on this yet. Add a ${next.label.toLowerCase()} based on it.</p>`}</section>` : ''}
    </div>
    <div class="grid-2 row-gap">${sourcesBlock(type, r.id)}${notesBlock(type, r.id)}</div>
    ${dbPanel(['M:N junction table', 'JOIN', 'Trigger (same-project check)', 'CHECK constraint'], prev ? `
-- What this ${stage.label.toLowerCase()} is built on: a JOIN through the junction table
select p.id, p.title
from ${stage.link.table} l
join ${prev.type} p on p.id = l.${stage.link.up}
where l.${stage.link.self} = ${r.id};

-- Linking: one row per pair. A trigger rejects links across projects.
insert into ${stage.link.table} (${stage.link.up}, ${stage.link.self}) values (…, ${r.id});` : `
-- An observation belongs to one session (foreign key)
select * from observation where id = ${r.id};
-- Its project is found through the session, not stored twice (3NF)
select s.project_id from observation o join research_session s on s.id = o.session_id where o.id = ${r.id};`)}`;

  hookAttachments(view);
  $('#edit').onclick = () => editRecord(type, r);
  if ($('#add-next')) $('#add-next').onclick = () => editRecord(next.type, null, { projectId: r.project_id, upIds: [r.id] });
}
