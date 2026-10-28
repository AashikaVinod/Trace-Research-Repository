// ===================================================================
// Projects: the list of projects and a page for each project.
// ===================================================================

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
      <div class="chips" role="group" aria-label="Show projects">
        <button class="chip" data-show="active">Active</button>
        <button class="chip" data-show="all">All</button>
        <button class="chip" data-show="archived">Archived</button>
      </div>
      <label class="sr" for="filter">Search projects</label>
      <input class="input search-box" id="filter" type="search" placeholder="Search projects" value="${esc(search)}">
      <span class="count" id="count" aria-live="polite"></span>
    </div>
    <div id="list"></div>
    ${dbPanel(['LEFT JOIN', 'Correlated subquery', 'Soft delete (archived_at)', 'WHERE filter', 'View'], `
-- One row per project with its lead and evidence counts
select * from v_project_summary;

-- "Active" vs "Archived" is a WHERE filter on a nullable column
select * from research_project where archived_at is null;    -- active
select * from research_project where archived_at is not null; -- archived`,
    'Projects are archived instead of deleted. Foreign keys use ON DELETE RESTRICT, so the database refuses to delete a project that still has sessions or evidence.')}`;

  function draw() {
    setQuery({ show: show === 'active' ? '' : show, q: search });
    $$('[data-show]').forEach((button) => button.setAttribute('aria-pressed', button.dataset.show === show));
    const text = search.toLowerCase();
    const list = data.research_project
      .filter((p) => (show === 'all') || (show === 'archived' ? p.archived_at : !p.archived_at))
      .filter((p) => `${p.title} ${p.description} ${p.research_objective}`.toLowerCase().includes(text))
      .sort((a, b) => (b.start_date > a.start_date ? 1 : -1));
    $('#count').textContent = plural(list.length, 'project');
    $('#list').innerHTML = list.length
      ? `<div class="card table-card"><table class="table project-table">
          <thead><tr><th scope="col">Project</th><th scope="col" class="hide-sm">Team</th><th scope="col">Evidence collected</th><th scope="col" class="hide-sm">Sessions</th><th scope="col">Status</th></tr></thead>
          <tbody>${list.map(projectRow).join('')}</tbody></table></div>`
      : `<div class="empty"><h2>No projects here</h2><p>Try another filter, or create a project.</p></div>`;
  }

  $('#add').onclick = () => editProject();
  $$('[data-show]').forEach((button) => { button.onclick = () => { show = button.dataset.show; draw(); }; });
  $('#filter').oninput = (event) => { search = event.target.value; draw(); };
  draw();
}

// One project as a table row (inspired by the Growly "active programs" table).
function projectRow(p) {
  const counts = projectCounts(p.id);
  const team = data.project_researcher.filter((l) => l.project_id === p.id).map((l) => byId('researcher', l.researcher_id));
  const total = STAGES.reduce((sum, s) => sum + counts[s.type], 0);
  const segments = STAGES.map((s) => ({ value: counts[s.type], color: `var(--${['obs', 'find', 'ins', 'rec', 'dec'][s.step - 1]})`, label: s.plural }));
  return `<tr class="${p.archived_at ? 'is-archived' : ''}">
    <td><a class="strong-link" href="#/projects/${p.id}">${esc(p.title)}</a><small>${esc(shorten(p.research_objective, 80))}</small></td>
    <td class="hide-sm"><span class="avatars">${team.map((r) => avatar(r.full_name, 28)).join('')}</span></td>
    <td class="evidence-cell">${segmentBar(segments)}<small>${plural(total, 'record')}, ${counts.design_decision} decided</small></td>
    <td class="hide-sm">${counts.sessions}</td>
    <td><div class="pills">${statusPill(p.status)}${p.archived_at ? pill('archived', 'dark') : ''}</div></td>
  </tr>`;
}

function pageProject(params) {
  const p = byId('research_project', Number(params.id));
  if (!p) return notFound('Project', '#/projects', 'projects');
  setCrumbs(['Projects', '#/projects'], [p.title]);

  const counts = projectCounts(p.id);
  const archived = !!p.archived_at;
  const lead = projectLead(p.id);
  const sessions = data.research_session.filter((s) => s.project_id === p.id).sort((a, b) => (b.session_date > a.session_date ? 1 : -1));
  const questions = data.research_question.filter((q) => q.project_id === p.id);
  const team = data.project_researcher.filter((l) => l.project_id === p.id).map((l) => ({ ...byId('researcher', l.researcher_id), role: l.project_role }));
  const methods = data.project_method.filter((l) => l.project_id === p.id).map((l) => byId('research_method', l.method_id));
  const sentiment = sentimentCounts(p.id);

  view.innerHTML = `
    ${archived ? `<div class="notice" role="status">${icon('archive', 16)} This project was archived on ${formatDate(p.archived_at)}. Restore it to add new work.</div>` : ''}
    <section class="card project-head">
      <div class="pills">${statusPill(p.status)}</div>
      <h1>${esc(p.title)}</h1>
      ${meta(`Started ${formatDate(p.start_date)}`, p.end_date ? `Ended ${formatDate(p.end_date)}` : '', lead ? `Led by ${esc(lead.full_name)}` : '')}
      <p class="lede" style="margin-top:16px">${esc(p.research_objective)}</p>
      ${p.description ? `<p class="muted">${esc(p.description)}</p>` : ''}
      <div class="actions">
        <button class="btn" id="edit">${icon('pencil', 15)} Edit</button>
        <button class="btn" id="archive">${icon(archived ? 'archive-restore' : 'archive', 15)} ${archived ? 'Restore' : 'Archive'}</button>
        <a class="btn" href="#/trail?project=${p.id}">${icon('waypoints', 15)} Evidence trail</a>
      </div>
    </section>

    <div class="grid-2 row-gap">
      <section class="card"><div class="card-top"><h3>Evidence funnel</h3></div>${funnelChart(counts, `&project=${p.id}`)}</section>
      <section class="card"><div class="card-top"><h3>How sessions felt</h3></div>${sentimentFaces(sentiment)}</section>
    </div>

    <div class="grid-main row-gap">
      <section class="card">
        <div class="card-top"><h3>Sessions (${sessions.length})</h3>${archived ? '' : `<button class="btn btn-small" id="add-session">${icon('plus', 15)} Session</button>`}</div>
        ${sessions.length ? `<ul class="rows">${sessions.map(sessionRow).join('')}</ul>` : '<p class="quiet">No sessions yet.</p>'}
      </section>
      <div class="stack">
        <section class="card">
          <div class="card-top"><h3>Research questions</h3>${archived ? '' : `<button class="btn btn-small" id="add-question">${icon('plus', 15)} Question</button>`}</div>
          ${questions.length ? `<ol class="questions">${questions.map((q) => `<li><span>${esc(q.question_text)}
            <small class="quiet" style="display:block;font-family:var(--font);font-size:12.5px">${coverageText(q)}</small></span>
            <button class="icon-btn" data-question="${q.id}" aria-label="Edit question">${icon('pencil', 15)}</button></li>`).join('')}</ol>`
            : '<p class="quiet">No questions yet.</p>'}
        </section>
        <section class="card">
          <div class="card-top"><h3>Team</h3></div>
          <ul class="team">${team.map((r) => `<li>${avatar(r.full_name, 36)}<span><strong>${esc(r.full_name)}</strong><small>${esc(capital(r.role))}</small></span></li>`).join('') || '<li class="quiet">Nobody assigned yet.</li>'}</ul>
          <div class="card-foot"><div class="pills">${methods.map((m) => pill(m.name, 'grey')).join('') || '<span class="quiet">No methods yet</span>'}</div></div>
        </section>
      </div>
    </div>

    ${dbPanel(['Foreign key (1:N)', 'M:N junction table', 'Composite primary key', 'Trigger', 'UPDATE'], `
-- Sessions belong to this project through a foreign key (one-to-many)
select * from research_session where project_id = ${p.id} order by session_date desc;

-- The team is a many-to-many relationship stored in a junction table
select r.full_name, pr.project_role
from project_researcher pr
join researcher r on r.id = pr.researcher_id
where pr.project_id = ${p.id};

-- Archiving is an UPDATE. A trigger then blocks new work in this project.
update research_project set archived_at = now() where id = ${p.id};`)}`;

  $('#edit').onclick = () => editProject(p);
  $('#archive').onclick = () => toggleArchive(p);
  if ($('#add-session')) $('#add-session').onclick = () => editSession(null, p.id);
  if ($('#add-question')) $('#add-question').onclick = () => editQuestion(p.id);
  $$('[data-question]').forEach((button) => {
    button.onclick = () => editQuestion(p.id, byId('research_question', Number(button.dataset.question)));
  });
}

// "Covered in 3 sessions": a count from the session_question junction table.
function coverageText(question) {
  const count = data.session_question.filter((l) => l.question_id === question.id).length;
  return count ? `Covered in ${plural(count, 'session')}` : 'Not covered by a session yet';
}

// One row in a list of sessions.
function sessionRow(s) {
  const date = new Date(s.session_date + 'T00:00');
  const observations = data.observation.filter((o) => o.session_id === s.id).length;
  return `<li><a href="#/sessions/${s.id}">
    <span class="date-chip"><b>${date.getDate()}</b>${date.toLocaleString('en-GB', { month: 'short' })}</span>
    <span class="row-text"><strong>${esc(s.title)}</strong>${meta(esc(byId('research_method', s.method_id).name), plural(observations, 'observation'))}</span>
    ${s.status !== 'completed' ? statusPill(s.status) : `<span class="chev">${icon('chevron-right', 18)}</span>`}</a></li>`;
}

// Shared "not found" page.
function notFound(what, backHref, backLabel) {
  setCrumbs([`${what} not found`]);
  view.innerHTML = `<div class="empty"><h2>${what} not found</h2><p>It may have been removed, or the link is wrong.</p><a class="btn" href="${backHref}">Back to ${backLabel}</a></div>`;
}
