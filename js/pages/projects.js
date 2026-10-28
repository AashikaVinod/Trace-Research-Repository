// Projects list and project page.

function pageProjects(params, query) {
  setCrumbs(['Projects']);
  let show = query.show || 'active';
  let search = query.q || '';

  view.innerHTML = `
    <header class="page-head">
      <div><h1>Projects</h1><p>Each project holds the questions, sessions and evidence of one study.</p></div>
      <button class="btn btn-dark" id="add">${icon('plus', 16)} New project</button>
    </header>
    <div class="toolbar">
      <div class="chips" role="group" aria-label="Show">
        ${['active', 'all', 'archived'].map((v) => `<button class="chip" data-show="${v}">${capital(v)}</button>`).join('')}
      </div>
      <input class="input search-box" id="filter" type="search" placeholder="Search projects" aria-label="Search projects" value="${esc(search)}">
    </div>
    <div id="list"></div>`;

  function draw() {
    setQuery({ show: show === 'active' ? '' : show, q: search });
    $$('[data-show]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.show === show));
    const list = data.research_project
      .filter((p) => (show === 'all' ? true : show === 'archived' ? p.archived_at : !p.archived_at))
      .filter((p) => `${p.title} ${p.description} ${p.research_objective}`.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (b.start_date > a.start_date ? 1 : -1));
    if (!list.length) { $('#list').innerHTML = `<div class="empty"><h2>No projects here</h2><p>Try another filter, or create a project.</p></div>`; return; }
    $('#list').innerHTML = `<div class="project-grid">${list.map(projectCard).join('')}</div>`;
  }

  $('#add').onclick = () => editProject();
  $$('[data-show]').forEach((b) => { b.onclick = () => { show = b.dataset.show; draw(); }; });
  $('#filter').oninput = (e) => { search = e.target.value; draw(); };
  draw();
}

function projectCard(p) {
  const counts = projectCounts(p.id);
  const lead = projectLead(p.id);
  return `<a class="card project-card ${p.archived_at ? 'is-archived' : ''}" href="#/projects/${p.id}">
    <div class="card-top">${statusPill(p.status)}${p.archived_at ? pill('archived', 'dark') : ''}</div>
    <h3>${esc(p.title)}</h3>
    <p class="muted">${esc(shorten(p.research_objective, 110))}</p>
    <div class="mini-chain">${STAGES.map((s) => `<span class="stage-${s.type}" title="${counts[s.type]} ${s.plural.toLowerCase()}">${counts[s.type]}</span>`).join('')}</div>
    <div class="card-foot">
      ${lead ? `${avatar(lead.full_name, 26)}<span class="small">${esc(lead.full_name)}</span>` : '<span class="small muted">No lead</span>'}
      <span class="small muted push">${plural(counts.sessions, 'session')}</span>
    </div>
  </a>`;
}

function pageProject(params) {
  const p = byId('research_project', Number(params.id));
  if (!p) { setCrumbs(['Projects', '#/projects'], ['Not found']); view.innerHTML = `<div class="empty"><h2>Project not found</h2><a class="btn" href="#/projects">Back to projects</a></div>`; return; }
  setCrumbs(['Projects', '#/projects'], [p.title]);
  const counts = projectCounts(p.id);
  const sessions = data.research_session.filter((s) => s.project_id === p.id).sort((a, b) => (b.session_date > a.session_date ? 1 : -1));
  const questions = data.research_question.filter((q) => q.project_id === p.id);
  const team = data.project_researcher.filter((l) => l.project_id === p.id).map((l) => ({ ...byId('researcher', l.researcher_id), role: l.project_role }));
  const methods = data.project_method.filter((l) => l.project_id === p.id).map((l) => byId('research_method', l.method_id)).filter(Boolean);
  const archived = !!p.archived_at;

  view.innerHTML = `
    ${archived ? `<div class="notice">${icon('archive', 16)} This project was archived on ${formatDate(p.archived_at)}. Restore it to add new work.</div>` : ''}
    <section class="card project-head">
      <div class="card-top">${statusPill(p.status)}<span class="muted small">${formatDate(p.start_date)}${p.end_date ? ` – ${formatDate(p.end_date)}` : ''}</span></div>
      <h1>${esc(p.title)}</h1>
      <p class="lede">${esc(p.research_objective)}</p>
      ${p.description ? `<p class="muted">${esc(p.description)}</p>` : ''}
      <div class="actions">
        <button class="btn" id="edit">${icon('pencil', 15)} Edit</button>
        <button class="btn" id="archive">${icon(archived ? 'archive-restore' : 'archive', 15)} ${archived ? 'Restore' : 'Archive'}</button>
        <a class="btn" href="#/trail?project=${p.id}">${icon('waypoints', 15)} Evidence trail</a>
      </div>
    </section>

    <section class="chain chain-large">
      ${STAGES.map((s) => `<a class="chain-step stage-${s.type}" href="#/library?project=${p.id}&type=${s.type}"><strong>${counts[s.type]}</strong><span>${s.plural}</span></a>`).join('')}
    </section>

    <div class="two-col">
      <section class="card">
        <div class="card-top"><h3>Sessions (${sessions.length})</h3>${archived ? '' : `<button class="btn btn-small" id="add-session">${icon('plus', 15)} Session</button>`}</div>
        ${sessions.length ? `<ul class="rows">${sessions.map((s) => `<li><a href="#/sessions/${s.id}">
          <span class="date-chip"><b>${new Date(s.session_date + 'T00:00').getDate()}</b>${new Date(s.session_date + 'T00:00').toLocaleString('en-GB', { month: 'short' })}</span>
          <span><strong>${esc(s.title)}</strong><small>${esc(byId('research_method', s.method_id)?.name)} · ${plural(data.observation.filter((o) => o.session_id === s.id).length, 'observation')}</small></span>
          ${s.status !== 'completed' ? statusPill(s.status) : ''}</a></li>`).join('')}</ul>`
          : '<p class="muted pad">No sessions yet.</p>'}
      </section>
      <div class="stack">
        <section class="card">
          <div class="card-top"><h3>Research questions</h3>${archived ? '' : `<button class="btn btn-small" id="add-question">${icon('plus', 15)} Question</button>`}</div>
          ${questions.length ? `<ol class="questions">${questions.map((q) => `<li><span>${esc(q.question_text)}</span>
            <button class="icon-btn" data-question="${q.id}" aria-label="Edit question">${icon('pencil', 15)}</button></li>`).join('')}</ol>`
            : '<p class="muted pad">No questions yet.</p>'}
        </section>
        <section class="card">
          <div class="card-top"><h3>Team and methods</h3></div>
          <ul class="team">${team.map((r) => `<li>${avatar(r.full_name, 30)}<span><strong>${esc(r.full_name)}</strong><small>${esc(capital(r.role))}</small></span></li>`).join('') || '<li class="muted">Nobody assigned yet.</li>'}</ul>
          <div class="pills">${methods.map((m) => pill(m.name, 'grey')).join('')}</div>
        </section>
      </div>
    </div>`;

  $('#edit').onclick = () => editProject(p);
  $('#archive').onclick = () => toggleArchive(p);
  if ($('#add-session')) $('#add-session').onclick = () => editSession(null, p.id);
  if ($('#add-question')) $('#add-question').onclick = () => editQuestion(p.id);
  $$('[data-question]').forEach((b) => { b.onclick = () => editQuestion(p.id, byId('research_question', Number(b.dataset.question))); });
}
