// ===================================================================
// Home: an editorial front page for the research.
// A headline built from real numbers, the latest decision as the lead
// story, a small "in numbers" box, and the evidence pipeline.
// ===================================================================

function pageHome() {
  setCrumbs(['Home']);
  const projects = data.research_project;

  if (projects.length === 0) {
    view.innerHTML = `<div class="empty"><h2>There's no research here yet</h2><p>Create a project to get started.</p>
      <button class="btn btn-dark" id="first-project">${icon('plus', 16)} New project</button></div>`;
    $('#first-project').onclick = () => editProject();
    return;
  }

  const decisions = data.design_decision.length;
  const lead = [...data.design_decision].sort((a, b) => (b.created_at > a.created_at ? 1 : -1))[0];
  const story = lineage('design_decision', lead.id);
  const leadProject = byId('research_project', lead.project_id);
  const sessionsBehind = new Set(story.byStage.observation.map((o) => o.session_id)).size;
  const recentSessions = [...data.research_session].sort((a, b) => (b.session_date > a.session_date ? 1 : -1)).slice(0, 4);
  const recentInsights = [...data.insight].sort((a, b) => (b.created_at > a.created_at ? 1 : -1)).slice(0, 4);
  const sentiment = sentimentCounts();
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // The evidence chain behind the lead story, written out like a byline.
  const chain = STAGES.map((s) => `<span><b>${story.byStage[s.type].length}</b> ${story.byStage[s.type].length === 1 ? s.label.toLowerCase() : s.plural.toLowerCase()}</span>`)
    .join(`<i aria-hidden="true">${icon('arrow-right', 14)}</i>`);

  view.innerHTML = `
    ${introNote()}
    <header class="masthead">
      <p class="kicker">The research desk <span>${today}</span></p>
      <h1>${plural(decisions, 'design decision')}, each traced back to what people actually did and said.</h1>
    </header>

    <div class="front">
      <article class="lead-story">
        <p class="kicker">Latest decision <span>${esc(leadProject.title)}</span></p>
        <h2><a href="#/trail/design_decision/${lead.id}">${esc(lead.title)}</a></h2>
        <p class="standfirst">${esc(lead.description)}</p>
        <p class="byline">${chain}</p>
        <p class="lead-foot">${statusPill(lead.status)}
          <span class="quiet">Rests on ${plural(story.byStage.observation.length, 'observation')} from ${plural(sessionsBehind, 'session')}.</span>
          <a class="text-link" href="#/trail/design_decision/${lead.id}">Read the full trail ${icon('arrow-right', 14)}</a></p>
      </article>

      <aside class="fact-box" aria-label="In numbers">
        <p class="kicker">In numbers</p>
        <dl>
          ${fact('#/projects', 'Projects', projects.length, `${activeProjects().length} active`)}
          ${fact('#/sessions', 'Sessions', data.research_session.length, `${data.research_session.filter((s) => s.status === 'planned').length} planned`)}
          ${fact('#/people', 'Participants', data.participant.length, 'by code only')}
          ${fact('#/library?type=insight', 'Insights', data.insight.length, `from ${plural(data.finding.length, 'finding')}`)}
        </dl>
        <div class="mood">
          <p class="kicker">How sessions felt</p>
          ${sentimentBar(sentiment)}
        </div>
      </aside>
    </div>

    <section class="pipeline-section" aria-labelledby="pipeline-title">
      <div class="section-head"><h2 id="pipeline-title">From observation to decision</h2><a class="text-link" href="#/trail">Open the evidence trail ${icon('arrow-right', 14)}</a></div>
      <ol class="pipeline">${STAGES.map((s) => `
        <li class="stage-${s.type}"><a href="#/library?type=${s.type}">
          <span class="pipe-step">${s.step}</span>
          <strong>${data[s.type].length}</strong>
          <span class="pipe-name">${s.plural}</span>
          ${s.step < 5 ? `<span class="pipe-used">${linkedPercent(s.type)}% carried forward</span>` : '<span class="pipe-used">decided</span>'}
        </a></li>`).join('')}
      </ol>
    </section>

    <div class="columns-2">
      <section>
        <div class="section-head"><h2>Recent sessions</h2><a class="text-link" href="#/sessions">All sessions</a></div>
        <ul class="index">${recentSessions.map((s) => `<li><a href="#/sessions/${s.id}">
          <time>${formatDate(s.session_date)}</time>
          <span><strong>${esc(s.title)}</strong>${meta(esc(byId('research_project', s.project_id).title), esc(byId('research_method', s.method_id).name))}</span>
          ${s.status === 'planned' ? statusPill('planned') : ''}</a></li>`).join('')}
        </ul>
      </section>
      <section>
        <div class="section-head"><h2>Latest insights</h2><a class="text-link" href="#/library?type=insight">All insights</a></div>
        <ul class="index index-serif">${recentInsights.map((i) => `<li><a href="#/record/insight/${i.id}">
          <span><strong>${esc(i.title)}</strong>${meta(esc(byId('research_project', i.project_id).title), `${esc(i.impact)} impact`)}</span></a></li>`).join('')}
        </ul>
      </section>
    </div>

    ${dbPanel(['Aggregate functions (COUNT)', 'View', 'Recursive CTE', 'GROUP BY'], `
-- The numbers come from one view (sql/06_views.sql)
select * from v_dashboard;

-- The lead story's evidence chain comes from the recursive lineage function
select record_type, count(*) from trace_lineage('design_decision', ${lead.id}) group by record_type;

-- How sessions felt
select sentiment, count(*) from observation group by sentiment;`)}`;

  if ($('#intro-close')) {
    $('#intro-close').onclick = () => { localStorage.setItem('trace.intro', 'done'); render(); };
  }
}

function fact(href, label, value, note) {
  return `<a class="fact" href="${href}"><dt>${label}</dt><dd><strong>${value}</strong><span>${note}</span></dd></a>`;
}

// A thin bar split into negative / neutral / positive, with a legend.
function sentimentBar(counts) {
  const total = counts.negative + counts.neutral + counts.positive || 1;
  const parts = [['negative', CHART_COLORS.negative], ['neutral', CHART_COLORS.neutral], ['positive', CHART_COLORS.positive]];
  return `<div class="mix" role="img" aria-label="${counts.negative} negative, ${counts.neutral} neutral, ${counts.positive} positive">
      ${parts.map(([mood, color]) => `<i style="width:${(counts[mood] / total) * 100}%;background:${color}"></i>`).join('')}</div>
    <div class="mix-legend">${parts.map(([mood]) => `<span><b>${counts[mood]}</b> ${mood}</span>`).join('')}</div>`;
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
