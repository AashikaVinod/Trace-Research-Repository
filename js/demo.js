// ===================================================================
// demo.js - demo mode. When config.js is empty, TRACE runs on a built-in
// sample study instead of Supabase, so every page has something to show.
//
// Nothing here is sent anywhere or stored in the browser: the sample data
// lives in memory and resets when the page is reloaded. Paste your Supabase
// URL and key into config.js and demo mode switches itself off.
//
// What is where, in order:
//   switch        DEMO (true when config.js is empty)
//   dates         demoDay, demoStamp (all dates are relative to today)
//   client        createDemoClient: answers the same calls db.js makes to
//                 Supabase (select, insert, update, delete, match, rpc,
//                 views), with the same unique and foreign key rules
//   views         demoView: the SQL views behind the Database query lab
//   pictures      DEMO_ART: drawn whiteboards, sketches, screens and notes
//   sample study  buildDemoData: the team, projects, sessions and evidence
// ===================================================================

const DEMO = !SUPABASE_URL && !SUPABASE_KEY;

// ----- Dates (so the sample study always looks current) ---------------

function demoDate(offsetDays, hour = 12, minute = 0) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
}
function demoDay(offsetDays) {
  const d = demoDate(offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function demoStamp(offsetDays, hour = 10, minute = 0) {
  return demoDate(offsetDays, hour, minute).toISOString();
}

// -------------------------------------------------------------------
// The stand-in client
// -------------------------------------------------------------------

// Columns that must be unique (case-insensitive), like the real indexes.
const DEMO_UNIQUE = {
  research_project: [['title', 'research_project_title_key']],
  researcher: [['email', 'researcher_email_key']],
  segment: [['name', 'segment_name_key']],
  research_method: [['name', 'research_method_name_key']],
  participant: [['participant_code', 'participant_code_key']],
};

// Junction tables: their composite primary key columns.
const DEMO_JUNCTIONS = {
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

// ON DELETE RESTRICT: [child table, column] per parent table.
const DEMO_RESTRICT = {
  research_project: [['research_session', 'project_id'], ['research_question', 'project_id'], ['finding', 'project_id'],
    ['insight', 'project_id'], ['recommendation', 'project_id'], ['design_decision', 'project_id']],
  research_session: [['observation', 'session_id']],
  researcher: [['research_session', 'researcher_id'], ['note', 'author_id'], ['annotation', 'author_id']],
  research_method: [['research_session', 'method_id']],
};

// ON DELETE CASCADE: [child table, column, parent table].
const DEMO_CASCADE = [
  ['project_researcher', 'project_id', 'research_project'], ['project_researcher', 'researcher_id', 'researcher'],
  ['project_method', 'project_id', 'research_project'], ['project_method', 'method_id', 'research_method'],
  ['participant_segment', 'participant_id', 'participant'], ['participant_segment', 'segment_id', 'segment'],
  ['session_participant', 'session_id', 'research_session'], ['session_participant', 'participant_id', 'participant'],
  ['session_question', 'session_id', 'research_session'], ['session_question', 'question_id', 'research_question'],
  ['observation_finding', 'observation_id', 'observation'], ['observation_finding', 'finding_id', 'finding'],
  ['finding_insight', 'finding_id', 'finding'], ['finding_insight', 'insight_id', 'insight'],
  ['insight_recommendation', 'insight_id', 'insight'], ['insight_recommendation', 'recommendation_id', 'recommendation'],
  ['recommendation_decision', 'recommendation_id', 'recommendation'], ['recommendation_decision', 'decision_id', 'design_decision'],
  ['source', 'session_id', 'research_session'], ['source', 'observation_id', 'observation'], ['source', 'finding_id', 'finding'],
  ['source', 'insight_id', 'insight'], ['source', 'recommendation_id', 'recommendation'], ['source', 'decision_id', 'design_decision'],
  ['note', 'session_id', 'research_session'], ['note', 'observation_id', 'observation'], ['note', 'finding_id', 'finding'],
  ['note', 'insight_id', 'insight'], ['note', 'recommendation_id', 'recommendation'], ['note', 'decision_id', 'design_decision'],
  ['annotation', 'source_id', 'source'],
];

function createDemoClient() {
  const store = buildDemoData();
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const ok = (rows) => ({ data: copy(rows), error: null });
  const fail = (code, message) => ({ data: null, error: { code, message } });

  function nextId(table) {
    return store[table].reduce((max, row) => Math.max(max, row.id || 0), 0) + 1;
  }

  // Returns an error result if `row` breaks a unique rule, otherwise null.
  function uniqueProblem(table, row, ignoreId = null) {
    for (const [column, constraint] of DEMO_UNIQUE[table] || []) {
      if (row[column] == null) continue;
      const clash = store[table].some((other) => other.id !== ignoreId
        && String(other[column]).toLowerCase() === String(row[column]).toLowerCase());
      if (clash) return fail('23505', `duplicate key value violates unique constraint "${constraint}"`);
    }
    const key = DEMO_JUNCTIONS[table];
    if (key && store[table].some((other) => key.every((c) => other[c] === row[c]))) {
      return fail('23505', `duplicate key value violates unique constraint "${table}_pkey"`);
    }
    return null;
  }

  function removeWithCascade(table, row) {
    store[table] = store[table].filter((r) => r !== row);
    for (const [child, column, parent] of DEMO_CASCADE) {
      if (parent !== table) continue;
      for (const dependent of store[child].filter((r) => r[column] === row.id)) removeWithCascade(child, dependent);
    }
  }

  class DemoQuery {
    constructor(table) {
      this.table = table;
      this.op = 'select';
      this.payload = null;
      this.filters = [];
    }
    select() { return this; }
    insert(rows) { this.op = 'insert'; this.payload = rows; return this; }
    update(changes) { this.op = 'update'; this.payload = changes; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(column, value) { this.filters.push([column, value]); return this; }
    match(values) { for (const column in values) this.filters.push([column, values[column]]); return this; }
    then(resolve, reject) {
      try { resolve(this.run()); } catch (error) { reject(error); }
    }

    run() {
      const { table } = this;
      if (table.startsWith('v_')) return ok(demoView(table));
      if (!store[table]) return fail('PGRST205', `Could not find the table 'public.${table}'`);
      const matching = () => store[table].filter((row) => this.filters.every(([c, v]) => row[c] === v));

      if (this.op === 'select') return ok(matching());

      if (this.op === 'insert') {
        const added = [];
        for (const input of Array.isArray(this.payload) ? this.payload : [this.payload]) {
          const row = { ...input };
          if (!DEMO_JUNCTIONS[table]) {
            row.id = nextId(table);
            row.created_at = new Date().toISOString();
            row.updated_at = row.created_at;
          }
          const problem = uniqueProblem(table, row);
          if (problem) return problem;
          store[table].push(row);
          added.push(row);
        }
        return ok(added);
      }

      if (this.op === 'update') {
        const rows = matching();
        for (const row of rows) {
          const problem = uniqueProblem(table, { ...row, ...this.payload }, row.id);
          if (problem) return problem;
        }
        for (const row of rows) Object.assign(row, this.payload, { updated_at: new Date().toISOString() });
        return ok(rows);
      }

      // delete
      const rows = matching();
      for (const row of rows) {
        for (const [child, column] of DEMO_RESTRICT[table] || []) {
          if (store[child].some((r) => r[column] === row.id)) {
            return fail('23503', `update or delete on table "${table}" violates foreign key constraint "${child}_${column}_fkey" on table "${child}"`);
          }
        }
      }
      for (const row of rows) removeWithCascade(table, row);
      return ok(rows);
    }
  }

  return {
    from: (table) => new DemoQuery(table),
    rpc: async (name, args) => {
      if (name !== 'trace_lineage') return fail('PGRST202', `Could not find the function public.${name}`);
      if (!byId(args.p_type, args.p_id)) return ok([]);
      return ok(lineage(args.p_type, args.p_id).rows);
    },
    storage: { from: () => ({ upload: async (name) => ({ data: { path: name }, error: null }), remove: async () => ({ data: [], error: null }) }) },
  };
}

// Reads a Blob as a data: address (demo photos stay in memory).
function demoReadBlob(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('The photo could not be read.'));
    reader.readAsDataURL(blob);
  });
}

// -------------------------------------------------------------------
// The SQL views, worked out from the loaded data (Database page)
// -------------------------------------------------------------------

function demoView(name) {
  const projectTitle = (id) => (byId('research_project', id) || {}).title || null;
  if (name === 'v_dashboard') {
    return [{
      projects: data.research_project.length,
      active_projects: activeProjects().length,
      sessions: data.research_session.length,
      participants: data.participant.length,
      observations: data.observation.length,
      findings: data.finding.length,
      insights: data.insight.length,
      recommendations: data.recommendation.length,
      decisions: data.design_decision.length,
    }];
  }
  if (name === 'v_project_summary') {
    return data.research_project.map((p) => {
      const counts = projectCounts(p.id);
      const lead = projectLead(p.id);
      return { id: p.id, title: p.title, status: p.status, lead: lead ? lead.full_name : null, sessions: counts.sessions,
        observations: counts.observation, findings: counts.finding, insights: counts.insight,
        recommendations: counts.recommendation, decisions: counts.design_decision, archived: !!p.archived_at };
    });
  }
  if (name === 'v_decision_strength') {
    return decisionStrength().map((d) => ({ id: d.id, title: d.title, status: d.status, observations: d.observations, sessions: d.sessions }));
  }
  if (name === 'v_evidence_gap') {
    const gaps = [];
    for (const stage of STAGES.slice(0, 4)) {
      for (const r of data[stage.type]) {
        if (downstream(stage.type, r.id).length === 0) gaps.push({ record_type: stage.type, id: r.id, title: r.title, project: projectTitle(r.project_id) });
      }
    }
    return gaps;
  }
  if (name === 'v_sessions_by_month') {
    const months = {};
    for (const s of data.research_session) months[s.session_date.slice(0, 7)] = (months[s.session_date.slice(0, 7)] || 0) + 1;
    return Object.keys(months).sort().map((month) => ({ month, sessions: months[month] }));
  }
  if (name === 'v_participants_by_segment') {
    return participantsBySegment().map((g) => ({ segment: g.name, participants: g.participants }));
  }
  if (name === 'v_source_owner') {
    return data.source.map((s) => {
      const owner = ownerOf(s);
      return { id: s.id, title: s.title, kind: s.kind, attached_to: owner ? owner.type : null, attached_id: owner ? owner.id : null };
    });
  }
  return [];
}

// -------------------------------------------------------------------
// Pictures for the sample sources. Each is a small drawing (SVG, 800x600)
// turned into a data: address, so the demo needs no uploaded files.
// They are marked as illustrations in the app.
// -------------------------------------------------------------------

const DEMO_ART = (() => {
  const HAND = "'Segoe Print','Bradley Hand','Marker Felt','Chalkboard SE','Comic Sans MS',cursive";
  const SANS = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const STICKY = { yellow: '#ffe68f', pink: '#ffc9dc', blue: '#c4e3ff', green: '#ccf0d4', orange: '#ffd3b0', violet: '#ddd6ff' };
  const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function svg(body, defs = '') {
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
      <defs><filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity=".18"/></filter>${defs}</defs>${body}</svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
  }
  function text(px, py, value, size = 18, opts = '') {
    return `<text x="${px}" y="${py}" font-size="${size}" ${opts}>${x(value)}</text>`;
  }
  function lines(px, py, list, size, gap, opts = '') {
    return list.map((line, i) => text(px, py + i * gap, line, size, opts)).join('');
  }
  function sticky(px, py, color, list, tilt = 0, w = 132, h = 96, dots = 0) {
    let dotMarks = '';
    for (let i = 0; i < dots; i++) dotMarks += `<circle cx="${px + w - 14 - i * 13}" cy="${py + h - 12}" r="5" fill="#e0483f"/>`;
    return `<g transform="rotate(${tilt} ${px + w / 2} ${py + h / 2})" filter="url(#sh)">
      <rect x="${px}" y="${py}" width="${w}" height="${h}" fill="${STICKY[color]}"/>
      <rect x="${px}" y="${py}" width="${w}" height="12" fill="#000" opacity=".04"/>
      <g font-family="${HAND}" fill="#2a2a33">${lines(px + 10, py + 32, list, 15, 20)}</g>${dotMarks}</g>`;
  }

  // A whiteboard with columns of sticky notes. columns: [{ head, color, notes: [[line, ...], ...], dots: [n, ...] }]
  function whiteboard(title, columns, subtitle = '') {
    const colWidth = 720 / columns.length;
    let body = `<rect width="800" height="600" fill="#d9dad5"/>
      <rect x="18" y="16" width="764" height="548" rx="10" fill="#b9bcbf"/>
      <rect x="28" y="26" width="744" height="528" rx="6" fill="#fbfbf8"/>
      <rect x="28" y="26" width="744" height="528" rx="6" fill="url(#glare)"/>
      <rect x="120" y="560" width="560" height="14" rx="4" fill="#a7abaf"/>
      <rect x="180" y="552" width="70" height="10" rx="5" fill="#1f3b8a"/><rect x="262" y="553" width="60" height="9" rx="4.5" fill="#c8312b"/>
      <g font-family="${HAND}">${text(52, 74, title, 30, 'fill="#1f3b8a" font-weight="700"')}
      ${subtitle ? text(54, 102, subtitle, 16, 'fill="#5a6070"') : ''}</g>`;
    columns.forEach((col, c) => {
      const left = 44 + c * colWidth;
      body += `<g font-family="${HAND}">${text(left + 6, 140, col.head, 19, 'fill="#c8312b" font-weight="700"')}</g>
        <path d="M${left + 6} 148 q ${colWidth / 3} 4 ${colWidth - 30} 0" stroke="#c8312b" stroke-width="2" fill="none" stroke-linecap="round"/>`;
      col.notes.forEach((note, n) => {
        const tilt = ((c * 3 + n * 5) % 7) - 3;
        body += sticky(left + 6 + (n % 2) * 6, 166 + n * 118, col.color, note, tilt, Math.min(150, colWidth - 26), 100, (col.dots || [])[n] || 0);
      });
    });
    return svg(body, `<linearGradient id="glare" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#e9ebe6" stop-opacity=".6"/></linearGradient>`);
  }

  // Pencil sketch paper with a faint dot grid.
  function paper(body) {
    return svg(`<rect width="800" height="600" fill="#fdfbf4"/><rect width="800" height="600" fill="url(#dots)"/><g fill="none" stroke="#3d3f47" stroke-linecap="round" stroke-linejoin="round">${body}</g>`,
      '<pattern id="dots" width="30" height="30" patternUnits="userSpaceOnUse"><circle cx="15" cy="15" r="1" fill="#d8d4c6"/></pattern>');
  }
  function phoneOutline(px, py, w = 210, h = 400) {
    return `<rect x="${px}" y="${py}" width="${w}" height="${h}" rx="26" stroke-width="3"/><rect x="${px + 2}" y="${py + 1}" width="${w - 3}" height="${h - 2}" rx="25" stroke-width="1" opacity=".4"/>
      <path d="M${px + w / 2 - 22} ${py + 14} h44" stroke-width="4"/>`;
  }
  const scribble = (px, py, value, size = 17, color = '#3d3f47') => `<text x="${px}" y="${py}" font-size="${size}" font-family="${HAND}" fill="${color}" stroke="none">${x(value)}</text>`;

  // A phone screen drawn in a clean UI style.
  function screen(inner, appTitle, accent = '#0f6b55') {
    return svg(`<rect width="800" height="600" fill="#eceae4"/>
      <circle cx="120" cy="90" r="160" fill="#e2dfd6"/><circle cx="700" cy="540" r="190" fill="#e4e1d8"/>
      <g filter="url(#sh)"><rect x="255" y="20" width="290" height="600" rx="40" fill="#15161c"/></g>
      <rect x="266" y="31" width="268" height="590" rx="31" fill="#ffffff"/>
      <rect x="360" y="40" width="80" height="20" rx="10" fill="#15161c"/>
      <g font-family="${SANS}">${text(286, 56, '9:41', 13, 'fill="#15161c" font-weight="600"')}
      <rect x="266" y="72" width="268" height="54" fill="${accent}"/>
      ${text(286, 106, appTitle, 17, 'fill="#fff" font-weight="700"')}${inner}</g>`);
  }

  // Lined notebook paper with handwriting.
  function notebook(heading, list, ink = '#22336b') {
    let rules = '';
    for (let ly = 120; ly < 580; ly += 36) rules += `<line x1="60" y1="${ly}" x2="760" y2="${ly}" stroke="#bcd3ee" stroke-width="1.5"/>`;
    let holes = '';
    for (let hy = 90; hy < 560; hy += 92) holes += `<circle cx="34" cy="${hy}" r="9" fill="#d9d6cc"/>`;
    return svg(`<rect width="800" height="600" fill="#cfcabb"/>
      <g filter="url(#sh)"><rect x="14" y="10" width="772" height="580" rx="4" fill="#fffdf6"/></g>${rules}
      <line x1="104" y1="20" x2="104" y2="586" stroke="#e7a3a3" stroke-width="2"/>${holes}
      <g font-family="${HAND}" fill="${ink}">${text(118, 82, heading, 26, 'font-weight="700"')}
      ${list.map((line, i) => text(118 + (line.indent || 0), 112 + i * 36, line.t || line, 20, line.red ? 'fill="#b4362a"' : '')).join('')}</g>`);
  }

  return {
    affinityMap: () => whiteboard('Round 1: what got in the way', [
      { head: 'Finding a slot', color: 'yellow', notes: [['Scrolled past', 'free slots (P-01)'], ['Full + free look', 'the same!!'], ['Tapped month,', 'wanted calendar']] },
      { head: 'The timer', color: 'pink', notes: [['Never saw the', 'countdown'], ['Lost slot AND', 'basket (P-03)'], ['"Thought the slot', 'was mine"']], dots: [0, 3, 1] },
      { head: 'Price', color: 'orange', notes: [['£4.50 = the', 'whole order??'], ['Hesitated', 'before tapping']] },
      { head: 'Good bits', color: 'green', notes: [['Green tick', 'reassuring'], ['Fast when usual', 'slot is free']] },
    ], 'Checkout usability test, Android + iOS'),

    howMightWe: () => whiteboard('Slot step: how might we...', [
      { head: 'Certainty', color: 'blue', notes: [['HMW make a', 'slot feel', 'definitely mine?'], ['HMW warn before', 'it runs out?']], dots: [4, 2] },
      { head: 'Order of steps', color: 'violet', notes: [['HMW let people', 'book first, shop', 'second?'], ['HMW keep the', 'basket safe?']], dots: [5, 1] },
      { head: 'Regulars', color: 'green', notes: [['HMW hold the', 'usual slot?'], ['Same time every', 'week = 1 tap']], dots: [2, 0] },
    ], 'Workshop with design + engineering, dots = votes'),

    journeyMap: () => {
      const stages = ['Download', 'Sign up', 'First basket', 'First delivery', 'Second order'];
      let body = `<rect width="800" height="600" fill="#d9dad5"/><rect x="18" y="16" width="764" height="548" rx="10" fill="#b9bcbf"/>
        <rect x="28" y="26" width="744" height="528" rx="6" fill="#fbfbf8"/><rect x="120" y="560" width="560" height="14" rx="4" fill="#a7abaf"/>
        <g font-family="${HAND}">${text(52, 72, 'New customer journey (first 2 weeks)', 28, 'fill="#1f3b8a" font-weight="700"')}</g>
        <line x1="60" y1="250" x2="740" y2="250" stroke="#9aa0a8" stroke-width="2" stroke-dasharray="6 6"/>
        <g font-family="${HAND}" fill="#5a6070">${text(46, 168, ':)', 22)}${text(46, 338, ':(', 22)}</g>
        <path d="M90 200 C 150 180, 170 330, 230 320 S 320 220, 370 240 S 470 170, 520 210 S 580 350, 620 330 S 700 190, 730 175" stroke="#1f3b8a" stroke-width="4" fill="none" stroke-linecap="round"/>`;
      stages.forEach((stage, i) => {
        const left = 70 + i * 140;
        body += `<g font-family="${HAND}">${text(left, 120, stage, 19, 'fill="#c8312b" font-weight="700"')}</g>`;
      });
      body += sticky(70, 380, 'yellow', ['Saw £15 off', 'leaflet'], -2, 120, 80)
        + sticky(210, 380, 'pink', ['Address finder', 'missed new flat'], 2, 120, 80)
        + sticky(210, 466, 'pink', ['Password rules', 'after error'], -1, 120, 70)
        + sticky(350, 380, 'blue', ['25 min to build', 'first basket'], 1, 120, 80)
        + sticky(490, 380, 'orange', ['Oat milk for', 'semi-skimmed :('], -3, 120, 80)
        + sticky(630, 380, 'green', ['Reorder last', 'basket = 5 min'], 2, 120, 80);
      return svg(body);
    },

    weekGridSketch: () => {
      let cells = '';
      const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
      for (let c = 0; c < 7; c++) {
        cells += scribble(312 + c * 25, 172, days[c], 15);
        for (let r = 0; r < 6; r++) {
          const cx = 304 + c * 25;
          const cy = 182 + r * 34;
          const full = (c + r * 2) % 5 === 0 || (c === 5 && r < 3);
          cells += `<rect x="${cx}" y="${cy}" width="21" height="28" rx="3" stroke-width="1.6"/>`;
          if (full) cells += `<path d="M${cx + 3} ${cy + 24} l15 -20 M${cx + 3} ${cy + 13} l8 -10 M${cx + 10} ${cy + 26} l9 -12" stroke-width="1" opacity=".6"/>`;
        }
      }
      return paper(`${phoneOutline(290, 90)}
        ${scribble(306, 140, 'Delivery slots', 18)}<path d="M306 146 h110" stroke-width="1.4"/>
        ${cells}
        <rect x="306" y="400" width="178" height="40" rx="10" stroke-width="2.2"/>${scribble(334, 426, 'Reserve Thu 6-7pm', 15)}
        ${scribble(304, 466, 'Delivery £4.50, held 2 hrs', 13, '#6b6e78')}
        <path d="M520 205 C 560 200, 580 170, 600 150" stroke-width="1.6"/><path d="M512 210 l14 -2 l-6 -12" stroke-width="1.6"/>
        ${scribble(560, 136, 'hatched = FULL', 18, '#b4362a')}${scribble(560, 158, '+ the word "Full"', 16, '#b4362a')}
        ${scribble(560, 180, 'not colour only!', 16, '#b4362a')}
        <path d="M486 420 C 540 430, 560 470, 590 480" stroke-width="1.6"/>${scribble(596, 486, 'one tap to hold it,', 16)}${scribble(596, 508, 'then shop', 16)}
        <path d="M290 300 C 230 300, 200 260, 180 240" stroke-width="1.6"/>${scribble(70, 220, 'whole week', 18)}${scribble(70, 242, 'at a glance', 18)}
        ${scribble(60, 560, 'Week grid v1, PR', 16, '#8a8d96')}`);
    },

    doorstepSketch: () => {
      const phone = (px, title, rows, button) => `${phoneOutline(px, 120, 180, 330)}${scribble(px + 18, 172, title, 16)}
        <path d="M${px + 18} 180 h120" stroke-width="1.2"/>
        ${rows.map((row, i) => `<rect x="${px + 16}" y="${196 + i * 52}" width="148" height="42" rx="6" stroke-width="1.6"/>${scribble(px + 26, 222 + i * 52, row, 13)}`).join('')}
        <rect x="${px + 16}" y="392" width="148" height="34" rx="17" stroke-width="2.2"/>${scribble(px + 40, 414, button, 14)}`;
      return paper(`${scribble(50, 70, 'Approve swaps before the van arrives', 26, '#1f3b8a')}
        ${phone(60, 'Van leaving soon', ['2 swaps to check', 'Driver: Dev, 7:40'], 'Check swaps')}
        <path d="M252 290 h46" stroke-width="2.4"/><path d="M288 280 l12 10 l-12 10" stroke-width="2.4"/>
        ${phone(310, 'Swaps (2)', ['GF loaf > none?', 'Oat > semi milk', 'Pasta 1kg, ok'], 'Done')}
        <path d="M502 290 h46" stroke-width="2.4"/><path d="M538 280 l12 10 l-12 10" stroke-width="2.4"/>
        ${phone(560, 'All set', ['1 approved', '1 refused, refund'], 'Track van')}
        ${scribble(330, 500, 'never swap GF! auto-refuse', 16, '#b4362a')}<path d="M392 482 C 380 400, 360 260, 360 240" stroke-width="1.4" stroke="#b4362a"/>
        ${scribble(60, 560, 'cut-off: 30 min before delivery window', 16, '#6b6e78')}`);
    },

    slotListScreen: () => {
      let days = '';
      ['Thu 21', 'Fri 22', 'Sat 23', 'Sun 24'].forEach((day, i) => {
        const on = i === 0;
        days += `<rect x="${280 + i * 62}" y="140" width="56" height="44" rx="10" fill="${on ? '#0f6b55' : '#f1f1ee'}"/>
          ${text(290 + i * 62, 167, day, 13, `fill="${on ? '#fff' : '#3a3d45'}" font-weight="600"`)}`;
      });
      const slots = [['7:00 - 9:00', '£5.50', false], ['9:00 - 11:00', '£4.50', true], ['11:00 - 13:00', '£4.50', true], ['13:00 - 15:00', '£3.00', false],
        ['15:00 - 17:00', '£3.00', true], ['17:00 - 19:00', '£4.50', true], ['19:00 - 21:00', '£5.50', false], ['21:00 - 22:00', '£5.50', true]];
      let rows = '';
      slots.forEach(([time, price, full], i) => {
        const y = 200 + i * 50;
        rows += `<rect x="280" y="${y}" width="240" height="42" rx="10" fill="${full ? '#f4f4f2' : '#ffffff'}" stroke="${full ? '#ececea' : '#d9dcd6'}"/>
          ${text(294, y + 26, time, 14, `fill="${full ? '#b3b5ba' : '#15161c'}" font-weight="600"`)}
          ${text(462, y + 26, price, 14, `fill="${full ? '#c3c5ca' : '#0f6b55'}" font-weight="700"`)}`;
      });
      return screen(`${days}${rows}`, 'Choose a delivery slot');
    },

    starterBasketScreen: () => {
      const items = [['Semi-skimmed milk, 2 pints', '£1.45', '#dbe9f6'], ['Free range eggs, 6', '£2.10', '#fbe8c8'], ['Wholemeal loaf', '£1.25', '#efdcc4'],
        ['Bananas, loose x5', '£0.85', '#fff1b0'], ['Mature cheddar 400g', '£3.60', '#ffe7a6'], ['Fusilli 500g', '£0.75', '#f6e0c0'], ['Chopped tomatoes 4 pack', '£1.80', '#f9c9c0']];
      let rows = text(282, 152, 'Based on a household of 3', 12, 'fill="#6b6e78"');
      items.forEach(([name, price, tint], i) => {
        const y = 168 + i * 50;
        rows += `<rect x="280" y="${y}" width="240" height="44" rx="10" fill="#fff" stroke="#e3e5e0"/>
          <rect x="288" y="${y + 6}" width="32" height="32" rx="8" fill="${tint}"/>
          ${text(328, y + 20, name, 11.5, 'fill="#15161c" font-weight="600"')}${text(328, y + 36, price, 11, 'fill="#6b6e78"')}
          <circle cx="502" cy="${y + 22}" r="10" fill="#f2f2ef"/>${text(497, y + 27, '×', 15, 'fill="#8a8d96"')}`;
      });
      rows += `<rect x="280" y="530" width="240" height="44" rx="22" fill="#0f6b55"/>${text(330, 557, 'Add 7 items, £11.80', 14, 'fill="#fff" font-weight="700"')}`;
      return screen(rows, 'Your starter basket');
    },

    pointsScreen: () => screen(`
      <rect x="280" y="142" width="240" height="150" rx="16" fill="#1f2a44"/>
      <circle cx="490" cy="170" r="60" fill="#2c3a5c"/>
      ${text(298, 176, 'Gold member', 13, 'fill="#e8c766" font-weight="700"')}
      ${text(298, 230, '1,240', 44, 'fill="#fff" font-weight="800"')}${text(298, 258, 'points', 14, 'fill="#c3c9d8"')}
      ${text(298, 280, 'Next tier at 2,000', 11, 'fill="#93a0bd"')}
      ${text(282, 324, 'Your rewards', 15, 'fill="#15161c" font-weight="700"')}
      ${[['Double points on fruit', '#e2f4ec'], ['Free coffee at the café', '#fdede2'], ['Partner offers', '#efedfd'], ['Tier benefits', '#e6f0fb']].map(([label, tint], i) =>
        `<rect x="280" y="${338 + i * 52}" width="240" height="44" rx="10" fill="${tint}"/>${text(294, 365 + i * 52, label, 13, 'fill="#2a2d35" font-weight="600"')}`).join('')}
      <rect x="280" y="560" width="240" height="44" rx="22" fill="#1f2a44"/>${text(352, 587, 'Redeem points', 14, 'fill="#fff" font-weight="700"')}`,
      'Rewards', '#1f2a44'),

    diaryPage: () => notebook('Week 2, Wednesday', [
      'Checked slots on the bus again (8:10am).',
      'Nothing after 6pm until Saturday. Again.',
      { t: 'Quicker to just go myself at this point.', red: true },
      'Drove to the big supermarket after work,',
      'about 40 mins door to door. Annoyed.',
      'Would pay extra for a Weds evening slot',
      { t: 'if it meant I could stop thinking about it.', indent: 20 },
      'Mood: 2/5',
    ]),

    fieldNotes: () => notebook('Croydon store, picker shadowing', [
      'Route: chilled first, then ambient, frozen last',
      'Handheld shows item + aisle, nothing on swaps',
      { t: 'Missing 500g fusilli, picked 1kg "better value"', red: true },
      'Asked: how do you know what to swap?',
      { t: '"You just get a feel for it after a while"', indent: 20 },
      '~40 orders this shift, 3 had customer notes',
      'Dietary items mixed in with the rest',
      { t: 'Idea: swap guide card on the trolley?', red: true },
    ], '#2b2b2b'),

    fridgeList: () => svg(`
      <defs><linearGradient id="fridge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3f4f2"/><stop offset=".6" stop-color="#dfe2df"/><stop offset="1" stop-color="#c9cdca"/></linearGradient>
      <linearGradient id="light" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
      <rect width="800" height="600" fill="url(#fridge)"/>
      <rect x="0" y="0" width="800" height="600" fill="url(#light)" transform="rotate(-18 400 300)"/>
      <rect x="742" y="120" width="20" height="300" rx="10" fill="#b6bab7"/><rect x="746" y="126" width="6" height="288" rx="3" fill="#e8eae8"/>
      <g filter="url(#sh)" transform="rotate(-3 300 300)"><rect x="170" y="90" width="280" height="420" fill="#fffef8"/>
        <g font-family="${HAND}" fill="#26314f">${text(196, 140, 'Shopping', 30, 'font-weight="700"')}
        ${['semi skimmed x2', 'eggs', 'bread (brown)', 'pasta + sauce', 'bananas', 'yoghurts for lunches', 'washing up liquid'].map((item, i) => text(200, 190 + i * 40, '- ' + item, 20)).join('')}
        ${text(200, 480, 'Mon: chicken?', 20, 'fill="#b4362a"')}</g></g>
      <circle cx="300" cy="96" r="16" fill="#ef7d3c" filter="url(#sh)"/><circle cx="295" cy="91" r="5" fill="#fff" opacity=".5"/>
      <g filter="url(#sh)" transform="rotate(4 600 250)"><rect x="500" y="150" width="190" height="150" fill="#ffffff"/>
        <rect x="512" y="162" width="166" height="96" fill="#cfe7f7"/><circle cx="560" cy="200" r="20" fill="#ffd36b"/>
        <path d="M512 258 l50 -40 l40 30 l30 -20 l46 30 z" fill="#6cc08b"/>
        <g font-family="${HAND}" fill="#444">${text(530, 285, 'by Amira, age 6', 14)}</g></g>
      <rect x="586" y="138" width="22" height="22" rx="4" fill="#7c6cf0" filter="url(#sh)"/>
      <g filter="url(#sh)"><rect x="520" y="360" width="150" height="110" rx="4" fill="#fdede2"/>
        <g font-family="${HAND}" fill="#9c4612">${text(534, 395, 'Bin day: Tues', 17)}${text(534, 425, 'Swim: Thurs 5pm', 17)}${text(534, 455, 'Dentist 14th', 17)}</g></g>
      <circle cx="595" cy="364" r="12" fill="#2f7fd8" filter="url(#sh)"/>`),

    swapGuide: () => {
      const rows = [['Gluten-free bread', 'Regular bread', 'Another GF loaf'], ['Lactose-free milk', 'Regular milk', 'Other lactose-free'],
        ['Vegan cheese', 'Dairy cheese', 'Another vegan cheese'], ['Nut-free snacks', 'Anything "may contain"', 'Leave out, refund'], ['Halal chicken', 'Non-halal meat', 'Leave out, refund']];
      let table = `<rect x="110" y="250" width="580" height="38" fill="#15161c"/>
        ${text(124, 275, 'If this is missing', 14, 'fill="#fff" font-weight="700"')}${text(320, 275, 'Never swap with', 14, 'fill="#fff" font-weight="700"')}${text(510, 275, 'OK instead', 14, 'fill="#fff" font-weight="700"')}`;
      rows.forEach((row, i) => {
        const y = 288 + i * 40;
        table += `<rect x="110" y="${y}" width="580" height="40" fill="${i % 2 ? '#f6f5f1' : '#ffffff'}" stroke="#e7e5df"/>
          ${text(124, y + 26, row[0], 13.5, 'fill="#15161c" font-weight="600"')}${text(320, y + 26, row[1], 13.5, 'fill="#b4362a"')}${text(510, y + 26, row[2], 13.5, 'fill="#0f7353"')}`;
      });
      return svg(`<rect width="800" height="600" fill="#e4e1d8"/>
        <g filter="url(#sh)"><rect x="80" y="30" width="640" height="600" fill="#ffffff"/></g>
        <g font-family="${SANS}">
        ${text(110, 86, 'Dietary swaps: picker guide', 26, 'fill="#15161c" font-weight="800"')}
        ${text(110, 112, 'Draft v2, for the Croydon pilot', 14, 'fill="#6b6e78"')}
        <rect x="110" y="134" width="580" height="2" fill="#15161c"/>
        ${lines(110, 166, ['If the customer marked an item "never substitute", leave it out and refund.', 'Dietary items are never swapped for a version without the same label.', 'When unsure, leave it out. A refund is better than a wrong swap.'], 14, 24, 'fill="#3a3d45"')}
        ${table}</g>
        <g transform="rotate(-12 600 120)"><rect x="530" y="88" width="150" height="54" rx="6" fill="none" stroke="#c8312b" stroke-width="4"/>
        <text x="552" y="126" font-size="28" font-family="${SANS}" font-weight="800" fill="#c8312b" letter-spacing="4">DRAFT</text></g>`);
    },
  };
})();

// -------------------------------------------------------------------
// The sample study: a product research team at "Larder", a made-up
// grocery delivery app. Five projects, from an archived loyalty study to
// an accessibility review that hasn't started yet. Participants are
// codes only, as in real use. Every name and quote here is invented.
// -------------------------------------------------------------------

function buildDemoData() {
  const db = {};
  for (const table of TABLES) db[table] = [];
  const id = {}; // short key -> id, e.g. id.maya

  function add(table, key, row, createdOffset = -200, hour = 10) {
    row.id = db[table].length + 1;
    row.created_at = row.created_at || demoStamp(createdOffset, hour, (row.id * 7) % 60);
    row.updated_at = row.created_at;
    db[table].push(row);
    if (key) id[key] = row.id;
    return row.id;
  }
  const link = (table, row) => db[table].push(row);

  // ----- Team, methods, segments -----
  [
    ['maya', 'Maya Okafor', 'Lead UX Researcher'],
    ['tom', 'Tom Brennan', 'Senior UX Researcher'],
    ['joaquin', 'Joaquín Herrera', 'UX Researcher'],
    ['priya', 'Priya Raman', 'Product Designer'],
    ['sam', 'Sam Adeyemi', 'Content Designer'],
    ['hannah', 'Hannah Lindqvist', 'Research Operations'],
  ].forEach(([key, name, role]) => add('researcher', key, {
    full_name: name, email: `${name.split(' ')[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}@larder.example`, role_title: role,
  }, -260));

  [
    ['interview', 'Semi-structured interview', 'One-to-one conversation around a topic guide, usually 45 to 60 minutes.'],
    ['usability', 'Moderated usability test', 'Participants try real tasks on a prototype or the live app while thinking aloud.'],
    ['diary', 'Diary study', 'Participants log short entries over one or two weeks, in their own time.'],
    ['contextual', 'Contextual inquiry', 'Watching people in their own home or workplace while they do the task for real.'],
    ['unmoderated', 'Unmoderated remote test', 'Recorded task-based tests that participants complete on their own.'],
    ['cardsort', 'Card sort', 'Participants group and name items to show how they think about a topic.'],
  ].forEach(([key, name, description]) => add('research_method', key, { name, description }, -255));

  [
    ['family', 'Weekly family shoppers', 'One big shop a week for a household with children.'],
    ['busy', 'Busy professionals', 'Shop in short bursts around work, often on their phone.'],
    ['older', 'Older shoppers', 'Aged 60 and over.'],
    ['students', 'Students and house-shares', 'Shared orders, tight budgets, often near the minimum spend.'],
    ['newbie', 'First-time app users', 'Placed their first online grocery order in the last month.'],
    ['assistive', 'Assistive tech users', 'Use a screen reader, magnification or other access settings.'],
    ['proxy', 'Carers and proxy shoppers', 'Order for someone else, such as a parent.'],
    ['staff', 'Store and delivery staff', 'Pickers and drivers who fulfil orders.'],
  ].forEach(([key, name, description]) => add('segment', key, { name, description }, -255));

  // ----- Participants (codes only) -----
  [
    ['35-44', ['family'], 'Android, small screen. Shops for a family of five, usually on a Thursday evening.'],
    ['25-34', ['newbie', 'busy'], 'Moved to the area in spring. Used to shop in person on the way home from work.'],
    ['35-44', ['family'], 'Shops on Sunday nights once the kids are asleep. Very attached to Saturday morning slots.'],
    ['25-34', ['newbie', 'busy'], 'Lives in a new-build flat. iPhone, uses Apple Pay for everything.'],
    ['45-54', ['family'], 'Has used the app for three years. Took part in three rounds of testing.'],
    ['18-24', ['students'], 'Shares a house with four others. They split one big order a week.'],
    ['55-64', ['family'], 'Long-time loyalty member. Prefers the website on a laptop but agreed to test on mobile.'],
    ['35-44', ['family'], 'Shops around a family member\'s dietary needs. Checks every bag at the door.'],
    ['25-34', ['busy'], 'Works night shifts. Wants deliveries outside normal hours.'],
    ['18-24', ['students', 'newbie'], 'In student halls. Shops with friends to reach the minimum order.'],
    ['45-54', ['busy'], 'Books the same Friday slot every week. Quick and a bit impatient in tests.'],
    ['35-44', ['busy'], 'Often gives up on online shopping when evening slots are full. Drives to work.'],
    ['25-34', ['newbie'], 'Placed her first online grocery order during the study. Cooks most evenings.'],
    ['55-64', ['family'], 'Does a big monthly shop plus small top-ups in between.'],
    ['25-34', ['busy'], 'Remote participant in Leeds. Unmoderated tests only.'],
    ['45-54', ['family'], 'Works from home two days a week, so is usually in for deliveries.'],
    ['35-44', ['assistive'], 'Has red-green colour blindness. Uses larger text settings.'],
    ['18-24', ['students'], 'Small phone with a cracked screen. Very fast at scanning lists.'],
    ['25-34', ['busy'], 'Shops on lunch breaks, a few minutes at a time.'],
    ['55-64', ['proxy'], 'Orders for her mother, who lives across town.'],
    ['65+', ['older', 'newbie'], 'Started using the app after her local shop closed. Prefers large text.'],
    ['65+', ['older', 'assistive'], 'Uses VoiceOver for most apps. Happy to help with the accessibility review.'],
    ['25-34', ['staff'], 'Picker at the Croydon store, two years in the role.'],
    ['65+', ['older'], 'Member of the loyalty scheme since it launched.'],
  ].forEach(([age, segments, notes], i) => {
    const code = `P-${String(i + 1).padStart(2, '0')}`;
    const pid = add('participant', code, { participant_code: code, age_band: age, notes }, -240 + i * 3);
    for (const g of segments) link('participant_segment', { participant_id: pid, segment_id: id[g] });
  });

  // ----- Projects -----
  const projects = [
    ['slot', 'Delivery slot booking', 'active', -150, null, null,
      'Understand why shoppers abandon checkout at the delivery slot step, and what would make booking a slot feel quick and certain.',
      'Checkout analytics show the biggest drop-off happens on the slot screen. This study follows the slot step from first interviews to the redesigned week grid.',
      'maya', ['tom', 'joaquin', 'priya'], ['interview', 'usability', 'diary', 'unmoderated']],
    ['onb', 'First-week onboarding', 'active', -95, null, null,
      'Learn what new customers need in their first week so that more of them come back for a second order.',
      'Only about a third of new customers place a second order within a month. We want to know what happens in between.',
      'tom', ['priya', 'joaquin', 'sam', 'hannah'], ['interview', 'contextual', 'usability', 'unmoderated', 'diary', 'cardsort']],
    ['sub', 'Substitutions and missing items', 'completed', -178, -58, null,
      'Find out how customers feel about substitutions they did not choose, and what pickers need to make better ones.',
      'Ran with the Croydon store team. Led to per-item "never substitute" and in-app approval of swaps.',
      'joaquin', ['maya', 'tom'], ['contextual', 'interview', 'diary', 'usability']],
    ['loy', 'Loyalty card rethink', 'completed', -205, -125, -110,
      'Understand what members value about the loyalty scheme and why so few redeem their points.',
      'Archived after the points-in-pounds change shipped. The tier question is parked with the commercial team.',
      'maya', ['priya', 'sam'], ['interview', 'cardsort', 'usability']],
    ['a11y', 'Accessibility review of the iOS app', 'planned', 10, null, null,
      'Check that people using VoiceOver, larger text and colour adjustments can complete a full shop on their own.',
      'Pairs an expert audit against WCAG 2.2 AA with sessions alongside assistive tech users.',
      'priya', ['sam', 'hannah'], ['usability', 'interview']],
  ];
  for (const [key, title, status, start, end, archived, objective, description, lead, team, methods] of projects) {
    const pid = add('research_project', key, {
      title, status, research_objective: objective, description,
      start_date: demoDay(start), end_date: end === null ? null : demoDay(end),
      archived_at: archived === null ? null : demoStamp(archived, 16),
    }, Math.min(start, 0) - 6);
    link('project_researcher', { project_id: pid, researcher_id: id[lead], project_role: 'lead' });
    for (const r of team) link('project_researcher', { project_id: pid, researcher_id: id[r], project_role: 'researcher' });
    for (const m of methods) link('project_method', { project_id: pid, method_id: id[m] });
  }

  // ----- Research questions -----
  [
    ['slot', 'q_slot_why', 'Why do shoppers leave checkout at the delivery slot step?'],
    ['slot', 'q_slot_pick', 'How do people decide which slot to pick when several are free?'],
    ['slot', 'q_slot_sure', 'What would make a reserved slot feel certain rather than provisional?'],
    ['slot', 'q_slot_price', 'How does the delivery charge shown on each slot affect the choice?'],
    ['onb', 'q_onb_expect', 'What do new customers expect to happen in their first order?'],
    ['onb', 'q_onb_drop', 'Where do people drop off between signing up and their first checkout?'],
    ['onb', 'q_onb_back', 'What brings someone back for a second order within two weeks?'],
    ['sub', 'q_sub_feel', 'How do customers feel about substitutions they didn\'t choose?'],
    ['sub', 'q_sub_pickers', 'What do pickers need to know to choose a good substitute?'],
    ['sub', 'q_sub_ask', 'When do customers want to be asked rather than told?'],
    ['loy', 'q_loy_value', 'What do members actually value about the scheme?'],
    ['loy', 'q_loy_redeem', 'Why do so few members redeem their points?'],
    ['a11y', 'q_a11y_sr', 'Can screen reader users complete a full shop without sighted help?'],
    ['a11y', 'q_a11y_wcag', 'Which parts of checkout fail WCAG 2.2 AA?'],
    ['a11y', 'q_a11y_grid', 'How do people with low vision use the new week grid?'],
  ].forEach(([project, key, text], i) => add('research_question', key, { project_id: id[project], question_text: text }, -200 + i));

  // ----- Sessions -----
  // key, project, title, day offset, method, facilitator, status, minutes, participants, questions, notes
  const sessions = [
    ['s_kitchen', 'slot', 'Kitchen-table interview, weekly shop', -142, 'interview', 'maya', 'completed', 55, ['P-03'], ['q_slot_why', 'q_slot_pick'], 'At P-03\'s home. She showed us how she plans the shop on her phone after the kids are in bed.'],
    ['s_round1a', 'slot', 'Checkout usability test, round 1 (Android)', -128, 'usability', 'tom', 'completed', 60, ['P-01', 'P-07'], ['q_slot_why', 'q_slot_price'], 'Live app, Android build 5.12. P-07 arrived ten minutes late so we cut the last task.'],
    ['s_round1b', 'slot', 'Checkout usability test, round 1 (iOS)', -121, 'usability', 'maya', 'completed', 60, ['P-05', 'P-11'], ['q_slot_why', 'q_slot_sure'], 'Live app on iOS. Same script as the Android round.'],
    ['s_diary', 'slot', 'Two-week diary: planning the weekly shop', -104, 'diary', 'joaquin', 'completed', 20, ['P-03', 'P-08', 'P-12', 'P-14'], ['q_slot_pick', 'q_slot_why'], 'Diary ran for 14 days. The 20 minutes is the kick-off call; entries came in over the fortnight.'],
    ['s_shift', 'slot', 'Interview: shift workers and late slots', -86, 'interview', 'joaquin', 'completed', 40, ['P-09'], ['q_slot_pick', 'q_slot_price'], 'Remote, on video. Scheduled around his night shift.'],
    ['s_unmod', 'slot', 'Unmoderated test of the week grid prototype', -63, 'unmoderated', 'priya', 'completed', 15, ['P-15', 'P-16', 'P-17'], ['q_slot_pick'], 'Figma prototype, three tasks. Recordings in the shared drive.'],
    ['s_round2', 'slot', 'Usability test, round 2: week grid', -41, 'usability', 'maya', 'completed', 50, ['P-01', 'P-18'], ['q_slot_pick', 'q_slot_price'], 'First test of the week grid with "Delivery £x" labels.'],
    ['s_round3', 'slot', 'Usability test, round 3: reserve, then shop', -19, 'usability', 'tom', 'completed', 55, ['P-05', 'P-19'], ['q_slot_sure', 'q_slot_why'], 'Coded prototype on the staging build.'],
    ['s_round4', 'slot', 'Round 4: delivery charge labels', 3, 'usability', 'maya', 'planned', 45, ['P-07', 'P-20'], ['q_slot_price'], 'Testing three charge label options. Hannah has booked the lab.'],
    ['s_followup', 'slot', 'Follow-up interviews with diary participants', 9, 'interview', 'joaquin', 'planned', 30, ['P-08', 'P-12'], ['q_slot_sure'], 'Short calls to show them the new flow.'],
    ['o_why', 'onb', 'Interview: why people signed up', -88, 'interview', 'tom', 'completed', 45, ['P-02'], ['q_onb_expect'], ''],
    ['o_home', 'onb', 'In-home visit: a first order from scratch', -80, 'contextual', 'priya', 'completed', 70, ['P-13'], ['q_onb_expect', 'q_onb_drop'], 'She was cooking dinner the whole time, which was actually perfect.'],
    ['o_signup', 'onb', 'Sign-up usability test', -66, 'usability', 'tom', 'completed', 45, ['P-04', 'P-06'], ['q_onb_drop'], ''],
    ['o_tour', 'onb', 'Unmoderated test of the first-run tour', -52, 'unmoderated', 'priya', 'completed', 12, ['P-10', 'P-21', 'P-22'], ['q_onb_drop', 'q_onb_expect'], ''],
    ['o_cardsort', 'onb', 'Card sort: aisle names', -25, 'cardsort', 'sam', 'cancelled', 30, ['P-06'], ['q_onb_expect'], 'Participant didn\'t show. Rerunning as an unmoderated sort in December.'],
    ['o_diary', 'onb', 'Two-week new customer diary', -33, 'diary', 'joaquin', 'completed', 20, ['P-02', 'P-13', 'P-21'], ['q_onb_back'], ''],
    ['o_starter', 'onb', 'Usability test: starter basket prototype', -12, 'usability', 'tom', 'completed', 50, ['P-06', 'P-22'], ['q_onb_expect', 'q_onb_back'], 'P-22 used VoiceOver throughout. Good early signal for the accessibility review.'],
    ['o_lapsed', 'onb', 'Interview: customers who didn\'t come back', 6, 'interview', 'tom', 'planned', 40, ['P-04'], ['q_onb_back'], ''],
    ['u_store', 'sub', 'Picker shadowing, Croydon store', -172, 'contextual', 'joaquin', 'completed', 180, ['P-23'], ['q_sub_pickers'], 'Morning shift, 6am to 9am. Store manager was very welcoming.'],
    ['u_wrong', 'sub', 'Interview: substitutions gone wrong', -165, 'interview', 'maya', 'completed', 50, ['P-08'], ['q_sub_feel'], ''],
    ['u_parent', 'sub', 'Interview: shopping for a parent', -150, 'interview', 'joaquin', 'completed', 45, ['P-20'], ['q_sub_feel', 'q_sub_ask'], ''],
    ['u_doorstep', 'sub', 'Doorstep diary: checking deliveries', -136, 'diary', 'joaquin', 'completed', 20, ['P-03', 'P-14', 'P-16'], ['q_sub_feel', 'q_sub_ask'], ''],
    ['u_prefs', 'sub', 'Usability test: substitution preferences', -115, 'usability', 'tom', 'completed', 45, ['P-11', 'P-14'], ['q_sub_ask'], ''],
    ['u_approve', 'sub', 'Usability test: approve swaps before delivery', -74, 'usability', 'joaquin', 'completed', 45, ['P-16', 'P-20'], ['q_sub_ask'], ''],
    ['l_members', 'loy', 'Interview: long-time members', -198, 'interview', 'maya', 'completed', 50, ['P-07', 'P-24'], ['q_loy_value'], ''],
    ['l_sort', 'loy', 'Card sort: reward types', -184, 'cardsort', 'sam', 'completed', 35, ['P-05', 'P-10', 'P-15'], ['q_loy_value'], 'Remote sort, 24 cards.'],
    ['l_balance', 'loy', 'Usability test: points balance screen', -160, 'usability', 'priya', 'completed', 40, ['P-02', 'P-18'], ['q_loy_redeem'], ''],
    ['l_never', 'loy', 'Interview: members who never redeem', -140, 'interview', 'maya', 'completed', 40, ['P-12'], ['q_loy_redeem'], ''],
    ['a_voiceover', 'a11y', 'Screen reader walkthrough: VoiceOver', 12, 'usability', 'priya', 'planned', 60, ['P-22'], ['q_a11y_sr'], 'Bring the iPhone 13 test device. Allow extra time for breaks.'],
  ];
  for (const [key, project, title, day, method, who, status, minutes, people, questions, notes] of sessions) {
    const sid = add('research_session', key, {
      project_id: id[project], method_id: id[method], researcher_id: id[who], title, session_date: demoDay(day),
      duration_minutes: minutes, status, notes: notes || null,
    }, Math.min(day, 0) - 12);
    for (const p of people) link('session_participant', { session_id: sid, participant_id: id[p] });
    for (const q of questions) link('session_question', { session_id: sid, question_id: id[q] });
  }
  const sessionDay = {};
  for (const s of sessions) sessionDay[s[0]] = s[3];

  // ----- Step 1: observations (session, key, title, what happened, sentiment) -----
  const observations = [
    ['s_kitchen', 'ob_slotfirst', 'Checks the slot before building the basket', 'P-03 opened the delivery slots before anything else. "No point filling a basket if Saturday morning\'s gone." She only started shopping once she had seen a free slot.', 'neutral'],
    ['s_kitchen', 'ob_lostbasket', 'Lost her slot while comparing prices', 'Her reserved slot expired while she compared nappy prices on another site. When she came back the slot was gone and she had to hunt again. She called it the most annoying bit of the whole app.', 'negative'],
    ['s_kitchen', 'ob_sameslot', 'Books the same slot almost every week', 'Books Saturday 8 to 9am nearly every week and wishes the app would just hold it for her.', 'neutral'],
    ['s_round1a', 'ob_scrollpast', 'Scrolled past the free slots', 'P-01 swiped through the day tabs four times and missed that Thursday had free evening slots. Full slots were only a slightly lighter grey than free ones.', 'negative'],
    ['s_round1a', 'ob_chargetotal', 'Read the delivery charge as the order total', 'P-07 thought the £4.50 on each slot was the cost of the whole order and hesitated before tapping. Only realised on the payment screen.', 'negative'],
    ['s_round1a', 'ob_greentick', 'Liked the green tick after booking', 'Both participants said the green tick and "Slot booked" message felt reassuring.', 'positive'],
    ['s_round1b', 'ob_calendar', 'Tapped the month name expecting a calendar', 'P-05 tapped "November" twice, expecting a calendar to open. When nothing happened she swiped through days one at a time.', 'negative'],
    ['s_round1b', 'ob_timer', 'Missed the two-hour reservation timer', 'Neither participant noticed the small countdown under the slot. P-11 assumed the slot was his until delivery day.', 'negative'],
    ['s_round1b', 'ob_usualfast', 'Quick when the usual slot is free', 'P-11 booked his usual Friday slot in under 20 seconds. The flow only felt slow when that slot was taken.', 'positive'],
    ['s_diary', 'ob_commute', 'Slot hunting happens on the commute', 'Three of the four diarists logged checking slots on the bus or train, usually in bursts of a minute or two.', 'neutral'],
    ['s_diary', 'ob_drove', 'Gave up and drove to the shop', 'Two weeks running, P-12 found no evening slot free by Wednesday and drove to the supermarket instead. Her entry: "Quicker to just go myself at this point."', 'negative'],
    ['s_diary', 'ob_partner', 'Screenshot of slots sent to a partner', 'P-08 screenshotted the slot list and sent it to her partner on WhatsApp to agree a time before booking.', 'neutral'],
    ['s_diary', 'ob_reminder', 'The evening-before reminder helps', 'Two diarists mentioned the reminder the night before as useful, mostly for knowing to be home.', 'positive'],
    ['s_shift', 'ob_late', 'Needs slots after 10pm', 'P-09 works nights at a hospital and wanted deliveries after 10pm or before 7am. He has never seen either offered.', 'negative'],
    ['s_shift', 'ob_paymore', 'Would pay more for a one-hour window', 'Said he would happily pay a couple of pounds more for a one-hour window instead of two.', 'neutral'],
    ['s_unmod', 'ob_gridfaster', 'Found a free slot faster in the week grid', 'All three participants found a free evening slot faster in the week grid than people did with the day list in round 1, roughly 15 seconds against 40.', 'positive'],
    ['s_unmod', 'ob_colour', 'Couldn\'t tell full from free by colour', 'P-17, who is colour blind, couldn\'t tell which grid cells were full. He tapped each one to find out.', 'negative'],
    ['s_round2', 'ob_gridclear', 'Read the week grid without help', 'P-01 and P-18 understood the grid straight away. P-01: "Oh, that\'s much better, I can see the whole week."', 'positive'],
    ['s_round2', 'ob_labelok', 'New charge label read correctly', 'With the label changed to "Delivery £4.50", both participants understood the charge was for delivery only.', 'positive'],
    ['s_round2', 'ob_keepslot', 'Wanted to keep the slot while browsing offers', 'P-18 wanted to reserve a slot and then browse offers without worrying about the timer.', 'neutral'],
    ['s_round3', 'ob_calmer', 'Reserving first felt calmer', 'P-05 said reserving first "takes the pressure off". She didn\'t look at the timer once during the shop.', 'positive'],
    ['s_round3', 'ob_lapse', 'Unclear what happens when the hold runs out', 'P-19 asked what happens to her basket if the reservation runs out. The prototype didn\'t say.', 'negative'],
    ['s_round3', 'ob_extend', 'Tapped "keep my slot" without hesitating', 'Both participants tapped the "Need more time? Keep your slot for another hour" prompt straight away.', 'positive'],

    ['o_why', 'ob_voucher', 'Signed up for a first-order discount', 'P-02 downloaded the app after a £15-off leaflet came through the door. Had no strong reason to pick us over his usual shop.', 'neutral'],
    ['o_why', 'ob_favourites', 'Expected his usual items to be there', 'Asked where his "usual stuff" was and seemed surprised he had to build a list from nothing.', 'negative'],
    ['o_home', 'ob_search', 'Searched for exact product names', 'P-13 typed things like "semi skimmed 4 pint" instead of browsing aisles. Two searches returned nothing useful.', 'negative'],
    ['o_home', 'ob_25min', 'Spent 25 minutes on the first basket', 'Building the first basket took about 25 minutes while she cooked. "The second time should be quicker, hopefully."', 'neutral'],
    ['o_home', 'ob_unitprice', 'Pleased to see the price per kilo', 'Pointed at the unit price and said it is the thing she always checks in store.', 'positive'],
    ['o_signup', 'ob_address', 'Address finder missed a new-build flat', 'P-04\'s building is new and the address finder didn\'t list her flat. She typed it in by hand after two tries.', 'negative'],
    ['o_signup', 'ob_password', 'Password rules only appeared after an error', 'P-06 hit the password error twice before the rules showed up. "Just tell me what you want first."', 'negative'],
    ['o_signup', 'ob_apple', 'Liked signing in with Apple', 'P-04 used Sign in with Apple and said it made her trust the app more.', 'positive'],
    ['o_tour', 'ob_skiptour', 'Skipped the tour within seconds', 'All three skipped the four-screen tour, two of them on the first screen.', 'neutral'],
    ['o_tour', 'ob_offers', 'Couldn\'t find where offers live', 'After skipping the tour, P-21 looked for offers under Account before finding them on the home screen.', 'negative'],
    ['o_diary', 'ob_fridge', 'Second order prompted by an empty fridge', 'Two of three diarists placed a second order when they ran low on basics. None mentioned our reminder emails.', 'neutral'],
    ['o_diary', 'ob_reorder', '"Reorder last basket" saved time', 'P-13 used Reorder for her second shop and logged that it took under five minutes.', 'positive'],
    ['o_diary', 'ob_oatmilk', 'A surprise substitution put her off', 'P-21 got oat milk instead of semi-skimmed on her first order and wrote "not ordering again for a bit".', 'negative'],
    ['o_starter', 'ob_presumptuous', 'Starter basket felt presumptuous at first', 'P-06 didn\'t like the pre-filled basket ("I don\'t eat half of this") but kept six of the twelve items.', 'neutral'],
    ['o_starter', 'ob_swipe', 'Removing items was quick', 'Both participants removed items with a swipe without any help. P-22 did the same with VoiceOver actions.', 'positive'],
    ['o_starter', 'ob_whysuggest', 'Wanted to know why items were suggested', 'P-22 asked: "Is this what everyone buys, or what you want to sell me?"', 'neutral'],

    ['u_store', 'ob_guess', 'Pickers guess when an item is missing', 'With no guidance, the picker chose the nearest product on the shelf. For a missing 500g fusilli she took a 1kg bag "because it\'s better value".', 'neutral'],
    ['u_store', 'ob_notes', 'Customer notes are rare', 'Of about 40 orders picked during the shift, only 3 had a note about substitutions.', 'neutral'],
    ['u_wrong', 'ob_gf', 'Gluten-free bread swapped for regular bread', 'A gluten-free loaf was replaced with a regular one. P-08 only noticed at breakfast, and her daughter can\'t eat gluten.', 'negative'],
    ['u_wrong', 'ob_never', 'Wants to say "never swap this"', 'Asked for a way to mark some items as never to be substituted, whatever happens.', 'neutral'],
    ['u_parent', 'ob_mum', 'Her mum sometimes refuses the whole delivery', 'P-20 orders for her mother, who gets confused by substitutions and has turned away a whole delivery before.', 'negative'],
    ['u_parent', 'ob_call', 'A call from the driver went down well', 'Once, a driver rang ahead to check a swap. P-20: "Brilliant, exactly what I\'d want."', 'positive'],
    ['u_doorstep', 'ob_rush', 'Swaps are checked at the door, in a rush', 'Diarists check the receipt on the doorstep while the driver waits, and feel awkward refusing items.', 'negative'],
    ['u_doorstep', 'ob_goodswap', 'Good swaps go unnoticed', 'P-14 got a better brand for the same price and only noticed later. Logged it as a "nice surprise".', 'positive'],
    ['u_doorstep', 'ob_email', 'Substitutions are buried in the email', 'Two diarists couldn\'t find the substitutions in the confirmation email. They sit below the receipt total.', 'negative'],
    ['u_prefs', 'ob_peritem', 'Per-item settings understood quickly', 'Both participants set "no substitute" on two items within a minute.', 'positive'],
    ['u_prefs', 'ob_default', '"Allow all swaps" default felt risky', 'P-11 said allowing all swaps by default "feels like it\'s for the shop, not for me".', 'negative'],
    ['u_approve', 'ob_approved', 'Approved swaps on her phone before the van came', 'P-16 approved two swaps ten minutes before the van arrived and said it made her feel in control.', 'positive'],
    ['u_approve', 'ob_phonecall', 'A call would still be needed for some', 'P-20 said her mum would never open a notification, so a phone call would still be needed.', 'neutral'],

    ['l_members', 'ob_coupons', 'Values coupons over points', 'P-07 said the money-off coupons for things she actually buys are the only part of the scheme she notices.', 'positive'],
    ['l_members', 'ob_expire', 'Didn\'t know points expire', 'P-24 had lost points twice without knowing they expire after a year.', 'negative'],
    ['l_sort', 'ob_grouped', 'Sorted rewards into "money off" and "treats"', 'All three sorted rewards into money off the shop and treats, not into the five tiers we use.', 'neutral'],
    ['l_sort', 'ob_charity', 'Donating points ranked highly', 'Two participants put "donate points to a food bank" near the top.', 'positive'],
    ['l_balance', 'ob_pounds', 'Asked what points are worth in pounds', 'Both participants asked what 1,240 points was worth in money.', 'negative'],
    ['l_balance', 'ob_redeem', 'Redeem button hidden below the fold', 'P-18 scrolled past the redeem button twice on a small phone.', 'negative'],
    ['l_never', 'ob_christmas', 'Saves points for Christmas, then forgets', 'P-12 means to save points for the Christmas shop but has forgotten they exist by December.', 'neutral'],
  ];
  const perSession = {};
  for (const [session, key, title, description, sentiment] of observations) {
    perSession[session] = (perSession[session] || 0) + 1;
    add('observation', key, { session_id: id[session], title, description, sentiment }, sessionDay[session], 14 + perSession[session]);
  }

  // ----- Steps 2 to 5 -----
  function stage(table, linkTable, upColumn, selfColumn, rows) {
    for (const row of rows) {
      const { key, project, ups, day, ...values } = row;
      const rid = add(table, key, { project_id: id[project], ...values }, day, 11);
      for (const up of ups) link(linkTable, { [upColumn]: id[up], [selfColumn]: rid });
    }
  }

  stage('finding', 'observation_finding', 'observation_id', 'finding_id', [
    { key: 'f_lookalike', project: 'slot', day: -118, confidence: 'high', title: 'Full and free slots look alike', ups: ['ob_scrollpast', 'ob_calendar', 'ob_colour'],
      description: 'People missed free slots because full ones were only a lighter grey. It was worst on small Android screens and for the colour-blind participant, who had to tap every slot to check.' },
    { key: 'f_charge', project: 'slot', day: -117, confidence: 'high', title: 'The delivery charge is mistaken for the order total', ups: ['ob_chargetotal', 'ob_labelok'],
      description: 'A bare price on each slot reads as the price of the shop. Once it said "Delivery £4.50", nobody was confused.' },
    { key: 'f_losing', project: 'slot', day: -115, confidence: 'high', title: 'Losing a reserved slot is the biggest frustration in checkout', ups: ['ob_lostbasket', 'ob_timer', 'ob_lapse', 'ob_keepslot', 'ob_extend'],
      description: 'Nobody noticed the two-hour timer, so when a slot lapsed it felt like the app had taken it away. People want to hold a slot while they shop, and to be told before it runs out.' },
    { key: 'f_first', project: 'slot', day: -100, confidence: 'medium', title: 'Shoppers choose a slot before they shop', ups: ['ob_slotfirst', 'ob_commute', 'ob_calmer'],
      description: 'Several people check delivery times before adding anything. The slot decides whether the shop happens at all.' },
    { key: 'f_regular', project: 'slot', day: -98, confidence: 'medium', title: 'Regular shoppers want their usual slot held', ups: ['ob_sameslot', 'ob_usualfast'],
      description: 'Weekly shoppers book the same time over and over. When that slot is free, booking is fast. When it isn\'t, the whole flow feels slow.' },
    { key: 'f_evening', project: 'slot', day: -82, confidence: 'medium', title: 'Evening and late slots run out midweek', ups: ['ob_drove', 'ob_late'],
      description: 'People who work long or unusual hours often find nothing that fits by Wednesday, and some go to the shop instead.' },
    { key: 'f_household', project: 'slot', day: -99, confidence: 'low', title: 'Booking a slot is often a household decision', ups: ['ob_partner'],
      description: 'At least one diarist agreed the delivery time with a partner before booking. Only one clear case so far.' },
    { key: 'f_week', project: 'slot', day: -60, confidence: 'high', title: 'Seeing the whole week makes slots faster to find', ups: ['ob_gridfaster', 'ob_gridclear'],
      description: 'The week grid let people spot a free slot at a glance instead of swiping day by day.' },

    { key: 'f_empty', project: 'onb', day: -78, confidence: 'high', title: 'New customers start from an empty basket and find it slow', ups: ['ob_favourites', 'ob_25min', 'ob_presumptuous', 'ob_swipe'],
      description: 'The first basket takes a long time because there is nothing to start from. A suggested basket helps, as long as it is quick to edit.' },
    { key: 'f_search', project: 'onb', day: -79, confidence: 'medium', title: 'Search fails on everyday wording', ups: ['ob_search'],
      description: 'People search the way they write a shopping list, and our search expects product names.' },
    { key: 'f_loops', project: 'onb', day: -64, confidence: 'high', title: 'Account set-up has avoidable error loops', ups: ['ob_address', 'ob_password'],
      description: 'The address finder and password rules both make people fail before they are told what is needed.' },
    { key: 'f_tour', project: 'onb', day: -50, confidence: 'high', title: 'Nobody reads the first-run tour', ups: ['ob_skiptour', 'ob_offers'],
      description: 'Everyone skipped it, then struggled to find things the tour would have shown them.' },
    { key: 'f_baddelivery', project: 'onb', day: -20, confidence: 'medium', title: 'A bad first delivery stops the second order', ups: ['ob_oatmilk'],
      description: 'One unwanted substitution on a first order was enough for a diarist to stop ordering.' },
    { key: 'f_reorder', project: 'onb', day: -19, confidence: 'medium', title: 'Reordering is what makes the second shop easy', ups: ['ob_reorder', 'ob_fridge'],
      description: 'Second orders happen when people run low, and Reorder makes them quick.' },

    { key: 'f_dietary', project: 'sub', day: -160, confidence: 'high', title: 'Unwanted swaps can break dietary needs', ups: ['ob_gf', 'ob_never'],
      description: 'For some households a wrong swap isn\'t an annoyance, it means someone can\'t eat. They want certain items never to be swapped.' },
    { key: 'f_doorstep', project: 'sub', day: -130, confidence: 'high', title: 'Swaps are judged at the doorstep, under pressure', ups: ['ob_rush', 'ob_email', 'ob_mum'],
      description: 'Customers find out about swaps with the driver waiting. Refusing feels awkward, and the details are hard to find.' },
    { key: 'f_pickers', project: 'sub', day: -168, confidence: 'medium', title: 'Pickers have no guidance on what makes a good swap', ups: ['ob_guess', 'ob_notes'],
      description: 'Pickers rely on instinct, and customers rarely leave notes to help them.' },
    { key: 'f_asked', project: 'sub', day: -72, confidence: 'high', title: 'Being asked first feels better than being told', ups: ['ob_call', 'ob_approved', 'ob_phonecall'],
      description: 'Whether by phone or in the app, people react well when they can say yes or no before the van arrives.' },
    { key: 'f_settings', project: 'sub', day: -112, confidence: 'medium', title: 'Per-item swap settings are easy to use', ups: ['ob_peritem', 'ob_default'],
      description: 'People set preferences quickly, but distrust a default that allows every swap.' },

    { key: 'f_value', project: 'loy', day: -155, confidence: 'high', title: 'Points mean nothing without a pound value', ups: ['ob_pounds', 'ob_expire'],
      description: 'Members can\'t say what their points are worth, and some lose them without knowing.' },
    { key: 'f_moneyoff', project: 'loy', day: -180, confidence: 'medium', title: 'Members think in money off, not tiers', ups: ['ob_grouped', 'ob_coupons'],
      description: 'People group rewards as savings or treats. The five tiers don\'t match how they think.' },
    { key: 'f_hidden', project: 'loy', day: -138, confidence: 'medium', title: 'Redeeming is hard to find', ups: ['ob_redeem', 'ob_christmas'],
      description: 'The redeem button sits below the fold, and points are easy to forget.' },
  ]);

  stage('insight', 'finding_insight', 'finding_id', 'insight_id', [
    { key: 'i_gate', project: 'slot', day: -96, impact: 'high', title: 'The slot is the first decision, not the last', ups: ['f_first', 'f_losing'],
      description: 'People treat the delivery time as the gate to the whole shop. Putting it at the end of checkout makes them do the hardest part last, under a timer, with a full basket at stake.' },
    { key: 'i_uncertain', project: 'slot', day: -95, impact: 'high', title: 'Uncertainty, not price, drives drop-off at the slot step', ups: ['f_losing', 'f_charge', 'f_lookalike'],
      description: 'People leave when they can\'t tell what is free, what it costs or whether it is still theirs. Each of those is a design problem we can fix.' },
    { key: 'i_regulars', project: 'slot', day: -80, impact: 'medium', title: 'Weekly shoppers are poorly served by one-off booking', ups: ['f_regular', 'f_evening'],
      description: 'Our most loyal customers have to win their slot again every week, and the ones with tight schedules lose most often.' },
    { key: 'i_glance', project: 'slot', day: -57, impact: 'medium', title: 'Glanceable availability matters more than detail', ups: ['f_week', 'f_lookalike'],
      description: 'Being able to see the week at once, with clear free and full states, does more than any extra detail on each slot.' },
    { key: 'i_firstbasket', project: 'onb', day: -48, impact: 'high', title: 'The first basket is the real onboarding', ups: ['f_empty', 'f_tour', 'f_reorder'],
      description: 'People learn the app by shopping, not by reading about it. If the first basket is easy, the second one usually follows.' },
    { key: 'i_trust', project: 'onb', day: -18, impact: 'high', title: 'Trust is won or lost on the first delivery', ups: ['f_baddelivery'],
      description: 'New customers have no goodwill to fall back on. One bad surprise can end the relationship.' },
    { key: 'i_goodwill', project: 'onb', day: -62, impact: 'medium', title: 'Every sign-up error costs goodwill we haven\'t earned yet', ups: ['f_loops'],
      description: 'Errors before the first order hit harder than the same errors for a regular customer.' },
    { key: 'i_safety', project: 'sub', day: -158, impact: 'high', title: 'For some households, substitutions are a safety issue', ups: ['f_dietary', 'f_pickers'],
      description: 'Dietary needs turn a convenience feature into something that can cause real harm, so it needs the care of a safety feature.' },
    { key: 'i_control', project: 'sub', day: -70, impact: 'high', title: 'Control before the doorstep turns a swap into a choice', ups: ['f_asked', 'f_doorstep', 'f_settings'],
      description: 'The same swap feels fine when approved in advance and bad when discovered at the door.' },
    { key: 'i_simple', project: 'loy', day: -135, impact: 'medium', title: 'Members want a simple saving, not a game', ups: ['f_value', 'f_moneyoff', 'f_hidden'],
      description: 'Tiers and points add effort without adding value people can see. Money off is what they understand.' },
  ]);

  stage('recommendation', 'insight_recommendation', 'insight_id', 'recommendation_id', [
    { key: 'r_reserve', project: 'slot', day: -90, priority: 'high', status: 'accepted', title: 'Let people reserve a slot before they shop', ups: ['i_gate', 'i_uncertain'],
      description: 'Move slot choice to the start, hold it while people shop, and keep the basket safe if the hold ends.' },
    { key: 'r_grid', project: 'slot', day: -55, priority: 'high', status: 'accepted', title: 'Show availability as a week grid with text labels', ups: ['i_glance', 'i_uncertain'],
      description: 'A seven-day grid where full slots are hatched and labelled "Full", so the state never depends on colour alone.' },
    { key: 'r_label', project: 'slot', day: -94, priority: 'medium', status: 'accepted', title: 'Label the charge as "Delivery £x" on every slot', ups: ['i_uncertain'],
      description: 'Say what the price is for, right where people see it.' },
    { key: 'r_repeat', project: 'slot', day: -78, priority: 'medium', status: 'proposed', title: 'Offer a repeating weekly slot for regular shoppers', ups: ['i_regulars'],
      description: 'Let weekly customers keep the same slot each week until they change it.' },
    { key: 'r_warn', project: 'slot', day: -54, priority: 'high', status: 'accepted', title: 'Warn before a reservation lapses and offer to extend it', ups: ['i_uncertain', 'i_gate'],
      description: 'A clear prompt ten minutes before the hold ends, with one tap to keep the slot for another hour.' },
    { key: 'r_starter', project: 'onb', day: -46, priority: 'high', status: 'accepted', title: 'Offer an editable starter basket based on household size', ups: ['i_firstbasket'],
      description: 'Pre-fill a small basket of everyday items that is quick to trim, and say why each item is there.' },
    { key: 'r_tips', project: 'onb', day: -47, priority: 'medium', status: 'accepted', title: 'Replace the tour with tips in context', ups: ['i_firstbasket'],
      description: 'Show one short tip the first time someone reaches offers, Reorder or substitutions.' },
    { key: 'r_signup', project: 'onb', day: -61, priority: 'medium', status: 'accepted', title: 'Show password rules up front and allow manual addresses', ups: ['i_goodwill'],
      description: 'Tell people what is needed before they type, and make manual address entry a first-class option.' },
    { key: 'r_approvefirst', project: 'onb', day: -16, priority: 'high', status: 'proposed', title: 'Ask first-time customers to approve substitutions', ups: ['i_trust'],
      description: 'On a first order, switch swaps to "ask me" by default.' },
    { key: 'r_never', project: 'sub', day: -110, priority: 'high', status: 'accepted', title: 'Add a "never substitute" setting per item', ups: ['i_safety', 'i_control'],
      description: 'Let customers mark items that must never be swapped, and remember it for future orders.' },
    { key: 'r_inapp', project: 'sub', day: -68, priority: 'high', status: 'accepted', title: 'Send swap approvals to the app before the van leaves', ups: ['i_control'],
      description: 'A notification with each proposed swap and a simple approve or refuse.' },
    { key: 'r_guide', project: 'sub', day: -150, priority: 'medium', status: 'accepted', title: 'Give pickers a short swap guide for dietary items', ups: ['i_safety'],
      description: 'A one-page guide covering the dietary labels that must never be swapped across.' },
    { key: 'r_call', project: 'sub', day: -66, priority: 'medium', status: 'rejected', title: 'Keep a phone call option for customers who don\'t use notifications', ups: ['i_control'],
      description: 'Rejected for now: drivers can\'t take on calls at current volumes. Revisit with the proxy shopper work.' },
    { key: 'r_pounds', project: 'loy', day: -132, priority: 'high', status: 'accepted', title: 'Show points as pounds everywhere', ups: ['i_simple'],
      description: 'Lead with the money value and keep the points number secondary.' },
    { key: 'r_tiers', project: 'loy', day: -130, priority: 'medium', status: 'proposed', title: 'Collapse the five tiers into one balance', ups: ['i_simple'],
      description: 'Replace tiers with a single savings balance that is easy to explain.' },
  ]);

  stage('design_decision', 'recommendation_decision', 'recommendation_id', 'decision_id', [
    { key: 'd_move', project: 'slot', day: -30, status: 'implemented', decided_on: demoDay(-30), title: 'Move slot booking to the start of the shop', ups: ['r_reserve', 'r_warn'],
      description: 'Customers pick and hold a slot first, then shop. The hold lasts two hours, with a warning and a one-tap extension.' },
    { key: 'd_grid', project: 'slot', day: -12, status: 'approved', decided_on: demoDay(-12), title: 'Ship the week grid with "Full" and "Free" text', ups: ['r_grid'],
      description: 'Replaces the day list on iOS and Android in the next release. Hatching plus text, checked with VoiceOver.' },
    { key: 'd_label', project: 'slot', day: -44, status: 'implemented', decided_on: demoDay(-44), title: 'Rename the slot price to "Delivery £x"', ups: ['r_label'],
      description: 'A copy change only, shipped ahead of the bigger redesign.' },
    { key: 'd_pilot', project: 'slot', day: -14, status: 'proposed', decided_on: null, title: 'Pilot repeating slots in two London stores', ups: ['r_repeat'],
      description: 'A small pilot before committing engineering time. Needs sign-off from store operations.' },
    { key: 'd_starter', project: 'onb', day: -8, status: 'approved', decided_on: demoDay(-8), title: 'Build the starter basket for the January release', ups: ['r_starter'],
      description: 'Seven everyday items scaled to household size, each with a short "why it\'s here" line and swipe to remove.' },
    { key: 'd_tour', project: 'onb', day: -40, status: 'implemented', decided_on: demoDay(-40), title: 'Remove the first-run tour', ups: ['r_tips'],
      description: 'Replaced with three tips that appear in context the first time.' },
    { key: 'd_password', project: 'onb', day: -45, status: 'implemented', decided_on: demoDay(-45), title: 'Show password rules before people type', ups: ['r_signup'],
      description: 'Rules are listed under the field and tick off as they are met.' },
    { key: 'd_never', project: 'sub', day: -90, status: 'implemented', decided_on: demoDay(-90), title: 'Launch per-item "never substitute"', ups: ['r_never'],
      description: 'Available on every product page and in the basket. Remembered across orders.' },
    { key: 'd_approve', project: 'sub', day: -62, status: 'implemented', decided_on: demoDay(-62), title: 'Approve swaps in the app up to 30 minutes before delivery', ups: ['r_inapp'],
      description: 'Unanswered swaps fall back to the customer\'s default setting.' },
    { key: 'd_guide', project: 'sub', day: -70, status: 'approved', decided_on: demoDay(-70), title: 'Print a dietary swap guide for pickers', ups: ['r_guide'],
      description: 'Trial in Croydon first, then roll out with the store operations team.' },
    { key: 'd_points', project: 'loy', day: -120, status: 'implemented', decided_on: demoDay(-120), title: 'Show points in pounds on the balance screen', ups: ['r_pounds'],
      description: '"£12.40 to spend" leads, with "1,240 points" underneath.' },
    { key: 'd_tiers', project: 'loy', day: -126, status: 'reversed', decided_on: demoDay(-126), title: 'Drop the tiers in the spring relaunch', ups: ['r_tiers'],
      description: 'Approved at first, then reversed when the commercial team kept tiers for a partner deal.' },
  ]);

  // ----- Sources (drawn illustrations) and their pins -----
  const sources = [
    ['src_affinity', 'Affinity map after round 1', 'whiteboard', DEMO_ART.affinityMap, 'Sticky notes from both round 1 tests, grouped by what got in the way.', 'session_id', 's_round1b', -120,
      [[0.46, 0.48, 'This cluster became the finding about losing a reserved slot.', 'maya'], [0.69, 0.28, 'P-07\'s quote here is the one for the deck.', 'tom'], [0.245, 0.48, 'Colour issue, check with P-17 in the unmoderated round.', 'priya']]],
    ['src_hmw', 'Slot step: how might we', 'whiteboard', DEMO_ART.howMightWe, 'From the cross-team workshop. Dots are votes.', 'insight_id', 'i_gate', -94,
      [[0.42, 0.42, 'Top vote by far. Became the reserve-first recommendation.', 'maya']]],
    ['src_daylist', 'Current slot picker (day list)', 'screenshot', DEMO_ART.slotListScreen, 'The live day list before the redesign. Full slots are only a lighter grey.', 'finding_id', 'f_lookalike', -118,
      [[0.5, 0.42, 'Full vs free: almost no contrast here.', 'priya'], [0.5, 0.26, 'Day tabs: P-01 swiped these four times.', 'tom']]],
    ['src_grid', 'Week grid sketch, first pass', 'sketch', DEMO_ART.weekGridSketch, 'Priya\'s first sketch of the week grid, with hatching for full slots.', 'recommendation_id', 'r_grid', -56,
      [[0.46, 0.43, 'Hatching plus the word "Full", so it works without colour.', 'priya'], [0.49, 0.7, 'Engineering asked for the hold time to sit here.', 'tom']]],
    ['src_diary', 'Diary entry, P-12, week 2', 'notes', DEMO_ART.diaryPage, 'Transcribed from the diary app.', 'observation_id', 'ob_drove', -103,
      [[0.42, 0.33, 'Second week in a row. Strong quote for the evening-slots finding.', 'joaquin']]],
    ['src_fridge', 'Fridge shopping list', 'photo', DEMO_ART.fridgeList, 'P-13 keeps her list on the fridge and copied it into the app item by item.', 'session_id', 'o_home', -80,
      [[0.38, 0.42, 'She typed these in one by one. Search failed on two of them.', 'priya']]],
    ['src_starter', 'Starter basket prototype', 'screenshot', DEMO_ART.starterBasketScreen, 'The prototype used in the starter basket test.', 'session_id', 'o_starter', -13,
      [[0.5, 0.25, 'P-22 asked where this suggestion comes from.', 'tom'], [0.63, 0.4, 'Swipe and the × both worked with VoiceOver.', 'priya']]],
    ['src_journey', 'New customer journey map', 'whiteboard', DEMO_ART.journeyMap, 'Mapped from the interviews, the home visit and the diary.', 'insight_id', 'i_firstbasket', -48,
      [[0.36, 0.7, 'Two error loops right at sign-up.', 'tom'], [0.67, 0.7, 'The substitution surprise lands here.', 'joaquin']]],
    ['src_fieldnotes', 'Field notes, Croydon store', 'notes', DEMO_ART.fieldNotes, 'Written during the morning shift.', 'session_id', 'u_store', -172,
      [[0.5, 0.33, 'Same story from two other pickers on the break.', 'joaquin']]],
    ['src_doorstep', 'Doorstep approval flow', 'sketch', DEMO_ART.doorstepSketch, 'The three-screen flow tested in the approve-before-delivery session.', 'recommendation_id', 'r_inapp', -67,
      [[0.5, 0.5, 'GF loaf: auto-refuse because of "never substitute".', 'joaquin']]],
    ['src_guide', 'Picker swap guide, draft v2', 'document', DEMO_ART.swapGuide, 'Draft reviewed with the Croydon store manager.', 'decision_id', 'd_guide', -69,
      [[0.5, 0.62, 'Store team asked for halal to be added. Done in v2.', 'maya']]],
    ['src_points', 'Points balance screen', 'screenshot', DEMO_ART.pointsScreen, 'The balance screen before points were shown in pounds.', 'finding_id', 'f_value', -158,
      [[0.45, 0.38, '"What is that in money?" Both participants asked.', 'priya'], [0.5, 0.97, 'Redeem sits below the fold on small phones.', 'maya']]],
  ];
  for (const [key, title, kind, draw, caption, column, owner, day, pins] of sources) {
    const sid = add('source', key, { title, kind, caption, file_url: draw(), is_illustration: true, session_id: null, observation_id: null,
      finding_id: null, insight_id: null, recommendation_id: null, decision_id: null, [column]: id[owner] }, day, 16);
    pins.forEach(([px, py, body, author], i) => add('annotation', null, { source_id: sid, x: px, y: py, body, author_id: id[author] }, day + (i ? 1 : 0), 17));
  }

  // ----- Team notes -----
  [
    ['session_id', 's_round1a', 'tom', -127, 'Recordings are in the shared drive under "Round 1". Worth watching P-01 at 14:20.'],
    ['session_id', 's_round2', 'maya', -40, 'Huge difference from round 1. Let\'s show the P-01 clip at the leadership review.'],
    ['session_id', 's_round2', 'priya', -39, 'Agreed. I\'ll cut it down to under a minute.'],
    ['finding_id', 'f_lookalike', 'priya', -60, 'I\'ll pair with Sam on the "Full" and "Free" wording so it reads well with VoiceOver too.'],
    ['finding_id', 'f_losing', 'joaquin', -100, 'Diary entries back this up. P-12 mentioned the timer twice without being asked.'],
    ['insight_id', 'i_uncertain', 'maya', -93, 'This is the line I\'d lead with in the quarterly review.'],
    ['decision_id', 'd_move', 'tom', -22, 'Rolled out to 10% of Android users first, then everyone a week later. Hannah has the checkout dashboard link.'],
    ['decision_id', 'd_pilot', 'hannah', -5, 'Store ops need four weeks\' notice to set up repeating slots.'],
    ['recommendation_id', 'r_repeat', 'priya', -70, 'Engineering think this is about two sprints. Parking it until the grid ships.'],
    ['session_id', 'o_home', 'priya', -79, 'Photo of her fridge list is in Sources. Lovely example of how people actually plan.'],
    ['finding_id', 'f_tour', 'tom', -49, 'Matches what analytics told us: most people skip on screen one.'],
    ['decision_id', 'd_tour', 'sam', -38, 'Tip copy is in the content doc. v3 is final.'],
    ['recommendation_id', 'r_approvefirst', 'joaquin', -15, 'Links nicely with the substitutions work. We could reuse the same approval screen.'],
    ['session_id', 'o_cardsort', 'hannah', -25, 'Second no-show this month. Adding a reminder text the day before from now on.'],
    ['session_id', 'u_store', 'joaquin', -171, 'Store manager says we can come back in January to test the picker guide.'],
    ['finding_id', 'f_dietary', 'maya', -159, 'Flagged to the trust and safety team as well.'],
    ['decision_id', 'd_tiers', 'maya', -112, 'Commercial kept tiers for the partner deal. Revisit if the deal ends.'],
  ].forEach(([column, owner, author, day, body]) => add('note', null, {
    body, author_id: id[author], session_id: null, observation_id: null, finding_id: null, insight_id: null,
    recommendation_id: null, decision_id: null, [column]: id[owner],
  }, day, 15));

  return db;
}
