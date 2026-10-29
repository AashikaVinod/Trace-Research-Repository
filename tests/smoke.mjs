// Quick check against the STARTER study (what a fresh install shows):
// every page opens, the photos load from Storage, and the console is clean.
//   TRACE_DB=trace_test_install ./tests/supabase-local/run-e2e.sh  (with E2E_SCRIPT=tests/smoke.mjs)
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8090';
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, name) => { console.log(ok ? 'PASS' : 'FAIL', name); if (!ok) failed++; };
const open = async (hash) => { await page.goto(`${BASE}/#${hash}`); await page.waitForSelector('main h1, main .empty'); await page.waitForTimeout(500); };

await open('/');
check(await page.locator('.stat-card strong').first().textContent() === '1', 'home: one starter project');
for (const hash of ['/projects', '/projects/1', '/library', '/record/finding/1', '/trail', '/trail/design_decision/1', '/sessions', '/sessions/1', '/people', '/sources', '/database']) {
  await open(hash);
  check(await page.locator('main h1').count() > 0, `page opens: ${hash}`);
}
await open('/sources');
check(await page.locator('.polaroid').count() === 4, 'sources: the four starter photos are listed');
await page.waitForFunction(() => [...document.querySelectorAll('.polaroid img')].every((i) => i.complete && i.naturalWidth > 0));
check(true, 'sources: the photos load from Storage');
await open('/trail/design_decision/1');
check(await page.locator('.trail-card').count() >= 5, 'trail: a decision traces back through its evidence');
check(errors.length === 0, `no errors in the console ${errors.join(' | ')}`);
await browser.close();
process.exit(failed ? 1 : 0);
