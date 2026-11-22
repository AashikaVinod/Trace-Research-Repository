// ===================================================================
// forms.js - every add and edit form, and the sources, notes and pins.
// Forms save through db.js, then redraw the page.
//   Part 1: forms     editProject, editSession, editParticipant,
//                     editQuestion, editRecord (all five evidence steps),
//                     editSimple (team, methods, segments), openNewMenu
//   Part 2: photos    polaroid, sourcesBlock, notesBlock, editSource
//                     (upload), openSourceViewer (photo with numbered pins)
// ===================================================================

function options(rows, label = (row) => row.title, hint = null) {
  return rows.map((row) => ({ value: row.id, label: label(row), hint: hint ? hint(row) : '' }));
}

// Turns a list of words into form options: ['low', 'high'] -> [{ value: 'low', label: 'Low' }, ...]
function words(list) {
  return list.map((word) => ({ value: word, label: capital(word) }));
}

// After deleting something: show a page that still exists.
function afterDelete(message, path = '') {
  toast(message);
  if (path && location.hash !== `#${path}`) go(path); else render();
}

async function editProject(project = null) {
  const teamIds = project ? data.project_researcher.filter((l) => l.project_id === project.id).map((l) => l.researcher_id) : [];
  const methodIds = project ? data.project_method.filter((l) => l.project_id === project.id).map((l) => l.method_id) : [];
  const saved = await openForm({
    title: project ? 'Edit project' : 'New research project',
    submitLabel: project ? 'Save changes' : 'Create project',
    values: project ? { ...project, team_ids: teamIds, method_ids: methodIds } : { status: 'active', start_date: today(), team_ids: [], method_ids: [] },
    fields: [
      { type: 'section', label: 'About the project' },
      { name: 'title', label: 'Project title', required: true, min: 3 },
      { name: 'research_objective', label: 'Research objective', type: 'textarea', rows: 3, required: true, min: 10, help: 'What should this research help the team understand or decide?' },
      { name: 'description', label: 'Description', type: 'textarea', rows: 2 },
      { type: 'section', label: 'Timing' },
      { name: 'status', label: 'Status', type: 'select', required: true, half: true, options: words(['planned', 'active', 'paused', 'completed']) },
      { name: 'start_date', label: 'Start date', type: 'date', required: true, half: true },
      { name: 'end_date', label: 'End date', type: 'date', half: true, check: (v, all) => (v && all.start_date && v < all.start_date ? 'Must be on or after the start date.' : '') },
      { type: 'section', label: 'People and methods' },
      { name: 'team_ids', label: 'Team', type: 'checkboxes', options: options(data.researcher, (r) => r.full_name, (r) => r.role_title) },
      { name: 'method_ids', label: 'Methods', type: 'checkboxes', options: options(data.research_method, (m) => m.name) },
    ],
    onSave: (values) => saveProject(project?.id, values),
    onDelete: project ? async () => { await deleteRecord('research_project', project.id); afterDelete('Project deleted.', '/projects'); } : null,
    deleteLabel: 'project',
  });
  if (saved) { toast(project ? 'Project saved.' : 'Project created.'); project ? render() : go(`/projects/${saved.id}`); }
}

async function toggleArchive(project) {
  const archiving = !project.archived_at;
  const ok = await confirmBox(
    archiving ? 'Archive this project?' : 'Restore this project?',
    archiving ? 'Its records stay readable, but it is hidden from lists and accepts no new work until restored.' : 'It will appear in lists again and accept new work.',
    archiving ? 'Archive' : 'Restore');
  if (!ok) return;
  try {
    await setArchived(project.id, archiving);
    render();
    // Undo gives people a way back (HCI: user control and freedom).
    toast(archiving ? 'Project archived.' : 'Project restored.', 'success', {
      label: 'Undo',
      run: async () => { await setArchived(project.id, !archiving); toast('Change undone.'); render(); },
    });
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function editQuestion(projectId, question = null) {
  const saved = await openForm({
    title: question ? 'Edit research question' : 'Add a research question',
    values: question || {},
    fields: [{ name: 'question_text', label: 'Question', type: 'textarea', rows: 3, required: true, min: 5 }],
    onSave: (v) => saveSimple('research_question', question?.id, { ...v, project_id: projectId }),
    onDelete: question ? async () => { await deleteRecord('research_question', question.id); afterDelete('Question deleted.'); } : null,
    deleteLabel: 'question',
  });
  if (saved) { toast('Question saved.'); render(); }
}

async function editSession(session = null, projectId = null) {
  const values = session
    ? { ...session,
      participant_ids: data.session_participant.filter((l) => l.session_id === session.id).map((l) => l.participant_id),
      question_ids: data.session_question.filter((l) => l.session_id === session.id).map((l) => l.question_id) }
    : { project_id: projectId, status: 'completed', session_date: today(), duration_minutes: 45, participant_ids: [], question_ids: [] };
  const saved = await openForm({
    title: session ? 'Edit session' : 'New research session',
    submitLabel: session ? 'Save changes' : 'Create session',
    values,
    fields: [
      { type: 'section', label: 'The session' },
      { name: 'project_id', label: 'Project', type: 'select', number: true, required: true, disabled: !!session, options: options(activeProjects()) },
      { name: 'title', label: 'Session title', required: true, min: 3 },
      { name: 'session_date', label: 'Date', type: 'date', required: true, half: true },
      { name: 'duration_minutes', label: 'Minutes', type: 'number', half: true, check: (v) => (v != null && (v < 1 || v > 600) ? 'Between 1 and 600.' : '') },
      { type: 'section', label: 'How and who' },
      { name: 'method_id', label: 'Method', type: 'select', number: true, required: true, half: true, options: options(data.research_method, (m) => m.name) },
      { name: 'researcher_id', label: 'Facilitator', type: 'select', number: true, required: true, half: true, options: options(data.researcher, (r) => r.full_name) },
      { name: 'status', label: 'Status', type: 'select', required: true, options: words(['planned', 'completed', 'cancelled']) },
      { type: 'section', label: 'Participants and questions' },
      { name: 'participant_ids', label: 'Participants', type: 'checkboxes', options: options(data.participant, (p) => p.participant_code, (p) => p.age_band) },
      { name: 'question_ids', label: 'Questions covered', type: 'checkboxes', dependsOn: ['project_id'], emptyText: 'Pick a project that has research questions.',
        options: (v) => options(data.research_question.filter((q) => q.project_id === v.project_id), (q) => q.question_text) },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
    ],
    onSave: (v) => saveSession(session?.id, session ? { ...v, project_id: session.project_id } : v),
    onDelete: session ? async () => { await deleteRecord('research_session', session.id); afterDelete('Session deleted.', '/sessions'); } : null,
    deleteLabel: 'session',
  });
  if (saved) { toast(session ? 'Session saved.' : 'Session created.'); session ? render() : go(`/sessions/${saved.id}`); }
}

async function editParticipant(participant = null) {
  const nextNumber = Math.max(0, ...data.participant.map((p) => Number(p.participant_code.slice(2)) || 0)) + 1;
  const saved = await openForm({
    title: participant ? `Edit ${participant.participant_code}` : 'New participant',
    values: participant
      ? { ...participant, segment_ids: data.participant_segment.filter((l) => l.participant_id === participant.id).map((l) => l.segment_id) }
      : { participant_code: `P-${String(nextNumber).padStart(2, '0')}`, segment_ids: [] },
    fields: [
      { name: 'participant_code', label: 'Participant code', required: true, half: true, pattern: /^P-\d{2,3}$/, patternMessage: 'Use the format P-01.' },
      { name: 'age_band', label: 'Age band', type: 'select', half: true, options: ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'].map((a) => ({ value: a, label: a })) },
      { name: 'segment_ids', label: 'Segments', type: 'checkboxes', options: options(data.segment, (s) => s.name) },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2, help: 'Practical notes only. Never enter names or contact details.' },
    ],
    onSave: (v) => saveParticipant(participant?.id, v),
    onDelete: participant ? async () => { await deleteRecord('participant', participant.id); afterDelete('Participant deleted.'); } : null,
    deleteLabel: 'participant',
  });
  if (saved) { toast('Participant saved.'); render(); }
}

const RECORD_TEXT = {
  observation: { body: 'What happened', up: '' },
  finding: { body: 'Describe the pattern', up: 'Supporting observations' },
  insight: { body: 'Why it matters', up: 'Based on findings' },
  recommendation: { body: 'What should change', up: 'Based on insights' },
  design_decision: { body: 'Rationale', up: 'Implements recommendations' },
};

// Add or edit any of the five evidence records.
// preset: { projectId, sessionId, upIds } fills in a new record.
async function editRecord(type, record = null, preset = {}) {
  const stage = STAGE[type];
  const prev = previousStage(type);
  const fields = [];
  if (type === 'observation') {
    const sessions = data.research_session.filter((s) => (record ? s.project_id === record.project_id : !byId('research_project', s.project_id)?.archived_at));
    fields.push({ name: 'session_id', label: 'Session', type: 'select', number: true, required: true,
      options: options(sessions, (s) => `${s.title} (${byId('research_project', s.project_id)?.title})`) });
  } else {
    fields.push({ name: 'project_id', label: 'Project', type: 'select', number: true, required: true, disabled: !!record,
      options: options(record ? data.research_project : activeProjects()) });
  }
  fields.push({ name: 'title', label: 'Title', required: true, min: 3 });
  fields.push({ name: 'description', label: RECORD_TEXT[type].body, type: 'textarea', rows: 4, required: true, min: 3 });
  if (type === 'observation') fields.push({ name: 'sentiment', label: 'Sentiment', type: 'select', required: true, options: words(['positive', 'neutral', 'negative']) });
  if (type === 'finding') fields.push({ name: 'confidence', label: 'Confidence', type: 'select', required: true, options: words(['low', 'medium', 'high']) });
  if (type === 'insight') fields.push({ name: 'impact', label: 'Impact', type: 'select', required: true, options: words(['low', 'medium', 'high']) });
  if (type === 'recommendation') {
    fields.push({ name: 'priority', label: 'Priority', type: 'select', required: true, half: true, options: words(['low', 'medium', 'high']) });
    fields.push({ name: 'status', label: 'Status', type: 'select', required: true, half: true, options: words(['proposed', 'accepted', 'rejected']) });
  }
  if (type === 'design_decision') {
    fields.push({ name: 'status', label: 'Status', type: 'select', required: true, half: true, options: words(['proposed', 'approved', 'implemented', 'reversed']) });
    fields.push({ name: 'decided_on', label: 'Decided on', type: 'date', half: true });
  }
  if (prev) {
    fields.push({ type: 'section', label: `Evidence: link it to step ${prev.step}` });
    fields.push({ name: 'up_ids', label: RECORD_TEXT[type].up, type: 'checkboxes', dependsOn: ['project_id'],
      emptyText: `Choose a project that has ${prev.plural.toLowerCase()}.`,
      options: (v) => options(data[prev.type].filter((r) => r.project_id === v.project_id), (r) => r.title, (r) => shorten(r.description, 70)) });
  }
  const values = record
    ? { ...record, up_ids: upstream(type, record.id).map((r) => r.id) }
    : { project_id: preset.projectId ?? null, session_id: preset.sessionId ?? null, up_ids: preset.upIds || [],
      sentiment: 'neutral', confidence: 'medium', impact: 'medium', priority: 'medium', status: 'proposed' };
  const saved = await openForm({
    title: record ? `Edit ${stage.label.toLowerCase()}` : `New ${stage.label.toLowerCase()}`,
    submitLabel: record ? 'Save changes' : `Add ${stage.label.toLowerCase()}`,
    values,
    fields,
    onSave: (v) => saveRecord(type, record?.id, v, prev ? v.up_ids : undefined),
    onDelete: record ? async () => { await deleteRecord(type, record.id); afterDelete(`${stage.label} deleted.`, `/library?type=${type}`); } : null,
    deleteLabel: stage.label.toLowerCase(),
  });
  if (saved) { toast(`${stage.label} saved.`); record ? render() : go(`/record/${type}/${saved.id}`); }
}

async function editSimple(table, row = null) {
  const setup = {
    researcher: { noun: 'team member', fields: [
      { name: 'full_name', label: 'Full name', required: true, min: 2 },
      { name: 'email', label: 'Email', type: 'email', required: true, pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, patternMessage: 'Enter a valid email.' },
      { name: 'role_title', label: 'Role' }] },
    research_method: { noun: 'method', fields: [{ name: 'name', label: 'Name', required: true, min: 2 }, { name: 'description', label: 'Description', type: 'textarea', rows: 2 }] },
    segment: { noun: 'segment', fields: [{ name: 'name', label: 'Name', required: true, min: 2 }, { name: 'description', label: 'Description', type: 'textarea', rows: 2 }] },
  }[table];
  const saved = await openForm({
    title: row ? `Edit ${setup.noun}` : `New ${setup.noun}`,
    values: row || {},
    fields: setup.fields,
    onSave: (v) => saveSimple(table, row?.id, v),
    onDelete: row ? async () => { await deleteRecord(table, row.id); afterDelete('Deleted.'); } : null,
    deleteLabel: setup.noun,
  });
  if (saved) { toast('Saved.'); render(); }
}

// The "+ New" button in the top bar.
function openNewMenu() {
  const study = [
    ['project', 'folder-kanban', 'Project', 'Start a new study'],
    ['session', 'calendar-days', 'Session', 'An interview or test'],
    ['participant', 'user-plus', 'Participant', 'Anonymous, by code'],
    ['source', 'upload', 'Source', 'A photo, sketch or document'],
  ];
  const hints = { observation: 'What someone did or said', finding: 'A pattern across sessions', insight: 'Why the pattern matters', recommendation: 'What should change', design_decision: 'What the team decided' };
  const evidence = STAGES.map((s) => [s.type, 'file-text', `${s.step}. ${s.label}`, hints[s.type]]);
  const item = ([key, ic, label, hint]) => `
      <button class="new-item ${STAGE[key] ? `stage-${key}` : ''}" data-new="${key}">
        <span class="new-icon">${icon(ic)}</span><span><strong>${esc(label)}</strong><small>${esc(hint)}</small></span>
      </button>`;
  const { dialog, close } = openModal({
    title: 'Add to TRACE',
    wide: true,
    body: `<div class="new-menu">
      <p class="label-sm">Study</p>${study.map(item).join('')}
      <p class="label-sm">Evidence, in order</p>${evidence.map(item).join('')}
    </div>`,
  });
  dialog.addEventListener('click', (e) => {
    const button = e.target.closest('[data-new]');
    if (!button) return;
    close();
    const key = button.dataset.new;
    if (key === 'project') editProject();
    else if (key === 'session') editSession();
    else if (key === 'participant') editParticipant();
    else if (key === 'source') editSource();
    else editRecord(key);
  });
}

// ===================================================================
// Part 2: sources (photos), notes, and numbered pins on photos.
// Used on session and record pages and on the Sources page.
// ===================================================================

const SOURCE_KINDS = ['photo', 'whiteboard', 'sketch', 'notes', 'document', 'screenshot'];

// A source as a small polaroid. Clicking it opens the viewer.
function polaroid(source) {
  const tilt = ((source.id % 5) - 2) * 0.7; // a slightly different angle each, like prints on a desk
  return `<button class="polaroid" data-open-source="${source.id}" style="--tilt:${tilt}deg">
    <img src="${esc(sourceUrl(source))}" alt="" loading="lazy">
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
  if (add) editSource(null, add.dataset.addSource);
  const remove = event.target.closest('[data-delete-note]');
  if (remove) {
    confirmBox('Delete this note?', 'This cannot be undone.', 'Delete').then(async (ok) => {
      if (!ok) return;
      try {
        await deleteRecord('note', Number(remove.dataset.deleteNote));
        toast('Note deleted.');
        render();
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  }
});

// Wires up the note forms inside `root` (call after drawing a page).
function hookAttachments(root) {
  for (const form of $$('[data-note-form]', root)) {
    form.onsubmit = async (event) => {
      event.preventDefault();
      const [type, id] = form.dataset.noteForm.split(':');
      const body = $('textarea', form).value.trim();
      const error = $('.error', form);
      if (body.length < 2) { error.textContent = 'Write a note first.'; error.hidden = false; $('textarea', form).focus(); return; }
      try {
        await saveNote(type, Number(id), { body, author_id: Number($('select', form).value) });
        toast('Note added.');
        render();
      } catch (problem) {
        error.textContent = problem.message;
        error.hidden = false;
      }
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

// Add a source (a photo upload) or edit its details.
async function editSource(source = null, attachTo = '') {
  const owner = source ? ownerOf(source) : null;
  const saved = await openForm({
    title: source ? 'Edit source' : 'Add a source',
    submitLabel: source ? 'Save changes' : 'Add source',
    values: source ? { ...source, attach: `${owner.type}:${owner.id}` } : { kind: 'whiteboard', attach: attachTo || null },
    fields: [
      { type: 'section', label: 'The file' },
      ...(source ? [] : [{ name: 'file', label: 'Photo or scan', type: 'file', required: true, help: 'A photo of a whiteboard, a sketch, notes or a screenshot. It is resized, then uploaded to your Supabase storage.' }]),
      { name: 'title', label: 'Title', required: true, min: 3 },
      { name: 'kind', label: 'Kind', type: 'select', required: true, options: words(SOURCE_KINDS) },
      { name: 'caption', label: 'Caption', type: 'textarea', rows: 2, help: 'What does it show, and why does it matter?' },
      { type: 'section', label: 'Where it belongs' },
      { name: 'attach', label: 'Attach to', type: 'select', required: true, options: attachOptions() },
    ],
    onSave: async (values) => {
      let uploaded = null;
      if (values.file) {
        uploaded = await uploadPhoto(await readImage(values.file), values.title);
        values.file_url = uploaded;
      }
      try {
        return await saveSource(source ? source.id : null, values);
      } catch (error) {
        if (uploaded) await removeFiles([uploaded]); // don't leave an orphan file behind
        throw error;
      }
    },
    onDelete: source ? async () => { await deleteRecord('source', source.id); toast('Source deleted.'); render(); } : null,
    deleteLabel: 'source',
  });
  if (saved) { toast(source ? 'Source saved.' : 'Source added.'); render(); if (!source && saved.id) openSourceViewer(saved.id); }
}

// The viewer: the image with numbered pins, and the notes beside it.
// Click anywhere on the image to pin a new note there.
function openSourceViewer(sourceId) {
  const { dialog, close } = openModal({ title: byId('source', sourceId).title, wide: true, body: '<div id="viewer"></div>' });
  dialog.classList.add('modal-viewer');
  let draft = null; // where a new pin is being placed

  function draw() {
    const source = byId('source', sourceId);
    const owner = ownerOf(source);
    const pins = pinsFor(sourceId);
    $('#viewer', dialog).innerHTML = `<div class="viewer">
      <div class="viewer-image" id="viewer-image" title="Click to pin a note">
        <img src="${esc(sourceUrl(source))}" alt="${esc(source.caption || source.title)}">
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
        <div class="viewer-actions"><button class="btn btn-small" id="edit-source">${icon('pencil', 14)} Edit details</button></div>
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
      $('#pin-form', dialog).onsubmit = async (event) => {
        event.preventDefault();
        const body = $('#pin-body', dialog).value.trim();
        if (body.length < 2) { $('#pin-body', dialog).focus(); return; }
        try {
          await savePin(sourceId, { x: Number(draft.x.toFixed(4)), y: Number(draft.y.toFixed(4)), body, author_id: Number($('#pin-author', dialog).value) });
          draft = null;
          toast('Note pinned.');
          draw();
          render();
        } catch (error) {
          toast(error.message, 'error');
        }
      };
    }
    $$('[data-delete-pin]', dialog).forEach((button) => {
      button.onclick = async () => {
        try {
          await deleteRecord('annotation', Number(button.dataset.deletePin));
          draw();
          render();
        } catch (error) {
          toast(error.message, 'error');
        }
      };
    });
    $('#edit-source', dialog).onclick = () => editSource(byId('source', sourceId)).then(() => (byId('source', sourceId) ? draw() : close()));
  }
  draw();
}
