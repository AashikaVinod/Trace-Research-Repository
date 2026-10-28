// Authentication for Supabase mode. Visitors read; signing in with an
// account listed in public.trace_editor enables editing. In demo mode
// everything is editable locally and no sign-in exists.
import { getMode, getClient, checkIsEditor } from './data-access.js';
import { h, openDialog, button, toast, icon } from './ui.js';
import { normalizeError } from './errors.js';

const state = { session: null, email: null, isEditor: false, editorCheckFailed: false };
const listeners = new Set();

export const authState = () => ({ ...state });
export const onAuthChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn(authState()));

async function applySession(session) {
  state.session = session || null;
  state.email = session?.user?.email || null;
  state.isEditor = false;
  state.editorCheckFailed = false;
  if (session) {
    try { state.isEditor = await checkIsEditor(); } catch { state.editorCheckFailed = true; }
  }
}

export async function initAuth() {
  if (getMode() !== 'supabase') return;
  const client = getClient();
  const { data } = await client.auth.getSession();
  await applySession(data?.session);
  client.auth.onAuthStateChange((_event, session) => {
    // Run outside the callback: awaiting Supabase calls inside it can deadlock.
    setTimeout(() => applySession(session).then(emit), 0);
  });
}

export const canEdit = () => getMode() === 'demo' || state.isEditor;

function explainNotEditor() {
  toast(state.editorCheckFailed
    ? "Signed in, but TRACE couldn't confirm editing access. Check that sql/03_security.sql has been run."
    : `${state.email} can view TRACE but isn't an editor. Add this account to public.trace_editor (see README).`,
  { tone: 'error' });
}

/** Resolves true when the current user may edit, prompting sign-in if needed. */
export async function requireEditor() {
  if (canEdit()) return true;
  if (state.session) { explainNotEditor(); return false; }
  const signedIn = await openSignIn();
  if (!signedIn) return false;
  if (!state.isEditor) { explainNotEditor(); return false; }
  return true;
}

export function openSignIn() {
  return new Promise((resolve) => {
    let ok = false;
    const email = h('input', { id: 'signin-email', type: 'email', class: 'input', autocomplete: 'username', required: true });
    const password = h('input', { id: 'signin-password', type: 'password', class: 'input', autocomplete: 'current-password', required: true });
    const alertEl = h('div', { class: 'form-alert', role: 'alert', hidden: true });
    const submit = button('Sign in', { variant: 'primary', type: 'submit', form: 'signin-form' });
    const form = h('form', { id: 'signin-form', class: 'dialog-body form-grid', novalidate: true },
      h('p', { class: 'muted' }, 'Visitors can browse TRACE. Sign in with an editor account to create and change records.'),
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'signin-email' }, 'Email'), email),
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'signin-password' }, 'Password'), password));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      alertEl.hidden = true;
      if (!email.value.trim() || !password.value) {
        alertEl.replaceChildren(icon('triangle-alert'), h('span', {}, 'Enter your email and password.'));
        alertEl.hidden = false;
        return;
      }
      submit.disabled = true;
      submit.querySelector('span').textContent = 'Signing in…';
      const { data, error } = await getClient().auth.signInWithPassword({ email: email.value.trim(), password: password.value });
      if (error) {
        const message = /invalid login/i.test(error.message) ? 'Email or password is incorrect.' : normalizeError(error, 'sign in').message;
        alertEl.replaceChildren(icon('triangle-alert'), h('span', {}, message));
        alertEl.hidden = false;
        submit.disabled = false;
        submit.querySelector('span').textContent = 'Sign in';
        return;
      }
      await applySession(data.session);
      emit();
      ok = true;
      close();
      toast(state.isEditor ? `Signed in as ${state.email}.` : `Signed in as ${state.email} (view only).`, { tone: state.isEditor ? 'success' : 'info' });
    });
    const { close } = openDialog({
      title: 'Sign in to edit',
      size: 'sm',
      body: form,
      footer: h('footer', { class: 'dialog-footer' }, alertEl,
        h('div', { class: 'dialog-actions' }, button('Cancel', { onClick: () => close() }), submit)),
      onClose: () => resolve(ok),
    });
    email.focus();
  });
}

export async function signOut() {
  const { error } = await getClient().auth.signOut();
  if (error) { toast(normalizeError(error, 'sign out').message, { tone: 'error' }); return; }
  await applySession(null);
  emit();
  toast('Signed out. TRACE is now read-only.', { tone: 'info' });
}
