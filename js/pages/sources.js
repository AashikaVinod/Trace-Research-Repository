// ===================================================================
// Sources: every photo, sketch and document, organised by project
// (folders) and kind (chips), like the Files reference.
// ===================================================================

function pageSources(params, query) {
  setCrumbs(['Sources']);
  let projectId = query.project ? Number(query.project) : '';
  let kind = SOURCE_KINDS.includes(query.kind) ? query.kind : '';
  let search = '';

  view.innerHTML = `
    <header class="page-head">
      <div><h1>Sources</h1><p>Whiteboards, sketches, notes and documents behind the research. Open one to read its pinned notes.</p></div>
      <button class="btn btn-dark" id="add-source">${icon('upload', 16)} Add source</button>
    </header>
    <div class="folders">${data.research_project.map((p) => `
      <button class="folder-card" data-folder="${p.id}"><span class="folder-icon" aria-hidden="true"></span>
        <strong>${esc(p.title)}</strong><small>${plural(data.source.filter((s) => projectOfSource(s) === p.id).length, 'source')}</small></button>`).join('')}
    </div>
    <div class="toolbar row-gap">
      <div class="chips" role="group" aria-label="Kind">
        <button class="chip" data-kind="">All</button>${SOURCE_KINDS.map((k) => `<button class="chip" data-kind="${k}">${capital(k)}</button>`).join('')}
      </div>
      <label class="sr" for="source-search">Search sources</label>
      <input class="input search-box" id="source-search" type="search" placeholder="Search titles and captions">
      <span class="count" id="count" aria-live="polite"></span>
    </div>
    <div id="grid"></div>`;

  function draw() {
    setQuery({ project: projectId, kind });
    $$('[data-folder]').forEach((f) => f.setAttribute('aria-pressed', Number(f.dataset.folder) === projectId));
    $$('[data-kind]').forEach((c) => c.setAttribute('aria-pressed', c.dataset.kind === kind));
    const text = search.toLowerCase();
    const list = data.source
      .filter((s) => !projectId || projectOfSource(s) === projectId)
      .filter((s) => !kind || s.kind === kind)
      .filter((s) => `${s.title} ${s.caption}`.toLowerCase().includes(text))
      .sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
    $('#count').textContent = plural(list.length, 'source');
    $('#grid').innerHTML = list.length ? `<div class="polaroids polaroids-wide">${list.map((s) => {
      const owner = ownerOf(s);
      return `<div class="source-tile">${polaroid(s)}<a class="source-owner" href="${owner.href}">${esc(owner.label)}: ${esc(shorten(owner.title, 48))}</a></div>`;
    }).join('')}</div>` : '<div class="empty"><h2>No sources match</h2><p>Try another folder or kind, or add one.</p></div>';
  }

  $('#add-source').onclick = () => editSource();
  $$('[data-folder]').forEach((f) => { f.onclick = () => { projectId = projectId === Number(f.dataset.folder) ? '' : Number(f.dataset.folder); draw(); }; });
  $$('[data-kind]').forEach((c) => { c.onclick = () => { kind = c.dataset.kind; draw(); }; });
  $('#source-search').oninput = (event) => { search = event.target.value; draw(); };
  hookAttachments(view);
  draw();
}
