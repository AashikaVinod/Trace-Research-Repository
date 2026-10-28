// ===================================================================
// Sessions: the list of research sessions and a page for each one.
// ===================================================================

// One participant as a table row.
function participantRow(p) {
  const segments = data.participant_segment.filter((l) => l.participant_id === p.id).map((l) => byId('segment', l.segment_id));
  const sessions = data.session_participant.filter((l) => l.participant_id === p.id).length;
  return `<tr>
    <td><strong>${esc(p.participant_code)}</strong></td>
    <td>${esc(p.age_band || '—')}</td>
    <td class="hide-sm">${esc(segments.map((g) => g.name).join(', ') || '—')}</td>
    <td>${sessions ? `<a class="strong-link" href="#/sessions?participant=${p.id}">${sessions}</a>` : '0'}</td>
    <td class="right"><button class="icon-btn" data-participant="${p.id}" aria-label="Edit ${esc(p.participant_code)}">${icon('pencil', 15)}</button></td>
  </tr>`;
}

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
      <label class="sr" for="project">Project</label>
      <select class="input" id="project"><option value="">All projects</option>
        ${data.research_project.map((p) => `<option value="${p.id}">${esc(p.title)}</option>`).join('')}</select>
      <label class="sr" for="participant">Participant</label>
      <select class="input" id="participant"><option value="">Any participant</option>
        ${data.participant.map((p) => `<option value="${p.id}">${esc(p.participant_code)}</option>`).join('')}</select>
      <span class="count" id="count" aria-live="polite"></span>
    </div>
    <div class="card table-card"><table class="table">
      <thead><tr><th scope="col">Date</th><th scope="col">Session</th><th scope="col" class="hide-sm">Method</th><th scope="col" class="hide-sm">Participants</th><th scope="col" class="hide-sm">Evidence</th><th scope="col">Status</th></tr></thead>
      <tbody id="rows"></tbody>
    </table></div>

    <div class="section-head-row"><h2>Participants</h2>
      <button class="btn btn-small" id="add-participant">${icon('user-plus', 15)} New participant</button></div>
    <p class="muted" style="margin:-8px 0 16px">Identified by code only. TRACE never stores names or contact details.</p>
    <div class="card table-card"><table class="table">
      <thead><tr><th scope="col">Code</th><th scope="col">Age band</th><th scope="col" class="hide-sm">Segments</th><th scope="col">Sessions</th><th scope="col"><span class="sr">Edit</span></th></tr></thead>
      <tbody>${data.participant.map(participantRow).join('')}</tbody>
    </table></div>`;
  $('#project').value = String(projectId);
  $('#participant').value = String(participantId);

  function draw() {
    setQuery({ project: projectId, participant: participantId });
    const list = data.research_session
      .filter((s) => !projectId || s.project_id === projectId)
      .filter((s) => !participantId || data.session_participant.some((l) => l.session_id === s.id && l.participant_id === participantId))
      .sort((a, b) => (b.session_date > a.session_date ? 1 : -1));
    $('#count').textContent = plural(list.length, 'session');
    $('#rows').innerHTML = list.map((s) => {
      const codes = data.session_participant.filter((l) => l.session_id === s.id).map((l) => byId('participant', l.participant_id).participant_code);
      return `<tr>
        <td class="nowrap">${formatDate(s.session_date)}</td>
        <td><a class="strong-link" href="#/sessions/${s.id}">${esc(s.title)}</a><small>${esc(byId('research_project', s.project_id).title)}</small></td>
        <td class="hide-sm">${esc(byId('research_method', s.method_id).name)}</td>
        <td class="hide-sm">${esc(codes.join(', ') || '—')}</td>
        <td class="hide-sm">${plural(data.observation.filter((o) => o.session_id === s.id).length, 'observation')}</td>
        <td>${statusPill(s.status)}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="quiet">No sessions match.</td></tr>';
  }

  $('#add').onclick = () => editSession(null, projectId || null);
  $('#add-participant').onclick = () => editParticipant();
  $$('[data-participant]').forEach((b) => { b.onclick = () => editParticipant(byId('participant', Number(b.dataset.participant))); });
  $('#project').onchange = (event) => { projectId = event.target.value ? Number(event.target.value) : ''; draw(); };
  $('#participant').onchange = (event) => { participantId = event.target.value ? Number(event.target.value) : ''; draw(); };
  draw();
}


function pageSession(params) {
  const s = byId('research_session', Number(params.id));
  if (!s) return notFound('Session', '#/sessions', 'sessions');
  setCrumbs(['Sessions', '#/sessions'], [s.title]);

  const project = byId('research_project', s.project_id);
  const people = data.session_participant.filter((l) => l.session_id === s.id).map((l) => byId('participant', l.participant_id));
  const questions = data.session_question.filter((l) => l.session_id === s.id).map((l) => byId('research_question', l.question_id));
  const observations = data.observation.filter((o) => o.session_id === s.id);
  const archived = !!project.archived_at;

  let observationList = '<p class="quiet">No observations yet. What did the participant do or say?</p>';
  if (observations.length) {
    observationList = `<div class="link-list">${observations.map((o) => {
      const used = downstream('observation', o.id).length;
      return `<a class="link-item stage-observation" href="#/record/observation/${o.id}"><span class="dot"></span>
        <span><strong>${esc(o.title)}</strong><small>${esc(o.description)}</small>
        <small>${statusPill(o.sentiment)} ${used ? `Used in ${plural(used, 'finding')}` : '<span class="gap">Not used in a finding yet</span>'}</small></span></a>`;
    }).join('')}</div>`;
  }

  view.innerHTML = `
    <section class="card project-head">
      <div class="pills">${statusPill(s.status)}</div>
      <h1>${esc(s.title)}</h1>
      ${meta(formatDate(s.session_date), s.duration_minutes ? `${s.duration_minutes} minutes` : '', esc(byId('research_method', s.method_id).name), `with ${esc(byId('researcher', s.researcher_id).full_name)}`)}
      <p class="muted">Part of <a class="strong-link" href="#/projects/${project.id}">${esc(project.title)}</a></p>
      <div class="actions">
        <button class="btn" id="edit">${icon('pencil', 15)} Edit session</button>
        ${archived ? '' : `<button class="btn btn-dark" id="add-obs">${icon('plus', 15)} Add observation</button>`}
      </div>
    </section>
    <div class="grid-main row-gap">
      <section class="card"><div class="card-top"><h3>Observations (${observations.length})</h3></div>${observationList}</section>
      <div class="stack">
        <section class="card"><div class="card-top"><h3>Participants</h3></div>
          <div class="pills">${people.map((p) => `<a href="#/sessions?participant=${p.id}">${pill(p.participant_code, 'purple')}</a>`).join('') || '<span class="quiet">None added.</span>'}</div>
        </section>
        <section class="card"><div class="card-top"><h3>Questions covered</h3></div>
          ${questions.length ? `<ol class="questions">${questions.map((q) => `<li><span>${esc(q.question_text)}</span></li>`).join('')}</ol>` : '<p class="quiet">None linked.</p>'}
        </section>
        ${s.notes ? `<section class="card"><div class="card-top"><h3>Notes</h3></div><p class="muted">${esc(s.notes)}</p></section>` : ''}
      </div>
    </div>
    <div class="grid-2 row-gap">${sourcesBlock('research_session', s.id)}${notesBlock('research_session', s.id)}</div>`;

  hookAttachments(view);
  $('#edit').onclick = () => editSession(s);
  if ($('#add-obs')) $('#add-obs').onclick = () => editRecord('observation', null, { sessionId: s.id });
}
