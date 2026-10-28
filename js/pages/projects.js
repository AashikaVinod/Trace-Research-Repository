// Projects: list with search and filters, detail page, and project forms.
import * as data from '../data-access.js';
import { VOCAB } from '../rules.js';
import { STAGES } from '../evidence.js';
import { replaceQuery } from '../router.js';
import {
  h, icon, button, linkButton, loadingState, errorState, emptyState, formatDate, excerpt,
  statusPill, toneFor, plural, confirmDialog, toast, today,
} from '../ui.js';
import { openForm, vocabOptions, toOptions } from '../forms.js';
import { openSessionForm } from './sessions.js';

// ---------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------

export async function openProjectForm(ctx, project = null) {
  const result = await openForm({
    title: project ? 'Edit project' : 'New project',
    table: 'research_project',
    initial: project || { status: 'planned', start_date: today() },
    submitLabel: project ? 'Save changes' : 'Create project',
    successMessage: project ? 'Project saved.' : 'Project created.',
    fields: [
      { name: 'title', label: 'Title', type: 'text', placeholder: 'e.g. Mobile banking onboarding' },
      { name: 'research_objective', label: 'Research objective', type: 'textarea', rows: 3, help: 'What should this research help the team understand or decide?' },
      { name: 'description', label: 'Description', type: 'textarea', rows: 3 },
      { name: 'status', label: 'Status', type: 'select', options: vocabOptions(VOCAB.project_status) },
      { name: 'start_date', label: 'Start date', type: 'date', half: true },
      { name: 'end_date', label: 'End date', type: 'date', half: true },
    ],
    onSubmit: (values) => (project ? data.updateProject(project.id, values) : data.createProject(values)),
  });
  if (!result) return;
  if (!project && result.id) ctx.navigate(`/projects/${result.id}`);
  else ctx.refresh();
}

async function openQuestionForm(ctx, projectId, question = null) {
  const result = await openForm({
    title: question ? 'Edit research question' : 'Add research question',
    table: 'research_question',
    initial: question || { project_id: projectId },
    submitLabel: question ? 'Save changes' : 'Add question',
    successMessage: question ? 'Question saved.' : 'Question added.',
    fields: [{ name: 'question_text', label: 'Question', type: 'textarea', rows: 3, placeholder: 'e.g. Where do people stop, and why?' }],
    onSubmit: (values) => data.saveQuestion(question?.id ?? null, { ...values, project_id: projectId }),
  });
  if (result) ctx.refresh();
}

async function openTeamForm(ctx, detail) {
  const lead = detail.team.find((t) => t.project_role === 'lead');
  const result = await openForm({
    title: 'Edit methods and team',
    table: 'project_team',
    initial: {
      method_ids: detail.methods.map((m) => m.id),
      researcher_ids: detail.team.map((t) => t.researcher_id),
      lead_id: lead?.researcher_id ?? null,
    },
    submitLabel: 'Save changes',
    successMessage: 'Methods and team saved.',
    fields: [
      { name: 'method_ids', label: 'Research methods', type: 'multi', options: toOptions(detail.allMethods, (m) => m.name), emptyText: 'Add methods on the Team and methods page first.' },
      { name: 'researcher_ids', label: 'Team members', type: 'multi', options: toOptions(detail.allResearchers, (r) => r.full_name, (r) => r.role_title || '') },
      { name: 'lead_id', label: 'Project lead', type: 'select', numeric: true, required: false, emptyLabel: 'No lead', options: toOptions(detail.allResearchers, (r) => r.full_name), help: 'The lead is added to the team automatically.' },
    ],
    onSubmit: async (v) => {
      await data.saveProjectMethods(detail.project.id, v.method_ids);
      await data.saveProjectTeam(detail.project.id, v.researcher_ids, v.lead_id);
      return true;
    },
  });
  if (result) ctx.refresh();
}

async function toggleArchive(ctx, project) {
  const archiving = !project.archived_at;
  const ok = await confirmDialog({
    title: archiving ? `Archive “${project.title}”?` : `Restore “${project.title}”?`,
    body: archiving
      ? 'Archived projects keep all their records but are hidden by default and accept no new sessions or evidence. You can restore it at any time.'
      : 'The project will appear in lists again and accept new sessions and evidence.',
    confirmLabel: archiving ? 'Archive project' : 'Restore project',
  });
  if (!ok) return;
  try {
    if (archiving) await data.archiveProject(project.id); else await data.restoreProject(project.id);
    toast(archiving ? 'Project archived.' : 'Project restored.');
    ctx.refresh();
  } catch (e) {
    toast(e.message, { tone: 'error' });
  }
}

// ---------------------------------------------------------------------
// List
// ---------------------------------------------------------------------

export async function renderList(ctx) {
  ctx.setContext({ title: 'Projects', crumbs: [{ label: 'Projects' }] });
  ctx.view.replaceChildren(loadingState('Loading projects'));
  let projects;
  try { projects = await data.fetchProjects(); } catch (e) { if (!ctx.stale()) ctx.view.replaceChildren(errorState(e, ctx.refresh)); return; }
  if (ctx.stale()) return;

  const state = { q: ctx.query.q || '', status: ctx.query.status || '', archived: ctx.query.archived === '1' };
  const search = h('input', { type: 'search', class: 'input search-input', placeholder: 'Search projects', 'aria-label': 'Search projects', value: state.q });
  const status = h('select', { class: 'input', 'aria-label': 'Filter by status' },
    h('option', { value: '' }, 'All statuses'), VOCAB.project_status.map((s) => h('option', { value: s }, s[0].toUpperCase() + s.slice(1))));
  status.value = state.status;
  const archived = h('input', { type: 'checkbox', checked: state.archived });
  const count = h('span', { class: 'result-count', 'aria-live': 'polite' });
  const results = h('div', {});

  function draw() {
    const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = projects.filter((p) => (state.archived || !p.archived_at)
      && (!state.status || p.status === state.status)
      && terms.every((t) => [p.title, p.description, p.research_objective, p.lead?.full_name].join(' ').toLowerCase().includes(t)));
    const hiddenArchived = state.archived ? 0 : projects.filter((p) => p.archived_at).length;
    count.textContent = `${plural(list.length, 'project')}${hiddenArchived ? `, ${hiddenArchived} archived hidden` : ''}`;
    replaceQuery({ q: state.q, status: state.status, archived: state.archived ? '1' : '' });
    if (!projects.length) {
      results.replaceChildren(emptyState({ title: 'No projects yet', body: 'Create a project to start organising research.', action: button('New project', { icon: 'plus', variant: 'primary', onClick: ctx.guard(() => openProjectForm(ctx)) }) }));
      return;
    }
    if (!list.length) {
      results.replaceChildren(emptyState({
        title: 'No projects match these filters',
        action: button('Clear filters', { onClick: () => { state.q = ''; state.status = ''; search.value = ''; status.value = ''; draw(); } }),
      }));
      return;
    }
    results.replaceChildren(h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Project'), h('th', { scope: 'col' }, 'Status'), h('th', { scope: 'col', class: 'hide-sm' }, 'Lead'),
        h('th', { scope: 'col', class: 'num' }, 'Sessions'), h('th', { scope: 'col', class: 'hide-sm' }, 'Dates'))),
      h('tbody', {}, list.map((p) => h('tr', { class: p.archived_at ? 'row-archived' : null },
        h('td', {}, h('a', { class: 'row-title', href: `#/projects/${p.id}` }, p.title), h('p', { class: 'row-sub' }, excerpt(p.research_objective, 120))),
        h('td', {}, h('div', { class: 'pills' }, statusPill(p.status, toneFor.status[p.status]), p.archived_at ? statusPill('archived') : null)),
        h('td', { class: 'hide-sm' }, p.lead?.full_name || '—'),
        h('td', { class: 'num' }, String(p.sessionCount)),
        h('td', { class: 'hide-sm' }, formatDate(p.start_date), p.end_date ? ` to ${formatDate(p.end_date)}` : '')))))));
  }

  search.addEventListener('input', () => { state.q = search.value; draw(); });
  status.addEventListener('change', () => { state.status = status.value; draw(); });
  archived.addEventListener('change', () => { state.archived = archived.checked; draw(); });

  ctx.view.replaceChildren(
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, 'Projects'), h('p', { class: 'page-sub' }, 'Each project groups the questions, sessions and evidence for one research effort.')),
      h('div', { class: 'page-actions' }, button('New project', { icon: 'plus', variant: 'primary', onClick: ctx.guard(() => openProjectForm(ctx)) }))),
    h('div', { class: 'toolbar' }, search, status, h('label', { class: 'checkbox' }, archived, 'Show archived'), count),
    results);
  draw();
}

// ---------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------

export async function renderDetail(ctx) {
  const id = Number(ctx.params.id);
  ctx.setContext({ title: 'Project', crumbs: [{ label: 'Projects', href: '#/projects' }, { label: 'Loading…' }] });
  ctx.view.replaceChildren(loadingState('Loading project'));
  let d;
  try { d = await data.fetchProjectDetail(id); } catch (e) { if (!ctx.stale()) ctx.view.replaceChildren(errorState(e, ctx.refresh)); return; }
  if (ctx.stale()) return;
  if (!d) {
    ctx.setContext({ title: 'Project not found', crumbs: [{ label: 'Projects', href: '#/projects' }, { label: 'Not found' }] });
    ctx.view.replaceChildren(emptyState({ title: 'Project not found', body: `There is no project with id ${ctx.params.id}.`, action: linkButton('Back to projects', '#/projects') }));
    return;
  }
  const p = d.project;
  const archived = !!p.archived_at;
  ctx.setContext({ title: p.title, crumbs: [{ label: 'Projects', href: '#/projects' }, { label: p.title }] });

  const head = h('header', { class: 'detail-head' },
    h('div', { class: 'pills' }, statusPill(p.status, toneFor.status[p.status]), archived ? statusPill('archived', 'dark') : null),
    h('h1', {}, p.title),
    h('div', { class: 'page-actions' },
      button('Edit project', { icon: 'pencil', onClick: ctx.guard(() => openProjectForm(ctx, p)) }),
      button(archived ? 'Restore project' : 'Archive project', { icon: archived ? 'archive-restore' : 'archive', onClick: ctx.guard(() => toggleArchive(ctx, p)) }),
      linkButton('Open in library', `#/library?project=${p.id}`, { icon: 'library', variant: 'ghost' })));

  const notice = archived ? h('div', { class: 'notice notice-warn', role: 'note' }, icon('archive'),
    h('p', {}, `Archived on ${formatDate(p.archived_at)}. Its records stay readable, but it accepts no new sessions or evidence until it is restored.`)) : null;

  const counts = h('div', { class: 'counts-strip', 'aria-label': 'Evidence in this project' },
    STAGES.map((s) => h('a', { class: `stage-${s.type}`, href: `#/library?project=${p.id}&type=${s.type}` },
      h('strong', {}, String(d.counts[s.type])), h('span', {}, s.plural))));

  const addSession = button('New session', { icon: 'plus', size: 'sm', disabled: archived,
    onClick: ctx.guard(() => openSessionForm(ctx, { projectId: p.id })) });

  const sessionsSection = h('section', { class: 'section', 'aria-labelledby': 'ps-h' },
    h('div', { class: 'section-head' }, h('h2', { id: 'ps-h' }, `Sessions (${d.sessions.length})`), addSession),
    d.sessions.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Date'), h('th', { scope: 'col' }, 'Session'), h('th', { scope: 'col', class: 'hide-sm' }, 'Method'),
        h('th', { scope: 'col', class: 'hide-sm' }, 'Facilitator'), h('th', { scope: 'col', class: 'num' }, 'Observations'))),
      h('tbody', {}, d.sessions.map((s) => h('tr', {},
        h('td', {}, formatDate(s.session_date)),
        h('td', {}, h('a', { class: 'row-title', href: `#/sessions/${s.id}` }, s.title), s.status !== 'completed' ? h('div', {}, statusPill(s.status, toneFor.status[s.status])) : null),
        h('td', { class: 'hide-sm' }, s.method?.name || '—'),
        h('td', { class: 'hide-sm' }, s.researcher?.full_name || '—'),
        h('td', { class: 'num' }, String(s.observationCount)))))))
      : emptyState({ title: 'No sessions yet', body: archived ? 'This project is archived.' : 'Add a session to start recording observations.' }));

  const questions = h('section', { class: 'section', 'aria-labelledby': 'pq-h' },
    h('div', { class: 'section-head' }, h('h2', { id: 'pq-h' }, `Research questions (${d.questions.length})`),
      button('Add question', { icon: 'plus', size: 'sm', disabled: archived, onClick: ctx.guard(() => openQuestionForm(ctx, p.id)) })),
    d.questions.length ? h('ol', { class: 'panel question-list' }, d.questions.map((q) => h('li', {},
      h('span', {}, q.question_text),
      button('', { icon: 'pencil', variant: 'ghost', size: 'sm', 'aria-label': `Edit question: ${q.question_text}`, onClick: ctx.guard(() => openQuestionForm(ctx, p.id, q)) }))))
      : emptyState({ title: 'No research questions yet', body: 'Questions keep sessions focused on what the team needs to learn.' }));

  const aside = h('aside', { class: 'stack' },
    h('dl', { class: 'meta' },
      h('div', {}, h('dt', {}, 'Start date'), h('dd', {}, formatDate(p.start_date))),
      h('div', {}, h('dt', {}, 'End date'), h('dd', {}, p.end_date ? formatDate(p.end_date) : 'Not set')),
      h('div', {}, h('dt', {}, 'Methods'), h('dd', {}, d.methods.length ? h('div', { class: 'pills' }, d.methods.map((m) => statusPill(m.name))) : 'None assigned')),
      h('div', {}, h('dt', {}, 'Team'), h('dd', {}, d.team.length
        ? h('ul', { class: 'stack', style: 'gap:4px' }, d.team.map((t) => h('li', {}, t.researcher.full_name, h('span', { class: 'muted' }, ` (${t.project_role})`))))
        : 'Nobody assigned'))),
    button('Edit methods and team', { icon: 'users', onClick: ctx.guard(() => openTeamForm(ctx, d)) }));

  ctx.view.replaceChildren(head, notice || '',
    h('div', { class: 'detail-layout' },
      h('div', {},
        h('p', { class: 'muted small' }, 'Research objective'),
        h('p', { class: 'lede' }, p.research_objective),
        p.description ? h('p', { class: 'prose muted', style: 'margin-top:12px;font-size:1rem' }, p.description) : null,
        h('section', { class: 'section', 'aria-label': 'Evidence counts' }, counts),
        questions, sessionsSection),
      aside));
}
