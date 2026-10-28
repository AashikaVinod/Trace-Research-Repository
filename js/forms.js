// Schema-driven form dialogs. Validation uses the shared rules (rules.js);
// database errors are mapped back onto the matching field when possible.
import { h, icon, openDialog, button, toast } from './ui.js';
import { RULES, validateValue, validateRow } from './rules.js';
import { normalizeError } from './errors.js';

let uid = 0;

/**
 * openForm({ title, table, fields, initial, submitLabel, successMessage, onSubmit })
 * field: { name, label, half, type: text|email|date|number|textarea|select|multi,
 *          options: [] | (values) => [{ value, label, hint }], numeric, required,
 *          dependsOn: [names], help, placeholder, disabled, rows, emptyLabel, validate }
 * Resolves with onSubmit's result, or null if cancelled.
 */
export function openForm({ title, description, table, fields, initial = {}, submitLabel = 'Save', successMessage, onSubmit, size = 'md' }) {
  return new Promise((resolve) => {
    let settled = false;
    const formId = `form-${++uid}`;
    const controls = new Map(); // name -> { field, wrap, read(), render() }

    const ruleFor = (f) => ({ ...(RULES[table]?.[f.name] || {}), ...(f.required != null ? { required: f.required } : {}) });
    const isRequired = (f) => !!ruleFor(f).required;
    const optionsFor = (f, values) => (typeof f.options === 'function' ? f.options(values) : f.options || []);

    function currentValues() {
      const v = { ...initial };
      for (const [name, c] of controls) v[name] = c.read();
      return v;
    }

    function convert(f, raw) {
      if (raw === '' || raw == null) return null;
      if (f.type === 'number') { const n = Number(raw); return Number.isFinite(n) ? n : raw; }
      if (f.numeric) return Number(raw);
      return raw;
    }

    function buildControl(f) {
      const id = `${formId}-${f.name}`;
      const helpId = `${id}-help`;
      const errId = `${id}-error`;
      const errEl = h('p', { class: 'field-error', id: errId, hidden: true });
      const helpEl = f.help ? h('p', { class: 'field-help', id: helpId }, f.help) : null;
      const describedBy = [f.help ? helpId : null, errId].filter(Boolean).join(' ');
      const labelText = [f.label, isRequired(f) ? null : h('span', { class: 'field-optional' }, ' (optional)')];
      let wrap; let read; let render = () => {}; let focusTarget;

      if (f.type === 'multi') {
        const list = h('div', { class: 'multi-list' });
        const count = h('span', { class: 'multi-count', 'aria-live': 'polite' });
        const filter = h('input', { type: 'search', class: 'input input-sm', placeholder: `Filter ${f.label.toLowerCase()}`, 'aria-label': `Filter ${f.label}` });
        let selected = new Set((initial[f.name] || []).map(String));
        const updateCount = () => { count.textContent = `${selected.size} selected`; };
        render = (values) => {
          const opts = optionsFor(f, values);
          const valid = new Set(opts.map((o) => String(o.value)));
          selected = new Set([...selected].filter((v) => valid.has(v)));
          list.replaceChildren(...(opts.length ? opts.map((o) => {
            const cid = `${id}-${o.value}`;
            return h('label', { class: 'multi-option', for: cid, dataset: { text: `${o.label} ${o.hint || ''}`.toLowerCase() } },
              h('input', {
                type: 'checkbox', id: cid, value: String(o.value), checked: selected.has(String(o.value)),
                onChange: (e) => { if (e.target.checked) selected.add(e.target.value); else selected.delete(e.target.value); updateCount(); },
              }),
              h('span', { class: 'multi-label' }, o.label, o.hint ? h('span', { class: 'multi-hint' }, o.hint) : null));
          }) : [h('p', { class: 'multi-empty' }, f.emptyText || 'Nothing to choose from yet.')]));
          filter.hidden = opts.length <= 8;
          updateCount();
        };
        filter.addEventListener('input', () => {
          const q = filter.value.trim().toLowerCase();
          for (const opt of list.querySelectorAll('.multi-option')) opt.hidden = q && !opt.dataset.text.includes(q);
        });
        read = () => [...selected].map((v) => (f.numeric === false ? v : Number(v)));
        wrap = h('fieldset', { class: 'field field-multi', 'aria-describedby': describedBy },
          h('legend', { class: 'field-label' }, ...labelText, count),
          helpEl, filter, list, errEl);
        focusTarget = () => list.querySelector('input') || filter;
      } else {
        let input;
        const common = {
          id, name: f.name, class: 'input', 'aria-describedby': describedBy, disabled: f.disabled,
          placeholder: f.placeholder, required: isRequired(f) || null,
        };
        if (f.type === 'textarea') {
          input = h('textarea', { ...common, rows: f.rows || 4 });
          input.value = initial[f.name] ?? '';
        } else if (f.type === 'select') {
          input = h('select', common);
          render = (values) => {
            const prev = input.value || (initial[f.name] != null ? String(initial[f.name]) : '');
            const opts = optionsFor(f, values);
            const first = isRequired(f)
              ? h('option', { value: '', disabled: true }, f.placeholder || 'Choose…')
              : h('option', { value: '' }, f.emptyLabel || 'None');
            input.replaceChildren(first, ...opts.map((o) => h('option', { value: String(o.value) }, o.label)));
            input.value = opts.some((o) => String(o.value) === prev) ? prev : '';
          };
        } else {
          input = h('input', { ...common, type: f.type || 'text', min: f.min, max: f.max, step: f.step, autocomplete: f.autocomplete || 'off' });
          input.value = initial[f.name] ?? '';
        }
        read = () => convert(f, input.value);
        input.addEventListener('change', () => {
          for (const [, c] of controls) if (c.field.dependsOn?.includes(f.name)) c.render(currentValues());
        });
        wrap = h('div', { class: `field${f.half ? ' field-half' : ''}` },
          h('label', { class: 'field-label', for: id }, ...labelText),
          input, helpEl, errEl);
        focusTarget = () => input;
      }

      return {
        field: f, wrap, read, render, errEl, focusTarget,
        setError(msg) {
          errEl.textContent = msg || '';
          errEl.hidden = !msg;
          wrap.classList.toggle('has-error', !!msg);
          const target = focusTarget();
          if (target && f.type !== 'multi') target.setAttribute('aria-invalid', msg ? 'true' : 'false');
        },
      };
    }

    for (const f of fields) controls.set(f.name, buildControl(f));
    for (const [, c] of controls) c.render({ ...initial });

    const alertEl = h('div', { class: 'form-alert', role: 'alert', hidden: true });
    const submitBtn = button(submitLabel, { variant: 'primary', type: 'submit', form: formId });
    const form = h('form', { id: formId, class: 'dialog-body form-grid', novalidate: true },
      ...[...controls.values()].map((c) => c.wrap));

    function validate() {
      const values = currentValues();
      const errors = {};
      for (const [name, c] of controls) {
        if (c.field.disabled) continue;
        const msg = validateValue(ruleFor(c.field), values[name]) || c.field.validate?.(values[name], values);
        if (msg) errors[name] = msg;
      }
      for (const p of validateRow(table, values)) if (controls.has(p.field) && !errors[p.field]) errors[p.field] = p.message;
      for (const [name, c] of controls) c.setError(errors[name]);
      return { values, errors };
    }

    function showAlert(message) {
      alertEl.replaceChildren(icon('triangle-alert'), h('span', {}, message));
      alertEl.hidden = !message;
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      showAlert('');
      const { values, errors } = validate();
      const names = Object.keys(errors);
      if (names.length) {
        showAlert(names.length === 1 ? 'Fix the highlighted field.' : `Fix the ${names.length} highlighted fields.`);
        controls.get(names[0]).focusTarget()?.focus();
        return;
      }
      submitBtn.disabled = true;
      submitBtn.querySelector('span').textContent = 'Saving…';
      try {
        const result = await onSubmit(values);
        settled = true;
        close();
        if (successMessage) toast(typeof successMessage === 'function' ? successMessage(result) : successMessage);
        resolve(result ?? true);
      } catch (err) {
        const error = normalizeError(err, 'save');
        if (error.kind === 'partial') {
          settled = true;
          close();
          toast(error.message, { tone: 'error' });
          resolve({ partial: true, saved: err.saved });
          return;
        }
        if (error.field && controls.has(error.field)) {
          controls.get(error.field).setError(error.message);
          controls.get(error.field).focusTarget()?.focus();
        }
        showAlert(error.message);
        submitBtn.disabled = false;
        submitBtn.querySelector('span').textContent = submitLabel;
      }
    });

    const { close } = openDialog({
      title,
      description,
      size,
      body: form,
      footer: h('footer', { class: 'dialog-footer' }, alertEl,
        h('div', { class: 'dialog-actions' }, button('Cancel', { onClick: () => close() }), submitBtn)),
      onClose: () => { if (!settled) resolve(null); },
    });
    // Focus the first editable control.
    const first = [...controls.values()].find((c) => !c.field.disabled);
    first?.focusTarget()?.focus();
  });
}

/** Options helper: [{id, title}] -> [{value, label}] */
export const toOptions = (rows, label = (r) => r.title, hint) => rows.map((r) => ({ value: r.id, label: label(r), hint: hint ? hint(r) : undefined }));
export const vocabOptions = (list) => list.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }));
