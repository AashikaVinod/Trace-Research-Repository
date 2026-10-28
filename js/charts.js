// ===================================================================
// charts.js - simple charts made from HTML and CSS (no chart library).
// Each function returns an HTML string you can drop into a page.
// ===================================================================







// ===================================================================
// Dashboard components inspired by the reference designs.
// ===================================================================





// A horizontal bar split into coloured segments, e.g. one per evidence stage.
// segments: [{ value, color, label }]
function segmentBar(segments) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  return `<div class="segments" role="img" aria-label="${esc(segments.map((s) => `${s.label}: ${s.value}`).join(', '))}">
    ${segments.map((s) => `<i style="flex:${s.value / total};background:${s.color}" title="${esc(s.label)}: ${s.value}"></i>`).join('')}
  </div>`;
}

// One project's evidence as a bar split by stage (dashboard and projects table).
function evidenceBar(projectId) {
  const counts = projectCounts(projectId);
  return segmentBar(STAGES.map((s) => ({ value: counts[s.type], color: `var(--${['obs', 'find', 'ins', 'rec', 'dec'][s.step - 1]})`, label: s.plural })));
}




