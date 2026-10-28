// ===================================================================
// Sessions: the list of research sessions and a page for each one.
// ===================================================================

function pageSessions(params, query) {
  setCrumbs(['Sessions']);
  let projectId = query.project ? Number(query.project) : '';
  let participantId = query.participant ? Number(query.participant) : '';

  const methodCounts = data.research_method.map((m, index) => ({
    label: m.name,
    value: data.research_session.filter((s) => s.method_id === m.id).length,
    color: CHART_COLORS.series[index % CHART_COLORS.series.length],
  })).filter((m) => m.value > 0);

  view.innerHTML = `
    <header class="page-head">
      <div><h1>Sessions</h1><p>Interviews, tests and studies. Observations are recorded against the session they came from.</p></div>
      <button class="btn btn-dark" id="add">${icon('plus', 16)} New session</button>
    </header>
    <div class="dash dash-3">
      <section class="card"><div class="card-top"><div><h3>Sessions per month</h3><p class="card-sub">Latest month highlighted</p></div></div>
        ${pillColumns(countsByMonth(data.research_session, 'session_date').map((m) => ({ label: m.label, value: m.count, highlight: m.isCurrent })))}</section>
      <section class="card"><div class="card-top"><h3>Methods used</h3></div>${donutChart(methodCounts, 'sessions')}</section>
      <section class="card"><div class="card-top"><h3>Research rhythm</h3></div>${activityDots(sessionsByWeek(16))}
        <p class="card-sub" style="margin-top:12px">Each dot is a week. Darker means more sessions.</p>
        ${nextSession() ? `<div class="next-chip">${icon('calendar-days', 15)} Next: <a class="strong-link" href="#/sessions/${nextSession().id}">${esc(nextSession().title)}</a> ${daysUntil(nextSession().session_date)}</div>` : ''}</section>
    </div>
    <div class="toolbar row-gap">
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
    ${dbPanel(['M:N junction table', 'Composite primary key', 'GROUP BY', 'EXISTS'], `
-- Which sessions a participant joined (many-to-many through session_participant)
select s.title, s.session_date
from research_session s
where exists (select 1 from session_participant sp where sp.session_id = s.id and sp.participant_id = 1);

-- The method donut
select m.name, count(s.id) from research_method m
left join research_session s on s.method_id = m.id group by m.name;`,
    'session_participant has a composite primary key (session_id, participant_id), so the same person can never be added to a session twice.')}`;
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
  $('#project').onchange = (event) => { projectId = event.target.value ? Number(event.target.value) : ''; draw(); };
  $('#participant').onchange = (event) => { participantId = event.target.value ? Number(event.target.value) : ''; draw(); };
  draw();
}

// A thin bar showing how many observations were negative, neutral, positive.
function sentimentMix(observations) {
  if (observations.length === 0) return '';
  const parts = [['negative', CHART_COLORS.negative], ['neutral', CHART_COLORS.neutral], ['positive', CHART_COLORS.positive]];
  let bar = '';
  let legend = '';
  for (const [mood, color] of parts) {
    const count = observations.filter((o) => o.sentiment === mood).length;
    bar += `<i style="width:${(count / observations.length) * 100}%;background:${color}"></i>`;
    legend += `<span><b>${count}</b> ${mood}</span>`;
  }
  return `<div style="margin-bottom:20px"><div class="mix" role="img" aria-label="Sentiment">${bar}</div><div class="mix-legend">${legend}</div></div>`;
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
      <section class="card"><div class="card-top"><h3>Observations (${observations.length})</h3></div>${sentimentMix(observations)}${observationList}</section>
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
    ${dbPanel(['Foreign key (1:N)', 'ON DELETE RESTRICT', 'NOT NULL'], `
-- Each observation must belong to a session (session_id is NOT NULL + foreign key)
select title, sentiment from observation where session_id = ${s.id};

-- The database refuses to delete a session that still has observations
alter table observation add constraint observation_session_fk
  foreign key (session_id) references research_session (id) on delete restrict;`)}`;

  $('#edit').onclick = () => editSession(s);
  if ($('#add-obs')) $('#add-obs').onclick = () => editRecord('observation', null, { sessionId: s.id });
}
