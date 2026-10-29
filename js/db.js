// ===================================================================
// db.js - everything that reads or writes data.
//
// How it works:
//   1. loadAll() reads every TRACE table from Supabase into `data`.
//   2. Pages draw themselves from `data` (no queries inside pages).
//   3. Each save function writes ONE change to Supabase, then calls
//      loadAll() again, so every page and the evidence trail show it.
//
// Photos live in the Supabase Storage bucket "sources"; a source row keeps
// the file's name. Nothing is stored in the browser.
// ===================================================================

let data = {};     // every table, e.g. data.research_project is a list of rows
let client = null; // the Supabase client (created in startDatabase)
const BUCKET = 'sources';

const TABLES = [
  'researcher', 'segment', 'research_method', 'research_project', 'project_researcher', 'project_method',
  'participant', 'participant_segment', 'research_question', 'research_session', 'session_participant',
  'session_question', 'observation', 'finding', 'insight', 'recommendation', 'design_decision',
  'observation_finding', 'finding_insight', 'insight_recommendation', 'recommendation_decision',
  'source', 'note', 'annotation',
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
  source: ['title', 'kind', 'caption', 'file_url', 'is_illustration', 'session_id', 'observation_id', 'finding_id', 'insight_id', 'recommendation_id', 'decision_id'],
  note: ['body', 'author_id', 'session_id', 'observation_id', 'finding_id', 'insight_id', 'recommendation_id', 'decision_id'],
  annotation: ['source_id', 'x', 'y', 'body', 'author_id'],
};

// Sources and notes can belong to a session or any evidence record. Each
// possible owner has its own column (the "exclusive arc" in sql/07).
const OWNER_COLUMN = {
  research_session: 'session_id', observation: 'observation_id', finding: 'finding_id',
  insight: 'insight_id', recommendation: 'recommendation_id', design_decision: 'decision_id',
};

function pick(table, values) {
  const row = {};
  for (const column of COLUMNS[table]) {
    if (column in values) row[column] = values[column] ?? null;
  }
  return row;
}

// -------------------------------------------------------------------
// Connecting to Supabase
// -------------------------------------------------------------------

// Returns a message if js/config.js is empty or wrong, otherwise null.
function configProblem() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return 'js/config.js is empty. Paste your Supabase project URL and publishable key into it (SETUP.md, step 4).';
  if (!SUPABASE_URL.startsWith('https://') && !SUPABASE_URL.startsWith('http://localhost')) return 'SUPABASE_URL must start with https://';
  if (SUPABASE_KEY.startsWith('sb_secret_')) return 'That is a SECRET key. Remove it from js/config.js, reset it in Supabase, and use the publishable key.';
  if (SUPABASE_KEY.split('.').length === 3) {
    try {
      const payload = JSON.parse(atob(SUPABASE_KEY.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')));
      if (payload.role === 'service_role') return 'That is the SERVICE ROLE key, which bypasses all security. Remove it, reset it in Supabase, and use the publishable key.';
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
  // No login: nothing about a user is stored in the browser.
  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  await loadAll();
}

// Reads every table into `data`.
async function loadAll() {
  const results = await Promise.all(TABLES.map((table) => client.from(table).select('*')));
  const next = {};
  for (let i = 0; i < TABLES.length; i++) {
    if (results[i].error) throw friendlyError(results[i].error, 'load the data');
    next[TABLES[i]] = results[i].data;
    if (next[TABLES[i]].length && 'id' in next[TABLES[i]][0]) next[TABLES[i]].sort((a, b) => a.id - b.id);
  }
  data = next;
  // Supabase returns at most 1,000 rows per table per request by default.
  const full = TABLES.filter((table) => next[table].length >= 1000);
  if (full.length) toast(`Only the first 1,000 rows of ${full.join(', ')} are shown. See SETUP.md, "Limits".`, 'error');
  // An observation's project comes through its session (it isn't stored twice: 3NF).
  for (const observation of data.observation) {
    const session = byId('research_session', observation.session_id);
    observation.project_id = session ? session.project_id : null;
  }
}

// Which records depend on another one, in words (for "can't delete yet" messages).
const DEPENDENTS = {
  observation: 'observations', finding: 'findings', insight: 'insights', recommendation: 'recommendations',
  design_decision: 'decisions', research_session: 'sessions', research_question: 'research questions', note: 'notes',
};

// Turns a PostgreSQL error into a sentence people can act on.
function friendlyError(error, action) {
  const text = error.message || String(error);
  const code = error.code || '';
  let message = text;
  let field = '';
  if (/failed to fetch|networkerror|load failed/i.test(text)) {
    message = `Couldn't reach Supabase to ${action}. Check your connection and try again.`;
  } else if (/bucket not found/i.test(text)) {
    message = 'The photo bucket "sources" was not found. Run sql/09_storage.sql in Supabase (or sql/install_all.sql).';
  } else if (code === '42501' || /row-level security|permission denied/i.test(text)) {
    message = `Supabase refused to ${action}. Check that the SQL files were run (SETUP.md, step 2) and that js/config.js has your publishable key.`;
  } else if (code === '23505') { // UNIQUE constraint
    if (text.includes('participant_code')) field = 'participant_code';
    else if (text.includes('email')) field = 'email';
    else if (text.includes('name_key')) field = 'name';
    else if (text.includes('question')) field = 'question_text';
    else field = 'title';
    message = field === 'participant_code' ? 'Another participant already uses this code.' : 'Something with this name already exists here.';
  } else if (code === '23503' && text.startsWith('update or delete')) { // still used by other rows
    const used = (text.match(/on table "(\w+)"/g) || []).pop();
    const table = used ? used.match(/"(\w+)"/)[1] : '';
    message = `This can't be deleted yet: ${DEPENDENTS[table] || 'other records'} still depend on it. Delete or move those first.`;
  } else if (code === '23503') { // FOREIGN KEY on insert
    message = 'This refers to a record that no longer exists. Reload the page and try again.';
  } else if (code === 'PGRST205' || code === '42P01') {
    message = 'The TRACE tables were not found. Run sql/install_all.sql in the Supabase SQL Editor (SETUP.md, step 2).';
  } else if (code === '23514' && text.includes('violates check constraint')) { // CHECK constraint
    message = 'One of the values is not allowed. Check the form and try again.';
  }
  const friendly = new Error(message);
  friendly.code = code;
  friendly.field = field;
  return friendly;
}

// -------------------------------------------------------------------
// Low-level writes (one function per kind of change)
// -------------------------------------------------------------------

// INSERT one row and return it.
async function insertRow(table, row) {
  const result = await client.from(table).insert(row).select();
  if (result.error) throw friendlyError(result.error, 'save this');
  return result.data[0];
}

// UPDATE one row by id and return it.
async function updateRow(table, id, changes) {
  const result = await client.from(table).update(changes).eq('id', id).select();
  if (result.error) throw friendlyError(result.error, 'save the changes');
  if (!result.data.length) throw new Error('Nothing was saved: this record may have been deleted. Reload the page.');
  return result.data[0];
}

// DELETE one row by id. The database refuses if other rows still depend on it.
async function deleteById(table, id) {
  const result = await client.from(table).delete().eq('id', id).select();
  if (result.error) throw friendlyError(result.error, 'delete this');
  if (!result.data.length) throw new Error('Nothing was deleted: it may already be gone. Reload the page.');
}

// INSERT rows into a junction table.
async function addLinks(table, rows) {
  if (rows.length === 0) return;
  const result = await client.from(table).insert(rows).select();
  if (result.error) throw friendlyError(result.error, 'link the records');
}

// DELETE rows from a junction table. Each row is a match like { finding_id: 3, insight_id: 5 }.
async function removeLinks(table, rows) {
  for (const match of rows) {
    const result = await client.from(table).delete().match(match).select();
    if (result.error) throw friendlyError(result.error, 'remove a link');
  }
}

// Makes a junction table match `wantedIds` for one owner record:
// adds the missing links and removes the ones that were unticked.
async function syncLinks(table, ownerColumn, ownerId, otherColumn, wantedIds, extraColumns = {}) {
  const currentIds = data[table].filter((r) => r[ownerColumn] === ownerId).map((r) => r[otherColumn]);
  const toAdd = wantedIds.filter((id) => !currentIds.includes(id));
  const toRemove = currentIds.filter((id) => !wantedIds.includes(id));
  await addLinks(table, toAdd.map((id) => ({ [ownerColumn]: ownerId, [otherColumn]: id, ...extraColumns })));
  await removeLinks(table, toRemove.map((id) => ({ [ownerColumn]: ownerId, [otherColumn]: id })));
}

// Saves a row, then its links. These are separate requests, so if the links
// fail we say exactly what happened (the row itself is already saved).
async function saveWithLinks(saveRow, saveLinks) {
  const saved = await saveRow();
  try {
    await saveLinks(saved);
  } catch (error) {
    await loadAll();
    const partial = new Error(`Saved, but its links were not: ${error.message}`);
    partial.saved = saved;
    throw partial;
  }
  await loadAll();
  return saved;
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
// Runs one of the SQL views (sql/06_views.sql, sql/07) or the recursive
// function trace_lineage on the database itself, for the Database page.
async function runView(name, args = {}) {
  const result = name === 'trace_lineage'
    ? await client.rpc('trace_lineage', { p_type: args.type, p_id: args.id })
    : await client.from(name).select('*');
  if (result.error) throw friendlyError(result.error, 'run this query');
  return result.data;
}

// -------------------------------------------------------------------
// Saving. Each function writes, then reloads `data`.
// -------------------------------------------------------------------

function saveProject(id, values) {
  const row = pick('research_project', values);
  return saveWithLinks(
    () => (id ? updateRow('research_project', id, row) : insertRow('research_project', { status: 'planned', ...row })),
    async (saved) => {
      if (!values.team_ids) return;
      await syncLinks('project_researcher', 'project_id', saved.id, 'researcher_id', values.team_ids, { project_role: 'researcher' });
      await syncLinks('project_method', 'project_id', saved.id, 'method_id', values.method_ids || []);
    });
}

async function setArchived(projectId, archived) {
  await updateRow('research_project', projectId, { archived_at: archived ? new Date().toISOString() : null });
  await loadAll();
}

// Saves one of the five evidence records. upIds = the records it is built on.
function saveRecord(type, id, values, upIds) {
  const row = pick(type, values);
  if (id && type !== 'observation') delete row.project_id; // a record's project never changes
  const link = STAGE[type].link;
  return saveWithLinks(
    () => (id ? updateRow(type, id, row) : insertRow(type, row)),
    async (saved) => { if (link && upIds) await syncLinks(link.table, link.self, saved.id, link.up, upIds); });
}

function saveSession(id, values) {
  const row = pick('research_session', values);
  return saveWithLinks(
    () => (id ? updateRow('research_session', id, row) : insertRow('research_session', row)),
    async (saved) => {
      await syncLinks('session_participant', 'session_id', saved.id, 'participant_id', values.participant_ids || []);
      await syncLinks('session_question', 'session_id', saved.id, 'question_id', values.question_ids || []);
    });
}

function saveParticipant(id, values) {
  const row = pick('participant', values);
  return saveWithLinks(
    () => (id ? updateRow('participant', id, row) : insertRow('participant', row)),
    (saved) => syncLinks('participant_segment', 'participant_id', saved.id, 'segment_id', values.segment_ids || []));
}

// For simple tables: researcher, research_method, segment, research_question.
async function saveSimple(table, id, values) {
  const row = pick(table, values);
  const saved = id ? await updateRow(table, id, row) : await insertRow(table, row);
  await loadAll();
  return saved;
}

// ----- Time-based statistics for the dashboard ------------------------

function todayDate() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// The date to measure "recent" from: the latest day with research activity
// (not in the future), so a quiet week doesn't make everything read "0".
function researchToday() {
  const today = todayDate().getTime();
  let latest = 0;
  const dates = [...data.research_session.map((s) => s.session_date), ...allRecords().map((r) => r.created_at)];
  for (const value of dates) {
    const time = new Date(value.length === 10 ? value + 'T00:00' : value).getTime();
    if (time <= today + 86400000 && time > latest) latest = time;
  }
  const day = new Date(latest || today);
  day.setHours(0, 0, 0, 0);
  return day;
}

// How many rows have a date within the last `days` days.
function addedInLastDays(rows, dateKey, days) {
  const end = researchToday().getTime() + 86400000;
  const since = end - days * 86400000;
  return rows.filter((row) => {
    const time = new Date(row[dateKey].length === 10 ? row[dateKey] + 'T00:00' : row[dateKey]).getTime();
    return time >= since && time < end;
  }).length;
}

// Counts per month for the last `months` months, oldest first.
// Returns [{ label: 'Jun', count: 3, isCurrent: false }, ...]
function countsByMonth(rows, dateKey, months = 6) {
  const result = [];
  const now = researchToday();
  for (let i = months - 1; i >= 0; i--) {
    const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
    result.push({
      label: month.toLocaleString('en-GB', { month: 'short' }),
      count: rows.filter((row) => String(row[dateKey]).slice(0, 7) === key).length,
      isCurrent: i === 0,
    });
  }
  return result;
}


// Share of evidence (steps 1 to 4) that already feeds the next step.
function evidenceInUsePercent() {
  let total = 0;
  let used = 0;
  for (const stage of STAGES.slice(0, 4)) {
    total += data[stage.type].length;
    used += data[stage.type].filter((r) => downstream(stage.type, r.id).length > 0).length;
  }
  return total ? Math.round((used / total) * 100) : 0;
}

// The next planned session (or null).
function nextSession() {
  const upcoming = data.research_session
    .filter((s) => s.status === 'planned')
    .sort((a, b) => (a.session_date > b.session_date ? 1 : -1));
  return upcoming[0] || null;
}


// ----- Sources, notes and annotation pins ------------------------------

// Everything attached to one session or record.
function sourcesFor(type, id) {
  return data.source.filter((s) => s[OWNER_COLUMN[type]] === id);
}
function notesFor(type, id) {
  return data.note.filter((n) => n[OWNER_COLUMN[type]] === id).sort((a, b) => (a.created_at > b.created_at ? 1 : -1));
}
function pinsFor(sourceId) {
  return data.annotation.filter((a) => a.source_id === sourceId).sort((a, b) => a.id - b.id);
}

// What a source or note is attached to: { type, id, title, href }.
function ownerOf(row) {
  for (const type in OWNER_COLUMN) {
    const id = row[OWNER_COLUMN[type]];
    if (id) {
      const record = byId(type, id);
      const href = type === 'research_session' ? `#/sessions/${id}` : `#/record/${type}/${id}`;
      return { type, id, title: record ? record.title : 'Removed', href, label: type === 'research_session' ? 'Session' : STAGE[type].label };
    }
  }
  return null;
}

// The project a source belongs to (through whatever it's attached to).
function projectOfSource(source) {
  const owner = ownerOf(source);
  if (!owner) return null;
  const record = byId(owner.type, owner.id);
  return record ? record.project_id : null;
}


// The address of a stored photo. A source keeps the file's name in the
// "sources" bucket (older rows may hold a full address).
function sourceUrl(source) {
  if (/^(https?:|data:)/.test(source.file_url)) return source.file_url;
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(source.file_url)}`;
}

// Uploads a photo (a Blob) to Storage and returns the name it was stored under.
async function uploadPhoto(blob, title) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'photo';
  const name = `${Date.now()}-${slug}.jpg`;
  const result = await client.storage.from(BUCKET).upload(name, blob, { contentType: 'image/jpeg' });
  if (result.error) throw friendlyError(result.error, 'upload the photo');
  return name;
}

// Removes photos from Storage. A failure here isn't fatal: the rows are
// already gone, and a leftover file can be deleted in the Supabase dashboard.
async function removeFiles(names) {
  const stored = names.filter((name) => name && !/^(https?:|data:)/.test(name));
  if (stored.length) await client.storage.from(BUCKET).remove(stored);
}

// Attaches a new source (or updates one). `attach` is "type:id", e.g. "finding:3".
async function saveSource(id, values) {
  const row = pick('source', values);
  if (values.attach) {
    const [type, ownerId] = values.attach.split(':');
    for (const column of Object.values(OWNER_COLUMN)) row[column] = null;
    row[OWNER_COLUMN[type]] = Number(ownerId);
  }
  const saved = id ? await updateRow('source', id, row) : await insertRow('source', { kind: 'photo', is_illustration: false, ...row });
  await loadAll();
  return saved;
}

async function saveNote(type, ownerId, values) {
  const row = pick('note', values);
  row[OWNER_COLUMN[type]] = ownerId;
  const saved = await insertRow('note', row);
  await loadAll();
  return saved;
}

async function savePin(sourceId, values) {
  const saved = await insertRow('annotation', { source_id: sourceId, ...pick('annotation', values) });
  await loadAll();
  return saved;
}

// Deletes one row: a project, session, record, source, note, pin, participant...
// The database refuses, with a clear message, if other records still depend
// on it. Photos attached to what is deleted are removed from Storage too.
async function deleteRecord(table, id) {
  const files = table === 'source' ? [byId('source', id).file_url] : OWNER_COLUMN[table] ? sourcesFor(table, id).map((s) => s.file_url) : [];
  await deleteById(table, id);
  await removeFiles(files);
  await loadAll();
}
