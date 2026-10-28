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

// ===================================================================
// Dashboard components inspired by the reference designs.
// ===================================================================

// A tiny line chart for a stat card. values: [3, 5, 4, 8]
function sparkline(values, color = 'currentColor') {
  if (values.length < 2) return '';
  const width = 96;
  const height = 32;
  const largest = Math.max(...values, 1);
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - 3 - (value / largest) * (height - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `<svg class="sparkline" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
    <polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${points[points.length - 1].split(',')[0]}" cy="${points[points.length - 1].split(',')[1]}" r="3" fill="${color}"/>
  </svg>`;
}

// A small "+3 this month" badge. Green when up, grey when flat.
function deltaBadge(change, label) {
  const tone = change > 0 ? 'up' : 'flat';
  const sign = change > 0 ? '+' : '';
  return `<span class="delta delta-${tone}">${change > 0 ? icon('trending-up', 13) : ''}${sign}${change} ${esc(label)}</span>`;
}

// Pill-shaped columns; the highlighted one is solid, the rest are hatched
// (from the "project analytics" chart in the Donezo reference).
// items: [{ label, value, highlight }]
function pillColumns(items) {
  if (items.length === 0) return '<p class="quiet">No data yet.</p>';
  const largest = Math.max(1, ...items.map((item) => item.value));
  let html = `<div class="pill-columns" role="img" aria-label="${esc(items.map((i) => `${i.label}: ${i.value}`).join(', '))}">`;
  for (const item of items) {
    const height = Math.max(14, Math.round((item.value / largest) * 100));
    html += `<div class="pill-col ${item.highlight ? 'is-on' : ''}">
      <span class="pill-value">${item.value}</span>
      <span class="pill-bar" style="height:${height}%"></span>
      <span class="pill-label">${esc(item.label)}</span>
    </div>`;
  }
  return html + '</div>';
}

// A half-circle gauge with a big percentage in the middle
// (from the "project progress" gauge in the Donezo reference).
function gauge(percent, caption) {
  return `<div class="gauge" role="img" aria-label="${percent}% ${esc(caption)}">
    <div class="gauge-arc" style="--value:${percent}"></div>
    <div class="gauge-text"><strong>${percent}%</strong><span>${esc(caption)}</span></div>
  </div>`;
}

// A horizontal bar split into coloured segments, e.g. one per evidence stage.
// segments: [{ value, color, label }]
function segmentBar(segments) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  return `<div class="segments" role="img" aria-label="${esc(segments.map((s) => `${s.label}: ${s.value}`).join(', '))}">
    ${segments.map((s) => `<i style="flex:${s.value / total};background:${s.color}" title="${esc(s.label)}: ${s.value}"></i>`).join('')}
  </div>`;
}

// A row of dots, one per week; filled dots had research activity
// (from the "13 days" dot timeline in the financial dashboard reference).
// weeks: [{ label, count }]
function activityDots(weeks) {
  return `<div class="dots" role="img" aria-label="${weeks.filter((w) => w.count).length} of ${weeks.length} weeks had sessions">
    ${weeks.map((w) => `<i class="dot-${Math.min(w.count, 3)}" title="${esc(w.label)}: ${plural(w.count, 'session')}"></i>`).join('')}
  </div>`;
}

// Circles inside circles, one per step, evenly spaced, each labelled with
// its count (from the "annual profits" circles in the financial dashboard).
function concentricFunnel(counts) {
  const sizes = [100, 82, 64, 46, 28]; // % of the box, outer ring first
  let html = '<div class="rings-funnel" role="img" aria-label="' + esc(STAGES.map((s) => `${counts[s.type]} ${s.plural}`).join(', ')) + '">';
  STAGES.forEach((stage, index) => {
    html += `<span class="ring-layer stage-${stage.type}" style="width:${sizes[index]}%;height:${sizes[index]}%"><b>${counts[stage.type]}</b></span>`;
  });
  return html + '</div>';
}

// Three simple faces with counts (from the "how is it going?" faces in the
// financial dashboard reference). Drawn as tiny SVGs.
function sentimentFaces(counts) {
  const mouths = { negative: 'M8 16.5c1.2-1.6 2.5-2.2 4-2.2s2.8.6 4 2.2', neutral: 'M8.5 15.5h7', positive: 'M8 14c1.2 1.6 2.5 2.2 4 2.2s2.8-.6 4-2.2' };
  const colors = { negative: CHART_COLORS.negative, neutral: '#8f8d85', positive: CHART_COLORS.positive };
  let html = '<div class="faces">';
  for (const mood of ['negative', 'neutral', 'positive']) {
    html += `<div class="face face-${mood}">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="${colors[mood]}" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/><circle cx="9" cy="10" r=".6" fill="${colors[mood]}"/><circle cx="15" cy="10" r=".6" fill="${colors[mood]}"/><path d="${mouths[mood]}"/>
      </svg>
      <strong>${counts[mood]}</strong><span>${capital(mood)}</span>
    </div>`;
  }
  return html + '</div>';
}

// A ranked list, like a leaderboard. items: [{ label, value, unit, href, note }]
function rankList(items) {
  return `<ol class="ranks">${items.map((item, index) => `<li><a href="${item.href}">
    <span class="rank">${index + 1}</span>
    <span class="rank-text"><strong>${esc(item.label)}</strong>${item.note ? `<small>${esc(item.note)}</small>` : ''}</span>
    <span class="rank-value">${item.value}<small>${esc(item.unit)}</small></span></a></li>`).join('')}</ol>`;
}
