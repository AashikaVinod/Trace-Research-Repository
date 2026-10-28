// Research sessions: list, detail with observations, and session forms.
import * as data from '../data-access.js';
import { VOCAB } from '../rules.js';
import { replaceQuery } from '../router.js';
import {
  h, icon, button, linkButton, loadingState, errorState, emptyState, formatDate, excerpt,
  statusPill, toneFor, plural, recordHref, today, toast,
} from '../ui.js';
import { openForm, vocabOptions, toOptions } from '../forms.js';
import { openRecordForm } from './library.js';

export async function openSessionForm(ctx, { session = null, projectId = null, participantIds = [], questionIds = [] } = {}) {
  let lk;
  try { lk = await data.fetchLookups(); } catch (e) { toast(e.message, { tone: 'error' }); return; }
  const projects = lk.projects.filter((p) => !p.archived_at || p.id === session?.project_id);
  const result = await openForm({
    title: session ? 'Edit session' : 'New session',
    table: 'research_session',
    size: 'lg',
    initial: session
      ? { ...session, participant_ids: participantIds, question_ids: questionIds }
      : { project_id: projectId, status: 'planned', session_date: today(), duration_minutes: 45, participant_ids: [], question_ids: [] },
    submitLabel: session ? 'Save changes' : 'Create session',
    successMessage: session ? 'Session saved.' : 'Session created.',
    fields: [
      { name: 'project_id', label: 'Project', type: 'select', numeric: true, disabled: !!session, options: toOptions(projects),
        help: session ? "A session's project can't change after it is created." : null },
      { name: 'title', label: 'Title', type: 'text', placeholder: 'e.g. Checkout usability test C' },
      { name: 'session_date', label: 'Date', type: 'date', half: true },
      { name: 'duration_minutes', label: 'Duration (minutes)', type: 'number', min: 1, max: 600, step: 1, half: true },
      { name: 'method_id', label: 'Method', type: 'select', numeric: true, half: true, options: toOptions(lk.methods, (m) => m.name) },
      { name: 'researcher_id', label: 'Facilitator', type: 'select', numeric: true, half: true, options: toOptions(lk.researchers, (r) => r.full_name) },
      { name: 'status', label: 'Status', type: 'select', options: vocabOptions(VOCAB.session_status) },
      { name: 'participant_ids', label: 'Participants', type: 'multi', options: toOptions(lk.participants, (p) => p.participant_code, (p) => p.age_band || ''),
        emptyText: 'Add participants on the Participants page first.' },
      { name: 'question_ids', label: 'Research questions covered', type: 'multi', dependsOn: ['project_id'],
        options: (v) => toOptions(lk.questions.filter((q) => q.project_id === v.project_id), (q) => q.question_text),
        emptyText: 'The selected project has no research questions yet.' },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 3 },
    ],
    onSubmit: (v) => {
      const { participant_ids: pids, question_ids: qids, ...values } = v;
      return data.saveSession(session?.id ?? null, values, pids, qids);
    },
  });
  if (!result) return;
  const saved = result.partial ? result.saved : result;
  if (!session && saved?.id) ctx.navigate(`/sessions/${saved.id}`); else ctx.refresh();
}

export async function renderList(ctx) {
  ctx.setContext({ title: 'Sessions', crumbs: [{ label: 'Sessions' }] });
  ctx.view.replaceChildren(loadingState('Loading sessions'));
  let d;
  try { d = await data.fetchSessions(); } catch (e) { if (!ctx.stale()) ctx.view.replaceChildren(errorState(e, ctx.refresh)); return; }
  if (ctx.stale()) return;

  const state = {
    q: ctx.query.q || '', project: ctx.query.project ? Number(ctx.query.project) : '',
    status: ctx.query.status || '', participant: ctx.query.participant ? Number(ctx.query.participant) : '',
  };
  const search = h('input', { type: 'search', class: 'input search-input', placeholder: 'Search sessions', 'aria-label': 'Search sessions', value: state.q });
  const project = h('select', { class: 'input', 'aria-label': 'Filter by project' }, h('option', { value: '' }, 'All projects'),
    d.projects.map((p) => h('option', { value: String(p.id) }, p.archived_at ? `${p.title} (archived)` : p.title)));
  project.value = String(state.project);
  const status = h('select', { class: 'input', 'aria-label': 'Filter by status' }, h('option', { value: '' }, 'All statuses'),
    VOCAB.session_status.map((s) => h('option', { value: s }, s[0].toUpperCase() + s.slice(1))));
  status.value = state.status;
  const participant = h('select', { class: 'input', 'aria-label': 'Filter by participant' }, h('option', { value: '' }, 'Any participant'),
    d.participants.map((p) => h('option', { value: String(p.id) }, p.participant_code)));
  participant.value = String(state.participant);
  const count = h('span', { class: 'result-count', 'aria-live': 'polite' });
  const results = h('div', {});

  function draw() {
    const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = d.sessions.filter((s) => (!state.project || s.project_id === state.project)
      && (!state.status || s.status === state.status)
      && (!state.participant || s.participants.some((p) => p.id === state.participant))
      && terms.every((t) => [s.title, s.notes, s.project?.title, s.method?.name, s.researcher?.full_name].join(' ').toLowerCase().includes(t)));
    count.textContent = plural(list.length, 'session');
    replaceQuery(state);
    if (!d.sessions.length) {
      results.replaceChildren(emptyState({ title: 'No sessions yet', body: 'Schedule a session to start collecting observations.', action: button('New session', { icon: 'plus', variant: 'primary', onClick: ctx.guard(() => openSessionForm(ctx)) }) }));
      return;
    }
    if (!list.length) {
      results.replaceChildren(emptyState({ title: 'No sessions match these filters', action: button('Clear filters', { onClick: () => { Object.assign(state, { q: '', project: '', status: '', participant: '' }); search.value = ''; project.value = ''; status.value = ''; participant.value = ''; draw(); } }) }));
      return;
    }
    results.replaceChildren(h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Date'), h('th', { scope: 'col' }, 'Session'), h('th', { scope: 'col', class: 'hide-sm' }, 'Method'),
        h('th', { scope: 'col', class: 'hide-sm' }, 'Participants'), h('th', { scope: 'col', class: 'num' }, 'Observations'), h('th', { scope: 'col' }, 'Status'))),
      h('tbody', {}, list.map((s) => h('tr', {},
        h('td', { style: 'white-space:nowrap' }, formatDate(s.session_date)),
        h('td', {}, h('a', { class: 'row-title', href: `#/sessions/${s.id}` }, s.title), h('p', { class: 'row-sub' }, s.project?.title || '')),
        h('td', { class: 'hide-sm' }, s.method?.name || '—'),
        h('td', { class: 'hide-sm' }, s.participants.length ? s.participants.map((p) => p.participant_code).join(', ') : '—'),
        h('td', { class: 'num' }, String(s.observationCount)),
        h('td', {}, statusPill(s.status, toneFor.status[s.status]))))))));
  }
  search.addEventListener('input', () => { state.q = search.value; draw(); });
  project.addEventListener('change', () => { state.project = project.value ? Number(project.value) : ''; draw(); });
  status.addEventListener('change', () => { state.status = status.value; draw(); });
  participant.addEventListener('change', () => { state.participant = participant.value ? Number(participant.value) : ''; draw(); });

  ctx.view.replaceChildren(
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, 'Sessions'), h('p', { class: 'page-sub' }, 'Interviews, tests and studies. Observations are recorded against the session they came from.')),
      h('div', { class: 'page-actions' }, button('New session', { icon: 'plus', variant: 'primary', onClick: ctx.guard(() => openSessionForm(ctx, { projectId: state.project || null })) }))),
    h('div', { class: 'toolbar' }, search, project, status, participant, count),
    results);
  draw();
}

export async function renderDetail(ctx) {
  const id = Number(ctx.params.id);
  ctx.setContext({ title: 'Session', crumbs: [{ label: 'Sessions', href: '#/sessions' }, { label: 'Loading…' }] });
  ctx.view.replaceChildren(loadingState('Loading session'));
  let d;
  try { d = await data.fetchSessionDetail(id); } catch (e) { if (!ctx.stale()) ctx.view.replaceChildren(errorState(e, ctx.refresh)); return; }
  if (ctx.stale()) return;
  if (!d) {
    ctx.setContext({ title: 'Session not found', crumbs: [{ label: 'Sessions', href: '#/sessions' }, { label: 'Not found' }] });
    ctx.view.replaceChildren(emptyState({ title: 'Session not found', body: `There is no session with id ${ctx.params.id}.`, action: linkButton('Back to sessions', '#/sessions') }));
    return;
  }
  const s = d.session;
  const archived = !!d.project?.archived_at;
  ctx.setContext({ title: s.title, crumbs: [{ label: 'Sessions', href: '#/sessions' }, { label: s.title }] });

  const editSession = () => openSessionForm(ctx, { session: s, participantIds: d.participants.map((p) => p.id), questionIds: d.questions.map((q) => q.id) });
  const addObservation = () => openRecordForm(ctx, 'observation', { sessionId: s.id });

  const head = h('header', { class: 'detail-head' },
    h('div', { class: 'pills' }, statusPill(s.status, toneFor.status[s.status]), d.method ? statusPill(d.method.name) : null),
    h('h1', {}, s.title),
    h('div', { class: 'page-actions' },
      button('Edit session', { icon: 'pencil', onClick: ctx.guard(editSession) }),
      button('Add observation', { icon: 'plus', variant: 'primary', disabled: archived, onClick: ctx.guard(addObservation) })));

  const observations = h('section', { 'aria-labelledby': 'so-h' },
    h('div', { class: 'section-head' }, h('h2', { id: 'so-h' }, `Observations (${d.observations.length})`)),
    d.observations.length ? h('div', { class: 'records' }, d.observations.map((o) => h('article', { class: 'record-row', style: 'grid-template-columns:minmax(0,1fr) auto' },
      h('div', { class: 'record-main' },
        h('a', { class: 'record-title', href: recordHref('observation', o.id) }, o.title),
        h('p', { class: 'record-text' }, o.description),
        h('div', { class: 'record-meta' }, statusPill(o.sentiment, toneFor.sentiment[o.sentiment]),
          o.findingCount ? h('span', {}, `Used in ${plural(o.findingCount, 'finding')}`) : h('span', { class: 'gap-note' }, 'Not used in a finding yet'))),
      h('div', { class: 'record-links' },
        button('', { icon: 'pencil', variant: 'ghost', size: 'sm', 'aria-label': `Edit observation: ${o.title}`, onClick: ctx.guard(() => openRecordForm(ctx, 'observation', { record: { ...o, project_id: s.project_id } })) }),
        h('a', { class: 'small', href: `#/trail/observation/${o.id}` }, 'Trace')))))
      : emptyState({
        title: 'No observations yet',
        body: archived ? 'This project is archived, so no observations can be added.' : 'Record what participants did and said in this session.',
        action: archived ? null : button('Add observation', { icon: 'plus', onClick: ctx.guard(addObservation) }),
      }));

  const meta = h('dl', { class: 'meta' },
    h('div', {}, h('dt', {}, 'Project'), h('dd', {}, d.project ? h('a', { href: `#/projects/${d.project.id}` }, d.project.title) : '—')),
    h('div', {}, h('dt', {}, 'Date'), h('dd', {}, formatDate(s.session_date))),
    h('div', {}, h('dt', {}, 'Duration'), h('dd', {}, s.duration_minutes ? `${s.duration_minutes} minutes` : '—')),
    h('div', {}, h('dt', {}, 'Facilitator'), h('dd', {}, d.researcher?.full_name || '—')),
    h('div', {}, h('dt', {}, 'Participants'), h('dd', {}, d.participants.length
      ? h('div', { class: 'pills' }, d.participants.map((p) => h('a', { class: 'pill', href: `#/sessions?participant=${p.id}`, title: `Sessions with ${p.participant_code}` }, p.participant_code)))
      : 'None assigned')),
    h('div', {}, h('dt', {}, 'Questions'), h('dd', {}, d.questions.length ? h('ul', { class: 'stack', style: 'gap:6px' }, d.questions.map((q) => h('li', {}, q.question_text))) : 'None linked')),
    s.notes ? h('div', {}, h('dt', {}, 'Notes'), h('dd', {}, s.notes)) : null);

  ctx.view.replaceChildren(head,
    archived ? h('div', { class: 'notice notice-warn', role: 'note' }, icon('archive'), h('p', {}, 'This session belongs to an archived project. Restore the project to add observations.')) : '',
    h('div', { class: 'detail-layout' }, observations, h('aside', {}, meta)));
}
