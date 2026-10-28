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
// Shell: mode card, account, background motion
// -------------------------------------------------------------------

function renderShell() {
  if (MODE === 'sample') {
    $('#mode-card').innerHTML = `
      <div class="row"><strong><span class="mode-dot sample"></span>Sample mode</strong>
        <button class="btn btn-small" id="reset-sample" title="Reset the sample data">${icon('rotate-ccw', 14)} Reset</button></div>
      <p>A fictional study. Changes are saved in this browser only.</p>`;
    $('#reset-sample').onclick = async () => {
      const ok = await confirmBox('Reset the sample data?', 'Everything you added or changed in this browser will be replaced with the original sample study.', 'Reset');
      if (ok) { await resetSample(); toast('Sample data restored.'); render(); }
    };
    $('#account').innerHTML = '';
    return;
  }
  let status = 'View only. Sign in to edit.';
  if (auth.isEditor) status = `Editing as ${esc(auth.email)}.`;
  else if (auth.session) status = `Signed in as ${esc(auth.email)} (view only).`;
  $('#mode-card').innerHTML = `<strong><span class="mode-dot live"></span>Supabase</strong><p>${status}</p>`;
  $('#account').innerHTML = auth.session
    ? `${avatar(auth.email)}<button class="icon-btn" id="sign-out" aria-label="Sign out" title="Sign out">${icon('log-out')}</button>`
    : `<button class="btn" id="sign-in">${icon('log-in', 16)}<span>Sign in</span></button>`;
  if ($('#sign-out')) $('#sign-out').onclick = async () => { await signOut(); toast('Signed out.'); render(); };
  if ($('#sign-in')) $('#sign-in').onclick = () => openSignIn();
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

function openSignIn() {
  return new Promise((resolve) => {
    let signedIn = false;
    const { dialog, close } = openModal({
      title: 'Sign in to edit',
      body: `<form id="signin" class="form" novalidate>
          <div class="full" style="display:flex;gap:12px;align-items:center">${logo(36)}<p class="muted">Anyone can browse TRACE. Editors sign in to add and change research.</p></div>
          <div class="field"><label class="label" for="si-email">Email</label><input class="input" id="si-email" type="email" autocomplete="username"></div>
          <div class="field"><label class="label" for="si-pass">Password</label><input class="input" id="si-pass" type="password" autocomplete="current-password"></div>
        </form>`,
      footer: `<p class="form-alert" role="alert" hidden></p>
        <button class="btn" data-close>Cancel</button>
        <button class="btn btn-dark" type="submit" form="signin">Sign in</button>`,
      onClose: () => resolve(signedIn),
    });
    $('#si-email', dialog).focus();
    $('#signin', dialog).onsubmit = async (event) => {
      event.preventDefault();
      const alertBox = $('.form-alert', dialog);
      try {
        await signIn($('#si-email', dialog).value.trim(), $('#si-pass', dialog).value);
        signedIn = true;
        close();
        if (auth.isEditor) toast(`Signed in as ${auth.email}.`);
        else toast(`Signed in as ${auth.email}, but this account can only view.`, 'error');
        render();
      } catch (error) {
        alertBox.textContent = error.message;
        alertBox.hidden = false;
      }
    };
  });
}

// Every add/edit form calls this first.
async function requireEditor() {
  if (canEdit()) return true;
  if (!auth.session) await openSignIn();
  else toast(`${auth.email} can view TRACE but isn't an editor. Add it to trace_editor (see README).`, 'error');
  return canEdit();
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

async function start() {
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

  try {
    await startDatabase();
  } catch (error) {
    setCrumbs(['Problem']);
    view.innerHTML = `<div class="empty error">
      <h2>${error.kind === 'config' ? 'TRACE cannot start with this configuration' : "TRACE couldn't load its data"}</h2>
      <p>${esc(error.message)}</p>
      ${error.kind === 'config' ? '<p class="muted">Fix js/config.js and reload. Leave both values empty to use sample mode.</p>' : '<button class="btn" id="retry">Try again</button>'}
    </div>`;
    if ($('#retry')) $('#retry').onclick = () => location.reload();
    return;
  }

  if (MODE === 'supabase') {
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') setTimeout(() => setSession(session).then(renderShell), 0);
    });
  }
  buildAssistant();
  window.addEventListener('hashchange', () => { render(); view.focus({ preventScroll: true }); window.scrollTo(0, 0); });
  render();
}

start();
