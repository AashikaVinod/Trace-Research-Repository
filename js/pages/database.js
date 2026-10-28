// ===================================================================
// Database page: how TRACE uses PostgreSQL, in one place.
// Schema, live table sizes, a feature -> concept map, and a query lab
// that runs the views from sql/06_views.sql.
// ===================================================================

// The main tables, grouped, with their key columns.
const SCHEMA = [
  { group: 'People and setup', tables: [
    { name: 'researcher', columns: [['pk', 'id'], ['', 'full_name'], ['', 'email (unique)'], ['', 'role_title']] },
    { name: 'participant', columns: [['pk', 'id'], ['', 'participant_code (unique)'], ['', 'age_band'], ['', 'notes']] },
    { name: 'segment', columns: [['pk', 'id'], ['', 'name (unique)'], ['', 'description']] },
    { name: 'research_method', columns: [['pk', 'id'], ['', 'name (unique)'], ['', 'description']] },
  ] },
  { group: 'Projects and sessions', tables: [
    { name: 'research_project', columns: [['pk', 'id'], ['', 'title (unique)'], ['', 'research_objective'], ['', 'status (check)'], ['', 'archived_at']] },
    { name: 'research_question', columns: [['pk', 'id'], ['fk', 'project_id'], ['', 'question_text']] },
    { name: 'research_session', columns: [['pk', 'id'], ['fk', 'project_id'], ['fk', 'method_id'], ['fk', 'researcher_id'], ['', 'session_date']] },
  ] },
  { group: 'Evidence chain', tables: [
    { name: 'observation', stage: 'observation', columns: [['pk', 'id'], ['fk', 'session_id'], ['', 'title'], ['', 'sentiment (check)']] },
    { name: 'finding', stage: 'finding', columns: [['pk', 'id'], ['fk', 'project_id'], ['', 'title'], ['', 'confidence']] },
    { name: 'insight', stage: 'insight', columns: [['pk', 'id'], ['fk', 'project_id'], ['', 'title'], ['', 'impact']] },
    { name: 'recommendation', stage: 'recommendation', columns: [['pk', 'id'], ['fk', 'project_id'], ['', 'priority'], ['', 'status']] },
    { name: 'design_decision', stage: 'design_decision', columns: [['pk', 'id'], ['fk', 'project_id'], ['', 'status'], ['', 'decided_on']] },
  ] },
];

// The nine junction tables (many-to-many relationships).
const JUNCTIONS = [
  ['project_researcher', 'research_project', 'researcher'],
  ['project_method', 'research_project', 'research_method'],
  ['participant_segment', 'participant', 'segment'],
  ['session_participant', 'research_session', 'participant'],
  ['session_question', 'research_session', 'research_question'],
  ['observation_finding', 'observation', 'finding'],
  ['finding_insight', 'finding', 'insight'],
  ['insight_recommendation', 'insight', 'recommendation'],
  ['recommendation_decision', 'recommendation', 'design_decision'],
];

// Every feature in the app and the DBMS idea behind it.
const CONCEPT_MAP = [
  ['Home totals', 'Aggregate functions, views', 'v_dashboard in sql/06'],
  ['Projects list', 'LEFT JOIN, correlated subqueries', 'v_project_summary'],
  ['Archive a project', 'Soft delete, ON DELETE RESTRICT, trigger', 'archived_at; sql/02'],
  ['New project form', 'INSERT, NOT NULL, CHECK, DEFAULT', 'sql/01 and sql/02'],
  ['"Already exists" message', 'UNIQUE constraint (case-insensitive index)', 'research_project_title_key'],
  ['Team, segments, participants in sessions', 'Many-to-many junction tables, composite primary keys', '9 junction tables'],
  ['Observation belongs to a session', 'Foreign key (one-to-many), 3NF', 'no project_id on observation'],
  ['Linking evidence', 'Junction table + trigger (same-project rule)', 'trace_check_same_project'],
  ['Evidence trail', 'Recursive CTE, UNION ALL, view', 'trace_lineage, v_evidence_edge'],
  ['Gaps to close', 'Anti-join (NOT EXISTS)', 'v_evidence_gap'],
  ['Strongest decisions', 'Multi-table JOIN, COUNT(DISTINCT)', 'v_decision_strength'],
  ['Charts', 'GROUP BY, FILTER, date_trunc', 'v_sentiment_by_project, v_sessions_by_month'],
  ['Library search and tabs', 'WHERE, ILIKE, indexes', 'v_evidence_record'],
  ['"Last updated" dates', 'BEFORE UPDATE trigger', 'trace_touch_updated_at'],
  ['Who may edit (designed in SQL)', 'Roles, GRANT, Row Level Security, security definer function', 'sql/03_security.sql'],
  ['Installing the database', 'Transactions (BEGIN / COMMIT), sequences', 'sql/01–04'],
];

// Queries you can run from this page.
const QUERIES = [
  { view: 'v_dashboard', title: 'Totals for the home page', concept: 'Aggregates in one view',
    sql: 'select * from v_dashboard;' },
  { view: 'v_project_summary', title: 'Projects with their lead and evidence counts', concept: 'LEFT JOIN + subqueries',
    sql: "select p.title, r.full_name as lead,\n  (select count(*) from finding f where f.project_id = p.id) as findings\nfrom research_project p\nleft join project_researcher pr on pr.project_id = p.id and pr.project_role = 'lead'\nleft join researcher r on r.id = pr.researcher_id;" },
  { view: 'v_decision_strength', title: 'Evidence behind each decision', concept: 'Five-table JOIN + COUNT(DISTINCT)',
    sql: 'select d.title, count(distinct obf.observation_id) as observations\nfrom design_decision d\nleft join recommendation_decision rd on rd.decision_id = d.id\nleft join insight_recommendation ir on ir.recommendation_id = rd.recommendation_id\nleft join finding_insight fi on fi.insight_id = ir.insight_id\nleft join observation_finding obf on obf.finding_id = fi.finding_id\ngroup by d.title;' },
  { view: 'v_evidence_gap', title: 'Records nothing builds on yet', concept: 'Anti-join with NOT EXISTS',
    sql: 'select record_type, title from v_evidence_record e\nwhere record_type <> \'design_decision\'\n  and not exists (select 1 from v_evidence_edge g where g.from_type = e.record_type and g.from_id = e.id);' },
  { view: 'v_sessions_by_month', title: 'Sessions per month', concept: 'GROUP BY + date_trunc',
    sql: "select to_char(date_trunc('month', session_date), 'YYYY-MM') as month, count(*)\nfrom research_session group by 1 order by 1;" },
  { view: 'v_participants_by_segment', title: 'Participants per segment', concept: 'Junction table + GROUP BY',
    sql: 'select g.name, count(ps.participant_id)\nfrom segment g left join participant_segment ps on ps.segment_id = g.id\ngroup by g.name;' },
  { view: 'trace_lineage', title: 'The full lineage of decision #1', concept: 'Recursive CTE (WITH RECURSIVE)', args: { type: 'design_decision', id: 1 },
    sql: "select * from trace_lineage('design_decision', 1);" },
];

function pageDatabase() {
  setCrumbs(['Database']);
  const entityRows = TABLES.filter((t) => !JUNCTIONS.some((j) => j[0] === t)).map((t) => ({ label: t, value: data[t].length, color: 'var(--find)' }));
  const junctionRows = JUNCTIONS.map((j) => ({ label: j[0], value: data[j[0]].length, color: 'var(--obs)' }));
  const totalRows = TABLES.reduce((sum, t) => sum + data[t].length, 0);

  let schemaHtml = '';
  for (const group of SCHEMA) {
    schemaHtml += `<div class="schema-group"><h3>${group.group}</h3>`;
    for (const table of group.tables) {
      schemaHtml += `<div class="entity ${table.stage ? 'stage-' + table.stage : ''}">
        <header>${table.name}<small>${data[table.name].length} rows</small></header>
        <ul>${table.columns.map(([key, name]) => `<li>${key ? `<span class="key ${key}">${key.toUpperCase()}</span>` : '<span class="key"></span>'}${esc(name)}</li>`).join('')}</ul>
      </div>`;
    }
    schemaHtml += '</div>';
  }

  view.innerHTML = `
    <header class="page-head">
      <div><h1>Database</h1>
        <p>TRACE's database is designed for PostgreSQL: 12 entity tables, 9 junction tables, 9 views, a recursive function, 5 trigger functions and Row Level Security, all in the <code>sql/</code> folder.
        In this demo the app runs in your browser, so each query below is computed with the same logic as its SQL view.</p></div>
    </header>

    <div class="stats" aria-label="Database size">
      ${statLink('#/database', 'Tables', TABLES.length + 1, '21 data tables + 1 editor list')}
      ${statLink('#/database', 'Rows stored', totalRows, 'Across all tables')}
      ${statLink('#/database', 'Junction tables', JUNCTIONS.length, 'For many-to-many links')}
      ${statLink('#/database', 'Views', 9, 'Plus 1 recursive function')}
    </div>

    <section class="card">
      <div class="card-top"><h3>Schema</h3><span class="pills"><span class="pill pill-grey"><span class="key pk">PK</span>&nbsp;primary key</span><span class="pill pill-grey"><span class="key fk">FK</span>&nbsp;foreign key</span></span></div>
      <div class="schema">${schemaHtml}</div>
    </section>

    <div class="grid-2 row-gap">
      <section class="card"><div class="card-top"><h3>Junction tables (many-to-many)</h3></div>
        <ul class="junctions">${JUNCTIONS.map(([name, a, b]) => `<li><code>${a}</code> ${icon('arrow-left', 14)}${icon('arrow-right', 14)} <code>${b}</code><span class="push quiet">${name}</span></li>`).join('')}</ul>
      </section>
      <section class="card"><div class="card-top"><h3>Rows per table</h3></div>
        ${barChart([...entityRows, ...junctionRows].sort((a, b) => b.value - a.value).slice(0, 10))}
      </section>
    </div>

    <section class="card row-gap">
      <div class="card-top"><h3>Which DBMS concept powers each feature</h3></div>
      <div class="table-card" style="padding:0"><table class="table concept-table">
        <thead><tr><th scope="col">Feature in TRACE</th><th scope="col">DBMS concept</th><th scope="col" class="hide-sm">Where to find it</th></tr></thead>
        <tbody>${CONCEPT_MAP.map(([feature, concept, where]) => `<tr><td>${esc(feature)}</td><td>${esc(concept)}</td><td class="hide-sm"><code>${esc(where)}</code></td></tr>`).join('')}</tbody>
      </table></div>
    </section>

    <section class="card row-gap">
      <div class="card-top"><h3>Query lab</h3></div>
      <p class="card-note">Each query is a view or function in <code>sql/06_views.sql</code>. Press Run to see its result.</p>
      ${QUERIES.map((q, index) => `<div class="query">
        <div class="query-head">
          <div><h3>${esc(q.title)}</h3><p>${esc(q.concept)}</p></div>
          <button class="btn btn-small" data-run="${index}">${icon('play', 14)} Run</button>
        </div>
        <pre class="sql">${highlightSql(q.sql)}</pre>
        <div id="result-${index}"></div>
      </div>`).join('')}
    </section>`;

  $$('[data-run]').forEach((button) => {
    button.onclick = () => {
      const query = QUERIES[Number(button.dataset.run)];
      const box = $(`#result-${button.dataset.run}`);
      button.disabled = true;
      box.innerHTML = '<p class="quiet">Running…</p>';
      try {
        const rows = runView(query.view, query.args);
        box.innerHTML = resultTable(rows) + `<p class="query-source">${rows.length} rows, the same result <code>${query.view}</code> gives in PostgreSQL.</p>`;
      } catch (error) {
        box.innerHTML = `<p class="error">${esc(error.message)}</p>`;
      }
      button.disabled = false;
    };
  });
}

// One number in the summary row at the top.
function statLink(href, label, value, note) {
  return `<a class="stat" href="${href}"><span>${label}</span><strong>${value}</strong><small>${note}</small></a>`;
}

// Shows query results as a small table.
function resultTable(rows) {
  if (rows.length === 0) return '<p class="quiet">No rows.</p>';
  const columns = Object.keys(rows[0]);
  return `<div class="query-result"><table class="table compact">
    <thead><tr>${columns.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((row) => `<tr>${columns.map((c) => `<td>${esc(row[c] === null ? 'null' : row[c])}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}
