// People: participants (codes only), the research team, methods and segments.

function pagePeople() {
  setCrumbs(['People']);
  const segmentsOf = (p) => data.participant_segment.filter((l) => l.participant_id === p.id).map((l) => byId('segment', l.segment_id)).filter(Boolean);
  const sessionsOf = (p) => data.session_participant.filter((l) => l.participant_id === p.id).length;

  view.innerHTML = `
    <header class="page-head">
      <div><h1>People</h1><p>Participants are identified by code only. TRACE never stores names or contact details.</p></div>
      <button class="btn btn-dark" id="add-participant">${icon('user-plus', 16)} New participant</button>
    </header>
    <section class="card table-card">
      <table class="table">
        <thead><tr><th>Code</th><th>Age band</th><th>Segments</th><th>Sessions</th><th class="hide-sm">Notes</th><th><span class="sr">Edit</span></th></tr></thead>
        <tbody>${data.participant.map((p) => `<tr>
          <td><strong>${esc(p.participant_code)}</strong></td>
          <td>${esc(p.age_band || '—')}</td>
          <td><div class="pills">${segmentsOf(p).map((g) => pill(g.name, 'purple')).join('') || '<span class="muted">—</span>'}</div></td>
          <td>${sessionsOf(p) ? `<a href="#/sessions?participant=${p.id}">${sessionsOf(p)}</a>` : '0'}</td>
          <td class="hide-sm muted">${esc(shorten(p.notes, 60) || '—')}</td>
          <td class="right"><button class="icon-btn" data-participant="${p.id}" aria-label="Edit ${esc(p.participant_code)}">${icon('pencil', 15)}</button></td>
        </tr>`).join('')}</tbody>
      </table>
    </section>

    <div class="three-col">
      ${smallList('Research team', 'researcher', data.researcher, (r) => `${avatar(r.full_name, 30)}<span><strong>${esc(r.full_name)}</strong><small>${esc(r.role_title || '')}</small></span>`)}
      ${smallList('Methods', 'research_method', data.research_method, (m) => `<span><strong>${esc(m.name)}</strong><small>${esc(shorten(m.description, 60))}</small></span>`)}
      ${smallList('Segments', 'segment', data.segment, (g) => `<span><strong>${esc(g.name)}</strong><small>${esc(shorten(g.description, 60))}</small></span>`)}
    </div>`;

  $('#add-participant').onclick = () => editParticipant();
  $$('[data-participant]').forEach((b) => { b.onclick = () => editParticipant(byId('participant', Number(b.dataset.participant))); });
  $$('[data-add]').forEach((b) => { b.onclick = () => editSimple(b.dataset.add); });
  $$('[data-edit]').forEach((b) => { const [table, id] = b.dataset.edit.split(':'); b.onclick = () => editSimple(table, byId(table, Number(id))); });
}

function smallList(title, table, rows, content) {
  return `<section class="card">
    <div class="card-top"><h3>${title}</h3><button class="icon-btn" data-add="${table}" aria-label="Add to ${title}">${icon('plus', 16)}</button></div>
    <ul class="team">${rows.map((r) => `<li>${content(r)}<button class="icon-btn push" data-edit="${table}:${r.id}" aria-label="Edit">${icon('pencil', 14)}</button></li>`).join('')}</ul>
  </section>`;
}
