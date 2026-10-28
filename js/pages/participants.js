// Participants: fictional codes, segments, and the sessions they joined.
import * as data from '../data-access.js';
import { VOCAB } from '../rules.js';
import { replaceQuery } from '../router.js';
import { h, icon, button, loadingState, errorState, emptyState, excerpt, statusPill, plural } from '../ui.js';
import { openForm, toOptions } from '../forms.js';

function nextCode(participants) {
  const max = participants.reduce((m, p) => Math.max(m, Number(p.participant_code.slice(2)) || 0), 0);
  return `P-${String(max + 1).padStart(2, '0')}`;
}

async function openParticipantForm(ctx, d, participant = null) {
  const result = await openForm({
    title: participant ? `Edit ${participant.participant_code}` : 'New participant',
    description: 'Participants are identified by code only. Do not enter names, contact details or anything that identifies a real person.',
    table: 'participant',
    initial: participant
      ? { ...participant, segment_ids: participant.segments.map((s) => s.id) }
      : { participant_code: nextCode(d.participants), segment_ids: [] },
    submitLabel: participant ? 'Save changes' : 'Create participant',
    successMessage: participant ? 'Participant saved.' : 'Participant created.',
    fields: [
      { name: 'participant_code', label: 'Participant code', type: 'text', half: true, help: 'Format P-01.' },
      { name: 'age_band', label: 'Age band', type: 'select', half: true, emptyLabel: 'Not recorded', options: VOCAB.age_band.map((a) => ({ value: a, label: a })) },
      { name: 'segment_ids', label: 'Segments', type: 'multi', options: toOptions(d.segments, (s) => s.name, (s) => s.description || ''),
        emptyText: 'Add segments on the Team and methods page first.' },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 3, help: 'Practical notes only, such as scheduling or accessibility needs for sessions. No personal details.' },
    ],
    onSubmit: (v) => {
      const { segment_ids: segmentIds, ...values } = v;
      return data.saveParticipant(participant?.id ?? null, values, segmentIds);
    },
  });
  if (result) ctx.refresh();
}

export async function renderList(ctx) {
  ctx.setContext({ title: 'Participants', crumbs: [{ label: 'Participants' }] });
  ctx.view.replaceChildren(loadingState('Loading participants'));
  let d;
  try { d = await data.fetchParticipants(); } catch (e) { if (!ctx.stale()) ctx.view.replaceChildren(errorState(e, ctx.refresh)); return; }
  if (ctx.stale()) return;

  const state = { q: ctx.query.q || '', segment: ctx.query.segment ? Number(ctx.query.segment) : '' };
  const search = h('input', { type: 'search', class: 'input search-input', placeholder: 'Search codes and notes', 'aria-label': 'Search participants', value: state.q });
  const segment = h('select', { class: 'input', 'aria-label': 'Filter by segment' }, h('option', { value: '' }, 'All segments'),
    d.segments.map((s) => h('option', { value: String(s.id) }, s.name)));
  segment.value = String(state.segment);
  const count = h('span', { class: 'result-count', 'aria-live': 'polite' });
  const results = h('div', {});

  function draw() {
    const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = d.participants.filter((p) => (!state.segment || p.segments.some((s) => s.id === state.segment))
      && terms.every((t) => [p.participant_code, p.notes, p.age_band, ...p.segments.map((s) => s.name)].join(' ').toLowerCase().includes(t)));
    count.textContent = plural(list.length, 'participant');
    replaceQuery(state);
    if (!d.participants.length) {
      results.replaceChildren(emptyState({ title: 'No participants yet', body: 'Add participants with codes such as P-01, then assign them to sessions.', action: button('New participant', { icon: 'plus', variant: 'primary', onClick: ctx.guard(() => openParticipantForm(ctx, d)) }) }));
      return;
    }
    if (!list.length) {
      results.replaceChildren(emptyState({ title: 'No participants match', action: button('Clear filters', { onClick: () => { state.q = ''; state.segment = ''; search.value = ''; segment.value = ''; draw(); } }) }));
      return;
    }
    results.replaceChildren(h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Code'), h('th', { scope: 'col' }, 'Age band'), h('th', { scope: 'col' }, 'Segments'),
        h('th', { scope: 'col', class: 'num' }, 'Sessions'), h('th', { scope: 'col', class: 'hide-sm' }, 'Notes'), h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, 'Actions')))),
      h('tbody', {}, list.map((p) => h('tr', {},
        h('td', {}, h('strong', {}, p.participant_code)),
        h('td', {}, p.age_band || '—'),
        h('td', {}, p.segments.length ? h('div', { class: 'pills' }, p.segments.map((s) => statusPill(s.name, 'lavender'))) : h('span', { class: 'muted' }, 'None')),
        h('td', { class: 'num' }, p.sessionCount ? h('a', { href: `#/sessions?participant=${p.id}`, title: `Sessions with ${p.participant_code}` }, String(p.sessionCount)) : '0'),
        h('td', { class: 'hide-sm muted' }, excerpt(p.notes, 70) || '—'),
        h('td', { class: 'actions' }, button('Edit', { icon: 'pencil', variant: 'ghost', size: 'sm', 'aria-label': `Edit ${p.participant_code}`, onClick: ctx.guard(() => openParticipantForm(ctx, d, p)) }))))))));
  }
  search.addEventListener('input', () => { state.q = search.value; draw(); });
  segment.addEventListener('change', () => { state.segment = segment.value ? Number(segment.value) : ''; draw(); });

  ctx.view.replaceChildren(
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, 'Participants'), h('p', { class: 'page-sub' }, 'Fictional participant codes grouped into segments. TRACE stores no names or contact details.')),
      h('div', { class: 'page-actions' }, button('New participant', { icon: 'plus', variant: 'primary', onClick: ctx.guard(() => openParticipantForm(ctx, d)) }))),
    h('div', { class: 'notice', role: 'note' }, icon('lock'), h('p', {}, 'Keep personal information to a minimum: a code, an age band and segments are enough to analyse research by audience.')),
    h('div', { class: 'toolbar' }, search, segment, count),
    results);
  draw();
}
