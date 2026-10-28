// ===================================================================
// editors.js - the "add" and "edit" forms. Pages call these.
// Each form saves through db.js, then re-draws the current page.
// ===================================================================

const options = (rows, label = (r) => r.title, hint) => rows.map((r) => ({ value: r.id, label: label(r), hint: hint ? hint(r) : '' }));
const words = (list) => list.map((w) => ({ value: w, label: capital(w) }));

async function editProject(project = null) {
  if (!(await requireEditor())) return;
  const teamIds = project ? data.project_researcher.filter((l) => l.project_id === project.id).map((l) => l.researcher_id) : [];
  const methodIds = project ? data.project_method.filter((l) => l.project_id === project.id).map((l) => l.method_id) : [];
  const saved = await openForm({
    title: project ? 'Edit project' : 'New research project',
    submitLabel: project ? 'Save changes' : 'Create project',
    values: project ? { ...project, team_ids: teamIds, method_ids: methodIds } : { status: 'active', start_date: today(), team_ids: [], method_ids: [] },
    fields: [
      { name: 'title', label: 'Project title', required: true, min: 3 },
      { name: 'research_objective', label: 'Research objective', type: 'textarea', rows: 3, required: true, min: 10, help: 'What should this research help the team understand or decide?' },
      { name: 'description', label: 'Description', type: 'textarea', rows: 2 },
      { name: 'status', label: 'Status', type: 'select', required: true, half: true, options: words(['planned', 'active', 'paused', 'completed']) },
      { name: 'start_date', label: 'Start date', type: 'date', required: true, half: true },
      { name: 'end_date', label: 'End date', type: 'date', half: true, check: (v, all) => (v && all.start_date && v < all.start_date ? 'Must be on or after the start date.' : '') },
      { name: 'team_ids', label: 'Team', type: 'checkboxes', options: options(data.researcher, (r) => r.full_name, (r) => r.role_title) },
      { name: 'method_ids', label: 'Methods', type: 'checkboxes', options: options(data.research_method, (m) => m.name) },
    ],
    onSave: (values) => saveProject(project?.id, values),
  });
  if (saved) { toast(project ? 'Project saved.' : 'Project created.'); project ? render() : go(`/projects/${saved.id}`); }
}

async function toggleArchive(project) {
  if (!(await requireEditor())) return;
  const archiving = !project.archived_at;
  const ok = await confirmBox(
    archiving ? 'Archive this project?' : 'Restore this project?',
    archiving ? 'Its records stay readable, but it is hidden from lists and accepts no new work until restored.' : 'It will appear in lists again and accept new work.',
    archiving ? 'Archive' : 'Restore');
  if (!ok) return;
  try { await setArchived(project.id, archiving); toast(archiving ? 'Project archived.' : 'Project restored.'); render(); }
  catch (e) { toast(e.message, 'error'); }
}

async function editQuestion(projectId, question = null) {
  if (!(await requireEditor())) return;
  const saved = await openForm({
    title: question ? 'Edit research question' : 'Add a research question',
    values: question || {},
    fields: [{ name: 'question_text', label: 'Question', type: 'textarea', rows: 3, required: true, min: 5 }],
    onSave: (v) => saveSimple('research_question', question?.id, { ...v, project_id: projectId }),
  });
  if (saved) { toast('Question saved.'); render(); }
}

async function editSession(session = null, projectId = null) {
  if (!(await requireEditor())) return;
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
      { name: 'project_id', label: 'Project', type: 'select', number: true, required: true, disabled: !!session, options: options(activeProjects()) },
      { name: 'title', label: 'Session title', required: true, min: 3 },
      { name: 'session_date', label: 'Date', type: 'date', required: true, half: true },
      { name: 'duration_minutes', label: 'Minutes', type: 'number', half: true, check: (v) => (v != null && (v < 1 || v > 600) ? 'Between 1 and 600.' : '') },
      { name: 'method_id', label: 'Method', type: 'select', number: true, required: true, half: true, options: options(data.research_method, (m) => m.name) },
      { name: 'researcher_id', label: 'Facilitator', type: 'select', number: true, required: true, half: true, options: options(data.researcher, (r) => r.full_name) },
      { name: 'status', label: 'Status', type: 'select', required: true, options: words(['planned', 'completed', 'cancelled']) },
      { name: 'participant_ids', label: 'Participants', type: 'checkboxes', options: options(data.participant, (p) => p.participant_code, (p) => p.age_band) },
      { name: 'question_ids', label: 'Questions covered', type: 'checkboxes', dependsOn: ['project_id'], emptyText: 'Pick a project that has research questions.',
        options: (v) => options(data.research_question.filter((q) => q.project_id === v.project_id), (q) => q.question_text) },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
    ],
    onSave: (v) => saveSession(session?.id, session ? { ...v, project_id: session.project_id } : v),
  });
  if (saved) { toast(session ? 'Session saved.' : 'Session created.'); session ? render() : go(`/sessions/${saved.id}`); }
}

async function editParticipant(participant = null) {
  if (!(await requireEditor())) return;
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
  if (!(await requireEditor())) return;
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
  });
  if (saved) { toast(`${stage.label} saved.`); record ? render() : go(`/record/${type}/${saved.id}`); }
}

async function editSimple(table, row = null) {
  if (!(await requireEditor())) return;
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
  });
  if (saved) { toast('Saved.'); render(); }
}

// The "+ New" button in the top bar.
function openNewMenu() {
  const study = [
    ['project', 'folder-kanban', 'Project', 'Start a new study'],
    ['session', 'calendar-days', 'Session', 'An interview or test'],
    ['participant', 'user-plus', 'Participant', 'Anonymous, by code'],
  ];
  const hints = { observation: 'What someone did or said', finding: 'A pattern across sessions', insight: 'Why the pattern matters', recommendation: 'What should change', design_decision: 'What the team decided' };
  const evidence = STAGES.map((s) => [s.type, 'file-text', s.label, hints[s.type]]);
  const item = ([key, ic, label, hint]) => `
      <button class="new-item ${STAGE[key] ? `stage-${key}` : ''}" data-new="${key}">
        <span class="new-icon">${icon(ic)}</span><span><strong>${esc(label)}</strong><small>${esc(hint)}</small></span>
      </button>`;
  const { dialog, close } = openModal({
    title: 'Add to TRACE',
    wide: true,
    body: `<div class="new-menu">
      <p class="eyebrow new-menu-label">Study</p>${study.map(item).join('')}
      <p class="eyebrow new-menu-label">Evidence</p>${evidence.map(item).join('')}
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
    else editRecord(key);
  });
}
