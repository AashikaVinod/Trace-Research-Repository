// ===================================================================
// Home page: greeting, totals and charts that summarise the research.
// ===================================================================

function pageHome() {
  setCrumbs(['Home']);
  const projects = data.research_project;

  if (projects.length === 0) {
    view.innerHTML = `
      <section class="hero"><h1>Welcome to TRACE.</h1><p>Every design decision has a story.</p></section>
      <div class="empty row-gap">
        <h2>There's no research here yet</h2>
        <p>${MODE === 'supabase'
          ? 'Your Supabase database is connected but empty. Run <code>sql/04_seed_data.sql</code> in the Supabase SQL Editor to load the sample study, or create your own project.'
          : 'Create a project to get started.'}</p>
        <button class="btn btn-dark" id="first-project">${icon('plus', 16)} New project</button>
      </div>`;
    $('#first-project').onclick = () => editProject();
    return;
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstStart = projects.map((p) => p.start_date).sort()[0];
  const completed = data.research_session.filter((s) => s.status === 'completed').length;
  const archived = projects.length - activeProjects().length;
  const usedSegments = new Set(data.participant_segment.map((l) => l.segment_id)).size;

  // The newest decision and the evidence behind it.
  const newestDecision = [...data.design_decision].sort((a, b) => (b.created_at > a.created_at ? 1 : -1))[0];
  const decisionTrail = newestDecision ? lineage('design_decision', newestDecision.id) : null;

  const sentiment = sentimentCounts();
  const recentInsights = [...data.insight].sort((a, b) => (b.created_at > a.created_at ? 1 : -1)).slice(0, 4);

  view.innerHTML = `
    ${introCard()}
    <div class="hero-grid">
      <section class="hero">
        <span class="label-sm">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <h1>${greeting}.</h1>
        <p>Since ${formatDate(firstStart)}, your team has run ${plural(completed, 'session')} and turned ${plural(data.observation.length, 'observation')} into ${plural(data.design_decision.length, 'design decision')}.</p>
        <form class="hero-search" id="hero-search" role="search">
          ${icon('search', 18)}
          <label class="sr" for="hero-q">Search research</label>
          <input id="hero-q" type="search" placeholder="Search what participants said and did">
          <button class="btn btn-dark" type="submit">Search</button>
        </form>
        <div class="hero-actions">
          <button class="suggestion" data-ask="What are the key insights?">${icon('message-circle', 14)} What are the key insights?</button>
          <button class="suggestion" data-ask="Where are the gaps in our evidence?">Where are the gaps?</button>
        </div>
      </section>
      ${newestDecision ? `<a class="spotlight" href="#/trail/design_decision/${newestDecision.id}">
        <span class="label-sm">Latest decision</span>
        <h3>${esc(newestDecision.title)}</h3>
        <p>Backed by ${plural(decisionTrail.byStage.observation.length, 'observation')} from ${plural(new Set(decisionTrail.byStage.observation.map((o) => o.session_id)).size, 'session')}.</p>
        <div class="spot-chain" aria-hidden="true">${STAGES.map((s) => `<span class="stage-${s.type}" style="opacity:${decisionTrail.byStage[s.type].length ? 1 : 0.25}"></span>`).join('')}</div>
        <span class="btn btn-light btn-small">${icon('waypoints', 15)} View evidence trail</span>
      </a>` : ''}
    </div>

    <section class="stats" aria-label="Totals">
      ${statLink('#/projects', 'Projects', projects.length, archived ? `${activeProjects().length} active, ${archived} archived` : 'All active')}
      ${statLink('#/sessions', 'Sessions', data.research_session.length, `${data.research_session.filter((s) => s.status === 'planned').length} planned`)}
      ${statLink('#/people', 'Participants', data.participant.length, `Across ${plural(usedSegments, 'segment')}`)}
      ${statLink('#/library?type=insight', 'Insights', data.insight.length, `From ${plural(data.finding.length, 'finding')}`)}
    </section>

    <section class="card" aria-labelledby="flow-title">
      <div class="card-top"><h3 id="flow-title">How evidence becomes decisions</h3><a class="small" href="#/trail">Open the evidence trail</a></div>
      ${evidenceFlow()}
    </section>

    <div class="grid-3 row-gap">
      <article class="card">
        <div class="card-top"><h3>Sessions per month</h3><a class="small" href="#/sessions">View all</a></div>
        ${columnChart(sessionsByMonth().map((m) => ({ label: m.label, value: m.sessions })))}
      </article>
      <article class="card">
        <div class="card-top"><h3>How sessions felt</h3></div>
        ${donutChart([
          { label: 'Negative', value: sentiment.negative, color: CHART_COLORS.negative },
          { label: 'Neutral', value: sentiment.neutral, color: CHART_COLORS.neutral },
          { label: 'Positive', value: sentiment.positive, color: CHART_COLORS.positive },
        ], 'observations')}
      </article>
      <article class="card">
        <div class="card-top"><h3>Latest insights</h3><a class="small" href="#/library?type=insight">View all</a></div>
        <ul class="rows">${recentInsights.map((i) => `<li><a href="#/record/insight/${i.id}" class="stage-insight">
          <span class="dot"></span>
          <span class="row-text"><strong>${esc(i.title)}</strong>${meta(esc(byId('research_project', i.project_id).title), `${esc(i.impact)} impact`)}</span></a></li>`).join('')}
        </ul>
      </article>
    </div>

    ${dbPanel(['Aggregate functions (COUNT)', 'View', 'GROUP BY', 'FILTER', 'date_trunc'], `
-- The totals at the top come from one view (sql/06_views.sql)
select * from v_dashboard;

-- The sentiment donut groups observations
select sentiment, count(*) from observation group by sentiment;

-- Sessions per month
select to_char(date_trunc('month', session_date), 'YYYY-MM') as month, count(*)
from research_session group by 1 order by 1;`)}`;

  $('#hero-search').onsubmit = (event) => {
    event.preventDefault();
    go('/library?q=' + encodeURIComponent($('#hero-q').value.trim()));
  };
  $$('[data-ask]', view).forEach((button) => { button.onclick = () => openAssistant(button.dataset.ask); });
  if ($('#intro-close')) {
    $('#intro-close').onclick = () => { localStorage.setItem('trace.intro', 'done'); render(); };
  }
}

// The five steps as connected boxes. Each arrow shows how much of a step
// is used by the next one, so weak links stand out at a glance.
function evidenceFlow() {
  const hints = { observation: 'What people did and said', finding: 'Patterns across sessions', insight: 'Why they matter', recommendation: 'What should change', design_decision: 'What the team chose' };
  let html = '<div class="flow">';
  for (const stage of STAGES) {
    html += `<a class="flow-node stage-${stage.type}" href="#/library?type=${stage.type}">
      <span class="step">${stage.step}</span><strong>${data[stage.type].length}</strong><span>${stage.plural}</span><small>${hints[stage.type]}</small></a>`;
    if (stage.step < 5) {
      html += `<span class="flow-link" title="Share of ${stage.plural.toLowerCase()} used by the next step"><span class="line"></span>${linkedPercent(stage.type)}% used</span>`;
    }
  }
  return html + '</div>';
}

function statLink(href, label, value, note) {
  return `<a class="stat" href="${href}"><span>${label}</span><strong>${value}</strong><small>${note}</small></a>`;
}

// A one-time welcome that explains the five steps (HCI: help and documentation).
function introCard() {
  let seen = false;
  try { seen = localStorage.getItem('trace.intro') === 'done'; } catch (error) { seen = false; }
  if (seen) return '';
  return `<section class="intro" aria-label="How TRACE works">
    ${logo(44)}
    <div>
      <h2>How TRACE works</h2>
      <p class="muted">Research moves through five steps. Each step links to the one before it, so any decision can be traced back to real evidence.</p>
      <div class="steps">${STAGES.map((s) => `<span class="pill pill-${['purple', 'blue', 'green', 'orange', 'dark'][s.step - 1]}">${s.step}. ${s.label}</span>`).join('')}</div>
    </div>
    <button class="icon-btn close" id="intro-close" aria-label="Dismiss">${icon('x')}</button>
  </section>`;
}
