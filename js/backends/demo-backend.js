// Demo-mode implementation of the backend interface. Data lives in this
// browser's localStorage, never in PostgreSQL. It enforces the same keys,
// foreign keys, unique rules, checks and triggers as the SQL schema so the
// app behaves identically in both modes.
import { DEMO_DATA } from '../demo-data.js';
import { validateRow } from '../rules.js';
import { TraceError } from '../errors.js';

const STORAGE_KEY = 'trace.demo.v1';

const IDENTITY_TABLES = new Set([
  'researcher', 'segment', 'research_method', 'research_project', 'participant', 'research_question',
  'research_session', 'observation', 'finding', 'insight', 'recommendation', 'design_decision',
]);

const PRIMARY_KEYS = {
  project_researcher: ['project_id', 'researcher_id'],
  project_method: ['project_id', 'method_id'],
  participant_segment: ['participant_id', 'segment_id'],
  session_participant: ['session_id', 'participant_id'],
  session_question: ['session_id', 'question_id'],
  observation_finding: ['observation_id', 'finding_id'],
  finding_insight: ['finding_id', 'insight_id'],
  insight_recommendation: ['insight_id', 'recommendation_id'],
  recommendation_decision: ['recommendation_id', 'decision_id'],
};

const FOREIGN_KEYS = {
  project_researcher: { project_id: 'research_project', researcher_id: 'researcher' },
  project_method: { project_id: 'research_project', method_id: 'research_method' },
  participant_segment: { participant_id: 'participant', segment_id: 'segment' },
  research_question: { project_id: 'research_project' },
  research_session: { project_id: 'research_project', method_id: 'research_method', researcher_id: 'researcher' },
  session_participant: { session_id: 'research_session', participant_id: 'participant' },
  session_question: { session_id: 'research_session', question_id: 'research_question' },
  observation: { session_id: 'research_session' },
  finding: { project_id: 'research_project' },
  insight: { project_id: 'research_project' },
  recommendation: { project_id: 'research_project' },
  design_decision: { project_id: 'research_project' },
  observation_finding: { observation_id: 'observation', finding_id: 'finding' },
  finding_insight: { finding_id: 'finding', insight_id: 'insight' },
  insight_recommendation: { insight_id: 'insight', recommendation_id: 'recommendation' },
  recommendation_decision: { recommendation_id: 'recommendation', decision_id: 'design_decision' },
};

// [constraint name, columns]; the last column is compared case-insensitively.
const UNIQUE = {
  participant: [['participant_code_key', ['participant_code'], false]],
  researcher: [['researcher_email_key', ['email'], true]],
  segment: [['segment_name_key', ['name'], true]],
  research_method: [['research_method_name_key', ['name'], true]],
  research_project: [['research_project_title_key', ['title'], true]],
  research_question: [['research_question_text_key', ['project_id', 'question_text'], true]],
  research_session: [['research_session_title_key', ['project_id', 'title'], true]],
  observation: [['observation_title_key', ['session_id', 'title'], true]],
  finding: [['finding_title_key', ['project_id', 'title'], true]],
  insight: [['insight_title_key', ['project_id', 'title'], true]],
  recommendation: [['recommendation_title_key', ['project_id', 'title'], true]],
  design_decision: [['design_decision_title_key', ['project_id', 'title'], true]],
};

// Link tables whose two ends must belong to the same project.
const SAME_PROJECT = {
  session_question: [['research_session', 'session_id'], ['research_question', 'question_id']],
  observation_finding: [['observation', 'observation_id'], ['finding', 'finding_id']],
  finding_insight: [['finding', 'finding_id'], ['insight', 'insight_id']],
  insight_recommendation: [['insight', 'insight_id'], ['recommendation', 'recommendation_id']],
  recommendation_decision: [['recommendation', 'recommendation_id'], ['design_decision', 'decision_id']],
};

const PROJECT_LOCKED = new Set(['research_question', 'research_session', 'finding', 'insight', 'recommendation', 'design_decision']);
const BLOCKED_WHEN_ARCHIVED = new Set([...PROJECT_LOCKED, 'observation']);

const clone = (v) => JSON.parse(JSON.stringify(v));
// Shaped like a PostgREST error so it goes through the same normalisation as Supabase errors.
const dbError = (message, code, constraint) => Object.assign(new Error(message), { code, constraint });

export function createDemoBackend(storage = globalThis.localStorage) {
  let persistent = true;
  let db = load();

  function load() {
    try {
      const saved = storage?.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      persistent = false;
    }
    return clone(DEMO_DATA);
  }

  function save() {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      persistent = false;
    }
  }

  const rows = (table) => {
    if (!db[table]) throw dbError(`Unknown table ${table}.`, '42P01');
    return db[table];
  };

  function projectOf(kind, id) {
    const find = (t) => rows(t).find((r) => r.id === id);
    if (kind === 'observation') {
      const o = find('observation');
      return o ? rows('research_session').find((s) => s.id === o.session_id)?.project_id ?? null : null;
    }
    return find(kind)?.project_id ?? null;
  }

  function checkRow(table, row, existing = null) {
    // CHECK / NOT NULL (shared rules)
    const problems = validateRow(table, row);
    if (problems.length) {
      const p = problems[0];
      throw dbError(p.message, p.field && !row[p.field] && p.message.includes('required') ? '23502' : '23514', p.constraint, p.field);
    }
    // Foreign keys
    for (const [col, ref] of Object.entries(FOREIGN_KEYS[table] || {})) {
      if (row[col] == null) continue;
      if (!rows(ref).some((r) => r.id === row[col])) {
        throw dbError(`insert or update on table "${table}" violates foreign key constraint "${table}_${col.replace(/_id$/, '')}_fk"`, '23503', `${table}_${col.replace(/_id$/, '')}_fk`);
      }
    }
    // Primary key of link tables
    const pk = PRIMARY_KEYS[table];
    if (pk && rows(table).some((r) => r !== existing && pk.every((c) => r[c] === row[c]))) {
      throw dbError('These records are already linked.', '23505', `${table}_pkey`);
    }
    // Unique constraints
    for (const [name, cols, ci] of UNIQUE[table] || []) {
      const norm = (v, i) => (ci && i === cols.length - 1 && typeof v === 'string' ? v.toLowerCase() : v);
      const clash = rows(table).some((r) => r !== existing && cols.every((c, i) => norm(r[c], i) === norm(row[c], i)));
      if (clash) throw dbError(`duplicate key value violates unique constraint "${name}"`, '23505', name);
    }
    // Trigger: links stay within one project
    const sp = SAME_PROJECT[table];
    if (sp) {
      const [[kindA, colA], [kindB, colB]] = sp;
      const a = kindA === 'research_session' ? rows('research_session').find((s) => s.id === row[colA])?.project_id : projectOf(kindA, row[colA]);
      const b = projectOf(kindB, row[colB]);
      if (a != null && b != null && a !== b) {
        throw dbError(`Cannot link ${kindA} ${row[colA]} to ${kindB} ${row[colB]}: they belong to different projects.`, '23514', 'trace_same_project');
      }
    }
  }

  function checkArchived(table, row) {
    if (!BLOCKED_WHEN_ARCHIVED.has(table)) return;
    const projectId = table === 'observation'
      ? rows('research_session').find((s) => s.id === row.session_id)?.project_id
      : row.project_id;
    const project = rows('research_project').find((p) => p.id === projectId);
    if (project?.archived_at) {
      throw dbError('This project is archived. Restore it before adding new work.', '23514', 'trace_project_archived');
    }
  }

  function applyFilters(list, { eq, inList, isNull, notNull } = {}) {
    return list.filter((r) => Object.entries(eq || {}).every(([c, v]) => r[c] === v)
      && Object.entries(inList || {}).every(([c, vs]) => vs.includes(r[c]))
      && (isNull || []).every((c) => r[c] == null)
      && (notNull || []).every((c) => r[c] != null));
  }

  return {
    mode: 'demo',
    get persistent() { return persistent; },

    async list(table, { eq, inList, isNull, notNull, order, limit } = {}) {
      let list = applyFilters(rows(table), { eq, inList, isNull, notNull });
      const orders = [].concat(order || []);
      if (orders.length) {
        list = [...list].sort((a, b) => {
          for (const o of orders) {
            const x = a[o.col]; const y = b[o.col];
            if (x === y) continue;
            if (x == null) return 1;
            if (y == null) return -1;
            const cmp = x < y ? -1 : 1;
            return o.asc === false ? -cmp : cmp;
          }
          return 0;
        });
      }
      if (limit) list = list.slice(0, limit);
      return clone(list);
    },

    async get(table, id) {
      const row = rows(table).find((r) => r.id === id);
      return row ? clone(row) : null;
    },

    async count(table, filters = {}) {
      return applyFilters(rows(table), filters).length;
    },

    async insert(table, values) {
      const now = new Date().toISOString();
      const row = { ...values, created_at: now };
      if (IDENTITY_TABLES.has(table)) {
        row.id = rows(table).reduce((m, r) => Math.max(m, r.id), 0) + 1;
        row.updated_at = now;
      }
      checkRow(table, row);
      checkArchived(table, row);
      rows(table).push(row);
      save();
      return clone(row);
    },

    async update(table, id, patch) {
      const existing = rows(table).find((r) => r.id === id);
      if (!existing) throw new TraceError('Nothing was saved. The record may have been removed.', { code: 'PGRST116' });
      const next = { ...existing, ...patch, id, updated_at: new Date().toISOString() };
      if (PROJECT_LOCKED.has(table) && next.project_id !== existing.project_id) {
        throw dbError(`The project of a ${table} cannot be changed after it is created.`, '23514', 'trace_project_locked');
      }
      if (table === 'observation' && next.session_id !== existing.session_id) {
        const p = (sid) => rows('research_session').find((s) => s.id === sid)?.project_id;
        if (p(next.session_id) !== p(existing.session_id)) {
          throw dbError('An observation can only move to a session in the same project.', '23514', 'trace_project_locked');
        }
      }
      checkRow(table, next, existing);
      Object.assign(existing, next);
      save();
      return clone(existing);
    },

    async updateWhere(table, match, patch) {
      const targets = applyFilters(rows(table), { eq: match });
      if (!targets.length) throw new TraceError('Nothing was saved.', { code: 'PGRST116' });
      for (const t of targets) checkRow(table, { ...t, ...patch }, t);
      targets.forEach((t) => Object.assign(t, patch));
      save();
      return clone(targets);
    },

    async insertLinks(table, newRows) {
      const now = new Date().toISOString();
      const staged = [];
      // Validate all first so a failure leaves nothing half-written.
      const snapshot = rows(table).length;
      try {
        for (const r of newRows) {
          const row = { ...r, created_at: now };
          checkRow(table, row);
          rows(table).push(row);
          staged.push(row);
        }
      } catch (e) {
        rows(table).splice(snapshot);
        throw e;
      }
      save();
      return clone(staged);
    },

    async deleteLinks(table, matches) {
      for (const match of matches) {
        const list = rows(table);
        const i = list.findIndex((r) => Object.entries(match).every(([c, v]) => r[c] === v));
        if (i === -1) throw new TraceError('A link could not be removed because it no longer exists.', { code: 'PGRST116' });
        list.splice(i, 1);
      }
      save();
    },

    async isEditor() { return true; },

    reset() {
      db = clone(DEMO_DATA);
      try { storage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
    },
  };
}
