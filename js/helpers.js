// ===================================================================
// helpers.js - small tools used by every page.
// ===================================================================

// Escape text before putting it inside HTML. ALWAYS use this for data,
// so text typed by users can never become HTML or scripts.
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

// Returns an inline SVG icon (shapes from js/icons.js).
function icon(name, size = 18) {
  const shapes = (ICONS[name] || []).map(([tag, attrs]) =>
    `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes}</svg>`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = value.length === 10 ? new Date(value + 'T00:00:00') : new Date(value);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const plural = (n, word, many = word + 's') => `${n} ${n === 1 ? word : many}`;
const shorten = (text, max = 120) => (!text ? '' : text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text);
const capital = (text) => (text ? text[0].toUpperCase() + text.slice(1) : '');

// Coloured initials instead of photos (no personal images are stored).
function avatar(name, size = 28) {
  const letters = (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const hue = [...(name || '')].reduce((h, c) => h + c.charCodeAt(0), 0) % 5;
  return `<span class="avatar tone-${hue}" style="--size:${size}px" title="${esc(name)}">${esc(letters)}</span>`;
}

function pill(text, tone = 'grey') {
  return `<span class="pill pill-${tone}">${esc(capital(text))}</span>`;
}

const TONES = {
  active: 'green', planned: 'blue', paused: 'orange', completed: 'grey', cancelled: 'grey',
  high: 'orange', medium: 'blue', low: 'grey',
  negative: 'orange', neutral: 'grey', positive: 'green',
  accepted: 'green', proposed: 'purple', rejected: 'grey',
  implemented: 'green', approved: 'blue', reversed: 'grey',
};
const statusPill = (value) => pill(value, TONES[value] || 'grey');

// ----- Toast messages ------------------------------------------------
function toast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `${icon(type === 'error' ? 'triangle-alert' : 'circle-check')}<p>${esc(message)}</p>`;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), type === 'error' ? 8000 : 4000);
}

// ----- Modal dialogs ---------------------------------------------------
// Opens a <dialog>. `body` and `footer` are HTML strings.
function openModal({ title, body, footer = '', wide = false, onClose }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal' + (wide ? ' modal-wide' : '');
  dialog.innerHTML = `
    <header class="modal-head">
      <h2>${esc(title)}</h2>
      <button class="icon-btn" data-close aria-label="Close">${icon('x')}</button>
    </header>
    <div class="modal-body">${body}</div>
    ${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}`;
  const close = () => dialog.close();
  dialog.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  dialog.addEventListener('close', () => { dialog.remove(); if (onClose) onClose(); });
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, close };
}

function confirmBox(title, text, okLabel = 'Confirm') {
  return new Promise((resolve) => {
    let answer = false;
    const { dialog, close } = openModal({
      title,
      body: `<p class="muted">${esc(text)}</p>`,
      footer: `<button class="btn" data-close>Cancel</button><button class="btn btn-dark" id="confirm-ok">${esc(okLabel)}</button>`,
      onClose: () => resolve(answer),
    });
    $('#confirm-ok', dialog).onclick = () => { answer = true; close(); };
  });
}

// ----- Forms ----------------------------------------------------------
// openForm({ title, fields, values, submitLabel, onSave })
// Each field: { name, label, type, options, required, min, pattern,
//   patternMessage, half, help, disabled, number, dependsOn, check }
// type: text | email | date | number | textarea | select | checkboxes
// `options` can be a list, or a function (currentValues) => list, so a
// field can change when another one does (see `dependsOn`).
function openForm({ title, fields, values = {}, submitLabel = 'Save', onSave }) {
  return new Promise((resolve) => {
    let saved = null;
    const getOptions = (field, current) => (typeof field.options === 'function' ? field.options(current) : field.options || []);

    function controlHtml(field, current) {
      const id = `f-${field.name}`;
      const value = current[field.name];
      const attrs = `id="${id}" name="${field.name}" ${field.disabled ? 'disabled' : ''}`;
      if (field.type === 'textarea') return `<textarea class="input" rows="${field.rows || 4}" ${attrs}>${esc(value)}</textarea>`;
      if (field.type === 'select') {
        const options = getOptions(field, current);
        return `<select class="input" ${attrs}>
          <option value="">${field.required ? 'Choose…' : 'None'}</option>
          ${options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(value ?? '') ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
        </select>`;
      }
      if (field.type === 'checkboxes') {
        const options = getOptions(field, current);
        const chosen = (value || []).map(String);
        if (!options.length) return `<p class="checklist-empty">${esc(field.emptyText || 'Nothing to choose yet.')}</p>`;
        return `<div class="checklist" id="${id}">${options.map((o) => `
          <label class="check"><input type="checkbox" value="${esc(o.value)}" ${chosen.includes(String(o.value)) ? 'checked' : ''}>
            <span>${esc(o.label)}${o.hint ? `<small>${esc(o.hint)}</small>` : ''}</span></label>`).join('')}</div>`;
      }
      return `<input class="input" type="${field.type || 'text'}" value="${esc(value)}" ${attrs}>`;
    }

    function fieldHtml(field, current) {
      const optional = field.required ? '' : ' <span class="optional">optional</span>';
      return `<div class="field ${field.half ? 'half' : ''}" data-field="${field.name}">
        <label class="label" for="f-${field.name}">${esc(field.label)}${optional}</label>
        <div class="control">${controlHtml(field, current)}</div>
        ${field.help ? `<p class="help">${esc(field.help)}</p>` : ''}
        <p class="error" hidden></p>
      </div>`;
    }

    const { dialog, close } = openModal({
      title,
      wide: fields.some((f) => f.type === 'checkboxes'),
      body: `<form id="the-form" class="form" novalidate>${fields.map((f) => fieldHtml(f, values)).join('')}</form>`,
      footer: `<p class="form-alert" role="alert" hidden></p>
        <button class="btn" type="button" data-close>Cancel</button>
        <button class="btn btn-dark" type="submit" form="the-form">${esc(submitLabel)}</button>`,
      onClose: () => resolve(saved),
    });
    const form = $('#the-form', dialog);

    // Read every field into a plain object.
    function readValues() {
      const result = { ...values };
      for (const field of fields) {
        if (field.type === 'checkboxes') {
          result[field.name] = $$(`[data-field="${field.name}"] input:checked`, form).map((i) => Number(i.value));
          continue;
        }
        const raw = $(`#f-${field.name}`, form).value.trim();
        if (raw === '') result[field.name] = null;
        else if (field.number || field.type === 'number') result[field.name] = Number(raw);
        else result[field.name] = raw;
      }
      return result;
    }

    // Re-draw fields whose options depend on another field.
    form.addEventListener('change', (e) => {
      const changed = e.target.name;
      if (!changed) return;
      const current = readValues();
      for (const field of fields.filter((f) => (f.dependsOn || []).includes(changed))) {
        $(`[data-field="${field.name}"] .control`, form).innerHTML = controlHtml(field, current);
      }
    });

    function validate(current) {
      const problems = {};
      for (const field of fields) {
        if (field.disabled) continue;
        const v = current[field.name];
        if (field.required && (v == null || (Array.isArray(v) && !v.length))) problems[field.name] = 'This is required.';
        else if (typeof v === 'string' && field.min && v.length < field.min) problems[field.name] = `Use at least ${field.min} characters.`;
        else if (typeof v === 'string' && field.pattern && !field.pattern.test(v)) problems[field.name] = field.patternMessage || 'Check the format.';
        else if (field.check) { const msg = field.check(v, current); if (msg) problems[field.name] = msg; }
      }
      return problems;
    }

    function showProblems(problems) {
      for (const field of fields) {
        const box = $(`[data-field="${field.name}"]`, form);
        const message = problems[field.name];
        box.classList.toggle('has-error', !!message);
        $('.error', box).textContent = message || '';
        $('.error', box).hidden = !message;
      }
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertBox = $('.form-alert', dialog);
      alertBox.hidden = true;
      const current = readValues();
      const problems = validate(current);
      showProblems(problems);
      if (Object.keys(problems).length) {
        $(`[data-field="${Object.keys(problems)[0]}"] .input, [data-field="${Object.keys(problems)[0]}"] input`, form)?.focus();
        return;
      }
      const button = $('button[type=submit]', dialog);
      button.disabled = true;
      button.textContent = 'Saving…';
      try {
        saved = (await onSave(current)) ?? true;
        close();
      } catch (error) {
        if (error.saved) { saved = error.saved; close(); toast(error.message, 'error'); return; }
        if (error.field && fields.some((f) => f.name === error.field)) showProblems({ [error.field]: error.message });
        alertBox.textContent = error.message;
        alertBox.hidden = false;
        button.disabled = false;
        button.textContent = submitLabel;
      }
    });

    $('.input', form)?.focus();
  });
}

// A quiet line of details, e.g. meta('Project', '2 sessions').
// The dots between items come from CSS, so empty parts disappear.
function meta(...parts) {
  return `<span class="meta">${parts.filter(Boolean).map((p) => `<span>${p}</span>`).join('')}</span>`;
}
