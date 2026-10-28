// Browser test of the main TRACE workflow.
// Setup once:  npm install --no-save playwright && npx playwright install chromium
// Run:         node tests/serve.mjs 8080   (in another terminal)
//              BASE=http://localhost:8080 node tests/e2e.mjs
// Supabase mode: also set TRACE_E2E_EMAIL and TRACE_E2E_PASSWORD (an editor).
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8080';
const RUN = Date.now().toString(36).slice(-4);
let passed = 0; let failed = 0;
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
page.setDefaultTimeout(7000);
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/status of 409/.test(m.text())) errors.push(m.text()); }); // 409 = the deliberate duplicate test

async function step(name, fn) {
  try { await fn(); passed++; console.log('PASS', name); }
  catch (e) {
    failed++; console.log('FAIL', name, '\n    ', e.message.split('\n')[0]);
    while (await page.locator('dialog[open]').count()) await page.keyboard.press('Escape');
  }
}
const check = (ok, msg) => { if (!ok) throw new Error(msg); };
const modal = () => page.locator('dialog[open]');
const fill = (label, value) => modal().getByLabel(label, { exact: true }).fill(value);
const choose = (label, option) => modal().getByLabel(label, { exact: true }).selectOption({ label: option });
const tick = (text) => modal().locator('.check', { hasText: text }).first().locator('input').check();
const save = () => modal().locator('button[type=submit]').click();
const open = async (hash) => { await page.goto(`${BASE}/#${hash}`); await page.waitForSelector('h1'); };

await step('opens with the sample project already loaded', async () => {
  await open('/');
  await page.waitForSelector('text=Mobile banking onboarding');
  check(Number(await page.locator('.stat strong').first().textContent()) >= 4, 'projects counted');
});

if (process.env.TRACE_E2E_EMAIL) {
  await step('sign in as an editor', async () => {
    await page.locator('#sign-in').click();
    await modal().getByLabel('Email').fill(process.env.TRACE_E2E_EMAIL);
    await modal().getByLabel('Password').fill(process.env.TRACE_E2E_PASSWORD);
    await save();
    await page.waitForSelector('.mode-card >> text=Editing as');
  });
}

const project = `Demo project ${RUN}`;
await step('form rejects invalid input', async () => {
  await open('/projects');
  await page.locator('#add').click();
  await fill('Project title', 'ab');
  await save();
  check(await modal().locator('.has-error').count() >= 2, 'expected errors on title and objective');
  await page.keyboard.press('Escape');
});

await step('create a project', async () => {
  await page.locator('#add').click();
  await fill('Project title', project);
  await fill('Research objective', 'Show the whole TRACE workflow live in class.');
  await tick('Hana Sato');
  await save();
  await page.waitForSelector(`h1:has-text("${project}")`);
});

await step('add a question and a session', async () => {
  await page.locator('#add-question').click();
  await fill('Question', `What happens in run ${RUN}?`);
  await save();
  await page.waitForSelector(`text=What happens in run ${RUN}?`);
  await page.locator('#add-session').click();
  await fill('Session title', `Usability test ${RUN}`);
  await choose('Method', 'Moderated usability test');
  await choose('Facilitator', 'Hana Sato');
  await tick('P-01');
  await tick(`run ${RUN}`);
  await save();
  await page.waitForSelector(`h1:has-text("Usability test ${RUN}")`);
});

await step('record an observation', async () => {
  await page.locator('#add-obs').click();
  await fill('Title', `Observation ${RUN}`);
  await fill('What happened', 'The participant hesitated at the last step.');
  await save();
  await page.waitForSelector(`h1:has-text("Observation ${RUN}")`);
});

for (const [label, body] of [['Finding', 'Describe the pattern'], ['Insight', 'Why it matters'], ['Recommendation', 'What should change'], ['Decision', 'Rationale']]) {
  await step(`add a linked ${label.toLowerCase()}`, async () => {
    const before = await page.locator('h1').textContent();
    await page.locator('#add-next').click();
    check(await modal().locator('.check input:checked').count() === 1, 'previous record pre-ticked');
    await fill('Title', `${label} ${RUN}`);
    await fill(body, `Automated ${label.toLowerCase()}.`);
    await save();
    await page.waitForSelector(`h1:has-text("${label} ${RUN}")`);
    await page.waitForSelector(`.link-item:has-text("${before.trim()}")`);
  });
}

await step('evidence trail shows the complete story', async () => {
  await page.getByRole('link', { name: 'See its evidence trail' }).click();
  await page.waitForSelector('text=Complete story');
  check(await page.locator('.trail-card').count() === 5, 'five cards');
  check(await page.locator('#lines path').count() === 4, 'four connector lines');
});

await step('everything is still there after reloading', async () => {
  await page.reload();
  await page.waitForSelector(`.trail-card:has-text("Observation ${RUN}")`);
});

await step('library search finds the new records', async () => {
  await open(`/library?q=${RUN}`);
  check(await page.locator('.doc').count() === 5, `got ${await page.locator('.doc').count()}`);
  await page.locator('.folder-tab', { hasText: 'Insights' }).click();
  check(await page.locator('.doc').count() === 1, 'one insight');
});

await step('duplicate project title is refused', async () => {
  await open('/projects');
  await page.locator('#add').click();
  await fill('Project title', project.toUpperCase());
  await fill('Research objective', 'Trying to create a duplicate.');
  await save();
  await modal().locator('.form-alert:not([hidden])').waitFor();
  await page.keyboard.press('Escape');
});

await step('archive hides the project', async () => {
  await page.locator('.project-card', { hasText: project }).click();
  await page.locator('#archive').click();
  await modal().locator('#confirm-ok').click();
  await page.waitForSelector('text=This project was archived');
  await open('/projects');
  check(await page.locator('.project-card', { hasText: project }).count() === 0, 'hidden from active list');
});

await step('no errors in the browser console', async () => check(!errors.length, errors.join(' | ')));
await browser.close();
console.log(`\n${passed}/${passed + failed} steps passed`);
process.exit(failed ? 1 : 0);
