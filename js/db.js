// ===================================================================
// db.js - everything that reads or writes data.
//
// How it works:
//   1. loadAll() reads every TRACE table into the `data` object.
//   2. Pages draw themselves from `data` (no queries inside pages).
//   3. Save functions write ONE change, then call loadAll() again.
//
// Two modes:
//   'supabase' - js/config.js has a URL + key: PostgreSQL via Supabase.
//   'sample'   - config is empty: the sample project is loaded from
//                js/sample-data.js and changes are kept in localStorage.
// ===================================================================

const MODE = SUPABASE_URL && SUPABASE_KEY ? 'supabase' : 'sample';
let client = null;          // the Supabase client (supabase mode only)
let data = {};              // every table, e.g. data.research_project = [...]
const auth = { session: null, email: null, isEditor: false };

const TABLES = [
  'researcher', 'segment', 'research_method', 'research_project', 'project_researcher', 'project_method',
  'participant', 'participant_segment', 'research_question', 'research_session', 'session_participant',
  'session_question', 'observation', 'finding', 'insight', 'recommendation', 'design_decision',
  'observation_finding', 'finding_insight', 'insight_recommendation', 'recommendation_decision',
];

// The evidence chain. `link` is the junction table joining the
// previous stage to this one: link.up = previous stage's id column.
const STAGES = [
  { type: 'observation', label: 'Observation', plural: 'Observations', step: 1 },
  { type: 'finding', label: 'Finding', plural: 'Findings', step: 2, link: { table: 'observation_finding', up: 'observation_id', self: 'finding_id' } },
  { type: 'insight', label: 'Insight', plural: 'Insights', step: 3, link: { table: 'finding_insight', up: 'finding_id', self: 'insight_id' } },
  { type: 'recommendation', label: 'Recommendation', plural: 'Recommendations', step: 4, link: { table: 'insight_recommendation', up: 'insight_id', self: 'recommendation_id' } },
  { type: 'design_decision', label: 'Decision', plural: 'Decisions', step: 5, link: { table: 'recommendation_decision', up: 'recommendation_id', self: 'decision_id' } },
];
const STAGE = Object.fromEntries(STAGES.map((s) => [s.type, s]));
const previousStage = (type) => STAGES[STAGE[type].step - 2] || null;
const nextStage = (type) => STAGES[STAGE[type].step] || null;

// Columns each table may be written with (anything else is ignored).
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
const pick = (table, values) => Object.fromEntries(COLUMNS[table].filter((c) => c in values).map((c) => [c, values[c] ?? null]));

// -------------------------------------------------------------------
// Start-up
// -------------------------------------------------------------------

// Returns a problem message if js/config.js is filled in wrongly.
function configProblem() {
  if (!SUPABASE_URL && !SUPABASE_KEY) return null;
  if (!SUPABASE_URL || !SUPABASE_KEY) return 'js/config.js has only one of the two values. Fill in both, or leave both empty for sample mode.';
  if (!/^https:\/\/|^http:\/\/localhost/.test(SUPABASE_URL)) return 'SUPABASE_URL must start with https://';
  if (SUPABASE_KEY.startsWith('sb_secret_')) return 'That is a SECRET key. Remove it from js/config.js, rotate it in Supabase, and use the publishable key.';
  try {
    if (SUPABASE_KEY.split('.').length === 3 && JSON.parse(atob(SUPABASE_KEY.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role') {
      return 'That is the SERVICE ROLE key, which bypasses all security. Remove it, rotate it, and use the publishable key.';
    }
  } catch { /* not a JWT: fine */ }
  return null;
}

async function startDatabase() {
  const problem = configProblem();
  if (problem) throw Object.assign(new Error(problem), { kind: 'config' });
  if (MODE === 'supabase') {
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: result } = await client.auth.getSession();
    await setSession(result.session);
  } else {
    loadSample();
  }
  await loadAll();
}

async function loadAll() {
  if (MODE === 'sample') {
    data = JSON.parse(JSON.stringify(sample));
  } else {
    const results = await Promise.all(TABLES.map((t) => client.from(t).select('*')));
    results.forEach((result, i) => {
      if (result.error) throw friendlyError(result.error, 'load the data');
      data[TABLES[i]] = result.data;
    });
  }
  // Observations get their project through their session (not stored twice).
  for (const o of data.observation) o.project_id = byId('research_session', o.session_id)?.project_id ?? null;
}

// -------------------------------------------------------------------
// Sample mode storage (localStorage)
// -------------------------------------------------------------------

const SAMPLE_KEY = 'trace.sample.v3'; // bump this when the sample data changes
let sample = null;

function loadSample() {
  try { sample = JSON.parse(localStorage.getItem(SAMPLE_KEY)); } catch { sample = null; }
  if (!sample) sample = JSON.parse(JSON.stringify(SAMPLE_DATA));
}
function saveSample() {
  try { localStorage.setItem(SAMPLE_KEY, JSON.stringify(sample)); } catch { /* storage blocked: changes last until reload */ }
}
async function resetSample() {
  sample = JSON.parse(JSON.stringify(SAMPLE_DATA));
  saveSample();
  await loadAll();
}

// A few database rules repeated for sample mode, so it behaves like PostgreSQL.
function sampleChecks(table, row, existing = null) {
  const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const clash = (fn) => sample[table].some((r) => r !== existing && fn(r));
  if (table === 'research_project' && clash((r) => same(r.title, row.title))) throw fieldError('title', 'A project with this title already exists.');
  if (table === 'participant' && clash((r) => r.participant_code === row.participant_code)) throw fieldError('participant_code', 'Another participant already uses this code.');
  if (STAGE[table] && table !== 'observation' && clash((r) => r.project_id === row.project_id && same(r.title, row.title))) throw fieldError('title', 'This project already has a record with this title.');
  const projectId = table === 'observation' ? sample.research_session.find((s) => s.id === row.session_id)?.project_id : row.project_id;
  const project = sample.research_project.find((p) => p.id === projectId);
  if (!existing && project?.archived_at && table !== 'research_project') throw new Error('This project is archived. Restore it before adding new work.');
}
const fieldError = (field, message) => Object.assign(new Error(message), { field });

// -------------------------------------------------------------------
// Low-level writes (one function per kind of change)
// -------------------------------------------------------------------

async function insertRow(table, row) {
  if (MODE === 'sample') {
    sampleChecks(table, row);
    const now = new Date().toISOString();
    const saved = { ...row, created_at: now, updated_at: now };
    saved.id = Math.max(0, ...sample[table].map((r) => r.id)) + 1;
    sample[table].push(saved);
    saveSample();
    return saved;
  }
  const { data: rows, error } = await client.from(table).insert(row).select();
  if (error) throw friendlyError(error, 'save this');
  if (!rows?.length) throw new Error('Nothing was saved. Your account may not be allowed to edit.');
  return rows[0];
}

async function updateRow(table, id, patch) {
  if (MODE === 'sample') {
    const existing = sample[table].find((r) => r.id === id);
    sampleChecks(table, { ...existing, ...patch }, existing);
    Object.assign(existing, patch, { updated_at: new Date().toISOString() });
    saveSample();
    return existing;
  }
  const { data: rows, error } = await client.from(table).update(patch).eq('id', id).select();
  if (error) throw friendlyError(error, 'save the changes');
  // Row Level Security turns a forbidden update into "0 rows changed".
  if (!rows?.length) throw new Error("Nothing was saved. Your account isn't allowed to edit, or the record was removed.");
  return rows[0];
}

async function addLinks(table, rows) {
  if (!rows.length) return;
  if (MODE === 'sample') { sample[table].push(...rows.map((r) => ({ ...r, created_at: new Date().toISOString() }))); saveSample(); return; }
  const { data: saved, error } = await client.from(table).insert(rows).select();
  if (error) throw friendlyError(error, 'link the records');
  if ((saved || []).length !== rows.length) throw new Error('Some links were not saved.');
}

async function removeLinks(table, rows) {
  for (const match of rows) {
    if (MODE === 'sample') {
      sample[table] = sample[table].filter((r) => !Object.entries(match).every(([k, v]) => r[k] === v));
      saveSample();
      continue;
    }
    const { data: removed, error } = await client.from(table).delete().match(match).select();
    if (error) throw friendlyError(error, 'remove a link');
    if (!removed?.length) throw new Error("A link couldn't be removed. Your account may not be allowed to edit.");
  }
}

// Makes a junction table match `wantedIds` for one owner record.
async function syncLinks(table, ownerCol, ownerId, otherCol, wantedIds, extra = () => ({})) {
  const current = (MODE === 'sample' ? sample[table] : data[table]).filter((l) => l[ownerCol] === ownerId).map((l) => l[otherCol]);
  const toAdd = wantedIds.filter((id) => !current.includes(id));
  const toRemove = current.filter((id) => !wantedIds.includes(id));
  await addLinks(table, toAdd.map((id) => ({ [ownerCol]: ownerId, [otherCol]: id, ...extra(id) })));
  await removeLinks(table, toRemove.map((id) => ({ [ownerCol]: ownerId, [otherCol]: id })));
}

// Turns a Supabase/PostgreSQL error into a sentence a person can act on.
function friendlyError(error, action) {
  const text = error.message || String(error);
  const code = error.code || '';
  let message = text;
  let field = '';
  if (/failed to fetch|networkerror|load failed/i.test(text)) message = `Couldn't reach Supabase to ${action}. Check your connection and try again.`;
  else if (code === '42501' || /row-level security|permission denied/i.test(text)) message = `You don't have permission to ${action}. Sign in with an editor account.`;
  else if (code === '23505') {
    field = /participant_code/.test(text) ? 'participant_code' : /email/.test(text) ? 'email' : /name_key/.test(text) ? 'name' : /question/.test(text) ? 'question_text' : 'title';
    message = field === 'participant_code' ? 'Another participant already uses this code.' : 'Something with this name already exists here.';
  } else if (code === '23503') message = 'This refers to a record that no longer exists. Refresh the page and try again.';
  else if (code === 'PGRST205' || code === '42P01') message = 'The TRACE tables were not found. Run the files in the sql folder (see README).';
  else if (code === '23514' && /violates check constraint/.test(text)) message = 'One of the values is not allowed. Check the form and try again.';
  return Object.assign(new Error(message), { code, field });
}

// -------------------------------------------------------------------
// Reading helpers (all work on the loaded `data`)
// -------------------------------------------------------------------

const byId = (table, id) => (data[table] || []).find((r) => r.id === id);
const activeProjects = () => data.research_project.filter((p) => !p.archived_at);

// All evidence records as one list, each tagged with its type.
function allRecords() {
  return STAGES.flatMap((s) => data[s.type].map((r) => ({ ...r, type: s.type })));
}

// Records that this record is built on (the previous stage).
function upstream(type, id) {
  const stage = STAGE[type];
  if (!stage.link) return [];
  const prev = previousStage(type);
  return data[stage.link.table].filter((l) => l[stage.link.self] === id)
    .map((l) => byId(prev.type, l[stage.link.up])).filter(Boolean).map((r) => ({ ...r, type: prev.type }));
}

// Records built on this record (the next stage).
function downstream(type, id) {
  const next = nextStage(type);
  if (!next) return [];
  return data[next.link.table].filter((l) => l[next.link.up] === id)
    .map((l) => byId(next.type, l[next.link.self])).filter(Boolean).map((r) => ({ ...r, type: next.type }));
}

// Everything connected to one record: its ancestors and descendants.
// Returns { byStage: { observation: [...], ... }, edges: [[fromKey, toKey]] }.
function lineage(type, id) {
  const key = (t, i) => `${t}:${i}`;
  const seen = new Map([[key(type, id), { ...byId(type, id), type }]]);
  const edges = [];
  const walk = (t, i, direction) => {
    const neighbours = direction === 'up' ? upstream(t, i) : downstream(t, i);
    for (const n of neighbours) {
      edges.push(direction === 'up' ? [key(n.type, n.id), key(t, i)] : [key(t, i), key(n.type, n.id)]);
      if (!seen.has(key(n.type, n.id))) { seen.set(key(n.type, n.id), n); walk(n.type, n.id, direction); }
    }
  };
  walk(type, id, 'up');
  walk(type, id, 'down');
  const byStage = Object.fromEntries(STAGES.map((s) => [s.type, []]));
  for (const r of seen.values()) byStage[r.type].push(r);
  return { byStage, edges: [...new Set(edges.map((e) => e.join('>')))].map((e) => e.split('>')) };
}

function projectCounts(projectId) {
  const counts = Object.fromEntries(STAGES.map((s) => [s.type, data[s.type].filter((r) => r.project_id === projectId).length]));
  counts.sessions = data.research_session.filter((s) => s.project_id === projectId).length;
  return counts;
}

function projectLead(projectId) {
  const link = data.project_researcher.find((l) => l.project_id === projectId && l.project_role === 'lead');
  return link ? byId('researcher', link.researcher_id) : null;
}

// -------------------------------------------------------------------
// Saving (each function writes, then reloads `data`)
// -------------------------------------------------------------------

async function saveProject(id, values) {
  const row = pick('research_project', values);
  const saved = id ? await updateRow('research_project', id, row) : await insertRow('research_project', { status: 'planned', ...row });
  if (values.team_ids) {
    await syncLinks('project_researcher', 'project_id', saved.id, 'researcher_id', values.team_ids, () => ({ project_role: 'researcher' }));
    await syncLinks('project_method', 'project_id', saved.id, 'method_id', values.method_ids || []);
  }
  await loadAll();
  return saved;
}

async function setArchived(projectId, archived) {
  await updateRow('research_project', projectId, { archived_at: archived ? new Date().toISOString() : null });
  await loadAll();
}

// type is one of the five stages. upIds = ids of the records it is built on.
async function saveRecord(type, id, values, upIds) {
  const row = pick(type, values);
  if (id && type !== 'observation') delete row.project_id; // a record's project never changes
  const saved = id ? await updateRow(type, id, row) : await insertRow(type, row);
  const link = STAGE[type].link;
  if (link && upIds) {
    try {
      await syncLinks(link.table, link.self, saved.id, link.up, upIds);
    } catch (error) {
      await loadAll();
      throw Object.assign(new Error(`${STAGE[type].label} saved, but its links were not: ${error.message}`), { saved });
    }
  }
  await loadAll();
  return saved;
}

async function saveSession(id, values) {
  const saved = id ? await updateRow('research_session', id, pick('research_session', values)) : await insertRow('research_session', pick('research_session', values));
  await syncLinks('session_participant', 'session_id', saved.id, 'participant_id', values.participant_ids || []);
  await syncLinks('session_question', 'session_id', saved.id, 'question_id', values.question_ids || []);
  await loadAll();
  return saved;
}

async function saveParticipant(id, values) {
  const saved = id ? await updateRow('participant', id, pick('participant', values)) : await insertRow('participant', pick('participant', values));
  await syncLinks('participant_segment', 'participant_id', saved.id, 'segment_id', values.segment_ids || []);
  await loadAll();
  return saved;
}

// For simple tables: researcher, research_method, segment, research_question.
async function saveSimple(table, id, values) {
  const saved = id ? await updateRow(table, id, pick(table, values)) : await insertRow(table, pick(table, values));
  await loadAll();
  return saved;
}

// -------------------------------------------------------------------
// Sign-in (supabase mode). Visitors read; editors can write.
// -------------------------------------------------------------------

async function setSession(session) {
  auth.session = session || null;
  auth.email = session?.user?.email || null;
  auth.isEditor = false;
  if (session) {
    const { data: ok, error } = await client.rpc('trace_is_editor');
    auth.isEditor = !error && ok === true;
  }
}

async function signIn(email, password) {
  const { data: result, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(/invalid/i.test(error.message) ? 'Email or password is incorrect.' : error.message);
  await setSession(result.session);
}

async function signOut() {
  await client.auth.signOut();
  await setSession(null);
}

const canEdit = () => MODE === 'sample' || auth.isEditor;
