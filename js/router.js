// Hash-based router: works on any static host (no server rewrites needed)
// and keeps browser back/forward working through the Evidence Trail.
const routes = [];

export function route(pattern, handler) {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
  routes.push({ re, keys, handler });
}

export function parseHash() {
  const raw = decodeURI(location.hash.slice(1)) || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs)) };
}

export function match(path) {
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) return { handler: r.handler, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

function build(path, query = {}) {
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '' && v !== false)).toString();
  return `#${path}${qs ? `?${qs}` : ''}`;
}

export function navigate(path, query) {
  const next = build(path, query);
  if (location.hash === next) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = next;
}

/** Updates the query string (e.g. filters) without re-rendering or adding history. */
export function replaceQuery(query) {
  history.replaceState(null, '', build(parseHash().path, query));
}

export function startRouter(render) {
  window.addEventListener('hashchange', render);
  render();
}
