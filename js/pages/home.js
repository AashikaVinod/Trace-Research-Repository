// ===================================================================
// Home: three things. The totals, the main flow (trace a decision)
// and the next session.
// ===================================================================

function pageHome() {
  setCrumbs(['Home']);
  if (data.research_project.length === 0) {
    view.innerHTML = `<div class="empty"><h2>There's no research here yet</h2><p>Create a project to get started.</p>
      <button class="btn btn-dark" id="first-project">${icon('plus', 16)} New project</button></div>`;
    $('#first-project').onclick = () => editProject();
    return;
  }

  const upNext = nextSession();
  const decisions = decisionStrength().slice(0, 4);

  view.innerHTML = `
    <header class="page-head">
      <div><h1>Research overview</h1><p>Every design decision, traced back to what people actually did and said.</p></div>
      <button class="btn btn-dark" id="add-project">${icon('plus', 16)} New project</button>
    </header>

    <div class="stats">
      ${total('#/projects', 'Projects', data.research_project.length, `${activeProjects().length} active`)}
      ${total('#/sessions', 'Sessions', data.research_session.length, `${data.research_session.filter((s) => s.status === 'planned').length} planned`)}
      ${total('#/library?type=observation', 'Observations', data.observation.length, `from ${plural(data.participant.length, 'participant')}`)}
      ${total('#/library?type=design_decision', 'Decisions', data.design_decision.length, `${data.design_decision.filter((d) => d.status === 'accepted' || d.status === 'implemented').length} accepted`)}
    </div>

    <div class="grid-main row-gap">
      <section class="card">
        <div class="card-top"><h3>Trace a decision</h3><a class="text-link" href="#/trail">All decisions</a></div>
        <ul class="rows">${decisions.map((d) => `<li><a href="#/trail/design_decision/${d.id}" class="stage-design_decision">
          <span class="dot"></span>
          <span class="row-text"><strong>${esc(d.title)}</strong>${meta(esc(byId('research_project', d.project_id).title), plural(d.observations, 'observation'))}</span>
          <span class="chev">${icon('chevron-right', 18)}</span></a></li>`).join('')}</ul>
      </section>
      <section class="card">
        <div class="card-top"><h3>Up next</h3></div>
        ${upNext ? `<p class="up-title"><a href="#/sessions/${upNext.id}">${esc(upNext.title)}</a></p>
          <p class="muted">${formatDate(upNext.session_date)}, ${daysUntil(upNext.session_date)}</p>
          <p class="card-sub">${esc(byId('research_method', upNext.method_id).name)}</p>`
        : '<p class="quiet">No sessions planned.</p>'}
      </section>
    </div>`;

  $('#add-project').onclick = () => editProject();
}

function total(href, label, value, note) {
  return `<a class="stat" href="${href}"><span>${label}</span><strong>${value}</strong><small>${note}</small></a>`;
}
