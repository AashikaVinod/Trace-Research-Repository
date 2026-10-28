// TRACE application bootstrap: chooses the data source, builds the shell,
// and renders pages for each route.
import { initDataSource, getMode, isDemoPersistent, resetDemoData } from './data-access.js';
import { initAuth, authState, onAuthChange, openSignIn, signOut, requireEditor } from './auth.js';
import { route, match, parseHash, navigate, startRouter } from './router.js';
import { h, icon, button, clear, errorState, emptyState, linkButton, confirmDialog, toast } from './ui.js';
import * as dashboard from './pages/dashboard.js';
import * as projects from './pages/projects.js';
import * as library from './pages/library.js';
import * as trail from './pages/trail.js';
import * as sessions from './pages/sessions.js';
import * as participants from './pages/participants.js';
import * as reference from './pages/reference.js';

const view = document.getElementById('main');
let renderToken = 0;
let leaveHandlers = [];

// ---------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------

function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) el.replaceWith(icon(el.dataset.icon, { size: 17 }));
}

function setNavOpen(open) {
  document.body.classList.toggle('nav-open', open);
  document.getElementById('menu-btn').setAttribute('aria-expanded', String(open));
  document.getElementById('scrim').hidden = !open;
}

function setContext({ title, crumbs = [] }) {
  document.title = title ? `${title} · TRACE` : 'TRACE';
  const nav = clear(document.getElementById('crumbs'));
  const ol = h('ol', {});
  crumbs.forEach((c, i) => {
    const last = i === crumbs.length - 1;
    ol.append(h('li', {},
      c.href && !last ? h('a', { href: c.href }, c.label) : h('span', { 'aria-current': last ? 'page' : null }, c.label),
      last ? null : icon('chevron-right', { size: 14 })));
  });
  nav.append(ol);
}

function renderStatus() {
  const el = clear(document.getElementById('status'));
  const mode = getMode();
  if (mode === 'demo') {
    el.append(h('span', { class: 'mode-chip mode-demo', title: 'Changes are stored in this browser only' }, icon('hard-drive', { size: 14 }), 'Demo data'));
    return;
  }
  const a = authState();
  el.append(h('span', { class: 'mode-chip mode-live', title: 'Reading and writing PostgreSQL through Supabase' }, icon('database', { size: 14 }),
    a.isEditor ? 'Supabase: editing' : 'Supabase: read-only'));
  if (a.session) {
    el.append(h('span', { class: 'user-email', title: a.email }, a.email),
      button('', { icon: 'log-out', variant: 'ghost', 'aria-label': 'Sign out', title: 'Sign out', onClick: signOut }));
  } else {
    el.append(button('Sign in', { icon: 'log-in', variant: 'ghost', onClick: () => openSignIn() }));
  }
}

function renderBanner() {
  const el = clear(document.getElementById('banner'));
  if (getMode() !== 'demo') return;
  el.append(h('div', { class: 'banner banner-demo', role: 'note' },
    icon('info', { size: 16 }),
    h('p', {},
      h('strong', {}, 'Demo mode. '),
      isDemoPersistent()
        ? 'Changes are saved in this browser only, not in PostgreSQL. See the README to connect Supabase.'
        : 'This browser blocks local storage, so changes will be lost when you leave. Nothing is saved to PostgreSQL.'),
    button('Reset demo data', {
      icon: 'rotate-ccw', variant: 'ghost', size: 'sm',
      onClick: async () => {
        const ok = await confirmDialog({ title: 'Reset demo data?', body: 'This replaces everything you changed in demo mode with the original sample data. It does not affect any database.', confirmLabel: 'Reset demo data', tone: 'danger' });
        if (!ok) return;
        resetDemoData();
        toast('Demo data reset to the original sample.');
        renderRoute();
      },
    })));
}

// ---------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------

route('/', dashboard.render);
route('/projects', projects.renderList);
route('/projects/:id', projects.renderDetail);
route('/library', library.renderList);
route('/library/:type/:id', library.renderDetail);
route('/trail', trail.render);
route('/trail/:type/:id', trail.render);
route('/sessions', sessions.renderList);
route('/sessions/:id', sessions.renderDetail);
route('/participants', participants.renderList);
route('/reference', reference.render);

function navKeyFor(path) {
  const first = path.split('/')[1] || 'dashboard';
  return first;
}

async function renderRoute() {
  const token = ++renderToken;
  leaveHandlers.forEach((fn) => fn());
  leaveHandlers = [];
  setNavOpen(false);
  const { path, query } = parseHash();
  const key = navKeyFor(path);
  for (const a of document.querySelectorAll('[data-nav]')) {
    if (a.dataset.nav === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  const searchInput = document.getElementById('global-q');
  if (key !== 'library') searchInput.value = '';

  const found = match(path);
  const ctx = {
    view,
    params: found?.params || {},
    query,
    setContext,
    stale: () => token !== renderToken,
    refresh: () => renderRoute(),
    navigate,
    onLeave: (fn) => leaveHandlers.push(fn),
    guard: (fn) => async (...args) => { if (await requireEditor()) return fn(...args); return null; },
  };
  if (!found) {
    setContext({ title: 'Not found', crumbs: [{ label: 'Not found' }] });
    view.replaceChildren(emptyState({ title: 'This page does not exist', body: `There is nothing at "${path}".`, action: linkButton('Go to the dashboard', '#/', { variant: 'primary' }) }));
    return;
  }
  try {
    await found.handler(ctx);
  } catch (e) {
    if (token === renderToken) view.replaceChildren(errorState(e, ctx.refresh));
    console.error(e);
  }
  if (token === renderToken && document.activeElement === document.body) view.focus({ preventScroll: true });
}

// ---------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------

function renderConfigProblem(config) {
  setContext({ title: 'Configuration problem', crumbs: [{ label: 'Configuration problem' }] });
  view.replaceChildren(h('section', { class: 'config-problem', role: 'alert' },
    h('h1', {}, 'TRACE cannot start with this configuration'),
    h('p', {}, 'js/config.js contains values that are incomplete or unsafe. TRACE will not fall back to demo mode, so you never mistake local data for the database.'),
    h('ul', {}, config.problems.map((p) => h('li', {}, p))),
    h('p', { class: 'muted' }, 'Fix js/config.js and reload. To use demo mode instead, set both values to empty strings.')));
}

async function start() {
  hydrateIcons();
  document.getElementById('menu-btn').addEventListener('click', () => setNavOpen(!document.body.classList.contains('nav-open')));
  document.getElementById('scrim').addEventListener('click', () => setNavOpen(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('nav-open')) setNavOpen(false); });
  document.getElementById('global-search').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = document.getElementById('global-q').value.trim();
    navigate('/library', { q });
  });

  let config;
  try {
    config = await initDataSource();
  } catch (e) {
    view.replaceChildren(errorState({ message: `TRACE could not connect to Supabase: ${e.message}`, kind: 'network' }, () => location.reload()));
    return;
  }
  if (config.mode === 'invalid') { renderConfigProblem(config); return; }

  try {
    await initAuth();
  } catch (e) {
    toast(`Couldn't restore your sign-in: ${e.message}`, { tone: 'error' });
  }
  renderStatus();
  renderBanner();
  onAuthChange(() => { renderStatus(); renderRoute(); });
  startRouter(renderRoute);
}

start();
