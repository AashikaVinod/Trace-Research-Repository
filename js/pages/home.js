// ===================================================================
// Home: the research dashboard.
// Row 1  four stat cards (one highlighted), with change badges and sparklines
// Row 2  research activity, the next session, evidence in use (gauge)
// Row 3  project progress, how sessions felt, strongest decisions
// Row 4  the latest decision, activity over 16 weeks, latest insights
// ===================================================================

function pageHome() {
  setCrumbs(['Dashboard']);
  if (data.research_project.length === 0) {
    view.innerHTML = `<div class="empty"><h2>There's no research here yet</h2><p>Create a project to get started.</p>
      <button class="btn btn-dark" id="first-project">${icon('plus', 16)} New project</button></div>`;
    $('#first-project').onclick = () => editProject();
    return;
  }

  const projects = data.research_project;
  const sessionMonths = countsByMonth(data.research_session, 'session_date');
  const observationMonths = countsByMonth(data.observation, 'created_at');
  const decisionMonths = countsByMonth(data.design_decision, 'created_at');
  const upNext = nextSession();
  const lead = [...data.design_decision].sort((a, b) => (b.created_at > a.created_at ? 1 : -1))[0];
  const story = lineage('design_decision', lead.id);

  view.innerHTML = `
    ${introNote()}
    <header class="page-head">
      <div><h1>Dashboard</h1><p>Trace every design decision back to what people actually did and said.</p></div>
      <div class="actions-row">
        <button class="btn" id="add-evidence">${icon('file-text', 16)} Add evidence</button>
        <button class="btn btn-dark" id="add-project">${icon('plus', 16)} New project</button>
      </div>
    </header>

    <div class="dash">
      <a class="card stat-card is-featured" href="#/projects">
        <div class="stat-top"><span>Research projects</span><span class="round-link">${icon('arrow-up-right', 16)}</span></div>
        <strong>${projects.length}</strong>
        <span class="delta delta-light">${activeProjects().length} active, ${projects.length - activeProjects().length} archived</span>
      </a>
      ${statCard('#/sessions', 'Sessions run', data.research_session.length, addedInLastDays(data.research_session, 'session_date', 30), sessionMonths)}
      ${statCard('#/library?type=observation', 'Observations', data.observation.length, addedInLastDays(data.observation, 'created_at', 30), observationMonths)}
      ${statCard('#/library?type=design_decision', 'Design decisions', data.design_decision.length, addedInLastDays(data.design_decision, 'created_at', 30), decisionMonths)}

      <section class="card span-2">
        <div class="card-top"><div><h3>Research activity</h3><p class="card-sub">Sessions per month</p></div><a class="round-link" href="#/sessions" aria-label="All sessions">${icon('arrow-up-right', 16)}</a></div>
        ${pillColumns(sessionMonths.map((m) => ({ label: m.label, value: m.count, highlight: m.isCurrent })))}
      </section>

      <section class="card up-next">
        <div class="card-top"><h3>Up next</h3>${icon('bell', 17)}</div>
        ${upNext ? `
          <p class="up-title">${esc(upNext.title)}</p>
          <p class="card-sub">${esc(byId("research_method", upNext.method_id).name)}, ${esc(byId("research_project", upNext.project_id).title)}</p>
          <p class="up-when">${icon('calendar-days', 15)} ${formatDate(upNext.session_date)} <span>${daysUntil(upNext.session_date)}</span></p>
          <a class="btn btn-green" href="#/sessions/${upNext.id}">${icon('play', 15)} Open session</a>`
        : `<p class="quiet">No sessions planned. <a class="text-link" href="#/sessions">Plan one</a></p>`}
      </section>

      <section class="card">
        <div class="card-top"><h3>Evidence in use</h3></div>
        ${gauge(evidenceInUsePercent(), 'feeds the next step')}
        <ul class="legend legend-row"><li><i style="background:var(--green)"></i>Used</li><li><i class="hatch-swatch"></i>Waiting</li></ul>
      </section>

      <section class="card span-2">
        <div class="card-top"><div><h3>Project progress</h3><p class="card-sub">Evidence at each step, per project</p></div><a class="round-link" href="#/projects" aria-label="All projects">${icon('arrow-up-right', 16)}</a></div>
        <ul class="progress-list">${activeProjects().map(projectProgressRow).join('')}</ul>
        <ul class="legend legend-row">${STAGES.map((s) => `<li><i class="stage-${s.type}" style="background:var(--c)"></i>${s.plural}</li>`).join('')}</ul>
      </section>

      <section class="card">
        <div class="card-top"><h3>How sessions felt</h3></div>
        ${sentimentFaces(sentimentCounts())}
        <p class="card-sub" style="margin-top:12px">Across ${plural(data.observation.length, 'observation')}.</p>
      </section>

      <section class="card">
        <div class="card-top"><h3>Best-backed decisions</h3></div>
        ${rankList(decisionStrength().slice(0, 4).map((d) => ({ label: d.title, value: d.observations, unit: 'obs', href: `#/trail/design_decision/${d.id}`, note: byId('research_project', d.project_id).title })))}
      </section>

      <article class="card span-2 lead-card">
        <div class="card-top"><div><p class="card-sub">Latest decision in ${esc(byId("research_project", lead.project_id).title)}</p></div>${statusPill(lead.status)}</div>
        <h2><a href="#/trail/design_decision/${lead.id}">${esc(lead.title)}</a></h2>
        <p class="muted">${esc(lead.description)}</p>
        <div class="chain-steps">${STAGES.map((s) => `<span class="stage-${s.type}"><b>${story.byStage[s.type].length}</b>${story.byStage[s.type].length === 1 ? s.label : s.plural}</span>`).join('')}</div>
        <a class="text-link" href="#/trail/design_decision/${lead.id}">See the full evidence trail ${icon('arrow-right', 14)}</a>
      </article>

      <section class="card">
        <div class="card-top"><h3>Research rhythm</h3></div>
        ${activityDots(sessionsByWeek(16))}
        <p class="card-sub" style="margin-top:12px">${sessionsByWeek(16).filter((w) => w.count).length} of the last 16 weeks had sessions, up to ${formatDate(researchToday().toISOString().slice(0, 10))}.</p>
      </section>

      <section class="card">
        <div class="card-top"><h3>Latest insights</h3><a class="round-link" href="#/library?type=insight" aria-label="All insights">${icon('arrow-up-right', 16)}</a></div>
        <ul class="mini-list">${[...data.insight].sort((a, b) => (b.created_at > a.created_at ? 1 : -1)).slice(0, 3).map((i) => `
          <li><a href="#/record/insight/${i.id}"><span class="dot stage-insight"></span><span><strong>${esc(i.title)}</strong><small>${esc(i.impact)} impact</small></span></a></li>`).join('')}</ul>
      </section>
    </div>

    ${dbPanel(['Aggregate functions (COUNT)', 'View', 'GROUP BY month', 'Recursive CTE'], `
-- Totals for the cards (sql/06_views.sql)
select * from v_dashboard;

-- Sessions per month for the activity chart
select to_char(date_trunc('month', session_date), 'YYYY-MM') as month, count(*)
from research_session group by 1 order by 1;

-- Best-backed decisions: a five-table JOIN with COUNT(DISTINCT)
select title, observations from v_decision_strength order by observations desc limit 4;`)}`;

  $('#add-project').onclick = () => editProject();
  $('#add-evidence').onclick = () => openNewMenu();
  if ($('#intro-close')) $('#intro-close').onclick = () => { localStorage.setItem('trace.intro', 'done'); render(); };
}

function statCard(href, label, value, recent, months) {
  return `<a class="card stat-card" href="${href}">
    <div class="stat-top"><span>${label}</span><span class="round-link">${icon('arrow-up-right', 16)}</span></div>
    <div class="stat-mid"><strong>${value}</strong>${sparkline(months.map((m) => m.count), 'var(--green)')}</div>
    ${deltaBadge(recent, 'latest month')}
  </a>`;
}

// One project as a row: name, team, and a bar split by evidence stage.
function projectProgressRow(project) {
  const counts = projectCounts(project.id);
  const team = data.project_researcher.filter((l) => l.project_id === project.id).map((l) => byId('researcher', l.researcher_id));
  return `<li><a href="#/projects/${project.id}">
    <span class="progress-name"><strong>${esc(project.title)}</strong><small>${plural(counts.sessions, 'session')}</small></span>
    <span class="avatars">${team.map((r) => avatar(r.full_name, 26)).join('')}</span>
    <span class="progress-bar">${evidenceBar(project.id)}</span>
  </a></li>`;
}


// A one-line welcome that explains the idea (HCI: help and documentation).
function introNote() {
  let seen = false;
  try { seen = localStorage.getItem('trace.intro') === 'done'; } catch (error) { seen = false; }
  if (seen) return '';
  return `<p class="intro-note">${logo(20)}
    <span><strong>How TRACE works:</strong> research moves through five steps, from observation to decision. Each step links to the one before, so every decision can be traced back to real evidence.</span>
    <button class="icon-btn" id="intro-close" aria-label="Dismiss">${icon('x', 16)}</button></p>`;
}
