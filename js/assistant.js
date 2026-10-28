// ===================================================================
// assistant.js - "Quick answers": a panel you consult like a reference
// desk. Pick a common question or type your own.
//
// By default the answers come straight from your data (counts, joins
// and groupings over the loaded tables), so it always works, even
// offline. If AI_ASSISTANT is true in config.js, questions are sent to
// /api/ask (a Vercel function that calls Claude) instead, with a short
// summary of the research as context.
// ===================================================================

// True only if config.js turns AI on (and still works with an older config.js).
const AI_ON = typeof AI_ASSISTANT !== 'undefined' && AI_ASSISTANT === true;

const ASK_SUGGESTIONS = [
  'What are the key insights?',
  'Which decisions have the strongest evidence?',
  'Where are the gaps in our evidence?',
  'What did participants struggle with?',
  'Give me an overview of each project',
  'Who did we talk to?',
];

function buildAssistant() {
  const panel = document.createElement('aside');
  panel.className = 'ask';
  panel.id = 'ask';
  panel.setAttribute('aria-label', 'Quick answers');
  panel.hidden = true;
  panel.innerHTML = `
    <header class="ask-head">
      <div><h2>Quick answers</h2><p>${AI_ON ? 'Written by AI from a summary of your research' : 'Straight from your research data'}</p></div>
      <button class="icon-btn" id="ask-close" aria-label="Close quick answers">${icon('x')}</button>
    </header>
    <div class="ask-log" id="ask-log" aria-live="polite">
      <p class="kicker">Common questions</p>
      <ul class="ask-index">${ASK_SUGGESTIONS.map((q) => `<li><button data-ask="${esc(q)}">${esc(q)}${icon('arrow-right', 14)}</button></li>`).join('')}</ul>
    </div>
    <form class="ask-form" id="ask-form">
      <label class="sr" for="ask-input">Ask your own question</label>
      <input class="input" id="ask-input" placeholder="Ask your own question" autocomplete="off">
      <button class="btn btn-dark" type="submit">Ask</button>
    </form>`;
  document.body.append(panel);

  $('#ask-close').onclick = closeAssistant;
  $('#ask-form').onsubmit = (event) => {
    event.preventDefault();
    const question = $('#ask-input').value.trim();
    if (question) ask(question);
    $('#ask-input').value = '';
  };
  panel.addEventListener('click', (event) => {
    const item = event.target.closest('[data-ask]');
    if (item) ask(item.dataset.ask);
    if (event.target.closest('a')) closeAssistant();
  });
  panel.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeAssistant(); });
}

function openAssistant(question = '') {
  const panel = $('#ask');
  panel.hidden = false;
  requestAnimationFrame(() => panel.classList.add('open'));
  $('#ask-input').focus();
  if (question) ask(question);
}

function closeAssistant() {
  const panel = $('#ask');
  panel.classList.remove('open');
  setTimeout(() => { panel.hidden = true; }, 250);
  $('#ask-btn').focus();
}

// Each answer is filed as an entry: the question, the answer, its source.
function addAnswer(question, html, source) {
  const entry = document.createElement('article');
  entry.className = 'answer';
  entry.innerHTML = `<p class="kicker">${esc(question)}</p><div class="answer-body">${html}</div>${source ? `<p class="answer-source">${source}</p>` : ''}`;
  $('#ask-log').append(entry);
  entry.scrollIntoView({ block: 'nearest' });
  return entry;
}

function ask(question) {
  if (AI_ON) {
    const entry = addAnswer(question, '<p class="quiet">Looking it up…</p>', '');
    askAi(question)
      .then((answer) => {
        $('.answer-body', entry).innerHTML = answer;
        entry.insertAdjacentHTML('beforeend', '<p class="answer-source">Written by Claude (AI) from a summary of your research. Double-check important details.</p>');
      })
      .catch((error) => {
        const reply = answerFromData(question);
        $('.answer-body', entry).innerHTML = reply.html;
        entry.insertAdjacentHTML('beforeend', `<p class="answer-source">The AI service didn't answer (${esc(error.message)}), so this comes straight from your data. ${reply.source}</p>`);
      });
    return;
  }
  const reply = answerFromData(question);
  addAnswer(question, reply.html, reply.source);
}

// ----- Answers from the data -------------------------------------------

function mentions(text, words) {
  return words.some((word) => text.includes(word));
}

function answerFromData(question) {
  const q = question.toLowerCase();
  const project = data.research_project.find((p) => q.includes(p.title.toLowerCase()) || q.includes(p.title.split(' ')[0].toLowerCase()));
  if (project) return projectAnswer(project);
  if (mentions(q, ['gap', 'missing', 'unused', 'weak', 'incomplete'])) return gapsAnswer();
  if (mentions(q, ['decision', 'strong', 'evidence', 'backed', 'proof'])) return decisionsAnswer();
  if (mentions(q, ['struggle', 'pain', 'problem', 'negative', 'frustrat', 'difficult', 'issue', 'hard'])) return painAnswer();
  if (mentions(q, ['participant', 'who', 'segment', 'people', 'audience', 'talk'])) return peopleAnswer();
  if (mentions(q, ['session', 'method', 'interview', 'when', 'schedule', 'planned', 'next'])) return sessionsAnswer();
  if (mentions(q, ['overview', 'summary', 'summar', 'project', 'status', 'progress'])) return overviewAnswer();
  if (mentions(q, ['insight', 'key', 'learn', 'takeaway', 'main', 'important', 'finding'])) return insightsAnswer();
  return helpAnswer();
}

function source(tables, concepts) {
  return `From <code>${tables}</code> using ${concepts}.`;
}

function insightsAnswer() {
  const order = { high: 0, medium: 1, low: 2 };
  const insights = [...data.insight].sort((a, b) => order[a.impact] - order[b.impact]).slice(0, 4);
  const items = insights.map((i) => `<li><a href="#/record/insight/${i.id}">${esc(i.title)}</a> <span class="quiet">(${esc(i.impact)} impact, ${plural(upstream('insight', i.id).length, 'finding')})</span></li>`).join('');
  return {
    html: `<p>There are <strong>${data.insight.length} insights</strong>. The most important ones:</p><ul class="list">${items}</ul>`,
    source: source('insight, finding_insight', 'a JOIN to count findings and ORDER BY impact'),
  };
}

function decisionsAnswer() {
  const strongest = decisionStrength().slice(0, 5);
  return {
    html: `<p>Decisions ranked by how many observations stand behind them:</p>
      ${barChart(strongest.map((d) => ({ label: shorten(d.title, 38), value: d.observations, stage: 'design_decision', href: `#/trail/design_decision/${d.id}` })))}`,
    source: source('v_decision_strength', 'four JOINs through the junction tables and COUNT(DISTINCT)'),
  };
}

function gapsAnswer() {
  const gaps = evidenceGaps();
  const lines = STAGES.slice(0, 4).map((stage) => {
    const count = gaps.filter((g) => g.type === stage.type).length;
    return { label: `${stage.plural} not used yet`, value: count, stage: stage.type, href: `#/trail` };
  });
  return {
    html: `<p><strong>${completeTrailPercent()}%</strong> of decisions trace all the way back to an observation. Unused records at each step:</p>${barChart(lines)}`,
    source: source('v_evidence_gap', 'an anti-join (NOT EXISTS)'),
  };
}

function painAnswer() {
  const negatives = data.observation.filter((o) => o.sentiment === 'negative');
  const perProject = activeProjects().map((p) => ({ label: p.title, value: negatives.filter((o) => o.project_id === p.id).length, stage: 'recommendation' }));
  const examples = negatives.slice(-3).reverse().map((o) => `<li><a href="#/record/observation/${o.id}">${esc(o.title)}</a></li>`).join('');
  return {
    html: `<p><strong>${negatives.length} of ${data.observation.length}</strong> observations were negative. By project:</p>${barChart(perProject)}<p>Recent examples:</p><ul class="list">${examples}</ul>`,
    source: source('observation, research_session', 'WHERE sentiment = negative and GROUP BY project'),
  };
}

function peopleAnswer() {
  const segments = participantsBySegment().filter((g) => g.participants > 0);
  return {
    html: `<p>You've worked with <strong>${data.participant.length} participants</strong> (codes only, no names). By segment:</p>
      ${barChart(segments.map((g) => ({ label: g.name, value: g.participants, stage: 'observation' })))}`,
    source: source('participant_segment', 'a many-to-many junction table and GROUP BY'),
  };
}

function sessionsAnswer() {
  const completed = data.research_session.filter((s) => s.status === 'completed').length;
  const upcoming = data.research_session.filter((s) => s.status === 'planned').sort((a, b) => (a.session_date > b.session_date ? 1 : -1))[0];
  const months = sessionsByMonth();
  return {
    html: `<p><strong>${completed} sessions</strong> completed${upcoming ? `, and the next one is <a href="#/sessions/${upcoming.id}">${esc(upcoming.title)}</a> on ${formatDate(upcoming.session_date)}` : ''}.</p>
      ${columnChart(months.map((m) => ({ label: m.label, value: m.sessions })))}`,
    source: source('v_sessions_by_month', 'date_trunc and GROUP BY month'),
  };
}

function overviewAnswer() {
  const rows = activeProjects().map((p) => {
    const c = projectCounts(p.id);
    return `<li><a href="#/projects/${p.id}">${esc(p.title)}</a> <span class="quiet">(${esc(p.status)}): ${c.sessions} sessions, ${c.observation} observations, ${c.design_decision} decisions</span></li>`;
  }).join('');
  return { html: `<p>${plural(activeProjects().length, 'project')} in progress:</p><ul class="list">${rows}</ul>`, source: source('v_project_summary', 'LEFT JOIN and COUNT per project') };
}

function projectAnswer(project) {
  const c = projectCounts(project.id);
  const s = sentimentCounts(project.id);
  const topInsight = data.insight.find((i) => i.project_id === project.id && i.impact === 'high') || data.insight.find((i) => i.project_id === project.id);
  return {
    html: `<p><strong><a href="#/projects/${project.id}">${esc(project.title)}</a></strong> is ${esc(project.status)}. Its goal: ${esc(project.research_objective)}</p>
      ${funnelChart(c, `&project=${project.id}`)}
      <p>Sentiment: ${s.negative} negative, ${s.neutral} neutral, ${s.positive} positive.${topInsight ? ` Top insight: <a href="#/record/insight/${topInsight.id}">${esc(topInsight.title)}</a>.` : ''}</p>`,
    source: source('v_project_summary, v_sentiment_by_project', 'WHERE project_id = … and GROUP BY'),
  };
}

function helpAnswer() {
  return {
    html: `<p>I can answer questions about insights, decisions and their evidence, gaps, what participants struggled with, sessions, participants, or any project by name (for example "Grocery checkout").</p>`,
    source: '',
  };
}

// ----- Optional AI answers ------------------------------------------------

// A short text summary of the research, sent as context to the AI.
function researchSummary() {
  const lines = [];
  for (const p of data.research_project) {
    const c = projectCounts(p.id);
    lines.push(`Project "${p.title}" (${p.status}${p.archived_at ? ', archived' : ''}): ${p.research_objective} Sessions ${c.sessions}, observations ${c.observation}, findings ${c.finding}, insights ${c.insight}, recommendations ${c.recommendation}, decisions ${c.design_decision}.`);
  }
  for (const i of data.insight) lines.push(`Insight (${i.impact} impact, project ${i.project_id}): ${i.title}. ${i.description}`);
  for (const d of decisionStrength()) lines.push(`Decision (${d.status}): ${d.title}. Backed by ${d.observations} observations from ${d.sessions} sessions.`);
  const s = sentimentCounts();
  lines.push(`Observation sentiment overall: ${s.negative} negative, ${s.neutral} neutral, ${s.positive} positive.`);
  lines.push(`Records not used by the next step yet: ${evidenceGaps().length}.`);
  return lines.join('\n');
}

async function askAi(question) {
  const response = await fetch('api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, context: researchSummary() }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `error ${response.status}`);
  // Show the AI's text safely: escape it, then turn "- " lines into a list.
  const lines = esc(result.answer || '').split('\n').filter((line) => line.trim());
  let html = '';
  let inList = false;
  for (const line of lines) {
    if (line.trim().startsWith('- ')) {
      if (!inList) { html += '<ul class="list">'; inList = true; }
      html += `<li>${line.trim().slice(2)}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<p>${line}</p>`;
    }
  }
  return html + (inList ? '</ul>' : '');
}
