// LOCAL TESTING ONLY. Imitates the two parts of a Supabase project that
// TRACE uses, so the real supabase-js client can be tested offline:
//   /rest/v1/*  -> proxied to a local PostgREST (the engine Supabase runs)
//   /auth/v1/*  -> a tiny MOCK of Supabase Auth (password sign-in only)
// The mock auth is NOT Supabase Auth; it only issues JWTs like it would.
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.MOCK_PORT || 54321);
const POSTGREST = process.env.POSTGREST_URL || 'http://127.0.0.1:3000';
const SECRET = process.env.JWT_SECRET;
const USERS = {
  'editor@example.org': { id: '00000000-0000-0000-0000-0000000000e1', password: 'editor-pass' },
  'viewer@example.org': { id: '00000000-0000-0000-0000-0000000000a1', password: 'viewer-pass' },
};

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export function sign(payload, secret = SECRET) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(payload);
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

function cors(res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,DELETE,HEAD,OPTIONS,PUT');
  res.setHeader('access-control-expose-headers', 'content-range, x-total-count');
}
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => { d += c; }); req.on('end', () => r(d)); });

function userFor(email) {
  const u = USERS[email];
  return { id: u.id, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' };
}

http.createServer(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  const url = new URL(req.url, 'http://x');

  if (url.pathname.startsWith('/auth/v1/')) {
    const path = url.pathname.slice(8);
    if (path === '/token' && url.searchParams.get('grant_type') === 'password') {
      const { email, password } = JSON.parse(await readBody(req) || '{}');
      if (!USERS[email] || USERS[email].password !== password) return json(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      const now = Math.floor(Date.now() / 1000);
      const user = userFor(email);
      const access_token = sign({ sub: user.id, email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600 });
      return json(res, 200, { access_token, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: `refresh-${user.id}`, user });
    }
    if (path === '/user') {
      try {
        const token = (req.headers.authorization || '').split(' ')[1];
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        if (!payload.email) throw new Error('no user');
        return json(res, 200, userFor(payload.email));
      } catch { return json(res, 401, { msg: 'invalid token' }); }
    }
    if (path === '/logout') { res.writeHead(204).end(); return; }
    return json(res, 404, { msg: `mock auth does not implement ${path}` });
  }

  if (url.pathname.startsWith('/rest/v1')) {
    const target = POSTGREST + url.pathname.slice(8) + url.search;
    const headers = { ...req.headers };
    delete headers.host;
    // Supabase's gateway turns the apikey into the bearer token when no user token is sent.
    if (!headers.authorization && headers.apikey) headers.authorization = `Bearer ${headers.apikey}`;
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
    try {
      const r = await fetch(target, { method: req.method, headers, body });
      const out = Buffer.from(await r.arrayBuffer());
      const h = {};
      r.headers.forEach((v, k) => { if (!['content-encoding', 'transfer-encoding', 'connection'].includes(k)) h[k] = v; });
      res.writeHead(r.status, h);
      res.end(req.method === 'HEAD' ? undefined : out);
    } catch (e) { json(res, 502, { message: `PostgREST unreachable: ${e.message}` }); }
    return;
  }
  json(res, 404, { msg: 'not found' });
}).listen(PORT, () => console.log(`mock Supabase on http://localhost:${PORT}`));
