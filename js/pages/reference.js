// Team and methods: researchers, research methods and participant segments.
import * as data from '../data-access.js';
import { h, button, loadingState, errorState, emptyState, excerpt } from '../ui.js';
import { openForm } from '../forms.js';

const FORMS = {
  researcher: {
    noun: 'researcher', table: 'researcher', save: data.saveResearcher,
    fields: [
      { name: 'full_name', label: 'Full name', type: 'text' },
      { name: 'email', label: 'Work email', type: 'email', help: 'Use a fictional address (for example name@example.org) for demo data.' },
      { name: 'role_title', label: 'Role', type: 'text', placeholder: 'e.g. UX researcher' },
    ],
  },
  method: {
    noun: 'method', table: 'research_method', save: data.saveMethod,
    fields: [{ name: 'name', label: 'Name', type: 'text' }, { name: 'description', label: 'Description', type: 'textarea', rows: 3 }],
  },
  segment: {
    noun: 'segment', table: 'segment', save: data.saveSegment,
    fields: [{ name: 'name', label: 'Name', type: 'text' }, { name: 'description', label: 'Description', type: 'textarea', rows: 3 }],
  },
};

async function openEntityForm(ctx, kind, row = null) {
  const f = FORMS[kind];
  const result = await openForm({
    title: row ? `Edit ${f.noun}` : `New ${f.noun}`,
    table: f.table,
    initial: row || {},
    fields: f.fields,
    submitLabel: row ? 'Save changes' : `Create ${f.noun}`,
    successMessage: row ? `${f.noun[0].toUpperCase()}${f.noun.slice(1)} saved.` : `${f.noun[0].toUpperCase()}${f.noun.slice(1)} created.`,
    onSubmit: (v) => f.save(row?.id ?? null, v),
  });
  if (result) ctx.refresh();
}

function section(ctx, { id, title, sub, kind, rows, columns }) {
  return h('section', { class: 'section', 'aria-labelledby': id },
    h('div', { class: 'section-head' },
      h('div', {}, h('h2', { id }, `${title} (${rows.length})`), h('p', {}, sub)),
      button(`New ${FORMS[kind].noun}`, { icon: 'plus', size: 'sm', onClick: ctx.guard(() => openEntityForm(ctx, kind)) })),
    rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, columns.map((c) => h('th', { scope: 'col', class: c.cls || null }, c.label)), h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, 'Actions')))),
      h('tbody', {}, rows.map((r) => h('tr', {},
        columns.map((c) => h('td', { class: c.cls || null }, c.value(r))),
        h('td', { class: 'actions' }, button('Edit', { icon: 'pencil', variant: 'ghost', size: 'sm', 'aria-label': `Edit ${r.full_name || r.name}`, onClick: ctx.guard(() => openEntityForm(ctx, kind, r)) })))))))
      : emptyState({ title: `No ${title.toLowerCase()} yet` }));
}

export async function render(ctx) {
  ctx.setContext({ title: 'Team and methods', crumbs: [{ label: 'Team and methods' }] });
  ctx.view.replaceChildren(loadingState('Loading team and methods'));
  let d;
  try { d = await data.fetchReference(); } catch (e) { if (!ctx.stale()) ctx.view.replaceChildren(errorState(e, ctx.refresh)); return; }
  if (ctx.stale()) return;

  ctx.view.replaceChildren(
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Team and methods'),
      h('p', { class: 'page-sub' }, 'The people who run research, the methods they use, and the audience segments participants belong to.'))),
    section(ctx, {
      id: 'ref-researchers', title: 'Researchers', sub: 'Assigned to projects and facilitating sessions', kind: 'researcher', rows: d.researchers,
      columns: [
        { label: 'Name', value: (r) => h('strong', {}, r.full_name) },
        { label: 'Role', value: (r) => r.role_title || '—', cls: 'hide-sm' },
        { label: 'Email', value: (r) => r.email, cls: 'hide-sm' },
        { label: 'Projects', value: (r) => String(r.projectCount), cls: 'num' },
        { label: 'Sessions led', value: (r) => String(r.sessionCount), cls: 'num' },
      ],
    }),
    section(ctx, {
      id: 'ref-methods', title: 'Research methods', sub: 'How sessions gather evidence', kind: 'method', rows: d.methods,
      columns: [
        { label: 'Method', value: (m) => h('strong', {}, m.name) },
        { label: 'Description', value: (m) => excerpt(m.description, 100) || '—', cls: 'hide-sm' },
        { label: 'Sessions', value: (m) => String(m.sessionCount), cls: 'num' },
      ],
    }),
    section(ctx, {
      id: 'ref-segments', title: 'Segments', sub: 'Audience groups for participants', kind: 'segment', rows: d.segments,
      columns: [
        { label: 'Segment', value: (g) => h('strong', {}, g.name) },
        { label: 'Description', value: (g) => excerpt(g.description, 100) || '—', cls: 'hide-sm' },
        { label: 'Participants', value: (g) => (g.participantCount ? h('a', { href: `#/participants?segment=${g.id}` }, String(g.participantCount)) : '0'), cls: 'num' },
      ],
    }));
}
