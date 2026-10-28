// ===================================================================
// attachments.js - sources (photos, sketches, documents), notes, and
// numbered pins on images. Used on record, session and flow pages.
// ===================================================================

const SOURCE_KINDS = ['photo', 'whiteboard', 'sketch', 'notes', 'document', 'screenshot'];

// A source as a small polaroid. Clicking it opens the viewer.
function polaroid(source) {
  const tilt = ((source.id % 5) - 2) * 0.7; // a slightly different angle each, like prints on a desk
  return `<button class="polaroid" data-open-source="${source.id}" style="--tilt:${tilt}deg">
    <img src="${esc(source.file_url)}" alt="" loading="lazy">
    <span class="polaroid-title">${esc(source.title)}</span>
    <span class="polaroid-meta">${esc(capital(source.kind))}${pinsFor(source.id).length ? `, ${plural(pinsFor(source.id).length, 'pin')}` : ''}</span>
  </button>`;
}

// The "Sources" card for a session or record.
function sourcesBlock(type, id) {
  const sources = sourcesFor(type, id);
  return `<section class="card">
    <div class="card-top"><div><h3>Sources (${sources.length})</h3><p class="card-sub">Photos, sketches and documents behind this</p></div>
      <button class="btn btn-small" data-add-source="${type}:${id}">${icon('upload', 15)} Add source</button></div>
    ${sources.length ? `<div class="polaroids">${sources.map(polaroid).join('')}</div>`
      : '<p class="quiet">No sources yet. Add a whiteboard photo, a sketch or your notes.</p>'}
  </section>`;
}

// The "Notes" card: a short thread plus a form to add one.
function notesBlock(type, id) {
  const notes = notesFor(type, id);
  return `<section class="card">
    <div class="card-top"><h3>Notes (${notes.length})</h3></div>
    <ul class="notes">${notes.map((n) => {
      const author = byId('researcher', n.author_id);
      return `<li>${avatar(author.full_name, 30)}<div><p class="note-head"><strong>${esc(author.full_name)}</strong><span>${formatDate(n.created_at)}</span>
        <button class="icon-btn" data-delete-note="${n.id}" aria-label="Delete note">${icon('trash', 14)}</button></p><p>${esc(n.body)}</p></div></li>`;
    }).join('')}</ul>
    <form class="note-form" data-note-form="${type}:${id}">
      <label class="sr" for="note-${type}-${id}">Add a note</label>
      <textarea class="input" id="note-${type}-${id}" rows="2" placeholder="Add a note for the team…"></textarea>
      <div class="note-form-row">
        <label class="sr" for="author-${type}-${id}">Written by</label>
        <select class="input" id="author-${type}-${id}">${data.researcher.map((r) => `<option value="${r.id}">${esc(r.full_name)}</option>`).join('')}</select>
        <button class="btn btn-dark btn-small" type="submit">Add note</button>
      </div>
      <p class="error" hidden></p>
    </form>
  </section>`;
}

// One click listener for the whole page, added once: it handles every
// "open source", "add source" and "delete note" button, wherever it is.
document.addEventListener('click', (event) => {
  if (event.target.closest('dialog') && !event.target.closest('[data-open-source]')) return;
  const open = event.target.closest('[data-open-source]');
  if (open) openSourceViewer(Number(open.dataset.openSource));
  const add = event.target.closest('[data-add-source]');
  if (add) editSource(add.dataset.addSource);
  const remove = event.target.closest('[data-delete-note]');
  if (remove) {
    confirmBox('Delete this note?', 'The note will be removed for everyone.', 'Delete').then((ok) => {
      if (ok) { deleteRow('note', Number(remove.dataset.deleteNote)); toast('Note deleted.'); render(); }
    });
  }
});

// Wires up the note forms inside `root` (call after drawing a page).
function hookAttachments(root) {
  for (const form of $$('[data-note-form]', root)) {
    form.onsubmit = (event) => {
      event.preventDefault();
      const [type, id] = form.dataset.noteForm.split(':');
      const body = $('textarea', form).value.trim();
      const error = $('.error', form);
      if (body.length < 2) { error.textContent = 'Write a note first.'; error.hidden = false; $('textarea', form).focus(); return; }
      saveNote(type, Number(id), { body, author_id: Number($('select', form).value) });
      toast('Note added.');
      render();
    };
  }
}

// Things a source can be attached to, as form options ("Finding: ...").
function attachOptions() {
  const list = [];
  for (const s of data.research_session.filter((s) => !byId('research_project', s.project_id).archived_at)) {
    list.push({ value: `research_session:${s.id}`, label: `Session: ${s.title}` });
  }
  for (const stage of STAGES) {
    for (const r of data[stage.type].filter((r) => !byId('research_project', r.project_id).archived_at)) {
      list.push({ value: `${stage.type}:${r.id}`, label: `${stage.label}: ${r.title}` });
    }
  }
  return list;
}

// Add a source: a photo or scan, attached to one session or record.
async function editSource(attachTo = '') {
  const saved = await openForm({
    title: 'Add a source',
    submitLabel: 'Add source',
    values: { kind: 'whiteboard', attach: attachTo || null },
    fields: [
      { name: 'file', label: 'Photo or scan', type: 'file', required: true, help: 'A whiteboard, a sketch, notes or a screenshot. It is resized before saving.' },
      { name: 'title', label: 'Title', required: true, min: 3 },
      { name: 'kind', label: 'Kind', type: 'select', required: true, options: words(SOURCE_KINDS) },
      { name: 'caption', label: 'Caption', type: 'textarea', rows: 2, help: 'What does it show, and why does it matter?' },
      { name: 'attach', label: 'Attach to', type: 'select', required: true, options: attachOptions() },
    ],
    onSave: async (values) => {
      values.file_url = await readImage(values.file);
      return saveSource(values);
    },
  });
  if (saved) { toast('Source added.'); render(); openSourceViewer(saved.id); }
}

// The viewer: the image with numbered pins, and the notes beside it.
// Click anywhere on the image to pin a new note there.
function openSourceViewer(sourceId) {
  const { dialog } = openModal({ title: byId('source', sourceId).title, wide: true, body: '<div id="viewer"></div>' });
  dialog.classList.add('modal-viewer');
  let draft = null; // where a new pin is being placed

  function draw() {
    const source = byId('source', sourceId);
    const owner = ownerOf(source);
    const pins = pinsFor(sourceId);
    $('#viewer', dialog).innerHTML = `<div class="viewer">
      <div class="viewer-image" id="viewer-image" title="Click to pin a note">
        <img src="${esc(source.file_url)}" alt="${esc(source.caption || source.title)}">
        ${pins.map((p, i) => `<span class="pin" style="left:${p.x * 100}%;top:${p.y * 100}%" data-pin-index="${i + 1}">${i + 1}</span>`).join('')}
        ${draft ? `<span class="pin pin-draft" style="left:${draft.x * 100}%;top:${draft.y * 100}%">+</span>` : ''}
      </div>
      <aside class="viewer-side">
        <div class="pills">${pill(source.kind, 'grey')}${source.is_illustration ? pill('illustration', 'purple') : pill('uploaded', 'green')}</div>
        ${source.caption ? `<p class="viewer-caption">${esc(source.caption)}</p>` : ''}
        <dl class="viewer-meta">
          <div><dt>Attached to</dt><dd><a class="strong-link" href="${owner.href}">${esc(owner.label)}: ${esc(owner.title)}</a></dd></div>
          <div><dt>Added</dt><dd>${formatDate(source.created_at)}</dd></div>
        </dl>
        <h3 class="viewer-h">Pinned notes (${pins.length})</h3>
        <ol class="pin-list">${pins.map((p, i) => {
          const author = byId('researcher', p.author_id);
          return `<li><span class="pin pin-static">${i + 1}</span><div><p>${esc(p.body)}</p><small>${esc(author.full_name)}, ${formatDate(p.created_at)}</small></div>
            <button class="icon-btn" data-delete-pin="${p.id}" aria-label="Delete pin ${i + 1}">${icon('trash', 14)}</button></li>`;
        }).join('') || '<li class="quiet">No pins yet.</li>'}</ol>
        ${draft ? `<form class="pin-form" id="pin-form">
            <label class="label" for="pin-body">Note for this spot</label>
            <textarea class="input" id="pin-body" rows="3"></textarea>
            <label class="label" for="pin-author">Written by</label>
            <select class="input" id="pin-author">${data.researcher.map((r) => `<option value="${r.id}">${esc(r.full_name)}</option>`).join('')}</select>
            <div class="note-form-row"><button class="btn btn-small" type="button" id="pin-cancel">Cancel</button><button class="btn btn-dark btn-small" type="submit">Pin note</button></div>
          </form>` : `<p class="help">${icon('pin', 14)} Click anywhere on the image to pin a note.</p>`}
      </aside>
    </div>`;

    $('#viewer-image', dialog).onclick = (event) => {
      const box = event.currentTarget.getBoundingClientRect();
      draft = { x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)), y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)) };
      draw();
      $('#pin-body', dialog).focus();
    };
    if ($('#pin-form', dialog)) {
      $('#pin-cancel', dialog).onclick = () => { draft = null; draw(); };
      $('#pin-form', dialog).onsubmit = (event) => {
        event.preventDefault();
        const body = $('#pin-body', dialog).value.trim();
        if (body.length < 2) { $('#pin-body', dialog).focus(); return; }
        savePin(sourceId, { x: Number(draft.x.toFixed(4)), y: Number(draft.y.toFixed(4)), body, author_id: Number($('#pin-author', dialog).value) });
        draft = null;
        toast('Note pinned.');
        draw();
        render();
      };
    }
    $$('[data-delete-pin]', dialog).forEach((button) => {
      button.onclick = () => { deleteRow('annotation', Number(button.dataset.deletePin)); draw(); render(); };
    });
  }
  draw();
}
