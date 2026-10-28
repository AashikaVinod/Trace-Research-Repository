// Sessions list and session page (with its observations).

function pageSessions(params, query) {
  setCrumbs(['Sessions']);
  let projectId = query.project ? Number(query.project) : '';
  let participantId = query.participant ? Number(query.participant) : '';

  view.innerHTML = `
    <header class="page-head">
      <div><h1>Sessions</h1><p>Interviews, tests and studies. Observations are recorded against the session they came from.</p></div>
      <button class="btn btn-dark" id="add">${icon('plus', 16)} New session</button>
    </header>
    <div class="toolbar">
      <select class="input" id="project" aria-label="Project"><option value="">All projects</option>
        ${data.research_project.map((p) => `<option value="${p.id}">${esc(p.title)}</option>`).join('')}</select>
      <select class="input" id="participant" aria-label="Participant"><option value="">Any participant</option>
        ${data.participant.map((p) => `<option value="${p.id}">${esc(p.participant_code)}</option>`).join('')}</select>
      <span class="count" id="count"></span>
    </div>
    <div class="card table-card"><table class="table">
      <thead><tr><th>Date</th><th>Session</th><th class="hide-sm">Method</th><th class="hide-sm">Participants</th><th class="hide-sm">Evidence</th><th>Status</th></tr></thead>
      <tbody id="rows"></tbody>
    </table></div>`;
  $('#project').value = String(projectId);
  $('#participant').value = String(participantId);

  function draw() {
    setQuery({ project: projectId, participant: participantId });
    const codes = (s) => data.session_participant.filter((l) => l.session_id === s.id).map((l) => byId('participant', l.participant_id)?.participant_code);
    const list = data.research_session
      .filter((s) => !projectId || s.project_id === projectId)
      .filter((s) => !participantId || data.session_participant.some((l) => l.session_id === s.id && l.participant_id === participantId))
      .sort((a, b) => (b.session_date > a.session_date ? 1 : -1));
    $('#count').textContent = plural(list.length, 'session');
    $('#rows').innerHTML = list.map((s) => `<tr>
      <td class="nowrap">${formatDate(s.session_date)}</td>
      <td><a class="strong-link" href="#/sessions/${s.id}">${esc(s.title)}</a><small>${esc(byId('research_project', s.project_id)?.title)}</small></td>
      <td class="hide-sm">${esc(byId('research_method', s.method_id)?.name)}</td>
      <td class="hide-sm">${esc(codes(s).join(', ') || '—')}</td>
      <td class="hide-sm">${plural(data.observation.filter((o) => o.session_id === s.id).length, 'observation')}</td>
      <td>${statusPill(s.status)}</td></tr>`).join('') || `<tr><td colspan="6" class="muted">No sessions match.</td></tr>`;
  }

  $('#add').onclick = () => editSession(null, projectId || null);
  $('#project').onchange = (e) => { projectId = e.target.value ? Number(e.target.value) : ''; draw(); };
  $('#participant').onchange = (e) => { participantId = e.target.value ? Number(e.target.value) : ''; draw(); };
  draw();
}

function pageSession(params) {
  const s = byId('research_session', Number(params.id));
  if (!s) { setCrumbs(['Sessions', '#/sessions'], ['Not found']); view.innerHTML = `<div class="empty"><h2>Session not found</h2><a class="btn" href="#/sessions">Back to sessions</a></div>`; return; }
  setCrumbs(['Sessions', '#/sessions'], [s.title]);
  const project = byId('research_project', s.project_id);
  const people = data.session_participant.filter((l) => l.session_id === s.id).map((l) => byId('participant', l.participant_id)).filter(Boolean);
  const questions = data.session_question.filter((l) => l.session_id === s.id).map((l) => byId('research_question', l.question_id)).filter(Boolean);
  const observations = data.observation.filter((o) => o.session_id === s.id);
  const archived = !!project?.archived_at;

  view.innerHTML = `
    <section class="card project-head">
      <div class="card-top" style="justify-content:flex-start">${statusPill(s.status)}${meta(formatDate(s.session_date), s.duration_minutes ? `${s.duration_minutes} minutes` : '')}</div>
      <h1>${esc(s.title)}</h1>
      <p class="muted">${esc(byId('research_method', s.method_id)?.name)} with ${esc(byId('researcher', s.researcher_id)?.full_name)}, for
        <a href="#/projects/${project.id}">${esc(project.title)}</a></p>
      <div class="actions">
        <button class="btn" id="edit">${icon('pencil', 15)} Edit session</button>
        ${archived ? '' : `<button class="btn btn-dark" id="add-obs">${icon('plus', 15)} Add observation</button>`}
      </div>
    </section>
    <div class="two-col">
      <section class="card">
        <div class="card-top"><h3>Observations (${observations.length})</h3></div>
        ${observations.length ? `<div class="link-list">${observations.map((o) => `
          <a class="link-item stage-observation" href="#/record/observation/${o.id}"><span class="dot"></span>
            <span><strong>${esc(o.title)}</strong><small>${esc(o.description)}</small>
            <small>${statusPill(o.sentiment)} ${downstream('observation', o.id).length ? `Used in ${plural(downstream('observation', o.id).length, 'finding')}` : '<span class="gap">Not used in a finding yet</span>'}</small></span></a>`).join('')}</div>`
          : `<p class="quiet">No observations yet. What did the participant do or say?</p>`}
      </section>
      <div class="stack">
        <section class="card"><div class="card-top"><h3>Participants</h3></div>
          <div class="pills">${people.map((p) => `<a href="#/sessions?participant=${p.id}">${pill(p.participant_code, 'purple')}</a>`).join('') || '<span class="muted">None added.</span>'}</div>
        </section>
        <section class="card"><div class="card-top"><h3>Questions covered</h3></div>
          ${questions.length ? `<ol class="questions">${questions.map((q) => `<li><span>${esc(q.question_text)}</span></li>`).join('')}</ol>` : '<p class="quiet">None linked.</p>'}
        </section>
        ${s.notes ? `<section class="card"><div class="card-top"><h3>Notes</h3></div><p class="muted">${esc(s.notes)}</p></section>` : ''}
      </div>
    </div>`;

  $('#edit').onclick = () => editSession(s);
  if ($('#add-obs')) $('#add-obs').onclick = () => editRecord('observation', null, { sessionId: s.id });
}
