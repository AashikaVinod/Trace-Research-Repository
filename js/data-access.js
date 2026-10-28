// TRACE data-access layer. Pages call these functions; they never talk to
// Supabase or localStorage directly. The same code runs against either
// backend (Supabase or demo), which share one interface.
import { checkConfig, createSupabaseClient } from './supabase-client.js';
import { createSupabaseBackend } from './backends/supabase-backend.js';
import { createDemoBackend } from './backends/demo-backend.js';
import { STAGES, STAGE, LINKS, upstreamLinkOf } from './evidence.js';
import { TraceError, normalizeError } from './errors.js';

let backend = null;
let client = null;

/** Chooses the data source from js/config.js. Never falls back silently. */
export async function initDataSource() {
  const config = checkConfig();
  if (config.mode === 'invalid') return config;
  if (config.mode === 'demo') {
    backend = createDemoBackend();
  } else {
    client = await createSupabaseClient(config);
    backend = createSupabaseBackend(client);
  }
  return config;
}

/** Used by automated tests to run the layer against a chosen backend. */
export function useBackend(b, c = null) { backend = b; client = c; }

export const getMode = () => backend?.mode || null;
export const getClient = () => client;
export const isDemoPersistent = () => backend?.mode === 'demo' && backend.persistent;
export function resetDemoData() { if (backend?.mode === 'demo') backend.reset(); }
export const checkIsEditor = () => backend.isEditor();

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

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
const PROJECT_LOCKED = new Set(['research_question', 'research_session', 'finding', 'insight', 'recommendation', 'design_decision']);

/** Keeps only known columns, trims text and turns empty strings into null. */
function clean(table, values) {
  const row = {};
  for (const col of COLUMNS[table]) {
    if (!(col in values)) continue;
    let v = values[col];
    if (typeof v === 'string') v = v.trim() === '' ? null : v.trim();
    row[col] = v ?? null;
  }
  return row;
}

export const indexBy = (list, key = 'id') => new Map(list.map((r) => [r[key], r]));
const groupBy = (list, key) => {
  const m = new Map();
  for (const r of list) { if (!m.has(r[key])) m.set(r[key], []); m.get(r[key]).push(r); }
  return m;
};

/** Makes a link table match `desiredIds` for one owner: inserts missing links, removes extra ones. */
async function syncLinks(table, ownerCol, ownerId, otherCol, desiredIds, extra = () => ({})) {
  const existing = await backend.list(table, { eq: { [ownerCol]: ownerId } });
  const have = new Set(existing.map((r) => r[otherCol]));
  const want = new Set(desiredIds);
  const add = [...want].filter((x) => !have.has(x)).map((x) => ({ [ownerCol]: ownerId, [otherCol]: x, ...extra(x) }));
  const remove = [...have].filter((x) => !want.has(x)).map((x) => ({ [ownerCol]: ownerId, [otherCol]: x }));
  await backend.insertLinks(table, add);
  await backend.deleteLinks(table, remove);
  return { added: add.length, removed: remove.length };
}

function partialSave(error, saved, label) {
  const e = normalizeError(error, 'update the links');
  return new TraceError(`${label} was saved, but its links were not updated: ${e.message}`, {
    kind: 'partial', code: e.code, detail: e.detail, cause: e,
  });
}

/** Insert or update one row of an entity table. */
async function saveRow(table, id, values) {
  const row = clean(table, values);
  if (id == null) return backend.insert(table, row);
  if (PROJECT_LOCKED.has(table)) delete row.project_id;
  return backend.update(table, id, row);
}

// ---------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------

export async function fetchDashboardMetrics() {
  const [projectsInUse, projectsArchived, sessions, participants, insights, ...stageCounts] = await Promise.all([
    backend.count('research_project', { isNull: ['archived_at'] }),
    backend.count('research_project', { notNull: ['archived_at'] }),
    backend.count('research_session'),
    backend.count('participant'),
    backend.count('insight'),
    ...STAGES.map((s) => backend.count(s.type)),
  ]);
  return {
    projects: projectsInUse + projectsArchived,
    projectsInUse,
    projectsArchived,
    sessions,
    participants,
    insights,
    stages: Object.fromEntries(STAGES.map((s, i) => [s.type, stageCounts[i]])),
  };
}

export async function fetchDashboard() {
  const [metrics, projects, sessions, insights] = await Promise.all([
    fetchDashboardMetrics(),
    backend.list('research_project', { order: { col: 'title' } }),
    backend.list('research_session', { order: [{ col: 'session_date', asc: false }, { col: 'id', asc: false }], limit: 6 }),
    backend.list('insight', { order: [{ col: 'created_at', asc: false }, { col: 'id', asc: false }], limit: 5 }),
  ]);
  const recentProjects = projects
    .filter((p) => !p.archived_at)
    .sort((a, b) => (b.created_at > a.created_at ? 1 : -1))
    .slice(0, 4);
  return { metrics, recentProjects, recentSessions: sessions, recentInsights: insights, projectById: indexBy(projects) };
}

// ---------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------

export async function fetchProjects() {
  const [projects, sessions, team, researchers] = await Promise.all([
    backend.list('research_project', { order: { col: 'start_date', asc: false } }),
    backend.list('research_session'),
    backend.list('project_researcher'),
    backend.list('researcher'),
  ]);
  const researcherById = indexBy(researchers);
  const sessionsByProject = groupBy(sessions, 'project_id');
  return projects.map((p) => {
    const lead = team.find((t) => t.project_id === p.id && t.project_role === 'lead');
    return {
      ...p,
      lead: lead ? researcherById.get(lead.researcher_id) : null,
      sessionCount: (sessionsByProject.get(p.id) || []).length,
    };
  });
}

export async function fetchProjectDetail(id) {
  const project = await backend.get('research_project', id);
  if (!project) return null;
  const [questions, projectMethods, methods, team, researchers, sessions, findings, insights, recommendations, decisions] = await Promise.all([
    backend.list('research_question', { eq: { project_id: id }, order: { col: 'id' } }),
    backend.list('project_method', { eq: { project_id: id } }),
    backend.list('research_method', { order: { col: 'name' } }),
    backend.list('project_researcher', { eq: { project_id: id } }),
    backend.list('researcher', { order: { col: 'full_name' } }),
    backend.list('research_session', { eq: { project_id: id }, order: [{ col: 'session_date', asc: false }, { col: 'id', asc: false }] }),
    backend.list('finding', { eq: { project_id: id } }),
    backend.list('insight', { eq: { project_id: id } }),
    backend.list('recommendation', { eq: { project_id: id } }),
    backend.list('design_decision', { eq: { project_id: id } }),
  ]);
  const sessionIds = sessions.map((s) => s.id);
  const observations = sessionIds.length ? await backend.list('observation', { inList: { session_id: sessionIds } }) : [];
  const methodById = indexBy(methods);
  const researcherById = indexBy(researchers);
  const roleOrder = { lead: 0, researcher: 1, observer: 2 };
  return {
    project,
    questions,
    methods: projectMethods.map((pm) => methodById.get(pm.method_id)).filter(Boolean),
    allMethods: methods,
    team: team.map((t) => ({ ...t, researcher: researcherById.get(t.researcher_id) }))
      .filter((t) => t.researcher)
      .sort((a, b) => roleOrder[a.project_role] - roleOrder[b.project_role]),
    allResearchers: researchers,
    sessions: sessions.map((s) => ({
      ...s,
      method: methodById.get(s.method_id),
      researcher: researcherById.get(s.researcher_id),
      observationCount: observations.filter((o) => o.session_id === s.id).length,
    })),
    counts: {
      observation: observations.length,
      finding: findings.length,
      insight: insights.length,
      recommendation: recommendations.length,
      design_decision: decisions.length,
    },
  };
}

export const createProject = (values) => saveRow('research_project', null, values);
export const updateProject = (id, values) => saveRow('research_project', id, values);
export const archiveProject = (id) => backend.update('research_project', id, { archived_at: new Date().toISOString() });
export const restoreProject = (id) => backend.update('research_project', id, { archived_at: null });

export async function saveProjectMethods(projectId, methodIds) {
  return syncLinks('project_method', 'project_id', projectId, 'method_id', methodIds);
}

/** Sets the team of a project; `leadId` (optional) becomes the single lead. */
export async function saveProjectTeam(projectId, researcherIds, leadId = null) {
  if (leadId != null && !researcherIds.includes(leadId)) researcherIds = [...researcherIds, leadId];
  await syncLinks('project_researcher', 'project_id', projectId, 'researcher_id', researcherIds,
    (rid) => ({ project_role: rid === leadId ? 'lead' : 'researcher' }));
  const team = await backend.list('project_researcher', { eq: { project_id: projectId } });
  for (const t of team) {
    if (t.project_role === 'lead' && t.researcher_id !== leadId) {
      await backend.updateWhere('project_researcher', { project_id: projectId, researcher_id: t.researcher_id }, { project_role: 'researcher' });
    } else if (t.researcher_id === leadId && t.project_role !== 'lead') {
      await backend.updateWhere('project_researcher', { project_id: projectId, researcher_id: t.researcher_id }, { project_role: 'lead' });
    }
  }
}

export const saveQuestion = (id, values) => saveRow('research_question', id, values);

// ---------------------------------------------------------------------
// Evidence records (Research Library + Evidence Trail)
// ---------------------------------------------------------------------

/** Loads all five record types, their links, sessions and projects. */
export async function fetchEvidence() {
  const [projects, sessions, ...rest] = await Promise.all([
    backend.list('research_project', { order: { col: 'title' } }),
    backend.list('research_session'),
    ...STAGES.map((s) => backend.list(s.type, { order: { col: 'id' } })),
    ...LINKS.map((l) => backend.list(l.table)),
  ]);
  const records = Object.fromEntries(STAGES.map((s, i) => [s.type, rest[i]]));
  const links = Object.fromEntries(LINKS.map((l, i) => [l.table, rest[STAGES.length + i]]));
  const sessionById = indexBy(sessions);
  // Observations get their project through their session (no redundant column).
  for (const o of records.observation) o.project_id = sessionById.get(o.session_id)?.project_id ?? null;
  return { projects, sessions, records, links, projectById: indexBy(projects), sessionById };
}

/** A flat list of every evidence record with link counts, for the library. */
export function flattenRecords(evidence) {
  const counts = new Map();
  const bump = (k, dir) => { const c = counts.get(k) || { up: 0, down: 0 }; c[dir] += 1; counts.set(k, c); };
  for (const l of LINKS) {
    for (const row of evidence.links[l.table]) {
      bump(`${l.from}:${row[l.fromCol]}`, 'down');
      bump(`${l.to}:${row[l.toCol]}`, 'up');
    }
  }
  return STAGES.flatMap((s) => evidence.records[s.type].map((r) => ({
    type: s.type,
    ...r,
    upCount: counts.get(`${s.type}:${r.id}`)?.up || 0,
    downCount: counts.get(`${s.type}:${r.id}`)?.down || 0,
  })));
}

export async function fetchRecord(type, id) {
  if (!STAGE[type]) throw new TraceError(`Unknown record type "${type}".`, { kind: 'validation' });
  const evidence = await fetchEvidence();
  const record = evidence.records[type].find((r) => r.id === id);
  if (!record) return null;
  const linked = (dir) => {
    const out = [];
    for (const l of LINKS) {
      if (dir === 'up' && l.to === type) {
        for (const row of evidence.links[l.table].filter((x) => x[l.toCol] === id)) {
          const r = evidence.records[l.from].find((x) => x.id === row[l.fromCol]);
          if (r) out.push({ type: l.from, ...r });
        }
      }
      if (dir === 'down' && l.from === type) {
        for (const row of evidence.links[l.table].filter((x) => x[l.fromCol] === id)) {
          const r = evidence.records[l.to].find((x) => x.id === row[l.toCol]);
          if (r) out.push({ type: l.to, ...r });
        }
      }
    }
    return out;
  };
  return {
    type,
    record,
    project: evidence.projectById.get(record.project_id) || null,
    session: type === 'observation' ? evidence.sessionById.get(record.session_id) : null,
    upstream: linked('up'),
    downstream: linked('down'),
    evidence,
  };
}

/**
 * Creates or updates a record. `upstreamIds` (optional) are the ids of the
 * records it is built on (e.g. the observations supporting a finding).
 */
export async function saveRecord(type, id, values, upstreamIds) {
  if (!STAGE[type]) throw new TraceError(`Unknown record type "${type}".`, { kind: 'validation' });
  const saved = await saveRow(type, id, values);
  const link = upstreamLinkOf(type);
  if (link && Array.isArray(upstreamIds)) {
    try {
      await syncLinks(link.table, link.toCol, saved.id, link.fromCol, upstreamIds);
    } catch (e) {
      const err = partialSave(e, saved, STAGE[type].label);
      err.saved = saved;
      throw err;
    }
  }
  return saved;
}

export const saveObservation = (id, values) => saveRecord('observation', id, values);

// ---------------------------------------------------------------------
// Participants and sessions
// ---------------------------------------------------------------------

export async function fetchParticipants() {
  const [participants, segments, memberships, sessionLinks] = await Promise.all([
    backend.list('participant', { order: { col: 'participant_code' } }),
    backend.list('segment', { order: { col: 'name' } }),
    backend.list('participant_segment'),
    backend.list('session_participant'),
  ]);
  const segmentById = indexBy(segments);
  return {
    segments,
    participants: participants.map((p) => ({
      ...p,
      segments: memberships.filter((m) => m.participant_id === p.id).map((m) => segmentById.get(m.segment_id)).filter(Boolean),
      sessionCount: sessionLinks.filter((l) => l.participant_id === p.id).length,
    })),
  };
}

export async function saveParticipant(id, values, segmentIds) {
  const saved = await saveRow('participant', id, values);
  try {
    await syncLinks('participant_segment', 'participant_id', saved.id, 'segment_id', segmentIds);
  } catch (e) {
    const err = partialSave(e, saved, 'Participant');
    err.saved = saved;
    throw err;
  }
  return saved;
}

export async function fetchSessions() {
  const [sessions, projects, methods, researchers, participants, sessionParticipants, observations, questions] = await Promise.all([
    backend.list('research_session', { order: [{ col: 'session_date', asc: false }, { col: 'id', asc: false }] }),
    backend.list('research_project', { order: { col: 'title' } }),
    backend.list('research_method', { order: { col: 'name' } }),
    backend.list('researcher', { order: { col: 'full_name' } }),
    backend.list('participant', { order: { col: 'participant_code' } }),
    backend.list('session_participant'),
    backend.list('observation'),
    backend.list('research_question', { order: { col: 'id' } }),
  ]);
  const projectById = indexBy(projects);
  const methodById = indexBy(methods);
  const researcherById = indexBy(researchers);
  const participantById = indexBy(participants);
  return {
    projects, methods, researchers, participants, questions, projectById,
    sessions: sessions.map((s) => ({
      ...s,
      project: projectById.get(s.project_id),
      method: methodById.get(s.method_id),
      researcher: researcherById.get(s.researcher_id),
      participants: sessionParticipants.filter((l) => l.session_id === s.id).map((l) => participantById.get(l.participant_id)).filter(Boolean),
      observationCount: observations.filter((o) => o.session_id === s.id).length,
    })),
  };
}

export async function fetchSessionDetail(id) {
  const session = await backend.get('research_session', id);
  if (!session) return null;
  const [project, method, researcher, participantLinks, questionLinks, observations, participants, questions, findingLinks] = await Promise.all([
    backend.get('research_project', session.project_id),
    backend.get('research_method', session.method_id),
    backend.get('researcher', session.researcher_id),
    backend.list('session_participant', { eq: { session_id: id } }),
    backend.list('session_question', { eq: { session_id: id } }),
    backend.list('observation', { eq: { session_id: id }, order: { col: 'id' } }),
    backend.list('participant', { order: { col: 'participant_code' } }),
    backend.list('research_question', { eq: { project_id: session.project_id }, order: { col: 'id' } }),
    backend.list('observation_finding'),
  ]);
  const participantById = indexBy(participants);
  const questionById = indexBy(questions);
  return {
    session, project, method, researcher,
    participants: participantLinks.map((l) => participantById.get(l.participant_id)).filter(Boolean),
    questions: questionLinks.map((l) => questionById.get(l.question_id)).filter(Boolean),
    observations: observations.map((o) => ({ ...o, findingCount: findingLinks.filter((l) => l.observation_id === o.id).length })),
  };
}

export async function saveSession(id, values, participantIds, questionIds) {
  const saved = await saveRow('research_session', id, values);
  try {
    await syncLinks('session_participant', 'session_id', saved.id, 'participant_id', participantIds);
    await syncLinks('session_question', 'session_id', saved.id, 'question_id', questionIds);
  } catch (e) {
    const err = partialSave(e, saved, 'Session');
    err.saved = saved;
    throw err;
  }
  return saved;
}

// ---------------------------------------------------------------------
// Reference data (researchers, methods, segments)
// ---------------------------------------------------------------------

export async function fetchReference() {
  const [researchers, methods, segments, sessions, memberships, team] = await Promise.all([
    backend.list('researcher', { order: { col: 'full_name' } }),
    backend.list('research_method', { order: { col: 'name' } }),
    backend.list('segment', { order: { col: 'name' } }),
    backend.list('research_session'),
    backend.list('participant_segment'),
    backend.list('project_researcher'),
  ]);
  return {
    researchers: researchers.map((r) => ({
      ...r,
      sessionCount: sessions.filter((s) => s.researcher_id === r.id).length,
      projectCount: team.filter((t) => t.researcher_id === r.id).length,
    })),
    methods: methods.map((m) => ({ ...m, sessionCount: sessions.filter((s) => s.method_id === m.id).length })),
    segments: segments.map((g) => ({ ...g, participantCount: memberships.filter((m) => m.segment_id === g.id).length })),
  };
}

export const saveResearcher = (id, values) => saveRow('researcher', id, values);
export const saveMethod = (id, values) => saveRow('research_method', id, values);
export const saveSegment = (id, values) => saveRow('segment', id, values);

// ---------------------------------------------------------------------
// Lookups for forms
// ---------------------------------------------------------------------

export async function fetchLookups() {
  const [projects, sessions, methods, researchers, participants, segments, questions] = await Promise.all([
    backend.list('research_project', { order: { col: 'title' } }),
    backend.list('research_session', { order: [{ col: 'session_date', asc: false }] }),
    backend.list('research_method', { order: { col: 'name' } }),
    backend.list('researcher', { order: { col: 'full_name' } }),
    backend.list('participant', { order: { col: 'participant_code' } }),
    backend.list('segment', { order: { col: 'name' } }),
    backend.list('research_question', { order: { col: 'id' } }),
  ]);
  return { projects, sessions, methods, researchers, participants, segments, questions };
}
