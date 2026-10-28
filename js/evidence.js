// The evidence chain model and pure graph functions (no DOM, no I/O), so
// the traversal logic can be tested on its own (tests/unit.test.mjs).

export const STAGES = [
  { type: 'observation', label: 'Observation', plural: 'Observations', step: 1 },
  { type: 'finding', label: 'Finding', plural: 'Findings', step: 2 },
  { type: 'insight', label: 'Insight', plural: 'Insights', step: 3 },
  { type: 'recommendation', label: 'Recommendation', plural: 'Recommendations', step: 4 },
  { type: 'design_decision', label: 'Design decision', plural: 'Design decisions', step: 5 },
];

export const STAGE = Object.fromEntries(STAGES.map((s) => [s.type, s]));

// Each link table connects a stage to the next one.
export const LINKS = [
  { table: 'observation_finding', from: 'observation', fromCol: 'observation_id', to: 'finding', toCol: 'finding_id' },
  { table: 'finding_insight', from: 'finding', fromCol: 'finding_id', to: 'insight', toCol: 'insight_id' },
  { table: 'insight_recommendation', from: 'insight', fromCol: 'insight_id', to: 'recommendation', toCol: 'recommendation_id' },
  { table: 'recommendation_decision', from: 'recommendation', fromCol: 'recommendation_id', to: 'design_decision', toCol: 'decision_id' },
];

/** The link table that feeds a stage (its "supported by" records), or null for observations. */
export const upstreamLinkOf = (type) => LINKS.find((l) => l.to === type) || null;
/** The link table that a stage feeds, or null for design decisions. */
export const downstreamLinkOf = (type) => LINKS.find((l) => l.from === type) || null;

export const nodeKey = (type, id) => `${type}:${id}`;

/**
 * Builds an adjacency graph.
 * records: { observation: [...], finding: [...], ... }
 * links:   { observation_finding: [...], ... }
 */
export function buildGraph(records, links) {
  const nodes = new Map();
  for (const s of STAGES) {
    for (const r of records[s.type] || []) nodes.set(nodeKey(s.type, r.id), { type: s.type, id: r.id, record: r, up: [], down: [] });
  }
  const edges = [];
  for (const l of LINKS) {
    for (const row of links[l.table] || []) {
      const a = nodes.get(nodeKey(l.from, row[l.fromCol]));
      const b = nodes.get(nodeKey(l.to, row[l.toCol]));
      if (!a || !b) continue; // ignore dangling links (filtered-out projects)
      a.down.push(b);
      b.up.push(a);
      edges.push({ from: nodeKey(a.type, a.id), to: nodeKey(b.type, b.id) });
    }
  }
  return { nodes, edges };
}

function walk(start, dir) {
  const seen = new Set();
  const stack = [...start[dir]];
  while (stack.length) {
    const n = stack.pop();
    const k = nodeKey(n.type, n.id);
    if (seen.has(k)) continue;
    seen.add(k);
    stack.push(...n[dir]);
  }
  return seen;
}

/**
 * The lineage of one record: everything it was built on (walking upstream)
 * plus everything built on it (walking downstream). Siblings are excluded.
 * Returns { focus, keys: Set, byStage: { type: [node...] }, edges: [...] }.
 */
export function lineage(graph, type, id) {
  const focus = graph.nodes.get(nodeKey(type, id));
  if (!focus) return null;
  const keys = new Set([nodeKey(type, id), ...walk(focus, 'up'), ...walk(focus, 'down')]);
  const byStage = Object.fromEntries(STAGES.map((s) => [s.type, []]));
  for (const k of keys) {
    const n = graph.nodes.get(k);
    byStage[n.type].push(n);
  }
  for (const list of Object.values(byStage)) list.sort((a, b) => a.id - b.id);
  // Only edges along the lineage (both ends inside, and in a consistent direction).
  const upKeys = walk(focus, 'up');
  const downKeys = walk(focus, 'down');
  const fk = nodeKey(type, id);
  const edges = graph.edges.filter((e) => {
    const inUp = (k) => upKeys.has(k) || k === fk;
    const inDown = (k) => downKeys.has(k) || k === fk;
    return (inUp(e.from) && inUp(e.to)) || (inDown(e.from) && inDown(e.to));
  });
  return { focus, keys, byStage, edges };
}

/** True when a record connects all the way from an observation to a decision. */
export function isCompleteChain(lin) {
  return !!lin && STAGES.every((s) => lin.byStage[s.type].length > 0);
}
