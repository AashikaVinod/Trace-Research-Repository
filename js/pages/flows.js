// ===================================================================
// Flows: every insight or decision as its own journey, from what people
// did and said to what the team decided, with the sources at each step.
// ===================================================================

function pageFlows(params, query) {
  setCrumbs(['Flows']);
  let type = ['finding', 'insight', 'recommendation', 'design_decision'].includes(query.type) ? query.type : 'insight';
  let projectId = query.project ? Number(query.project) : '';

  view.innerHTML = `
    <header class="page-head">
      <div><h1>Flows</h1><p>Every insight and decision as its own journey, with the evidence and sources behind it.</p></div>
    </header>
    <div class="toolbar">
      <div class="chips" role="group" aria-label="Show flows for">
        ${['insight', 'design_decision', 'finding', 'recommendation'].map((t) => `<button class="chip" data-flow-type="${t}">${STAGE[t].plural}</button>`).join('')}
      </div>
      <label class="sr" for="flow-project">Project</label>
      <select class="input" id="flow-project"><option value="">All projects</option>
        ${data.research_project.map((p) => `<option value="${p.id}">${esc(p.title)}</option>`).join('')}</select>
      <span class="count" id="count" aria-live="polite"></span>
    </div>
    <div id="flows"></div>`;
  $('#flow-project').value = String(projectId);

  function draw() {
    setQuery({ type: type === 'insight' ? '' : type, project: projectId });
    $$('[data-flow-type]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.flowType === type));
    const list = data[type].filter((r) => !projectId || r.project_id === projectId);
    $('#count').textContent = plural(list.length, 'flow');
    $('#flows').innerHTML = list.length ? `<div class="flow-grid">${list.map((r) => flowCard(type, r)).join('')}</div>`
      : '<div class="empty"><h2>No flows here</h2><p>Try another step or project.</p></div>';
  }
  $$('[data-flow-type]').forEach((b) => { b.onclick = () => { type = b.dataset.flowType; draw(); }; });
  $('#flow-project').onchange = (event) => { projectId = event.target.value ? Number(event.target.value) : ''; draw(); };
  draw();
}

// One flow as a card: its chain counts and a strip of its sources.
function flowCard(type, record) {
  const trail = lineage(type, record.id);
  const sources = journeySources(type, record.id);
  const notes = STAGES.reduce((sum, s) => sum + trail.byStage[s.type].reduce((n, r) => n + notesFor(s.type, r.id).length, 0), 0);
  const complete = STAGES.every((s) => trail.byStage[s.type].length > 0);
  return `<a class="card flow-card" href="#/flow/${type}/${record.id}">
    <div class="pills">${stageTag(type)}${complete ? pill('complete', 'green') : pill('in progress', 'orange')}</div>
    <h3>${esc(record.title)}</h3>
    <p class="card-sub">${esc(byId('research_project', record.project_id).title)}</p>
    <div class="flow-chain">${STAGES.map((s) => `<span class="stage-${s.type} ${s.type === type ? 'is-here' : ''}" title="${s.plural}"><b>${trail.byStage[s.type].length}</b></span>`).join('')}</div>
    <div class="flow-foot">
      <span class="thumbs">${sources.slice(0, 4).map((s) => `<img src="${esc(s.file_url)}" alt="">`).join('')}</span>
      ${meta(plural(sources.length, 'source'), plural(notes, 'note'))}
    </div>
  </a>`;
}

function stageTag(type) {
  return `<span class="doc-type stage-${type}"><b>${STAGE[type].step}</b>${STAGE[type].label}</span>`;
}

// The journey of one record, step by step, top to bottom.
function pageFlow(params) {
  const type = params.type;
  const record = STAGE[type] ? byId(type, Number(params.id)) : null;
  if (!record) return notFound('Flow', '#/flows', 'flows');
  setCrumbs(['Flows', '#/flows'], [record.title]);
  const trail = lineage(type, record.id);
  const sources = journeySources(type, record.id);
  const next = nextStage(type);
  const archived = !!byId('research_project', record.project_id).archived_at;

  let steps = '';
  for (const stage of STAGES) {
    const items = trail.byStage[stage.type];
    steps += `<li class="journey-step stage-${stage.type} ${items.length ? '' : 'is-empty'}">
      <div class="journey-marker"><span>${stage.step}</span></div>
      <div class="journey-body">
        <h2 class="journey-title">${stage.plural} <small>${items.length}</small></h2>
        ${items.length ? `<div class="journey-items">${items.map((r) => journeyItem(stage.type, r, stage.type === type && r.id === record.id)).join('')}</div>`
          : `<p class="quiet">Nothing at this step yet.${stage.step > STAGE[type].step && stage.step === STAGE[type].step + 1 && !archived ? ` <button class="text-link link-button" data-next="${stage.type}">Add a ${stage.label.toLowerCase()} based on this ${icon('arrow-right', 14)}</button>` : ''}</p>`}
      </div>
    </li>`;
  }

  view.innerHTML = `
    <header class="page-head">
      <div><div class="pills">${stageTag(type)}</div><h1 style="margin-top:12px">${esc(record.title)}</h1>
        <p>${esc(byId('research_project', record.project_id).title)}: the full journey of this ${STAGE[type].label.toLowerCase()}.</p></div>
      <div class="actions-row">
        <a class="btn" href="#/record/${type}/${record.id}">${icon('eye', 15)} Open record</a>
        <a class="btn" href="#/trail/${type}/${record.id}">${icon('waypoints', 15)} Trail view</a>
        <button class="btn btn-dark" data-add-source="${type}:${record.id}">${icon('upload', 15)} Add source</button>
      </div>
    </header>
    <div class="journey-layout">
      <ol class="journey">${steps}</ol>
      <aside class="stack">
        <section class="card"><div class="card-top"><div><h3>Sources in this flow (${sources.length})</h3><p class="card-sub">From every step and session behind it</p></div></div>
          ${sources.length ? `<div class="polaroids polaroids-2">${sources.map(polaroid).join('')}</div>` : '<p class="quiet">No sources yet.</p>'}</section>
        ${notesBlock(type, record.id)}
      </aside>
    </div>
    ${dbPanel(['WITH RECURSIVE (CTE)', 'Exclusive arc', 'UNION', 'Weak entity'], `
-- 1. Walk the flow with the recursive lineage function (sql/06)
select * from trace_lineage('${type}', ${record.id});

-- 2. Find the sources attached anywhere along it (sql/07: one FK column per owner type)
select s.title, s.kind from source s
where s.${OWNER_COLUMN[type]} = ${record.id}
   or s.session_id in (select session_id from observation where id in (/* the flow's observations */));

-- 3. Pins on an image only exist with their source (a weak entity)
select body, x, y from annotation where source_id = …;`)}`;

  hookAttachments(view);
  $$('[data-next]', view).forEach((b) => { b.onclick = () => editRecord(b.dataset.next, null, { projectId: record.project_id, upIds: [record.id] }); });
}

function journeyItem(type, r, isFocus) {
  const sources = sourcesFor(type, r.id);
  const notes = notesFor(type, r.id).length;
  const session = type === 'observation' ? byId('research_session', r.session_id) : null;
  return `<a class="journey-item ${isFocus ? 'is-focus' : ''}" href="#/flow/${type}/${r.id}">
    <strong>${esc(r.title)}</strong>
    <span class="journey-text">${esc(shorten(r.description, 140))}</span>
    <span class="journey-meta">${meta(session ? esc(session.title) : '', sources.length ? `${icon('image', 13)} ${plural(sources.length, 'source')}` : '', notes ? `${icon('sticky-note', 13)} ${plural(notes, 'note')}` : '')}</span>
    ${sources.length ? `<span class="thumbs">${sources.slice(0, 3).map((s) => `<img src="${esc(s.file_url)}" alt="">`).join('')}</span>` : ''}
  </a>`;
}
