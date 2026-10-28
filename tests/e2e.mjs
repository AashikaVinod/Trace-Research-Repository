// End-to-end browser test of the main workflows (demo mode by default).
// Requires Playwright + Chromium: `npx playwright install chromium`, then
//   node tests/serve.mjs 8080 &  BASE=http://localhost:8080 node tests/e2e.mjs
// In Supabase mode, set TRACE_E2E_EMAIL / TRACE_E2E_PASSWORD for an editor.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8080';
const EMAIL = process.env.TRACE_E2E_EMAIL;
const PASSWORD = process.env.TRACE_E2E_PASSWORD;
const RUN = Date.now().toString(36).slice(-5);
const results = [];
const errors = [];

async function step(name, fn) {
  try { await fn(); results.push(['PASS', name]); console.log('PASS', name); }
  catch (e) {
    results.push(['FAIL', name]); console.log('FAIL', name, '\n   ', e.message.split('\n')[0]);
    for (let i = 0; i < 3 && await page.locator('dialog[open]').count(); i++) await page.keyboard.press('Escape');
  }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
page.setDefaultTimeout(6000);
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

const go = async (hash) => { await page.goto(`${BASE}/#${hash}`); await page.waitForSelector('main h1, main .state-error, main .state-empty'); };
const dialog = () => page.locator('dialog[open]');
async function fill(label, value) { await dialog().getByLabel(label, { exact: true }).fill(value); }
async function select(label, optionLabel) { await dialog().getByLabel(label, { exact: true }).selectOption({ label: optionLabel }); }
async function check(text) { await dialog().locator('.multi-option', { hasText: text }).first().locator('input').check(); }
async function submit() { await dialog().locator('button[type=submit]').click(); }
async function expectToast(text) { await page.locator('.toast', { hasText: text }).first().waitFor({ timeout: 8000 }); }

await go('/');
const mode = (await page.locator('.mode-chip').textContent()).trim();
console.log('Mode:', mode, 'Run id:', RUN);
if (/Supabase/.test(mode) && EMAIL) {
  await step('sign in as editor', async () => {
    await page.getByRole('button', { name: 'Sign in' }).click();
    await fill('Email', EMAIL); await fill('Password', PASSWORD); await submit();
    await page.waitForSelector('.mode-chip:has-text("editing")', { timeout: 8000 });
  });
}

const projectTitle = `E2E project ${RUN}`;
let projectUrl;

await step('dashboard metrics match the projects list', async () => {
  await go('/');
  const shown = Number(await page.locator('.stat .stat-value').first().textContent());
  await go('/projects?archived=1');
  const rows = await page.locator('tbody tr').count();
  expect(shown === rows, `dashboard ${shown} vs list ${rows}`);
});

await step('invalid project is rejected with field errors', async () => {
  await go('/projects');
  await page.getByRole('button', { name: 'New project' }).click();
  await fill('Title', 'ab');
  await fill('Research objective', 'short');
  await fill('Start date', '2026-10-10');
  await fill('End date (optional)', '2026-10-01');
  await submit();
  expect(await dialog().locator('.field.has-error').count() >= 3, 'expected 3+ field errors');
  expect(await dialog().isVisible(), 'dialog should stay open');
  await page.keyboard.press('Escape');
});

await step('duplicate project title is reported by the data source', async () => {
  await go('/projects');
  await page.getByRole('button', { name: 'New project' }).click();
  await fill('Title', 'Mobile Banking Onboarding');
  await fill('Research objective', 'Checking duplicate handling works');
  await submit();
  await dialog().locator('.form-alert:not([hidden])').waitFor({ timeout: 8000 });
  expect(/already exists/.test(await dialog().locator('.form-alert').textContent()), 'duplicate message');
  await page.keyboard.press('Escape');
});

await step('create a project', async () => {
  await go('/projects');
  await page.getByRole('button', { name: 'New project' }).click();
  await fill('Title', projectTitle);
  await fill('Research objective', 'Verify the complete TRACE workflow end to end.');
  await select('Status', 'Active');
  await submit();
  await page.waitForSelector(`main h1:has-text("${projectTitle}")`);
  projectUrl = page.url();
  await expectToast('Project created');
});

await step('edit the project and it persists after reload', async () => {
  await page.getByRole('button', { name: 'Edit project' }).click();
  await fill('Description (optional)', 'Edited by the automated test.');
  await submit();
  await page.waitForSelector('text=Edited by the automated test.');
  await page.reload();
  await page.waitForSelector('text=Edited by the automated test.');
});

await step('add a research question', async () => {
  await page.getByRole('button', { name: 'Add question' }).click();
  await fill('Question', `Does the full chain work in run ${RUN}?`);
  await submit();
  await page.waitForSelector(`text=Does the full chain work in run ${RUN}?`);
});

await step('create a participant (code validated)', async () => {
  await go('/participants');
  await page.getByRole('button', { name: 'New participant' }).click();
  await fill('Participant code', 'Alice');
  await submit();
  expect(await dialog().locator('.field.has-error').count() === 1, 'bad code rejected');
  await fill('Participant code', `P-${String(100 + Math.floor(Math.random() * 899))}`);
  await select('Age band (optional)', '25-34');
  await check('Students');
  await submit();
  await expectToast('Participant created');
});

await step('create a session linked to the project and a participant', async () => {
  await page.goto(projectUrl);
  await page.getByRole('button', { name: 'New session' }).click();
  await fill('Title', `E2E session ${RUN}`);
  await select('Method', 'Moderated usability test');
  await select('Facilitator', 'Hana Sato');
  await select('Status', 'Completed');
  await check('P-01');
  await check(`run ${RUN}`);
  await submit();
  await page.waitForSelector(`main h1:has-text("E2E session ${RUN}")`);
  await page.waitForSelector('.meta >> text=P-01');
});

await step('record an observation against the session', async () => {
  await page.getByRole('button', { name: 'Add observation' }).first().click();
  await fill('Title', `E2E observation ${RUN}`);
  await fill('What happened', 'The participant hesitated before continuing.');
  await select('Sentiment', 'Negative');
  await submit();
  await page.waitForSelector(`main h1:has-text("E2E observation ${RUN}")`);
});

const chain = [
  ['finding', 'Finding', 'Description'],
  ['insight', 'Insight', 'Why it matters'],
  ['recommendation', 'Recommendation', 'What to change'],
  ['design_decision', 'Design decision', 'Rationale'],
];
let prevTitle = `E2E observation ${RUN}`;
for (const [, label, descLabel] of chain) {
  await step(`add ${label.toLowerCase()} linked to the previous record`, async () => {
    await page.getByRole('button', { name: new RegExp(`^Add ${label.toLowerCase()} based on this$`) }).click();
    const title = `E2E ${label.toLowerCase()} ${RUN}`;
    await fill('Title', title);
    await fill(descLabel, `Automated ${label.toLowerCase()} text.`);
    const linked = dialog().locator('.multi-option', { hasText: prevTitle }).locator('input');
    expect(await linked.isChecked(), 'previous record preselected');
    await submit();
    await page.waitForSelector(`main h1:has-text("${title}")`);
    await page.waitForSelector(`.linked-item:has-text("${prevTitle}")`);
    prevTitle = title;
  });
}

await step('evidence trail shows the full chain from the decision', async () => {
  await page.getByRole('link', { name: 'Open in evidence trail' }).click();
  await page.waitForSelector('.trail-board');
  await page.waitForSelector('text=complete trail');
  for (const t of ['observation', 'finding', 'insight', 'recommendation']) {
    expect(await page.locator('.trail-card', { hasText: `E2E ${t} ${RUN}` }).count() === 1, `${t} card`);
  }
  expect(await page.locator('.trail-lines path').count() >= 4, 'connector lines drawn');
});

await step('trail navigation: click back to the observation', async () => {
  await page.locator('.trail-card', { hasText: `E2E observation ${RUN}` }).click();
  await page.waitForSelector(`.trail-card.is-focus:has-text("E2E observation ${RUN}")`);
  await page.goBack();
  await page.waitForSelector(`.trail-card.is-focus:has-text("E2E design decision ${RUN}")`);
});

await step('library search and type filter', async () => {
  await go(`/library?q=${RUN}`);
  await page.waitForSelector('.record-row');
  expect(await page.locator('.record-row').count() === 5, `expected 5 records, got ${await page.locator('.record-row').count()}`);
  await page.locator('.segmented button', { hasText: 'Insights' }).click();
  expect(await page.locator('.record-row').count() === 1, 'one insight');
  await go('/library?q=zzzz-no-match');
  await page.waitForSelector('text=No records match');
});

await step('unlink evidence by editing the finding', async () => {
  await go(`/library?q=finding ${RUN}`);
  await page.locator('.record-title').first().click();
  await page.getByRole('button', { name: 'Edit finding' }).click();
  await dialog().locator('.multi-option', { hasText: `E2E observation ${RUN}` }).locator('input').uncheck();
  await submit();
  await page.waitForSelector('text=No observations support this finding yet.');
});

await step('archive the project, then new sessions are blocked', async () => {
  await page.goto(projectUrl);
  await page.getByRole('button', { name: 'Archive project' }).click();
  await dialog().getByRole('button', { name: 'Archive project' }).click();
  await page.waitForSelector('text=accepts no new sessions');
  expect(await page.getByRole('button', { name: 'New session' }).isDisabled(), 'new session disabled');
  await go('/projects');
  expect(await page.locator('tbody tr', { hasText: projectTitle }).count() === 0, 'hidden by default');
  await page.getByLabel('Show archived').check();
  expect(await page.locator('tbody tr', { hasText: projectTitle }).count() === 1, 'visible when shown');
});

await step('no uncaught errors in the console', async () => { expect(errors.length === 0, errors.join(' | ')); });

await browser.close();
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} steps passed`);
process.exit(failed ? 1 : 0);
