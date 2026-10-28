// Home page: a greeting, the latest decision, totals, the featured
// project, and recent work. Kept to a few calm blocks on purpose.

function pageHome() {
  setCrumbs(['Home']);
  const projects = data.research_project;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  if (!projects.length) {
    view.innerHTML = `
      <section class="hero"><h1>${greeting}.</h1><p>Every design decision has a story.</p></section>
      <div class="empty section">
        <h2>There's no research here yet</h2>
        <p>${MODE === 'supabase'
          ? 'Your Supabase database is connected but empty. Run <code>sql/04_seed_data.sql</code> in the Supabase SQL Editor to load the sample study, or create your own project.'
          : 'Create a project to get started.'}</p>
        <button class="btn btn-dark" id="first-project">${icon('plus', 16)} New project</button>
      </div>`;
    $('#first-project').onclick = () => editProject();
    return;
  }

  // Featured project: the active project with the most evidence.
  const featured = activeProjects()
    .map((p) => ({ p, total: STAGES.reduce((n, s) => n + projectCounts(p.id)[s.type], 0) }))
    .sort((a, b) => b.total - a.total)[0]?.p || projects[0];
  const counts = projectCounts(featured.id);
  const team = data.project_researcher.filter((l) => l.project_id === featured.id).map((l) => byId('researcher', l.researcher_id)).filter(Boolean);
  const maxStage = Math.max(1, ...STAGES.map((s) => data[s.type].length));
  const newest = (list, key = 'created_at') => [...list].sort((a, b) => (b[key] > a[key] ? 1 : -1));
  const recentSessions = newest(data.research_session, 'session_date').slice(0, 4);
  const recentInsights = newest(data.insight).slice(0, 4);
  const decision = newest(data.design_decision)[0];
  const story = decision ? lineage('design_decision', decision.id) : null;
  const day = (d) => new Date(d + 'T00:00');

  view.innerHTML = `
    <div class="hero-grid">
      <section class="hero">
        <span class="eyebrow">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <h1>${greeting}.<br>Every decision has <em>a story.</em></h1>
        <p>Search what participants said and did, or follow a decision back to the evidence behind it.</p>
        <form class="hero-search" id="hero-search" role="search">
          ${icon('sparkles', 20)}
          <input id="hero-q" type="search" placeholder="Search observations, insights and decisions" aria-label="Search research">
          <button class="btn btn-dark" type="submit">Search</button>
        </form>
      </section>
      ${decision ? `<a class="spotlight" href="#/trail/design_decision/${decision.id}">
        <span class="eyebrow">Latest decision</span>
        <h3>${esc(decision.title)}</h3>
        <p>Backed by ${plural(story.byStage.observation.length, 'observation')} from ${plural(new Set(story.byStage.observation.map((o) => o.session_id)).size, 'session')}.</p>
        <div class="spot-chain" aria-hidden="true">${STAGES.map((s) => `<span class="stage-${s.type}" style="opacity:${story.byStage[s.type].length ? 1 : 0.25}"></span>`).join('')}</div>
        <span class="btn btn-light btn-small">${icon('waypoints', 15)} See its story</span>
      </a>` : ''}
    </div>

    <section class="stats" aria-label="Totals">
      ${[
        ['#/projects', 'stat-feature', 'folder-kanban', 'Projects', projects.length, `${activeProjects().length} in progress`],
        ['#/sessions', 'stage-finding', 'calendar-days', 'Sessions', data.research_session.length, `${data.research_session.filter((s) => s.status === 'planned').length} coming up`],
        ['#/people', 'stage-observation', 'users', 'Participants', data.participant.length, 'Anonymous codes only'],
        ['#/library?type=insight', 'stage-insight', 'sparkles', 'Insights', data.insight.length, 'Ready to act on'],
      ].map(([href, cls, ic, label, value, note]) => `
        <a class="stat ${cls}" href="${href}">
          <span class="stat-icon">${icon(ic, 20)}</span>
          <span>${label}</span><strong>${value}</strong><small>${note}</small>
          <span class="go">${icon('arrow-up-right', 18)}</span>
        </a>`).join('')}
    </section>

    <section class="bento">
      <article class="card featured">
        <div class="card-top"><span class="eyebrow">Featured project</span>${statusPill(featured.status)}</div>
        <h2><a href="#/projects/${featured.id}">${esc(featured.title)}</a></h2>
        <p class="lede">${esc(featured.research_objective)}</p>
        <div class="chain">
          ${STAGES.map((s) => `<a class="chain-step stage-${s.type}" href="#/library?project=${featured.id}&type=${s.type}">
            <strong>${counts[s.type]}</strong><span>${s.plural}</span></a>`).join('')}
        </div>
        <div class="card-foot">
          <div class="avatars">${team.map((r) => avatar(r.full_name, 32)).join('')}</div>
          ${meta(plural(team.length, 'researcher'), plural(counts.sessions, 'session'))}
          <a class="btn btn-small" href="#/projects/${featured.id}">Open project ${icon('arrow-right', 15)}</a>
        </div>
      </article>

      <article class="card">
        <div class="card-top"><h3>Evidence pipeline</h3></div>
        <div class="bars">
          ${STAGES.map((s) => `<a href="#/library?type=${s.type}" class="stage-${s.type}">
            <span class="bar-label">${s.plural}</span><span class="bar-value">${data[s.type].length}</span>
            <span class="bar"><i style="width:${Math.round((data[s.type].length / maxStage) * 100)}%"></i></span></a>`).join('')}
        </div>
      </article>
    </section>

    <div class="two-col even">
      <article class="card">
        <div class="card-top"><h3>Recent sessions</h3><a class="small" href="#/sessions">View all</a></div>
        <ul class="rows">
          ${recentSessions.map((s) => `<li><a href="#/sessions/${s.id}">
            <span class="date-chip"><b>${day(s.session_date).getDate()}</b>${day(s.session_date).toLocaleString('en-GB', { month: 'short' })}</span>
            <span class="row-text"><strong>${esc(s.title)}</strong>${meta(esc(byId('research_project', s.project_id)?.title), esc(byId('research_method', s.method_id)?.name))}</span>
            ${s.status === 'planned' ? statusPill('planned') : `<span class="chev">${icon('chevron-right', 18)}</span>`}</a></li>`).join('')}
        </ul>
      </article>
      <article class="card">
        <div class="card-top"><h3>Latest insights</h3><a class="small" href="#/library?type=insight">View all</a></div>
        <ul class="rows">
          ${recentInsights.map((i) => `<li><a href="#/record/insight/${i.id}" class="stage-insight">
            <span class="dot"></span>
            <span class="row-text"><strong>${esc(i.title)}</strong>${meta(esc(byId('research_project', i.project_id)?.title), `${esc(i.impact)} impact`)}</span>
            <span class="chev">${icon('chevron-right', 18)}</span></a></li>`).join('')}
        </ul>
      </article>
    </div>`;

  $('#hero-search').onsubmit = (e) => { e.preventDefault(); go('/library?q=' + encodeURIComponent($('#hero-q').value.trim())); };
}
