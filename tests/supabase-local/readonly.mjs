// Supabase mode, signed out / non-editor: reads work, writes are refused
// by the UI AND by PostgreSQL (RLS), and the UI says so clearly.
import { chromium } from 'playwright';
const BASE = process.env.BASE;
const results = [];
const step = async (name, fn) => {
  try { await fn(); results.push(1); console.log('PASS', name); }
  catch (e) { results.push(0); console.log('FAIL', name, '\n   ', e.message.split('\n')[0]); }
};
const expect = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(6000);

await step('visitor sees live data in read-only mode', async () => {
  await page.goto(`${BASE}/#/`);
  await page.waitForSelector('.mode-chip:has-text("read-only")');
  expect(await page.locator('.stat-value').first().textContent() === '4', 'four projects from PostgreSQL');
  expect(await page.locator('.banner-demo').count() === 0, 'no demo banner in Supabase mode');
});
await step('visitor clicking New project is asked to sign in', async () => {
  await page.goto(`${BASE}/#/projects`);
  await page.getByRole('button', { name: 'New project' }).click();
  await page.waitForSelector('dialog[open] >> text=Sign in to edit');
});
await step('wrong password shows a clear message', async () => {
  await page.locator('dialog[open]').getByLabel('Email').fill('editor@example.org');
  await page.locator('dialog[open]').getByLabel('Password').fill('nope');
  await page.locator('dialog[open] button[type=submit]').click();
  await page.waitForSelector('dialog[open] >> text=Email or password is incorrect.');
});
await step('a non-editor account stays read-only', async () => {
  await page.locator('dialog[open]').getByLabel('Email').fill('viewer@example.org');
  await page.locator('dialog[open]').getByLabel('Password').fill('viewer-pass');
  await page.locator('dialog[open] button[type=submit]').click();
  await page.waitForSelector('.toast >> text=isn\'t an editor');
  await page.waitForSelector('.mode-chip:has-text("read-only")');
  expect(await page.locator('dialog[open]').count() === 0, 'no form opened for a non-editor');
});
await step('the database itself rejects anonymous writes (RLS)', async () => {
  const status = await page.evaluate(async () => {
    const mod = await import('/js/config.js');
    const r = await fetch(`${mod.SUPABASE_URL}/rest/v1/research_project`, {
      method: 'POST', headers: { apikey: mod.SUPABASE_PUBLISHABLE_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Sneaky', research_objective: 'Should never be stored', start_date: '2026-01-01' }),
    });
    return r.status;
  });
  expect(status === 401 || status === 403, `expected 401/403, got ${status}`);
});
await step('sign out returns to read-only', async () => {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForSelector('.topbar-status button:has-text("Sign in")');
});
await browser.close();
console.log(`${results.filter(Boolean).length}/${results.length} read-only checks passed\n`);
