// Home page: greeting, totals, the featured project and recent work.

function pageHome() {
  setCrumbs(['Home']);
  const projects = data.research_project;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  if (!projects.length) {
    view.innerHTML = `
      <section class="hero"><h1>${greeting}.</h1><p>Every design decision has a story.</p></section>
      <div class="empty">
        <h2>There's no research here yet</h2>
        <p>${MODE === 'supabase'
          ? 'Your Supabase database is connected but empty. Run <code>sql/04_seed_data.sql</code> in the Supabase SQL Editor to load the sample project, or create your own.'
          : 'Create a project to get started.'}</p>
        <button class="btn btn-dark" id="first-project">${icon('plus', 16)} New project</button>
      </div>`;
    $('#first-project').onclick = () => editProject();
    return;
  }

  // The featured project: the active project with the most evidence.
  const featured = activeProjects()
    .map((p) => ({ p, total: STAGES.reduce((n, s) => n + projectCounts(p.id)[s.type], 0) }))
    .sort((a, b) => b.total - a.total)[0]?.p || projects[0];
  const counts = projectCounts(featured.id);
  const team = data.project_researcher.filter((l) => l.project_id === featured.id).map((l) => byId('researcher', l.researcher_id)).filter(Boolean);
  const maxStage = Math.max(1, ...STAGES.map((s) => data[s.type].length));

  const recentSessions = [...data.research_session].sort((a, b) => (b.session_date > a.session_date ? 1 : -1)).slice(0, 4);
  const recentInsights = [...data.insight].sort((a, b) => (b.created_at > a.created_at ? 1 : -1)).slice(0, 3);
  const latestDecision = [...data.design_decision].sort((a, b) => (b.created_at > a.created_at ? 1 : -1))[0];
  const decisionTrail = latestDecision ? lineage('design_decision', latestDecision.id) : null;

  view.innerHTML = `
    <section class="hero">
      <h1>${greeting}.</h1>
      <p>Every design decision has a story. Here's where yours stand.</p>
      <form class="hero-search" id="hero-search">
        ${icon('sparkles', 20)}
        <input id="hero-q" type="search" placeholder="Search observations, findings, insights and decisions…" aria-label="Search research">
        <button class="btn btn-dark" type="submit">Search</button>
      </form>
    </section>

    <section class="stats">
      <a class="stat stat-feature" href="#/projects"><span>Projects</span><strong>${projects.length}</strong><small>${activeProjects().length} in use</small>${icon('arrow-up-right', 18)}</a>
      <a class="stat" href="#/sessions"><span>Research sessions</span><strong>${data.research_session.length}</strong><small>${data.research_session.filter((s) => s.status === 'planned').length} planned</small>${icon('arrow-up-right', 18)}</a>
      <a class="stat" href="#/people"><span>Participants</span><strong>${data.participant.length}</strong><small>Codes only, no names</small>${icon('arrow-up-right', 18)}</a>
      <a class="stat" href="#/library?type=insight"><span>Insights</span><strong>${data.insight.length}</strong><small>Documented so far</small>${icon('arrow-up-right', 18)}</a>
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
          <div class="avatars">${team.map((r) => avatar(r.full_name, 30)).join('')}</div>
          <span class="muted small">${plural(counts.sessions, 'session')}</span>
          <a class="btn btn-small" href="#/projects/${featured.id}">Open project ${icon('arrow-right', 15)}</a>
        </div>
      </article>

      <article class="card">
        <div class="card-top"><h3>Evidence pipeline</h3></div>
        <ul class="bars">
          ${STAGES.map((s) => `<li><a href="#/library?type=${s.type}">
            <span class="bar-label">${s.plural}</span>
            <span class="bar"><i class="stage-${s.type}" style="width:${Math.round((data[s.type].length / maxStage) * 100)}%"></i></span>
            <span class="bar-value">${data[s.type].length}</span></a></li>`).join('')}
        </ul>
      </article>

      <article class="card">
        <div class="card-top"><h3>Recent sessions</h3><a class="small" href="#/sessions">See all</a></div>
        <ul class="rows">
          ${recentSessions.map((s) => `<li><a href="#/sessions/${s.id}">
            <span class="date-chip"><b>${new Date(s.session_date + 'T00:00').getDate()}</b>${new Date(s.session_date + 'T00:00').toLocaleString('en-GB', { month: 'short' })}</span>
            <span><strong>${esc(s.title)}</strong><small>${esc(byId('research_project', s.project_id)?.title)}</small></span>
            ${s.status === 'planned' ? statusPill('planned') : ''}</a></li>`).join('')}
        </ul>
      </article>

      <article class="card">
        <div class="card-top"><h3>Latest insights</h3><a class="small" href="#/library?type=insight">See all</a></div>
        <ul class="rows">
          ${recentInsights.map((i) => `<li><a href="#/record/insight/${i.id}">
            <span class="dot stage-insight"></span>
            <span><strong>${esc(i.title)}</strong><small>${esc(byId('research_project', i.project_id)?.title)} · ${esc(i.impact)} impact</small></span></a></li>`).join('')}
        </ul>
      </article>

      ${latestDecision ? `<article class="card spotlight">
        <div class="card-top"><span class="eyebrow">Latest decision</span>${statusPill(latestDecision.status)}</div>
        <h3>${esc(latestDecision.title)}</h3>
        <p>Backed by <strong>${plural(decisionTrail.byStage.observation.length, 'observation')}</strong>
          from ${plural(new Set(decisionTrail.byStage.observation.map((o) => o.session_id)).size, 'session')}.</p>
        <a class="btn btn-light btn-small" href="#/trail/design_decision/${latestDecision.id}">${icon('waypoints', 15)} See its story</a>
      </article>` : ''}
    </section>`;

  $('#hero-search').onsubmit = (e) => { e.preventDefault(); go('/library?q=' + encodeURIComponent($('#hero-q').value.trim())); };
}
