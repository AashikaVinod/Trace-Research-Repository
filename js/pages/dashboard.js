// Dashboard: live metrics, the evidence pipeline, and recent work.
import * as data from '../data-access.js';
import { STAGES } from '../evidence.js';
import { h, loadingState, errorState, emptyState, formatDate, excerpt, statusPill, toneFor, plural, button } from '../ui.js';
import { openProjectForm } from './projects.js';

export async function render(ctx) {
  ctx.setContext({ title: 'Dashboard', crumbs: [{ label: 'Dashboard' }] });
  ctx.view.replaceChildren(loadingState('Loading dashboard'));
  let d;
  try { d = await data.fetchDashboard(); } catch (e) { if (!ctx.stale()) ctx.view.replaceChildren(errorState(e, ctx.refresh)); return; }
  if (ctx.stale()) return;
  const m = d.metrics;

  const stat = (value, label, note, href) => h('a', { class: 'stat', href },
    h('span', { class: 'stat-value' }, String(value)), h('span', { class: 'stat-label' }, label), note ? h('span', { class: 'stat-note' }, note) : null);

  const pipelineCaption = {
    observation: 'What people did and said',
    finding: 'Patterns across sessions',
    insight: 'Why the patterns matter',
    recommendation: 'What to change',
    design_decision: 'What the team decided',
  };

  const head = h('div', { class: 'page-head' },
    h('div', {}, h('h1', {}, 'Dashboard'),
      h('p', { class: 'page-sub' }, 'Every number on this page is counted from the active data source.')),
    h('div', { class: 'page-actions' }, button('New project', { icon: 'plus', variant: 'primary', onClick: ctx.guard(() => openProjectForm(ctx)) })));

  if (m.projects === 0) {
    ctx.view.replaceChildren(head, emptyState({
      title: 'No research projects yet',
      body: 'Start by creating a project. Sessions, observations and decisions all belong to a project.',
      action: button('Create your first project', { icon: 'plus', variant: 'primary', onClick: ctx.guard(() => openProjectForm(ctx)) }),
    }));
    return;
  }

  const stats = h('section', { class: 'stats', 'aria-label': 'Totals' },
    stat(m.projects, 'Projects', m.projectsArchived ? `${m.projectsInUse} in use, ${m.projectsArchived} archived` : 'All in use', '#/projects'),
    stat(m.sessions, 'Research sessions', null, '#/sessions'),
    stat(m.participants, 'Participants', 'Identified by code only', '#/participants'),
    stat(m.insights, 'Documented insights', null, '#/library?type=insight'));

  const pipeline = h('section', { class: 'section', 'aria-labelledby': 'pipeline-h' },
    h('div', { class: 'section-head' },
      h('h2', { id: 'pipeline-h' }, 'Evidence pipeline'),
      h('p', {}, 'Records at each stage, from observation to decision')),
    h('div', { class: 'pipeline' }, STAGES.map((s) => h('a', { class: `pipe-stage stage-${s.type}`, href: `#/library?type=${s.type}` },
      h('span', { class: 'pipe-count' }, String(m.stages[s.type])),
      h('span', { class: 'pipe-label' }, h('span', { class: 'stage-step' }, String(s.step)), h('span', {}, s.plural)),
      h('span', { class: 'pipe-caption' }, pipelineCaption[s.type])))));

  const projectName = (id) => d.projectById.get(id)?.title || 'Unknown project';

  const recentProjects = h('section', { 'aria-labelledby': 'rp-h' },
    h('div', { class: 'section-head' }, h('h2', { id: 'rp-h' }, 'Recent projects'), h('a', { href: '#/projects', class: 'small' }, 'All projects')),
    d.recentProjects.length
      ? h('div', { class: 'panel list' }, d.recentProjects.map((p) => h('a', { class: 'list-item', href: `#/projects/${p.id}` },
        h('span', { class: 'list-item-title' }, p.title, statusPill(p.status, toneFor.status[p.status])),
        h('span', { class: 'list-item-text' }, excerpt(p.research_objective, 110)),
        h('span', { class: 'list-item-meta' }, `Started ${formatDate(p.start_date)}`))))
      : emptyState({ title: 'No projects in use', body: 'Every project is archived.' }));

  const recentSessions = h('section', { 'aria-labelledby': 'ra-h' },
    h('div', { class: 'section-head' }, h('h2', { id: 'ra-h' }, 'Recent research activity'), h('a', { href: '#/sessions', class: 'small' }, 'All sessions')),
    d.recentSessions.length
      ? h('div', { class: 'panel list' }, d.recentSessions.map((s) => h('a', { class: 'list-item', href: `#/sessions/${s.id}` },
        h('span', { class: 'list-item-title' }, s.title, s.status !== 'completed' ? statusPill(s.status, toneFor.status[s.status]) : null),
        h('span', { class: 'list-item-meta' }, h('span', {}, formatDate(s.session_date)), h('span', {}, projectName(s.project_id))))))
      : emptyState({ title: 'No sessions yet', body: 'Sessions you schedule or run will appear here.' }));

  const recentInsights = h('section', { 'aria-labelledby': 'ri-h' },
    h('div', { class: 'section-head' }, h('h2', { id: 'ri-h' }, 'Recent insights'), h('a', { href: '#/library?type=insight', class: 'small' }, 'All insights')),
    d.recentInsights.length
      ? h('div', { class: 'panel list' }, d.recentInsights.map((i) => h('a', { class: 'list-item', href: `#/library/insight/${i.id}` },
        h('span', { class: 'list-item-title' }, i.title),
        h('span', { class: 'list-item-meta' }, h('span', {}, projectName(i.project_id)), h('span', {}, `${i.impact} impact`)))))
      : emptyState({ title: 'No insights yet', body: 'Insights explain why findings matter. Add one from the research library.' }));

  ctx.view.replaceChildren(head, stats, pipeline,
    h('div', { class: 'grid-3 section' }, recentProjects, recentSessions, recentInsights),
    h('p', { class: 'muted small section' }, `${plural(m.stages.observation, 'observation')} have been recorded across ${plural(m.sessions, 'session')}.`));
}
