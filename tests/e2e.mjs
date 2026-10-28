// Browser test of every TRACE flow (the demo runs in sample mode).
// Setup once:  npm install --no-save playwright && npx playwright install chromium
// Run:         node tests/serve.mjs 8080   (in another terminal)
//              BASE=http://localhost:8080 node tests/e2e.mjs
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8080';
const RUN = Date.now().toString(36).slice(-4);
let passed = 0;
let failed = 0;
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
page.setDefaultTimeout(7000);
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

async function step(name, fn) {
  try { await fn(); passed++; console.log('PASS', name); }
  catch (e) {
    failed++; console.log('FAIL', name, '\n    ', e.message.split('\n')[0]);
    for (let i = 0; i < 4 && await page.locator('dialog[open]').count(); i++) await page.keyboard.press('Escape');
  }
}
const check = (ok, msg) => { if (!ok) throw new Error(msg); };
const modal = () => page.locator('dialog[open]').last();
// Optional fields are labelled "Description optional", so match both forms.
const field = (label) => modal().getByLabel(new RegExp(`^${label}( optional)?$`));
const fill = (label, value) => field(label).fill(value);
const choose = (label, option) => field(label).selectOption({ label: option });
const tick = (text) => modal().locator('.check', { hasText: text }).first().locator('input').check();
const save = () => modal().locator('button[type=submit]').click();
const open = async (hash) => { await page.goto(`${BASE}/#${hash}`); await page.waitForSelector('main h1, main .empty'); };
const toastSays = (text) => page.locator('.toast', { hasText: text }).first().waitFor();

const project = `Demo project ${RUN}`;

// ---------- Start ----------
await step('opens with the sample study, the logo and totals', async () => {
  await open('/');
  check(await page.locator('.brand img').isVisible(), 'logo');
  check(Number(await page.locator('.stat-card strong').first().textContent()) >= 4, 'project total');
  check(await page.locator('.pill-columns').count() === 1 && await page.locator('.gauge').count() === 1 && await page.locator('.ranks li').count() === 4, 'dashboard components drawn');
});


// ---------- Shortcuts, help and motion ----------
await step('keyboard shortcuts: / focuses search, ? shows help', async () => {
  await page.locator('main h1').click();
  await page.keyboard.press('/');
  check(await page.evaluate(() => document.activeElement.id) === 'search-input', 'search focused');
  await page.locator('main h1').click();
  await page.keyboard.press('?');
  await modal().getByText('Keyboard shortcuts').waitFor();
  await page.keyboard.press('Escape');
  check(await page.locator('dialog[open]').count() === 0, 'closed with Escape');
});

await step('background motion can be paused and stays paused', async () => {
  await page.locator('#motion-btn').click();
  check(await page.evaluate(() => document.body.classList.contains('still')), 'paused');
  await page.reload();
  await page.waitForSelector('h1');
  check(await page.evaluate(() => document.body.classList.contains('still')), 'still paused after reload');
  await page.locator('#motion-btn').click();
});

// ---------- Projects ----------
await step('form rejects invalid input and asks before discarding', async () => {
  await open('/projects');
  await page.locator('#add').click();
  await fill('Project title', 'ab');
  await save();
  check(await modal().locator('.has-error').count() >= 2, 'field errors shown');
  await page.keyboard.press('Escape');
  await page.getByText('Discard your changes?').waitFor();
  await modal().locator('#confirm-ok').click();
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
});

await step('create a project with a team and methods', async () => {
  await page.locator('#add').click();
  await fill('Project title', project);
  await fill('Research objective', 'Show the whole TRACE workflow live in class.');
  await tick('Kavya Nair');
  await tick('Card sort');
  await save();
  await page.waitForSelector(`h1:has-text("${project}")`);
  await page.getByText('Kavya Nair').first().waitFor();
});

await step('edit the project; the change survives a reload', async () => {
  await page.locator('#edit').click();
  await fill('Description', 'Edited by the automated test.');
  await save();
  await page.waitForSelector('text=Edited by the automated test.');
  await page.reload();
  await page.waitForSelector('text=Edited by the automated test.');
});

await step('add and edit a research question', async () => {
  await page.locator('#add-question').click();
  await fill('Question', `What happens in run ${RUN}?`);
  await save();
  await page.locator('[data-question]').first().click();
  await fill('Question', `What really happens in run ${RUN}?`);
  await save();
  await page.waitForSelector(`text=What really happens in run ${RUN}?`);
});

// ---------- Sessions and the evidence chain ----------
await step('create and edit a session with a participant and question', async () => {
  await page.locator('#add-session').click();
  await fill('Session title', `Usability test ${RUN}`);
  await choose('Method', 'Moderated usability test');
  await choose('Facilitator', 'Kavya Nair');
  await tick('P-01');
  await tick(`run ${RUN}`);
  await save();
  await page.waitForSelector(`h1:has-text("Usability test ${RUN}")`);
  await page.locator('#edit').click();
  await fill('Minutes', '30');
  await save();
  await page.waitForSelector('text=30 minutes');
});

await step('record and edit an observation', async () => {
  await page.locator('#add-obs').click();
  await fill('Title', `Observation ${RUN}`);
  await fill('What happened', 'The participant hesitated at the last step.');
  await save();
  await page.waitForSelector(`h1:has-text("Observation ${RUN}")`);
  await page.locator('#edit').click();
  await choose('Sentiment', 'Negative');
  await save();
  await page.locator('.facts', { hasText: 'Negative' }).waitFor();
});

for (const [label, body] of [['Finding', 'Describe the pattern'], ['Insight', 'Why it matters'], ['Recommendation', 'What should change'], ['Decision', 'Rationale']]) {
  await step(`add a linked ${label.toLowerCase()}`, async () => {
    const before = (await page.locator('h1').textContent()).trim();
    await page.locator('#add-next').click();
    check(await modal().locator('.check input:checked').count() === 1, 'previous record ticked');
    await fill('Title', `${label} ${RUN}`);
    await fill(body, `Automated ${label.toLowerCase()}.`);
    await save();
    await page.waitForSelector(`h1:has-text("${label} ${RUN}")`);
    await page.waitForSelector(`.link-item:has-text("${before}")`);
  });
}

await step('evidence trail shows the complete story with lines', async () => {
  await page.getByRole('link', { name: 'See its evidence trail' }).click();
  await page.waitForSelector('text=Complete story');
  check(await page.locator('.trail-card').count() === 5, 'five cards');
  check(await page.locator('#lines path').count() === 4, 'four lines');
});

await step('trail: click a card, then go back', async () => {
  await page.locator('.trail-card', { hasText: `Observation ${RUN}` }).click();
  await page.waitForSelector(`.trail-card.is-focus:has-text("Observation ${RUN}")`);
  await page.goBack();
  await page.waitForSelector(`.trail-card.is-focus:has-text("Decision ${RUN}")`);
});

await step('unlink evidence by editing the finding', async () => {
  await open(`/library?q=Finding ${RUN}`);
  await page.locator('.doc').first().click();
  await page.locator('#edit').click();
  await modal().locator('.check', { hasText: `Observation ${RUN}` }).locator('input').uncheck();
  await save();
  await page.waitForSelector('text=No observations support this yet');
});

// ---------- Library, people, sessions ----------
await step('library: search, tabs, project filter and list view', async () => {
  await open(`/library?q=${RUN}`);
  check(await page.locator('.doc').count() === 5, `found ${await page.locator('.doc').count()}`);
  await page.locator('[data-layout="list"]').click();
  check(await page.locator('#results tbody tr').count() === 5, 'list view shows the same 5');
  await page.locator('[data-layout="grid"]').click();
  await page.locator('.folder-tab', { hasText: 'Insights' }).click();
  check(await page.locator('.doc').count() === 1, 'one insight');
  await page.locator('.folder-tab', { hasText: 'All evidence' }).click();
  await page.locator('#project').selectOption({ label: 'Library catalogue search' });
  check(await page.locator('.doc').count() === 0, 'other project has none of these');
});

await step('participants: code is validated, then create and edit', async () => {
  await open('/people');
  await page.locator('#add-participant').click();
  await fill('Participant code', 'Alice');
  await save();
  check(await modal().locator('.has-error').count() === 1, 'bad code rejected');
  const code = `P-${100 + Math.floor(Math.random() * 899)}`;
  await fill('Participant code', code);
  await tick('Students');
  await save();
  await page.locator('td', { hasText: code }).waitFor();
  await page.locator(`[aria-label="Edit ${code}"]`).click();
  await choose('Age band', '25-34');
  await save();
  await page.locator('tr', { hasText: code }).locator('text=25-34').waitFor();
});

await step('team, methods and segments: add and edit', async () => {
  await page.locator('[data-add="researcher"]').click();
  await fill('Full name', `Meera Joshi ${RUN}`);
  await fill('Email', `meera.${RUN}@example.org`);
  await save();
  await page.getByText(`Meera Joshi ${RUN}`).waitFor();
  await page.locator('[data-add="research_method"]').click();
  await fill('Name', `Tree test ${RUN}`);
  await save();
  await page.locator('[data-add="segment"]').click();
  await fill('Name', `Night-shift workers ${RUN}`);
  await save();
  await page.locator(`[aria-label="Edit Meera Joshi ${RUN}"]`).click();
  await fill('Role', 'Research intern');
  await save();
  await page.getByText('Research intern').waitFor();
});

await step('sessions: filter by participant', async () => {
  await open('/sessions');
  const all = await page.locator('#rows tr').count();
  await page.locator('#participant').selectOption({ label: 'P-01' });
  const filtered = await page.locator('#rows tr').count();
  check(filtered > 0 && filtered < all, `${filtered} of ${all}`);
});

// ---------- Safety nets ----------
await step('duplicate project title is refused', async () => {
  await open('/projects');
  await page.locator('#add').click();
  await fill('Project title', project.toUpperCase());
  await fill('Research objective', 'Trying to create a duplicate.');
  await save();
  await modal().locator('.form-alert:not([hidden])').waitFor();
  await page.keyboard.press('Escape');
  if (await page.getByText('Discard your changes?').count()) await modal().locator('#confirm-ok').click();
});

await step('archive, undo, archive again, then restore', async () => {
  await page.locator('.project-table tr', { hasText: project }).locator('a').click();
  await page.locator('#archive').click();
  await modal().locator('#confirm-ok').click();
  await page.waitForSelector('text=This project was archived');
  await page.locator('.toast button', { hasText: 'Undo' }).click();
  await toastSays('Change undone.');
  check(await page.locator('text=This project was archived').count() === 0, 'undo restored it');
  await page.locator('#archive').click();
  await modal().locator('#confirm-ok').click();
  await page.waitForSelector('text=This project was archived');
  await open('/projects');
  check(await page.locator('.project-table tr', { hasText: project }).count() === 0, 'hidden from active list');
  await page.locator('[data-show="archived"]').click();
  await page.locator('.project-table tr', { hasText: project }).locator('a').click();
  await page.locator('#archive').click();
  await modal().locator('#confirm-ok').click();
  await toastSays('Project restored.');
});

// ---------- Assistant and database ----------
await step('Quick answers: common and typed questions', async () => {
  await page.locator('#ask-btn').click();
  await page.locator('#ask [data-ask="What are the key insights?"]').click();
  await page.locator('.answer', { hasText: 'most important' }).waitFor();
  await page.locator('#ask-input').fill('Tell me about grocery checkout');
  await page.locator('#ask-input').press('Enter');
  await page.locator('.answer a', { hasText: 'Grocery checkout friction' }).first().waitFor();
  await page.locator('#ask-close').click();
});

await step('Database page: every query in the lab returns rows', async () => {
  await open('/database');
  const buttons = await page.locator('[data-run]').count();
  for (let i = 0; i < buttons; i++) {
    await page.locator(`[data-run="${i}"]`).click();
    await page.locator(`#result-${i} .query-source`).waitFor();
    check(await page.locator(`#result-${i} tbody tr`).count() > 0, `query ${i} returned rows`);
  }
});


await step('no errors in the browser console', async () => check(errors.length === 0, errors.join(' | ')));
await browser.close();
console.log(`\n${passed}/${passed + failed} steps passed`);
process.exit(failed ? 1 : 0);
