// ===================================================================
// helpers.js - small tools used by every page.
// ===================================================================

// Make text safe to put inside HTML. Use this for ALL data, so text
// that people type can never turn into HTML or a script.
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Short names for finding elements.
function $(selector, root = document) { return root.querySelector(selector); }
function $$(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }

// An inline SVG icon. The shapes come from js/icons.js (Lucide).
function icon(name, size = 18) {
  let shapes = '';
  for (const [tag, attributes] of ICONS[name] || []) {
    let attributeText = '';
    for (const key in attributes) attributeText += ` ${key}="${attributes[key]}"`;
    shapes += `<${tag}${attributeText}/>`;
  }
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes}</svg>`;
}

// The TRACE logo mark (assets/logo-mark.svg).
function logo(size = 28) {
  return `<img src="assets/logo-mark.svg" width="${size}" height="${size}" alt="">`;
}

// ----- Text and dates ------------------------------------------------

function formatDate(value) {
  if (!value) return '—';
  const date = value.length === 10 ? new Date(value + 'T00:00:00') : new Date(value);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function today() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function plural(count, word, many = word + 's') {
  return `${count} ${count === 1 ? word : many}`;
}

function shorten(text, max = 120) {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + '…';
}

function capital(text) {
  if (!text) return '';
  return text[0].toUpperCase() + text.slice(1);
}

// ----- Small visual pieces ---------------------------------------------

// Coloured initials instead of photos (TRACE stores no personal images).
function avatar(name, size = 28) {
  const words = (name || '?').split(' ');
  const letters = (words[0][0] + (words[1] ? words[1][0] : '')).toUpperCase();
  let total = 0;
  for (const letter of name || '') total += letter.charCodeAt(0);
  return `<span class="avatar tone-${total % 5}" style="--size:${size}px" title="${esc(name)}">${esc(letters)}</span>`;
}

function pill(text, tone = 'grey') {
  return `<span class="pill pill-${tone}">${esc(capital(text))}</span>`;
}

// Which colour each status word gets.
const TONES = {
  active: 'green', planned: 'blue', paused: 'orange', completed: 'grey', cancelled: 'grey',
  high: 'orange', medium: 'blue', low: 'grey',
  negative: 'orange', neutral: 'grey', positive: 'green',
  accepted: 'green', proposed: 'purple', rejected: 'grey',
  implemented: 'green', approved: 'blue', reversed: 'grey',
};
function statusPill(value) { return pill(value, TONES[value] || 'grey'); }

// A quiet line of details, e.g. meta('Project', '2 sessions').
// The dots between items come from CSS; empty parts are skipped.
function meta(...parts) {
  const items = parts.filter((part) => part);
  return `<span class="meta">${items.map((part) => `<span>${part}</span>`).join('')}</span>`;
}

// "How the database does this" panel shown at the bottom of pages.
// concepts: list of DBMS concept names. sql: the matching SQL.
function dbPanel(concepts, sql, note = '') {
  return `<details class="db-panel">
    <summary>${icon('database')} How the database does this ${icon('chevron-down')}</summary>
    <div class="db-body">
      <div class="concepts">${concepts.map((c) => `<span class="concept">${esc(c)}</span>`).join('')}</div>
      ${note ? `<p class="muted small">${note}</p>` : ''}
      <pre class="sql">${highlightSql(sql)}</pre>
    </div>
  </details>`;
}

// Colours SQL keywords so queries are easier to read.
const SQL_WORDS = ['select', 'from', 'where', 'join', 'left join', 'on', 'group by', 'order by', 'count', 'distinct',
  'union all', 'with recursive', 'as', 'and', 'or', 'not exists', 'insert into', 'values', 'update', 'set', 'delete',
  'create view', 'create policy', 'create trigger', 'references', 'primary key', 'foreign key', 'unique', 'check',
  'returning', 'limit', 'filter', 'is null', 'ilike', 'in', 'desc', 'begin', 'commit'];
function highlightSql(sql) {
  let html = esc(sql.trim());
  html = html.replace(/(--[^\n]*)/g, '<span class="cm">$1</span>');
  html = html.replace(/(&#39;[^&]*?&#39;)/g, '<span class="str">$1</span>');
  for (const word of SQL_WORDS) {
    html = html.replace(new RegExp(`\\b(${word})\\b`, 'gi'), '<span class="kw">$1</span>');
  }
  return html;
}

// ----- Toast messages ------------------------------------------------
// toast('Saved.') or toast('Archived.', 'success', { label: 'Undo', run: fn })
function toast(message, type = 'success', action = null) {
  const box = document.createElement('div');
  box.className = `toast toast-${type}`;
  box.setAttribute('role', type === 'error' ? 'alert' : 'status');
  box.innerHTML = `${icon(type === 'error' ? 'triangle-alert' : 'circle-check')}<p>${esc(message)}</p>`;
  if (action) {
    const button = document.createElement('button');
    button.textContent = action.label;
    button.onclick = () => { box.remove(); action.run(); };
    box.append(button);
  }
  $('#toasts').append(box);
  setTimeout(() => box.remove(), action ? 8000 : type === 'error' ? 8000 : 4000);
}

// ----- Modal dialogs ---------------------------------------------------
// Opens a <dialog>. `body` and `footer` are HTML strings.
// canClose (optional) can stop the dialog closing, e.g. unsaved changes.
function openModal({ title, body, footer = '', wide = false, onClose, canClose }) {
  const opener = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = wide ? 'modal modal-wide' : 'modal';
  dialog.setAttribute('aria-label', title);
  dialog.innerHTML = `
    <header class="modal-head">
      <h2>${esc(title)}</h2>
      <button class="icon-btn" data-close aria-label="Close">${icon('x')}</button>
    </header>
    <div class="modal-body">${body}</div>
    ${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}`;

  async function requestClose() {
    if (canClose && !(await canClose())) return;
    dialog.close();
  }
  dialog.addEventListener('click', (event) => {
    if (event.target.closest('[data-close]')) requestClose();
  });
  dialog.addEventListener('cancel', (event) => { // the Escape key
    event.preventDefault();
    requestClose();
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (onClose) onClose();
    if (opener && document.contains(opener)) opener.focus(); // give focus back
  });

  document.body.append(dialog);
  dialog.showModal();
  return { dialog, close: () => dialog.close() };
}

function confirmBox(title, text, okLabel = 'Confirm') {
  return new Promise((resolve) => {
    let answer = false;
    const { dialog, close } = openModal({
      title,
      body: `<p class="muted">${esc(text)}</p>`,
      footer: `<button class="btn" data-close>Cancel</button>
               <button class="btn btn-dark" id="confirm-ok">${esc(okLabel)}</button>`,
      onClose: () => resolve(answer),
    });
    $('#confirm-ok', dialog).onclick = () => { answer = true; close(); };
  });
}

// ----- Forms ----------------------------------------------------------
// openForm({ title, fields, values, submitLabel, onSave }) shows a form,
// checks it, and calls onSave(values). Each field looks like:
//   { name, label, type, options, required, min, pattern, patternMessage,
//     half, help, disabled, number, dependsOn, check, emptyText }
// type: text | email | date | number | textarea | select | checkboxes
//       | section (a small heading that splits a long form into chunks)
//       | file (an image picker; the value is the chosen File)
// options: a list, or a function (current values) => list, which lets a
// field change when another field changes (see dependsOn).
function openForm({ title, fields, values = {}, submitLabel = 'Save', onSave }) {
  return new Promise((resolve) => {
    let saved = null;
    let startingValues = '';
    const allFields = fields;
    fields = fields.filter((field) => field.type !== 'section'); // headings are not inputs

    function getOptions(field, current) {
      return typeof field.options === 'function' ? field.options(current) : field.options || [];
    }

    function controlHtml(field, current) {
      const id = `f-${field.name}`;
      const value = current[field.name];
      const attributes = `id="${id}" name="${field.name}" ${field.disabled ? 'disabled' : ''} ${field.required ? 'aria-required="true"' : ''}`;

      if (field.type === 'textarea') {
        return `<textarea class="input" rows="${field.rows || 4}" ${attributes}>${esc(value)}</textarea>`;
      }
      if (field.type === 'select') {
        let html = `<select class="input" ${attributes}><option value="">${field.required ? 'Choose…' : 'None'}</option>`;
        for (const option of getOptions(field, current)) {
          const selected = String(option.value) === String(value ?? '') ? 'selected' : '';
          html += `<option value="${esc(option.value)}" ${selected}>${esc(option.label)}</option>`;
        }
        return html + '</select>';
      }
      if (field.type === 'checkboxes') {
        const options = getOptions(field, current);
        if (options.length === 0) return `<p class="checklist-empty">${esc(field.emptyText || 'Nothing to choose yet.')}</p>`;
        const chosen = (value || []).map(String);
        let html = `<div class="checklist" id="${id}" role="group" aria-label="${esc(field.label)}">`;
        for (const option of options) {
          const checked = chosen.includes(String(option.value)) ? 'checked' : '';
          html += `<label class="check"><input type="checkbox" value="${esc(option.value)}" ${checked}>
            <span>${esc(option.label)}${option.hint ? `<small>${esc(option.hint)}</small>` : ''}</span></label>`;
        }
        return html + '</div>';
      }
      if (field.type === 'file') return `<input class="input" type="file" accept="image/*" ${attributes}>`;
      return `<input class="input" type="${field.type || 'text'}" value="${esc(value)}" ${attributes}>`;
    }

    function fieldHtml(field) {
      if (field.type === 'section') return `<p class="form-section">${esc(field.label)}</p>`;
      const optional = field.required ? '' : ' <span class="optional">optional</span>';
      return `<div class="field ${field.half ? 'half' : ''}" data-field="${field.name}">
        <label class="label" for="f-${field.name}">${esc(field.label)}${optional}</label>
        <div class="control">${controlHtml(field, values)}</div>
        ${field.help ? `<p class="help">${esc(field.help)}</p>` : ''}
        <p class="error" hidden></p>
      </div>`;
    }

    // Ask before throwing away changes (an HCI "error prevention" rule).
    async function canClose() {
      if (saved || JSON.stringify(readValues()) === startingValues) return true;
      return confirmBox('Discard your changes?', 'You have changes in this form that are not saved yet.', 'Discard');
    }

    const { dialog, close } = openModal({
      title,
      wide: fields.some((field) => field.type === 'checkboxes'),
      body: `<form id="the-form" class="form" novalidate>${allFields.map(fieldHtml).join('')}</form>`,
      footer: `<p class="form-alert" role="alert" hidden></p>
        <button class="btn" type="button" data-close>Cancel</button>
        <button class="btn btn-dark" type="submit" form="the-form">${esc(submitLabel)}</button>`,
      onClose: () => resolve(saved),
      canClose,
    });
    const form = $('#the-form', dialog);

    // Read every field into a plain object.
    function readValues() {
      const result = { ...values };
      for (const field of fields) {
        if (field.type === 'checkboxes') {
          result[field.name] = $$(`[data-field="${field.name}"] input:checked`, form).map((box) => Number(box.value));
          continue;
        }
        if (field.type === 'file') { result[field.name] = $(`#f-${field.name}`, form).files[0] || null; continue; }
        const raw = $(`#f-${field.name}`, form).value.trim();
        if (raw === '') result[field.name] = null;
        else if (field.number || field.type === 'number') result[field.name] = Number(raw);
        else result[field.name] = raw;
      }
      return result;
    }
    startingValues = JSON.stringify(readValues());

    // Re-draw fields whose options depend on the field that changed.
    form.addEventListener('change', (event) => {
      const changed = event.target.name;
      if (!changed) return;
      const current = readValues();
      for (const field of fields) {
        if ((field.dependsOn || []).includes(changed)) {
          $(`[data-field="${field.name}"] .control`, form).innerHTML = controlHtml(field, current);
        }
      }
    });

    function findProblems(current) {
      const problems = {};
      for (const field of fields) {
        if (field.disabled) continue;
        const value = current[field.name];
        const isEmpty = value === null || (Array.isArray(value) && value.length === 0);
        if (field.required && isEmpty) problems[field.name] = 'This is required.';
        else if (typeof value === 'string' && field.min && value.length < field.min) problems[field.name] = `Use at least ${field.min} characters.`;
        else if (typeof value === 'string' && field.pattern && !field.pattern.test(value)) problems[field.name] = field.patternMessage || 'Check the format.';
        else if (field.check) {
          const message = field.check(value, current);
          if (message) problems[field.name] = message;
        }
      }
      return problems;
    }

    function showProblems(problems) {
      for (const field of fields) {
        const box = $(`[data-field="${field.name}"]`, form);
        const message = problems[field.name] || '';
        box.classList.toggle('has-error', message !== '');
        $('.error', box).textContent = message;
        $('.error', box).hidden = message === '';
        const input = $(`#f-${field.name}`, form);
        if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
      }
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const alertBox = $('.form-alert', dialog);
      alertBox.hidden = true;
      const current = readValues();
      const problems = findProblems(current);
      showProblems(problems);
      const firstProblem = Object.keys(problems)[0];
      if (firstProblem) {
        alertBox.textContent = 'Please fix the highlighted fields.';
        alertBox.hidden = false;
        const target = $(`#f-${firstProblem}`, form) || $(`[data-field="${firstProblem}"] input`, form);
        if (target) target.focus();
        return;
      }

      const button = $('button[type=submit]', dialog);
      button.disabled = true;
      button.textContent = 'Saving…';
      try {
        saved = (await onSave(current)) || true;
        close();
      } catch (error) {
        if (error.saved) { // the record saved but its links did not
          saved = error.saved;
          close();
          toast(error.message, 'error');
          return;
        }
        if (error.field) showProblems({ [error.field]: error.message });
        alertBox.textContent = error.message;
        alertBox.hidden = false;
        button.disabled = false;
        button.textContent = submitLabel;
      }
    });

    const first = $('.input:not([disabled])', form);
    if (first) first.focus();
  });
}


// Shrinks a photo before it's stored (browsers only keep a few MB), and
// returns it as a "data URL" string that can be saved like any text.
function readImage(file, maxSize = 1400) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('Choose an image file (JPG, PNG or WebP).')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That file couldn't be read."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("That image couldn't be opened."));
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
