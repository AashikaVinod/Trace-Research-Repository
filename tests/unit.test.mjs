// Unit tests: run with `node --test tests/` (Node 18+). No dependencies.
// They exercise the real data-access layer against the demo backend, the
// evidence graph, the config guard and the seed's referential integrity.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoBackend } from '../js/backends/demo-backend.js';
import * as data from '../js/data-access.js';
import { buildGraph, lineage, isCompleteChain, STAGES, LINKS } from '../js/evidence.js';
import { checkConfig } from '../js/supabase-client.js';
import { DEMO_DATA } from '../js/demo-data.js';
import { validateRow } from '../js/rules.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
function fresh() {
  const storage = memoryStorage();
  const backend = createDemoBackend(storage);
  data.useBackend(backend);
  return { backend, storage };
}

test('seed: every foreign key and link resolves', () => {
  const ids = (t) => new Set(DEMO_DATA[t].map((r) => r.id));
  const fk = {
    research_session: { project_id: 'research_project', method_id: 'research_method', researcher_id: 'researcher' },
    observation: { session_id: 'research_session' },
    finding: { project_id: 'research_project' }, insight: { project_id: 'research_project' },
    recommendation: { project_id: 'research_project' }, design_decision: { project_id: 'research_project' },
  };
  for (const [t, cols] of Object.entries(fk)) {
    for (const row of DEMO_DATA[t]) for (const [c, ref] of Object.entries(cols)) assert.ok(ids(ref).has(row[c]), `${t}.${c}=${row[c]}`);
  }
  for (const l of LINKS) {
    for (const row of DEMO_DATA[l.table]) {
      assert.ok(ids(l.from).has(row[l.fromCol]));
      assert.ok(ids(l.to).has(row[l.toCol]));
    }
  }
});

test('seed: every row satisfies the validation rules', () => {
  for (const t of Object.keys(DEMO_DATA)) for (const row of DEMO_DATA[t]) assert.deepEqual(validateRow(t, row), [], `${t} ${row.id}`);
});

test('dashboard metrics are computed from the data', async () => {
  fresh();
  const m = await data.fetchDashboardMetrics();
  assert.equal(m.projects, DEMO_DATA.research_project.length);
  assert.equal(m.projectsArchived, 1);
  assert.equal(m.sessions, DEMO_DATA.research_session.length);
  assert.equal(m.participants, DEMO_DATA.participant.length);
  assert.equal(m.insights, DEMO_DATA.insight.length);
});

test('create, edit, archive and restore a project; it persists in storage', async () => {
  const { storage } = fresh();
  const p = await data.createProject({ title: '  Test project ', research_objective: 'A long enough objective', status: 'planned', start_date: '2026-10-01', description: '' });
  assert.equal(p.title, 'Test project');
  assert.equal(p.description, null);
  await data.updateProject(p.id, { title: 'Renamed project', research_objective: 'A long enough objective', status: 'active', start_date: '2026-10-01' });
  await data.archiveProject(p.id);
  // A "refresh": a new backend reading the same storage.
  data.useBackend(createDemoBackend(storage));
  const list = await data.fetchProjects();
  const again = list.find((x) => x.id === p.id);
  assert.equal(again.title, 'Renamed project');
  assert.ok(again.archived_at);
  await data.restoreProject(p.id);
  assert.equal((await data.fetchProjectDetail(p.id)).project.archived_at, null);
});

test('database rules are enforced in demo mode', async () => {
  fresh();
  await assert.rejects(data.createProject({ title: 'mobile banking ONBOARDING', research_objective: 'A long enough objective', status: 'planned', start_date: '2026-01-01' }), { code: '23505' });
  await assert.rejects(data.createProject({ title: 'Bad dates', research_objective: 'A long enough objective', status: 'planned', start_date: '2026-02-01', end_date: '2026-01-01' }), { constraint: 'research_project_dates_check' });
  await assert.rejects(data.saveParticipant(null, { participant_code: 'Alice' }, []), { code: '23514' });
  await assert.rejects(data.saveRecord('finding', null, { project_id: 4, title: 'Late', description: 'Archived project', confidence: 'low' }, []), { constraint: 'trace_project_archived' });
  // Linking an observation from project 2 to a finding in project 1 fails, but the finding itself is saved.
  await assert.rejects(data.saveRecord('finding', null, { project_id: 1, title: 'Cross project', description: 'Should fail on links', confidence: 'low' }, [9]), (e) => e.kind === 'partial' && !!e.saved);
});

test('full chain: observation -> finding -> insight -> recommendation -> decision', async () => {
  fresh();
  const s = await data.saveSession(null, { project_id: 1, method_id: 1, researcher_id: 1, title: 'Chain test session', session_date: '2026-10-20', status: 'completed', duration_minutes: 30 }, [1, 2], [1]);
  const o = await data.saveObservation(null, { session_id: s.id, title: 'Chain observation', description: 'Something happened', sentiment: 'negative' });
  const f = await data.saveRecord('finding', null, { project_id: 1, title: 'Chain finding', description: 'A pattern', confidence: 'high' }, [o.id, 1]);
  const i = await data.saveRecord('insight', null, { project_id: 1, title: 'Chain insight', description: 'Why it matters', impact: 'high' }, [f.id]);
  const r = await data.saveRecord('recommendation', null, { project_id: 1, title: 'Chain recommendation', description: 'Do this', priority: 'high', status: 'accepted' }, [i.id]);
  const d = await data.saveRecord('design_decision', null, { project_id: 1, title: 'Chain decision', description: 'We did it', status: 'approved' }, [r.id]);

  const ev = await data.fetchEvidence();
  const g = buildGraph(ev.records, ev.links);
  const lin = lineage(g, 'design_decision', d.id);
  assert.ok(isCompleteChain(lin));
  assert.deepEqual(lin.byStage.observation.map((n) => n.id).sort((a, b) => a - b), [1, o.id]);

  // Unlink: the finding no longer uses observation 1.
  await data.saveRecord('finding', f.id, { project_id: 1, title: 'Chain finding', description: 'A pattern', confidence: 'high' }, [o.id]);
  const rec = await data.fetchRecord('finding', f.id);
  assert.deepEqual(rec.upstream.map((u) => u.id), [o.id]);
  assert.deepEqual(rec.downstream.map((u) => u.id), [i.id]);
});

test('evidence lineage handles missing relationships', async () => {
  fresh();
  const ev = await data.fetchEvidence();
  const g = buildGraph(ev.records, ev.links);
  const orphan = lineage(g, 'observation', 2); // deliberately unlinked in the seed
  assert.equal(orphan.keys.size, 1);
  assert.equal(isCompleteChain(orphan), false);
  const rec4 = lineage(g, 'recommendation', 4); // no decision yet
  assert.equal(rec4.byStage.design_decision.length, 0);
  assert.ok(rec4.byStage.observation.length > 0);
  assert.equal(lineage(g, 'finding', 999), null);
  for (const s of STAGES) assert.ok(Array.isArray(rec4.byStage[s.type]));
});

test('project team: single lead is maintained', async () => {
  fresh();
  await data.saveProjectTeam(1, [1, 2, 3, 4], 3);
  const d = await data.fetchProjectDetail(1);
  assert.deepEqual(d.team.filter((t) => t.project_role === 'lead').map((t) => t.researcher_id), [3]);
  assert.equal(d.team.length, 4);
});

test('config guard refuses secret keys and accepts demo/publishable', () => {
  assert.equal(checkConfig('', '').mode, 'demo');
  assert.equal(checkConfig('https://abc.supabase.co', 'sb_publishable_abc123').mode, 'supabase');
  assert.equal(checkConfig('https://abc.supabase.co', 'sb_secret_abc').mode, 'invalid');
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = (role) => `${b64({ alg: 'HS256' })}.${b64({ role })}.sig`;
  globalThis.atob ??= (s) => Buffer.from(s, 'base64').toString('binary');
  assert.equal(checkConfig('https://abc.supabase.co', jwt('service_role')).mode, 'invalid');
  assert.equal(checkConfig('https://abc.supabase.co', jwt('anon')).mode, 'supabase');
  assert.equal(checkConfig('https://abc.supabase.co/rest/v1', 'sb_publishable_x').mode, 'invalid');
  assert.equal(checkConfig('http://example.com', 'sb_publishable_x').mode, 'invalid');
  assert.equal(checkConfig('https://abc.supabase.co', '').mode, 'invalid');
});
