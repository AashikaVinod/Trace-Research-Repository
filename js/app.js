// ===================================================================
// app.js - starts TRACE, draws the sidebar and top bar, and shows the
// right page for the address. Pages come from the part of the URL
// after "#", for example #/projects/2
// ===================================================================

const view = $('#view');

const ROUTES = [
  ['/', pageHome],
  ['/projects', pageProjects],
  ['/projects/:id', pageProject],
  ['/library', pageLibrary],
  ['/record/:type/:id', pageRecord],
  ['/trail', pageTrail],
  ['/trail/:type/:id', pageTrail],
  ['/sessions', pageSessions],
  ['/sessions/:id', pageSession],
  ['/people', pagePeople],
  ['/database', pageDatabase],
];

// Reads "#/projects/2?show=all" into { page, path, params, query }.
function readUrl() {
  const [path, queryText = ''] = (decodeURI(location.hash.slice(1)) || '/').split('?');
  const query = Object.fromEntries(new URLSearchParams(queryText));
  for (const [pattern, page] of ROUTES) {
    const names = [];
    const regex = new RegExp('^' + pattern.replace(/:(\w+)/g, (match, name) => { names.push(name); return '([^/]+)'; }) + '$');
    const found = (path || '/').match(regex);
    if (found) {
      const params = {};
      names.forEach((name, index) => { params[name] = found[index + 1]; });
      return { page, path, params, query };
    }
  }
  return { page: null, path, params: {}, query };
}

function go(path) {
  if (location.hash === '#' + path) render();
  else location.hash = path;
}

// Updates the filters in the address without redrawing the page.
function setQuery(query) {
  const filled = Object.entries(query).filter(([, value]) => value !== '' && value !== null && value !== undefined);
  const text = new URLSearchParams(filled).toString();
  history.replaceState(null, '', '#' + readUrl().path + (text ? '?' + text : ''));
}

// Breadcrumbs: setCrumbs(['Projects', '#/projects'], ['Mobile banking'])
function setCrumbs(...items) {
  document.title = `${items[items.length - 1][0]} · TRACE`;
  $('#crumbs').innerHTML = items.map(([label, href], index) => {
    const isLast = index === items.length - 1;
    return isLast || !href ? `<span>${esc(label)}</span>` : `<a href="${href}">${esc(label)}</a>${icon('chevron-right', 14)}`;
  }).join('');
}

function render() {
  const { page, path, params, query } = readUrl();
  closeMenu();
  const section = '/' + (path.split('/')[1] || '');
  for (const link of $$('[data-nav]')) {
    const active = link.dataset.nav === (section === '/record' ? '/library' : section);
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
  if (page) page(params, query);
  else notFound('Page', '#/', 'home');
  renderShell();
}

// -------------------------------------------------------------------
// Shell: the demo card and background motion
// -------------------------------------------------------------------

function renderShell() {
  $('#mode-card').innerHTML = `
    <strong><span class="mode-dot sample"></span>Demo data</strong>
    <p>A fictional study. What you add is kept in this browser.</p>`;
}

function openMenu() {
  document.body.classList.add('menu-open');
  $('#menu-btn').setAttribute('aria-expanded', 'true');
  $('.nav a').focus();
}
function closeMenu() {
  document.body.classList.remove('menu-open');
  $('#menu-btn').setAttribute('aria-expanded', 'false');
}

// Lets people pause the moving background (WCAG 2.2.2 Pause, Stop, Hide).
function setMotion(paused) {
  document.body.classList.toggle('still', paused);
  $('#motion-btn').innerHTML = paused ? `${icon('play', 15)} Play motion` : `${icon('pause', 15)} Pause motion`;
  $('#motion-btn').setAttribute('aria-pressed', paused ? 'true' : 'false');
  try { localStorage.setItem('trace.motion', paused ? 'paused' : 'on'); } catch (error) { /* storage blocked */ }
}

function showShortcuts() {
  openModal({
    title: 'Keyboard shortcuts',
    body: `<ul class="shortcuts">
      <li>Search research <kbd>/</kbd></li>
      <li>Add something new <kbd>N</kbd></li>
      <li>Ask TRACE <kbd>A</kbd></li>
      <li>Show these shortcuts <kbd>?</kbd></li>
      <li>Close a dialog or panel <kbd>Esc</kbd></li>
    </ul>`,
  });
}

// Single-key shortcuts (only when you're not typing in a field).
function handleShortcut(event) {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
  if (typing || event.metaKey || event.ctrlKey || event.altKey || document.querySelector('dialog[open]')) return;
  if (event.key === '/') { event.preventDefault(); $('#search-input').focus(); }
  else if (event.key === 'n') openNewMenu();
  else if (event.key === 'a') openAssistant();
  else if (event.key === '?') showShortcuts();
  else if (event.key === 'Escape') closeMenu();
}

// -------------------------------------------------------------------
// Start
// -------------------------------------------------------------------

function start() {
  const navIcons = { '/': 'house', '/projects': 'folder-kanban', '/library': 'files', '/trail': 'waypoints', '/sessions': 'calendar-days', '/people': 'users', '/database': 'database' };
  for (const link of $$('[data-nav]')) link.insertAdjacentHTML('afterbegin', icon(navIcons[link.dataset.nav]));
  $('#menu-btn').innerHTML = icon('menu');
  $('#search-icon').innerHTML = icon('search', 16);
  $('#new-btn').innerHTML = `${icon('plus', 17)}<span>New</span>`;
  $('#ask-btn').innerHTML = `${icon('message-circle', 17)}<span>Ask TRACE</span>`;
  $('#keys-btn').innerHTML = `${icon('keyboard', 15)} Shortcuts`;

  $('#new-btn').onclick = () => openNewMenu();
  $('#ask-btn').onclick = () => openAssistant();
  $('#keys-btn').onclick = () => showShortcuts();
  $('#menu-btn').onclick = () => (document.body.classList.contains('menu-open') ? closeMenu() : openMenu());
  $('#scrim').onclick = closeMenu;
  $('#search').onsubmit = (event) => {
    event.preventDefault();
    go('/library?q=' + encodeURIComponent($('#search-input').value.trim()));
  };
  let pausedBefore = false;
  try { pausedBefore = localStorage.getItem('trace.motion') === 'paused'; } catch (error) { pausedBefore = false; }
  setMotion(pausedBefore);
  $('#motion-btn').onclick = () => setMotion(!document.body.classList.contains('still'));
  document.addEventListener('keydown', handleShortcut);

  startDatabase();
  buildAssistant();
  window.addEventListener('hashchange', () => { render(); view.focus({ preventScroll: true }); window.scrollTo(0, 0); });
  render();
}

start();
