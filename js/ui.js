// Small UI toolkit. All text goes through textContent / text nodes, never
// innerHTML, so user-entered content cannot inject markup.
import { ICONS } from './icons-data.js';
import { STAGE } from './evidence.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === '') continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** h('a', { href: '#/x', class: 'link', onClick }, 'text', child) */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' && (tag === 'input' || tag === 'textarea' || tag === 'select')) el.value = v;
    else if (k === 'checked' || k === 'selected' || k === 'disabled') el[k] = Boolean(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

export function icon(name, { size = 16, label } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    'stroke-width': 1.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'icon',
  })) svg.setAttribute(k, v);
  if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); } else svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of ICONS[name] || []) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    svg.append(node);
  }
  return svg;
}

export function clear(el) { while (el.firstChild) el.firstChild.remove(); return el; }

export function button(label, { icon: iconName, variant = 'secondary', onClick, type = 'button', size, ...rest } = {}) {
  return h('button', { type, class: `btn btn-${variant}${size ? ` btn-${size}` : ''}`, onClick, ...rest },
    iconName ? icon(iconName) : null, label ? h('span', {}, label) : null);
}

export function linkButton(label, href, { icon: iconName, variant = 'secondary' } = {}) {
  return h('a', { href, class: `btn btn-${variant}` }, iconName ? icon(iconName) : null, h('span', {}, label));
}

// ---------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export function formatDate(value) {
  if (!value) return '—';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const capitalise = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function excerpt(text, max = 160) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

// ---------------------------------------------------------------------
// Badges and record bits
// ---------------------------------------------------------------------

export function stageBadge(type, { withStep = true } = {}) {
  const s = STAGE[type];
  return h('span', { class: `stage-badge stage-${type}` },
    withStep ? h('span', { class: 'stage-step', 'aria-hidden': 'true' }, String(s.step)) : null,
    s.label);
}

export function statusPill(value, tone = 'neutral') {
  return h('span', { class: `pill pill-${tone}` }, capitalise(value));
}

export const toneFor = {
  status: { active: 'mint', planned: 'blue', paused: 'orange', completed: 'neutral', cancelled: 'neutral' },
  level: { high: 'orange', medium: 'blue', low: 'neutral' },
  sentiment: { negative: 'orange', neutral: 'neutral', positive: 'mint' },
  recommendation: { accepted: 'mint', proposed: 'blue', rejected: 'neutral' },
  decision: { implemented: 'mint', approved: 'blue', proposed: 'lavender', reversed: 'neutral' },
};

export const recordHref = (type, id) => `#/library/${type}/${id}`;
export const trailHref = (type, id) => `#/trail/${type}/${id}`;

// ---------------------------------------------------------------------
// Page states
// ---------------------------------------------------------------------

export function loadingState(label = 'Loading') {
  return h('div', { class: 'state state-loading', role: 'status' },
    h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', {}, `${label}…`));
}

export function emptyState({ title, body, action }) {
  return h('div', { class: 'state state-empty' },
    h('p', { class: 'state-title' }, title),
    body ? h('p', { class: 'state-body' }, body) : null,
    action || null);
}

export function errorState(error, onRetry) {
  return h('div', { class: 'state state-error', role: 'alert' },
    icon('triangle-alert', { size: 20 }),
    h('div', {},
      h('p', { class: 'state-title' }, error?.kind === 'network' ? 'Connection problem' : 'Something went wrong'),
      h('p', { class: 'state-body' }, error?.message || String(error)),
      error?.detail && error.detail !== error.message ? h('p', { class: 'state-detail' }, `Details: ${error.detail}`) : null,
      onRetry ? button('Try again', { icon: 'refresh-cw', onClick: onRetry }) : null));
}

// ---------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------

export function toast(message, { tone = 'success', timeout } = {}) {
  const region = document.getElementById('toasts');
  if (!region) return;
  const close = () => el.remove();
  const el = h('div', { class: `toast toast-${tone}`, role: tone === 'error' ? 'alert' : 'status' },
    icon(tone === 'error' ? 'triangle-alert' : tone === 'info' ? 'info' : 'check'),
    h('p', {}, message),
    h('button', { type: 'button', class: 'toast-close', 'aria-label': 'Dismiss', onClick: close }, icon('x', { size: 14 })));
  region.append(el);
  setTimeout(close, timeout ?? (tone === 'error' ? 9000 : 4500));
}

// ---------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------

/** Opens a native <dialog>; returns { dialog, close }. Removed from the DOM on close. */
export function openDialog({ title, description, body, footer, size = 'md', onClose }) {
  const opener = document.activeElement;
  const titleId = `dlg-${Math.random().toString(36).slice(2)}`;
  const dialog = h('dialog', { class: `dialog dialog-${size}`, 'aria-labelledby': titleId },
    h('header', { class: 'dialog-header' },
      h('div', {},
        h('h2', { id: titleId, class: 'dialog-title' }, title),
        description ? h('p', { class: 'dialog-description' }, description) : null),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onClick: () => close() }, icon('x'))),
    body,
    footer || null);
  function close() {
    if (dialog.open) dialog.close();
  }
  dialog.addEventListener('close', () => {
    dialog.remove();
    onClose?.();
    if (opener && document.contains(opener)) opener.focus();
  });
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, close };
}

export function confirmDialog({ title, body, confirmLabel, tone = 'primary' }) {
  return new Promise((resolve) => {
    let result = false;
    const { close } = openDialog({
      title,
      size: 'sm',
      body: h('div', { class: 'dialog-body' }, h('p', {}, body)),
      footer: h('footer', { class: 'dialog-footer' },
        button('Cancel', { onClick: () => close() }),
        button(confirmLabel, { variant: tone, onClick: () => { result = true; close(); } })),
      onClose: () => resolve(result),
    });
  });
}
