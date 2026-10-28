// ===================================================================
// People: participants (codes only), the team, methods and segments.
// ===================================================================

function pagePeople() {
  setCrumbs(['People']);

  function segmentsOf(participant) {
    return data.participant_segment.filter((l) => l.participant_id === participant.id).map((l) => byId('segment', l.segment_id));
  }
  function sessionsOf(participant) {
    return data.session_participant.filter((l) => l.participant_id === participant.id).length;
  }

  const bands = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
  const ageColumns = bands.map((band) => ({ label: band, value: data.participant.filter((p) => p.age_band === band).length }));
  const segmentBars = participantsBySegment().map((g) => ({ label: g.name, value: g.participants, stage: 'observation' }));

  let rows = '';
  for (const p of data.participant) {
    const segments = segmentsOf(p);
    const sessions = sessionsOf(p);
    rows += `<tr>
      <td><strong>${esc(p.participant_code)}</strong></td>
      <td>${esc(p.age_band || '—')}</td>
      <td><div class="pills">${segments.map((g) => pill(g.name, 'purple')).join('') || '<span class="quiet">—</span>'}</div></td>
      <td>${sessions ? `<a class="strong-link" href="#/sessions?participant=${p.id}">${sessions}</a>` : '0'}</td>
      <td class="hide-sm quiet">${esc(shorten(p.notes, 60) || '—')}</td>
      <td class="right"><button class="icon-btn" data-participant="${p.id}" aria-label="Edit ${esc(p.participant_code)}">${icon('pencil', 15)}</button></td>
    </tr>`;
  }

  view.innerHTML = `
    <header class="page-head">
      <div><h1>People</h1><p>Participants are identified by code only. TRACE never stores names or contact details.</p></div>
      <button class="btn btn-dark" id="add-participant">${icon('user-plus', 16)} New participant</button>
    </header>
    <div class="grid-2">
      <section class="card"><div class="card-top"><h3>Participants per segment</h3></div>
        <p class="card-note">One person can belong to several segments.</p>${barChart(segmentBars)}</section>
      <section class="card"><div class="card-top"><h3>Age bands</h3></div>${columnChart(ageColumns, 'var(--obs)')}</section>
    </div>
    <section class="card table-card row-gap">
      <table class="table">
        <thead><tr><th scope="col">Code</th><th scope="col">Age band</th><th scope="col">Segments</th><th scope="col">Sessions</th><th scope="col" class="hide-sm">Notes</th><th scope="col"><span class="sr">Edit</span></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
    <div class="grid-3 row-gap">
      ${smallList('Research team', 'researcher', data.researcher, (r) => `${avatar(r.full_name, 36)}<span><strong>${esc(r.full_name)}</strong><small>${esc(r.role_title || '')}</small></span>`)}
      ${smallList('Methods', 'research_method', data.research_method, (m) => `<span><strong>${esc(m.name)}</strong><small>${esc(shorten(m.description, 60))}</small></span>`)}
      ${smallList('Segments', 'segment', data.segment, (g) => `<span><strong>${esc(g.name)}</strong><small>${esc(shorten(g.description, 60))}</small></span>`)}
    </div>
    ${dbPanel(['M:N junction table', 'UNIQUE constraint', 'CHECK (regular expression)', 'Data minimisation'], `
-- Participant codes must look like P-01 and can't repeat
alter table participant add constraint participant_code_check check (participant_code ~ '^P-[0-9]{2,3}$');
alter table participant add constraint participant_code_key unique (participant_code);

-- Participants per segment (a many-to-many relationship)
select g.name, count(ps.participant_id)
from segment g left join participant_segment ps on ps.segment_id = g.id
group by g.name;`,
    'The schema has no name, email or phone columns for participants: privacy is designed into the tables themselves.')}`;

  $('#add-participant').onclick = () => editParticipant();
  $$('[data-participant]').forEach((button) => { button.onclick = () => editParticipant(byId('participant', Number(button.dataset.participant))); });
  $$('[data-add]').forEach((button) => { button.onclick = () => editSimple(button.dataset.add); });
  $$('[data-edit]').forEach((button) => {
    const [table, id] = button.dataset.edit.split(':');
    button.onclick = () => editSimple(table, byId(table, Number(id)));
  });
}

function smallList(title, table, rows, content) {
  return `<section class="card">
    <div class="card-top"><h3>${title}</h3><button class="icon-btn" data-add="${table}" aria-label="Add to ${title}">${icon('plus', 16)}</button></div>
    <ul class="team">${rows.map((r) => `<li>${content(r)}<button class="icon-btn push" data-edit="${table}:${r.id}" aria-label="Edit ${esc(r.full_name || r.name)}">${icon('pencil', 14)}</button></li>`).join('')}</ul>
  </section>`;
}
