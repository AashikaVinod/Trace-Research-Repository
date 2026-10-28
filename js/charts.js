// ===================================================================
// charts.js - simple charts made from HTML and CSS (no chart library).
// Each function returns an HTML string you can drop into a page.
// ===================================================================

// Horizontal bars. items: [{ label, value, stage, href }]
function barChart(items) {
  const largest = Math.max(1, ...items.map((item) => item.value));
  let html = '<div class="bars">';
  for (const item of items) {
    const width = Math.round((item.value / largest) * 100);
    const tag = item.href ? 'a' : 'div';
    html += `<${tag} class="bar-row ${item.stage ? 'stage-' + item.stage : ''}" ${item.href ? `href="${item.href}"` : ''}>
      <span class="bar-label">${esc(item.label)}</span><span class="bar-value">${item.value}</span>
      <span class="bar"><i style="width:${width}%${item.color ? ';background:' + item.color : ''}"></i></span>
    </${tag}>`;
  }
  return html + '</div>';
}

// Vertical columns, e.g. sessions per month. items: [{ label, value }]
function columnChart(items, color = 'var(--find)') {
  if (items.length === 0) return '<p class="quiet">No data yet.</p>';
  const largest = Math.max(1, ...items.map((item) => item.value));
  let html = `<div class="columns" role="img" aria-label="${esc(items.map((i) => `${i.label}: ${i.value}`).join(', '))}">`;
  for (const item of items) {
    const height = Math.max(4, Math.round((item.value / largest) * 100));
    html += `<div class="col"><b>${item.value}</b><div class="col-bar" style="height:${height}%;background:${color}"></div><span>${esc(item.label)}</span></div>`;
  }
  return html + '</div>';
}

// A donut made with a CSS conic-gradient. items: [{ label, value, color }]
function donutChart(items, centerLabel) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  let gradient = [];
  let start = 0;
  for (const item of items) {
    const end = total ? start + (item.value / total) * 100 : start;
    gradient.push(`${item.color} ${start}% ${end}%`);
    start = end;
  }
  const background = total ? `conic-gradient(${gradient.join(', ')})` : 'var(--hover)';
  const description = items.map((item) => `${item.label}: ${item.value}`).join(', ');
  return `<div class="donut-wrap">
    <div class="donut" style="background:${background}" role="img" aria-label="${esc(description)}">
      <div class="donut-center"><strong>${total}</strong><small>${esc(centerLabel)}</small></div>
    </div>
    <ul class="legend">${items.map((item) => `<li><i style="background:${item.color}"></i>${esc(item.label)}<b>${item.value}</b></li>`).join('')}</ul>
  </div>`;
}

// A progress ring with a label beside it.
function ringStat(percent, color, title, note) {
  return `<div class="ring-row">
    <div class="ring" style="background:conic-gradient(${color} ${percent}%, var(--hover) 0)" role="img" aria-label="${percent}%"><b>${percent}%</b></div>
    <div><strong>${esc(title)}</strong><small>${esc(note)}</small></div>
  </div>`;
}

// The evidence funnel: how many records reach each stage.
// counts: { observation: 24, finding: 11, ... }  linkQuery: extra URL filter
function funnelChart(counts, linkQuery = '') {
  const largest = Math.max(1, ...STAGES.map((stage) => counts[stage.type]));
  let html = '<div class="funnel">';
  for (const stage of STAGES) {
    const width = Math.max(6, Math.round((counts[stage.type] / largest) * 100));
    html += `<a class="stage-${stage.type}" href="#/library?type=${stage.type}${linkQuery}">
      <span>${stage.plural}</span>
      <span class="funnel-track"><span class="funnel-fill" style="width:${width}%"></span></span>
      <b>${counts[stage.type]}</b></a>`;
  }
  return html + '</div>';
}

// Colours for charts, from the brand palette.
const CHART_COLORS = {
  positive: '#17a173', neutral: '#b9b7ae', negative: '#ef7d3c',
  series: ['#7c6cf0', '#2f7fd8', '#17a173', '#ef7d3c', '#15161c', '#c9a227'],
};
