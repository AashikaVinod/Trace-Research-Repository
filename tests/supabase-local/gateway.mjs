// LOCAL TESTING ONLY. Imitates the two parts of a Supabase project that
// TRACE uses, so the real supabase-js client can be tested offline:
//   /rest/v1/*     -> proxied to a local PostgREST (the engine Supabase runs)
//   /storage/v1/*  -> a tiny MOCK of Supabase Storage (upload, public read, delete)
// It is NOT Supabase; it only answers the way Supabase does for these calls.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.MOCK_PORT || 54321);
const POSTGREST = process.env.POSTGREST_URL || 'http://127.0.0.1:3000';
const files = new Map(); // photos uploaded by the app: name -> { type, bytes }

function cors(res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,DELETE,HEAD,OPTIONS,PUT');
  res.setHeader('access-control-expose-headers', 'content-range, x-total-count');
}
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((resolve) => { const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => resolve(Buffer.concat(chunks))); });

// supabase-js uploads a Blob as multipart form data: pull the file part out.
function filePart(body, contentType) {
  const boundary = '--' + /boundary=(.+)$/.exec(contentType)[1];
  for (const part of body.toString('latin1').split(boundary)) {
    if (!/filename=/.test(part)) continue;
    const start = part.indexOf('\r\n\r\n') + 4;
    const type = /content-type:\s*([^\r\n]+)/i.exec(part)?.[1] || 'image/jpeg';
    return { type, bytes: Buffer.from(part.slice(start, part.length - 2), 'latin1') };
  }
  return null;
}

http.createServer(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  const url = new URL(req.url, 'http://x');
  const route = decodeURIComponent(url.pathname);

  if (route === '/__storage') return json(res, 200, [...files.keys()]); // for the tests

  if (route.startsWith('/storage/v1/object/public/sources/')) {
    const name = route.slice('/storage/v1/object/public/sources/'.length);
    const stored = files.get(name);
    // The starter photos (and the extra ones the full test data uses) count as
    // already uploaded to the bucket by hand.
    const places = [path.join(root, 'assets', 'sources'), path.join(root, 'tests', 'fixtures', 'sources')];
    const starter = places.map((dir) => path.join(dir, path.basename(name))).find((file) => fs.existsSync(file));
    if (stored) { res.writeHead(200, { 'content-type': stored.type }); res.end(stored.bytes); return; }
    if (starter) { res.writeHead(200, { 'content-type': 'image/webp' }); res.end(fs.readFileSync(starter)); return; }
    return json(res, 404, { error: 'Object not found' });
  }
  if (req.method === 'POST' && route.startsWith('/storage/v1/object/sources/')) {
    const name = route.slice('/storage/v1/object/sources/'.length);
    const part = filePart(await readBody(req), req.headers['content-type'] || '');
    if (!part) return json(res, 400, { error: 'No file in the upload' });
    if (files.has(name)) return json(res, 400, { error: 'Duplicate', message: 'The resource already exists' });
    files.set(name, part);
    return json(res, 200, { Id: name, Key: `sources/${name}` });
  }
  if (req.method === 'DELETE' && route === '/storage/v1/object/sources') {
    const { prefixes = [] } = JSON.parse((await readBody(req)).toString() || '{}');
    for (const name of prefixes) files.delete(name);
    return json(res, 200, prefixes.map((name) => ({ name })));
  }

  if (route.startsWith('/rest/v1')) {
    const target = POSTGREST + route.slice(8) + url.search;
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.authorization; // the real gateway maps the key to the anon role; locally no key is needed
    delete headers.apikey;
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
  json(res, 404, { message: `the local gateway does not implement ${route}` });
}).listen(PORT, () => console.log(`Local Supabase gateway on http://localhost:${PORT}`));
