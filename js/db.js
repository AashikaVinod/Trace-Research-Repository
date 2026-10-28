// ===================================================================
// db.js - everything that reads or writes data.
//
// How it works:
//   1. loadAll() reads every TRACE table into the `data` object.
//   2. Pages draw themselves from `data` (no queries inside pages).
//   3. Each save function writes ONE change, then calls loadAll() again.
//
// Two modes:
//   'supabase' - js/config.js has a URL and key: PostgreSQL via Supabase.
//   'sample'   - config is empty: the sample study from js/sample-data.js,
//                with changes kept in this browser (localStorage).
// ===================================================================

const MODE = SUPABASE_URL && SUPABASE_KEY ? 'supabase' : 'sample';
let client = null;   // the Supabase client (supabase mode only)
let data = {};       // every table, e.g. data.research_project is a list of rows
const auth = { session: null, email: null, isEditor: false };

const TABLES = [
  'researcher', 'segment', 'research_method', 'research_project', 'project_researcher', 'project_method',
  'participant', 'participant_segment', 'research_question', 'research_session', 'session_participant',
  'session_question', 'observation', 'finding', 'insight', 'recommendation', 'design_decision',
  'observation_finding', 'finding_insight', 'insight_recommendation', 'recommendation_decision',
];

// The evidence chain. `link` is the junction table that joins the
// previous stage to this one (link.up = the previous stage's id column).
const STAGES = [
  { type: 'observation', label: 'Observation', plural: 'Observations', step: 1 },
  { type: 'finding', label: 'Finding', plural: 'Findings', step: 2, link: { table: 'observation_finding', up: 'observation_id', self: 'finding_id' } },
  { type: 'insight', label: 'Insight', plural: 'Insights', step: 3, link: { table: 'finding_insight', up: 'finding_id', self: 'insight_id' } },
  { type: 'recommendation', label: 'Recommendation', plural: 'Recommendations', step: 4, link: { table: 'insight_recommendation', up: 'insight_id', self: 'recommendation_id' } },
  { type: 'design_decision', label: 'Decision', plural: 'Decisions', step: 5, link: { table: 'recommendation_decision', up: 'recommendation_id', self: 'decision_id' } },
];
const STAGE = {};
for (const stage of STAGES) STAGE[stage.type] = stage;

function previousStage(type) { return STAGES[STAGE[type].step - 2] || null; }
function nextStage(type) { return STAGES[STAGE[type].step] || null; }

// The columns each table may be written with. Anything else is ignored.
const COLUMNS = {
  research_project: ['title', 'description', 'research_objective', 'status', 'start_date', 'end_date'],
  researcher: ['full_name', 'email', 'role_title'],
  segment: ['name', 'description'],
  research_method: ['name', 'description'],
  participant: ['participant_code', 'age_band', 'notes'],
  research_question: ['project_id', 'question_text'],
  research_session: ['project_id', 'method_id', 'researcher_id', 'title', 'session_date', 'duration_minutes', 'status', 'notes'],
  observation: ['session_id', 'title', 'description', 'sentiment'],
  finding: ['project_id', 'title', 'description', 'confidence'],
  insight: ['project_id', 'title', 'description', 'impact'],
  recommendation: ['project_id', 'title', 'description', 'priority', 'status'],
  design_decision: ['project_id', 'title', 'description', 'status', 'decided_on'],
};

function pick(table, values) {
  const row = {};
  for (const column of COLUMNS[table]) {
    if (column in values) row[column] = values[column] ?? null;
  }
  return row;
}

function copy(value) { return JSON.parse(JSON.stringify(value)); }

// -------------------------------------------------------------------
// Start-up
// -------------------------------------------------------------------

// Returns a message if js/config.js is filled in wrongly, otherwise null.
function configProblem() {
  if (!SUPABASE_URL && !SUPABASE_KEY) return null;
  if (!SUPABASE_URL || !SUPABASE_KEY) return 'js/config.js has only one of the two values. Fill in both, or leave both empty for sample mode.';
  if (!SUPABASE_URL.startsWith('https://') && !SUPABASE_URL.startsWith('http://localhost')) return 'SUPABASE_URL must start with https://';
  if (SUPABASE_KEY.startsWith('sb_secret_')) return 'That is a SECRET key. Remove it from js/config.js, rotate it in Supabase, and use the publishable key.';
  if (SUPABASE_KEY.split('.').length === 3) {
    try {
      const payload = JSON.parse(atob(SUPABASE_KEY.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')));
      if (payload.role === 'service_role') return 'That is the SERVICE ROLE key, which bypasses all security. Remove it, rotate it, and use the publishable key.';
    } catch (error) {
      // Not readable as a JWT: that's fine, Supabase will check it.
    }
  }
  return null;
}

async function startDatabase() {
  const problem = configProblem();
  if (problem) {
    const error = new Error(problem);
    error.kind = 'config';
    throw error;
  }
  if (MODE === 'supabase') {
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    const result = await client.auth.getSession();
    await setSession(result.data.session);
  } else {
    loadSample();
  }
  await loadAll();
}

// Reads every table into `data`.
async function loadAll() {
  if (MODE === 'sample') {
    data = copy(sample);
  } else {
    const results = await Promise.all(TABLES.map((table) => client.from(table).select('*')));
    for (let i = 0; i < TABLES.length; i++) {
      if (results[i].error) throw friendlyError(results[i].error, 'load the data');
      data[TABLES[i]] = results[i].data;
    }
  }
  // An observation's project comes through its session (it isn't stored twice: 3NF).
  for (const observation of data.observation) {
    const session = byId('research_session', observation.session_id);
    observation.project_id = session ? session.project_id : null;
  }
}

// -------------------------------------------------------------------
// Sample mode storage (localStorage)
// -------------------------------------------------------------------

const SAMPLE_KEY = 'trace.sample.v4'; // change this when the sample data changes
let sample = null;

function loadSample() {
  try {
    sample = JSON.parse(localStorage.getItem(SAMPLE_KEY));
  } catch (error) {
    sample = null;
  }
  if (!sample) sample = copy(SAMPLE_DATA);
}

function saveSample() {
  try {
    localStorage.setItem(SAMPLE_KEY, JSON.stringify(sample));
  } catch (error) {
    // Storage is blocked (private browsing): changes last until reload.
  }
}

async function resetSample() {
  sample = copy(SAMPLE_DATA);
  saveSample();
  await loadAll();
}

// A few database rules repeated for sample mode, so it behaves like PostgreSQL.
function sampleChecks(table, row, existing = null) {
  const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const others = sample[table].filter((r) => r !== existing);
  if (table === 'research_project' && others.some((r) => same(r.title, row.title))) {
    throw fieldError('title', 'A project with this title already exists.');
  }
  if (table === 'participant' && others.some((r) => r.participant_code === row.participant_code)) {
    throw fieldError('participant_code', 'Another participant already uses this code.');
  }
  if (STAGE[table] && table !== 'observation' && others.some((r) => r.project_id === row.project_id && same(r.title, row.title))) {
    throw fieldError('title', 'This project already has a record with this title.');
  }
  // Archived projects accept no new work (a trigger does this in PostgreSQL).
  let projectId = row.project_id;
  if (table === 'observation') {
    const session = sample.research_session.find((s) => s.id === row.session_id);
    projectId = session ? session.project_id : null;
  }
  const project = sample.research_project.find((p) => p.id === projectId);
  if (!existing && project && project.archived_at && table !== 'research_project') {
    throw new Error('This project is archived. Restore it before adding new work.');
  }
}

function fieldError(field, message) {
  const error = new Error(message);
  error.field = field;
  return error;
}

// -------------------------------------------------------------------
// Low-level writes (one function per kind of change)
// -------------------------------------------------------------------

// INSERT one row and return it.
async function insertRow(table, row) {
  if (MODE === 'sample') {
    sampleChecks(table, row);
    const now = new Date().toISOString();
    const nextId = Math.max(0, ...sample[table].map((r) => r.id)) + 1;
    const saved = { ...row, id: nextId, created_at: now, updated_at: now };
    sample[table].push(saved);
    saveSample();
    return saved;
  }
  const result = await client.from(table).insert(row).select();
  if (result.error) throw friendlyError(result.error, 'save this');
  if (!result.data || result.data.length === 0) throw new Error('Nothing was saved. Your account may not be allowed to edit.');
  return result.data[0];
}

// UPDATE one row by id and return it.
async function updateRow(table, id, changes) {
  if (MODE === 'sample') {
    const existing = sample[table].find((r) => r.id === id);
    sampleChecks(table, { ...existing, ...changes }, existing);
    Object.assign(existing, changes, { updated_at: new Date().toISOString() });
    saveSample();
    return existing;
  }
  const result = await client.from(table).update(changes).eq('id', id).select();
  if (result.error) throw friendlyError(result.error, 'save the changes');
  // Row Level Security turns a forbidden update into "0 rows changed".
  if (!result.data || result.data.length === 0) throw new Error("Nothing was saved. Your account isn't allowed to edit, or the record was removed.");
  return result.data[0];
}

// INSERT rows into a junction table.
async function addLinks(table, rows) {
  if (rows.length === 0) return;
  if (MODE === 'sample') {
    for (const row of rows) sample[table].push({ ...row, created_at: new Date().toISOString() });
    saveSample();
    return;
  }
  const result = await client.from(table).insert(rows).select();
  if (result.error) throw friendlyError(result.error, 'link the records');
  if (!result.data || result.data.length !== rows.length) throw new Error('Some links were not saved.');
}

// DELETE rows from a junction table. Each row is a match like { finding_id: 3, insight_id: 5 }.
async function removeLinks(table, rows) {
  for (const match of rows) {
    if (MODE === 'sample') {
      sample[table] = sample[table].filter((r) => !Object.keys(match).every((key) => r[key] === match[key]));
      saveSample();
      continue;
    }
    const result = await client.from(table).delete().match(match).select();
    if (result.error) throw friendlyError(result.error, 'remove a link');
    if (!result.data || result.data.length === 0) throw new Error("A link couldn't be removed. Your account may not be allowed to edit.");
  }
}

// Makes a junction table match `wantedIds` for one owner record:
// adds the missing links and removes the ones that were unticked.
async function syncLinks(table, ownerColumn, ownerId, otherColumn, wantedIds, extraColumns = {}) {
  const rows = MODE === 'sample' ? sample[table] : data[table];
  const currentIds = rows.filter((r) => r[ownerColumn] === ownerId).map((r) => r[otherColumn]);
  const toAdd = wantedIds.filter((id) => !currentIds.includes(id));
  const toRemove = currentIds.filter((id) => !wantedIds.includes(id));
  await addLinks(table, toAdd.map((id) => ({ [ownerColumn]: ownerId, [otherColumn]: id, ...extraColumns })));
  await removeLinks(table, toRemove.map((id) => ({ [ownerColumn]: ownerId, [otherColumn]: id })));
}

// Turns a PostgreSQL error into a sentence people can act on.
function friendlyError(error, action) {
  const text = error.message || String(error);
  const code = error.code || '';
  let message = text;
  let field = '';
  if (/failed to fetch|networkerror|load failed/i.test(text)) {
    message = `Couldn't reach Supabase to ${action}. Check your connection and try again.`;
  } else if (code === '42501' || /row-level security|permission denied/i.test(text)) {
    message = `You don't have permission to ${action}. Sign in with an editor account.`;
  } else if (code === '23505') { // UNIQUE constraint
    if (text.includes('participant_code')) field = 'participant_code';
    else if (text.includes('email')) field = 'email';
    else if (text.includes('name_key')) field = 'name';
    else if (text.includes('question')) field = 'question_text';
    else field = 'title';
    message = field === 'participant_code' ? 'Another participant already uses this code.' : 'Something with this name already exists here.';
  } else if (code === '23503') { // FOREIGN KEY
    message = 'This refers to a record that no longer exists. Refresh the page and try again.';
  } else if (code === 'PGRST205' || code === '42P01') {
    message = 'The TRACE tables were not found. Run the files in the sql folder (see README).';
  } else if (code === '23514' && text.includes('violates check constraint')) { // CHECK constraint
    message = 'One of the values is not allowed. Check the form and try again.';
  }
  const friendly = new Error(message);
  friendly.code = code;
  friendly.field = field;
  return friendly;
}

// -------------------------------------------------------------------
// Reading helpers (they all use the loaded `data`)
// -------------------------------------------------------------------

function byId(table, id) {
  return (data[table] || []).find((row) => row.id === id);
}

function activeProjects() {
  return data.research_project.filter((p) => !p.archived_at);
}

// All evidence records in one list, each tagged with its type.
function allRecords() {
  const records = [];
  for (const stage of STAGES) {
    for (const row of data[stage.type]) records.push({ ...row, type: stage.type });
  }
  return records;
}

// The records this record is built on (the previous stage).
function upstream(type, id) {
  const stage = STAGE[type];
  if (!stage.link) return [];
  const prev = previousStage(type);
  return data[stage.link.table]
    .filter((link) => link[stage.link.self] === id)
    .map((link) => byId(prev.type, link[stage.link.up]))
    .filter((row) => row)
    .map((row) => ({ ...row, type: prev.type }));
}

// The records built on this record (the next stage).
function downstream(type, id) {
  const next = nextStage(type);
  if (!next) return [];
  return data[next.link.table]
    .filter((link) => link[next.link.up] === id)
    .map((link) => byId(next.type, link[next.link.self]))
    .filter((row) => row)
    .map((row) => ({ ...row, type: next.type }));
}

// Everything connected to one record, walking up and down the chain.
// Returns { byStage: { observation: [...], ... }, edges: [[fromKey, toKey]], rows: [...] }
function lineage(type, id) {
  const key = (t, i) => `${t}:${i}`;
  const found = new Map();
  const edges = [];
  const rows = [{ record_type: type, id, title: byId(type, id).title, direction: 'self', depth: 0 }];
  found.set(key(type, id), { ...byId(type, id), type });

  function walk(t, i, direction, depth) {
    const neighbours = direction === 'upstream' ? upstream(t, i) : downstream(t, i);
    for (const n of neighbours) {
      if (direction === 'upstream') edges.push([key(n.type, n.id), key(t, i)]);
      else edges.push([key(t, i), key(n.type, n.id)]);
      if (!found.has(key(n.type, n.id))) {
        found.set(key(n.type, n.id), n);
        rows.push({ record_type: n.type, id: n.id, title: n.title, direction, depth });
        walk(n.type, n.id, direction, depth + 1);
      }
    }
  }
  walk(type, id, 'upstream', 1);
  walk(type, id, 'downstream', 1);

  const byStage = {};
  for (const stage of STAGES) byStage[stage.type] = [];
  for (const record of found.values()) byStage[record.type].push(record);
  const uniqueEdges = [...new Set(edges.map((edge) => edge.join('>')))].map((edge) => edge.split('>'));
  return { byStage, edges: uniqueEdges, rows };
}

function stageCounts(projectId = null) {
  const counts = {};
  for (const stage of STAGES) {
    counts[stage.type] = data[stage.type].filter((r) => projectId === null || r.project_id === projectId).length;
  }
  return counts;
}

function projectCounts(projectId) {
  const counts = stageCounts(projectId);
  counts.sessions = data.research_session.filter((s) => s.project_id === projectId).length;
  return counts;
}

function projectLead(projectId) {
  const link = data.project_researcher.find((l) => l.project_id === projectId && l.project_role === 'lead');
  return link ? byId('researcher', link.researcher_id) : null;
}

// ----- Statistics (used by charts, the assistant and the Database page) -----

// Observation sentiment, for one project or all of them.
function sentimentCounts(projectId = null) {
  const counts = { positive: 0, neutral: 0, negative: 0 };
  for (const o of data.observation) {
    if (projectId === null || o.project_id === projectId) counts[o.sentiment] += 1;
  }
  return counts;
}

// Sessions grouped by month, oldest first: [{ month: '2026-08', label: 'Aug', sessions: 4 }]
function sessionsByMonth(projectId = null) {
  const groups = {};
  for (const s of data.research_session) {
    if (projectId !== null && s.project_id !== projectId) continue;
    const month = s.session_date.slice(0, 7);
    groups[month] = (groups[month] || 0) + 1;
  }
  return Object.keys(groups).sort().map((month) => ({
    month,
    label: new Date(month + '-01T00:00').toLocaleString('en-GB', { month: 'short' }),
    sessions: groups[month],
  }));
}

// Records that nothing builds on yet (like the SQL view v_evidence_gap).
function evidenceGaps() {
  return allRecords().filter((r) => r.type !== 'design_decision' && downstream(r.type, r.id).length === 0);
}

// How much evidence stands behind each decision (like v_decision_strength).
function decisionStrength() {
  return data.design_decision.map((d) => {
    const observations = lineage('design_decision', d.id).byStage.observation;
    const sessions = new Set(observations.map((o) => o.session_id));
    return { id: d.id, title: d.title, status: d.status, project_id: d.project_id, observations: observations.length, sessions: sessions.size };
  }).sort((a, b) => b.observations - a.observations);
}

// Share of records that are connected to the next step (0-100).
function linkedPercent(type) {
  const rows = data[type];
  if (rows.length === 0) return 0;
  const linked = rows.filter((r) => downstream(type, r.id).length > 0).length;
  return Math.round((linked / rows.length) * 100);
}

// Share of decisions that trace all the way back to an observation.
function completeTrailPercent() {
  if (data.design_decision.length === 0) return 0;
  const complete = decisionStrength().filter((d) => d.observations > 0).length;
  return Math.round((complete / data.design_decision.length) * 100);
}

function participantsBySegment() {
  return data.segment.map((g) => ({
    id: g.id,
    name: g.name,
    participants: data.participant_segment.filter((l) => l.segment_id === g.id).length,
  })).sort((a, b) => b.participants - a.participants);
}

// -------------------------------------------------------------------
// The SQL views (sql/06_views.sql), for the Database page.
// In supabase mode this asks PostgreSQL. In sample mode it builds the
// same rows in the browser, using the statistics above.
// -------------------------------------------------------------------

async function runView(name, args = {}) {
  if (MODE === 'supabase') {
    const result = name === 'trace_lineage'
      ? await client.rpc('trace_lineage', { p_type: args.type, p_id: args.id })
      : await client.from(name).select('*');
    if (result.error) throw friendlyError(result.error, 'run this query');
    return result.data;
  }
  if (name === 'trace_lineage') return lineage(args.type, args.id).rows;
  if (name === 'v_dashboard') {
    return [{
      projects: data.research_project.length, active_projects: activeProjects().length,
      sessions: data.research_session.length, participants: data.participant.length,
      observations: data.observation.length, insights: data.insight.length, decisions: data.design_decision.length,
    }];
  }
  if (name === 'v_project_summary') {
    return data.research_project.map((p) => {
      const c = projectCounts(p.id);
      const lead = projectLead(p.id);
      return { id: p.id, title: p.title, status: p.status, archived: !!p.archived_at, lead: lead ? lead.full_name : null,
        sessions: c.sessions, observations: c.observation, findings: c.finding, insights: c.insight,
        recommendations: c.recommendation, decisions: c.design_decision };
    });
  }
  if (name === 'v_evidence_gap') return evidenceGaps().map((r) => ({ record_type: r.type, id: r.id, project_id: r.project_id, title: r.title }));
  if (name === 'v_sentiment_by_project') {
    const projectIds = [...new Set(data.observation.map((o) => o.project_id))].sort();
    return projectIds.map((id) => ({ project_id: id, ...sentimentCounts(id) }));
  }
  if (name === 'v_sessions_by_month') return sessionsByMonth().map((m) => ({ month: m.month, sessions: m.sessions }));
  if (name === 'v_participants_by_segment') return participantsBySegment();
  if (name === 'v_decision_strength') return decisionStrength().map((d) => ({ id: d.id, title: d.title, status: d.status, observations: d.observations, sessions: d.sessions }));
  throw new Error(`Unknown query ${name}`);
}

// -------------------------------------------------------------------
// Saving. Each function writes, then reloads `data`.
// -------------------------------------------------------------------

async function saveProject(id, values) {
  const row = pick('research_project', values);
  const saved = id ? await updateRow('research_project', id, row) : await insertRow('research_project', { status: 'planned', ...row });
  if (values.team_ids) {
    await syncLinks('project_researcher', 'project_id', saved.id, 'researcher_id', values.team_ids, { project_role: 'researcher' });
    await syncLinks('project_method', 'project_id', saved.id, 'method_id', values.method_ids || []);
  }
  await loadAll();
  return saved;
}

async function setArchived(projectId, archived) {
  await updateRow('research_project', projectId, { archived_at: archived ? new Date().toISOString() : null });
  await loadAll();
}

// Saves one of the five evidence records. upIds = the records it is built on.
async function saveRecord(type, id, values, upIds) {
  const row = pick(type, values);
  if (id && type !== 'observation') delete row.project_id; // a record's project never changes
  const saved = id ? await updateRow(type, id, row) : await insertRow(type, row);
  const link = STAGE[type].link;
  if (link && upIds) {
    try {
      await syncLinks(link.table, link.self, saved.id, link.up, upIds);
    } catch (error) {
      // Two separate requests are not one transaction, so say exactly what happened.
      await loadAll();
      const partial = new Error(`${STAGE[type].label} saved, but its links were not: ${error.message}`);
      partial.saved = saved;
      throw partial;
    }
  }
  await loadAll();
  return saved;
}

async function saveSession(id, values) {
  const row = pick('research_session', values);
  const saved = id ? await updateRow('research_session', id, row) : await insertRow('research_session', row);
  await syncLinks('session_participant', 'session_id', saved.id, 'participant_id', values.participant_ids || []);
  await syncLinks('session_question', 'session_id', saved.id, 'question_id', values.question_ids || []);
  await loadAll();
  return saved;
}

async function saveParticipant(id, values) {
  const row = pick('participant', values);
  const saved = id ? await updateRow('participant', id, row) : await insertRow('participant', row);
  await syncLinks('participant_segment', 'participant_id', saved.id, 'segment_id', values.segment_ids || []);
  await loadAll();
  return saved;
}

// For simple tables: researcher, research_method, segment, research_question.
async function saveSimple(table, id, values) {
  const row = pick(table, values);
  const saved = id ? await updateRow(table, id, row) : await insertRow(table, row);
  await loadAll();
  return saved;
}

// -------------------------------------------------------------------
// Sign-in (supabase mode). Visitors can read; editors can write.
// -------------------------------------------------------------------

async function setSession(session) {
  auth.session = session || null;
  auth.email = session ? session.user.email : null;
  auth.isEditor = false;
  if (session) {
    const result = await client.rpc('trace_is_editor');
    auth.isEditor = !result.error && result.data === true;
  }
}

async function signIn(email, password) {
  const result = await client.auth.signInWithPassword({ email, password });
  if (result.error) throw new Error(/invalid/i.test(result.error.message) ? 'Email or password is incorrect.' : result.error.message);
  await setSession(result.data.session);
}

async function signOut() {
  await client.auth.signOut();
  await setSession(null);
}

function canEdit() { return MODE === 'sample' || auth.isEditor; }
