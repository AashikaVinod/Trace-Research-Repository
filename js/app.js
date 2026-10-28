// ===================================================================
// app.js - starts TRACE, draws the shell, and picks the page to show.
// Pages are chosen from the part of the URL after "#", e.g. #/projects/2
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
];

// Reads "#/projects/2?x=1" into { path, params, query }.
function readUrl() {
  const [path, queryString = ''] = (decodeURI(location.hash.slice(1)) || '/').split('?');
  const query = Object.fromEntries(new URLSearchParams(queryString));
  for (const [pattern, page] of ROUTES) {
    const names = [];
    const regex = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '$');
    const match = (path || '/').match(regex);
    if (match) return { page, path, query, params: Object.fromEntries(names.map((n, i) => [n, match[i + 1]])) };
  }
  return { page: null, path, query, params: {} };
}

function go(path) {
  if (location.hash === '#' + path) render();
  else location.hash = path;
}

// Updates the filters in the URL without redrawing the page.
function setQuery(query) {
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null)).toString();
  history.replaceState(null, '', '#' + readUrl().path + (qs ? '?' + qs : ''));
}

function setCrumbs(...items) {
  document.title = `${items[items.length - 1][0]} · TRACE`;
  $('#crumbs').innerHTML = items.map(([label, href], i) =>
    i < items.length - 1 && href ? `<a href="${href}">${esc(label)}</a>${icon('chevron-right', 14)}` : `<span>${esc(label)}</span>`).join('');
}

function render() {
  const { page, path, params, query } = readUrl();
  document.body.classList.remove('menu-open');
  const section = '/' + (path.split('/')[1] || '');
  for (const link of $$('[data-nav]')) link.classList.toggle('active', link.dataset.nav === (section === '/record' ? '/library' : section));
  if (!page) {
    setCrumbs(['Not found']);
    view.innerHTML = `<div class="empty"><h2>Page not found</h2><a class="btn" href="#/">Go home</a></div>`;
    return;
  }
  page(params, query);
  renderShell();
}

// -------------------------------------------------------------------
// Shell: mode card, account area
// -------------------------------------------------------------------

function renderShell() {
  if (MODE === 'sample') {
    $('#mode-card').innerHTML = `
      <strong><span class="mode-dot sample"></span>Sample mode</strong>
      <p>You're exploring a fictional study. Changes stay in this browser only and are not sent to a database.</p>
      <button class="btn btn-small" id="reset-sample">${icon('rotate-ccw', 15)} Reset sample</button>`;
    $('#reset-sample').onclick = async () => {
      if (await confirmBox('Reset the sample data?', 'Everything you added or changed in this browser will be replaced with the original sample project.', 'Reset')) {
        await resetSample(); toast('Sample data restored.'); render();
      }
    };
    $('#account').innerHTML = '';
    return;
  }
  $('#mode-card').innerHTML = `
    <strong><span class="mode-dot live"></span>Connected to Supabase</strong>
    <p>${auth.isEditor ? `Editing as ${esc(auth.email)}.` : auth.session ? `Signed in as ${esc(auth.email)} (view only).` : 'Viewing only. Sign in to add or edit research.'}</p>`;
  $('#account').innerHTML = auth.session
    ? `${avatar(auth.email)}<button class="icon-btn" id="sign-out" aria-label="Sign out" title="Sign out">${icon('log-out')}</button>`
    : `<button class="btn" id="sign-in">${icon('log-in', 16)} Sign in</button>`;
  if ($('#sign-out')) $('#sign-out').onclick = async () => { await signOut(); toast('Signed out.'); render(); };
  if ($('#sign-in')) $('#sign-in').onclick = () => openSignIn();
}

function openSignIn() {
  return new Promise((resolve) => {
    let ok = false;
    const { dialog, close } = openModal({
      title: 'Sign in to edit',
      body: `<form id="signin" class="form" novalidate>
          <p class="muted full">Anyone can browse TRACE. Editors sign in to add and change research.</p>
          <div class="field"><label class="label" for="si-email">Email</label><input class="input" id="si-email" type="email" autocomplete="username"></div>
          <div class="field"><label class="label" for="si-pass">Password</label><input class="input" id="si-pass" type="password" autocomplete="current-password"></div>
        </form>`,
      footer: `<p class="form-alert" role="alert" hidden></p><button class="btn" data-close>Cancel</button><button class="btn btn-dark" type="submit" form="signin">Sign in</button>`,
      onClose: () => resolve(ok),
    });
    $('#si-email', dialog).focus();
    $('#signin', dialog).onsubmit = async (e) => {
      e.preventDefault();
      const alertBox = $('.form-alert', dialog);
      try {
        await signIn($('#si-email', dialog).value.trim(), $('#si-pass', dialog).value);
        ok = true;
        close();
        toast(auth.isEditor ? `Signed in as ${auth.email}.` : `Signed in as ${auth.email}, but this account can only view.`, auth.isEditor ? 'success' : 'error');
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

// -------------------------------------------------------------------
// Start
// -------------------------------------------------------------------

async function start() {
  const navIcons = { '/': 'house', '/projects': 'folder-kanban', '/library': 'files', '/trail': 'waypoints', '/sessions': 'calendar-days', '/people': 'users' };
  for (const link of $$('[data-nav]')) link.insertAdjacentHTML('afterbegin', icon(navIcons[link.dataset.nav]));
  $('#menu-btn').innerHTML = icon('menu');
  $('#search-icon').innerHTML = icon('search', 17);
  $('#new-btn').innerHTML = `${icon('plus', 17)}<span>New</span>`;
  $('#new-btn').onclick = () => openNewMenu();
  $('#menu-btn').onclick = () => document.body.classList.toggle('menu-open');
  $('#scrim').onclick = () => document.body.classList.remove('menu-open');
  $('#search').onsubmit = (e) => { e.preventDefault(); go('/library?q=' + encodeURIComponent($('#search-input').value.trim())); };

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
  window.addEventListener('hashchange', () => { render(); view.focus({ preventScroll: true }); window.scrollTo(0, 0); });
  render();
}

start();
