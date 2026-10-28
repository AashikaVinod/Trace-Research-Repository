// LOCAL TESTING ONLY: a dependency-free static server for the repository.
// `node tests/serve.mjs [port]`. If TRACE_TEST_URL and TRACE_TEST_KEY are set,
// js/config.js is replaced in responses (the file on disk is untouched).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || 8080);
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const globalHeaders = Object.fromEntries(vercel.headers.find((h) => h.source === '/(.*)').headers.map((h) => [h.key, h.value]));
// Allow the local mock Supabase origin when testing Supabase mode.
if (process.env.TRACE_TEST_URL) {
  globalHeaders['Content-Security-Policy'] = globalHeaders['Content-Security-Policy'].replace('connect-src', `connect-src ${new URL(process.env.TRACE_TEST_URL).origin}`);
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.md': 'text/markdown' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  if (url.pathname === '/js/config.js' && process.env.TRACE_TEST_URL !== undefined) {
    res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' });
    res.end(`const SUPABASE_URL = ${JSON.stringify(process.env.TRACE_TEST_URL)};\nconst SUPABASE_KEY = ${JSON.stringify(process.env.TRACE_TEST_KEY || '')};\nconst AI_ASSISTANT = false;\n`);
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { ...globalHeaders, 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  });
}).listen(port, () => console.log(`TRACE test server on http://localhost:${port}`));
