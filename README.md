<p align="center"><img src="assets/logo-mark.svg" width="64" height="64" alt="TRACE logo"></p>

# TRACE

**Every design decision has a story.**

TRACE is a UX research repository built for a Database Management Systems course. It stores research projects, participants, sessions and evidence in PostgreSQL. It connects the evidence step by step:

**1 Observation → 2 Finding → 3 Insight → 4 Recommendation → 5 Design decision**

Pick any decision and TRACE shows the real observations behind it. Every link is a row in a junction table, and the trail is computed with a recursive SQL query.

> All projects, people, participants and results in the sample data are **fictional**.

## Contents

1. [What's in the app](#whats-in-the-app)
2. [Run it now (sample mode)](#run-it-now-sample-mode)
3. [How the code fits together](#how-the-code-fits-together)
4. [Connect Supabase](#connect-supabase)
5. [Security model](#security-model)
6. [Optional: real AI answers](#optional-real-ai-answers)
7. [Push to GitHub and deploy on Vercel](#push-to-github-and-deploy-on-vercel)
8. [Testing](#testing)
9. [Troubleshooting](#troubleshooting)
10. [Known limitations](#known-limitations)

More documents:

- `docs/dbms-concepts.md`: every DBMS concept in TRACE, linked to a feature you can demo. Use it for your presentation.
- `docs/database-design.md`: entities, keys, relationships and normalisation.
- `docs/ux-audit.md`: the HCI and accessibility audit, and what was changed.
- `docs/brand.md`: logo, colour palette and type.
- `docs/testing-checklist.md`: what was tested, how, and what is still unverified.

---

## What's in the app

| Page | What you can do | Main DBMS idea |
| --- | --- | --- |
| **Home** | Totals, evidence health rings, sessions per month, sentiment donut, featured project, latest decision | Aggregates, views, GROUP BY |
| **Projects** | Search, filter, create, edit, archive with Undo, restore. Project pages have a funnel, sentiment and question coverage. | JOINs, soft delete, triggers |
| **Research library** | Folder tabs for the five evidence types, search, project filter, document cards | UNION ALL view, WHERE / ILIKE |
| **Evidence trail** | Trace any record up and down the chain, with live connector lines; strongest decisions; gaps to close | Recursive CTE, anti-join |
| **Sessions** | Charts of sessions per month and methods used; create and edit sessions; record observations | Foreign keys, M:N junctions |
| **People** | Participants (codes only), segments chart, age chart, team, methods, segments | M:N, UNIQUE, CHECK |
| **Database** | Schema diagram, rows per table, a feature-to-concept map, and a query lab that runs the real views | Everything, in one place |
| **Ask TRACE** | A chat panel for quick answers: key insights, strongest decisions, gaps, pain points, project summaries | Each answer names the query it used |

Every page ends with a **"How the database does this"** panel that names the concepts behind it and shows the SQL.

**Keyboard shortcuts:** `/` search, `N` add something new, `A` Ask TRACE, `?` show shortcuts, `Esc` close.

**Two modes**, always labelled in the sidebar card:

- **Sample mode**: used when `js/config.js` is empty. It opens with a ready-made fictional study, and changes stay in this browser (localStorage). **Reset sample** restores the original data.
- **Supabase mode**: used when `js/config.js` has your project URL and publishable key. Everything is read from and written to PostgreSQL. TRACE never falls back to sample data on its own.

## Run it now (sample mode)

Double-click `index.html`. It opens with the sample study loaded.

You can also serve the folder, which is closer to how Vercel serves it:

```bash
cd trace
python3 -m http.server 8080      # then open http://localhost:8080
```

**To demo adding things:** click **New** in the top bar. On any record's page, use **Leads to** to add the next step with the link already ticked. Then open **Evidence trail** to show the whole story, and **Database → Query lab** to run the SQL behind it.

## How the code fits together

The JavaScript uses plain `<script>` tags, with no framework, modules or build step. The files load in this order, so each file can use the ones above it:

```
index.html                  the page shell and the order scripts load in
js/config.js                your Supabase URL + key (empty = sample mode), AI switch
js/icons.js                 icon shapes (Lucide)
js/sample-data.js           the fictional sample study (generated from tools/generate_seed.py)
js/helpers.js               esc() for safe HTML, icons, dates, toasts, dialogs, the form builder
js/charts.js                bar, column, donut, ring and funnel charts made from HTML + CSS
js/db.js                    ALL data access: loadAll(), save functions, statistics, sign-in
js/editors.js               every add/edit form
js/assistant.js             Ask TRACE
js/pages/*.js               one file per page: home, projects, library, trail, sessions, people, database
js/app.js                   start-up, sidebar, shortcuts, and which page to show for each address
css/tokens.css              brand colours, spacing, type (change the design here)
css/style.css               all styles, in numbered sections
sql/                        01 schema, 02 constraints, 03 security, 04 seed, 05 queries, 06 views, 99 uninstall
api/ask.js                  optional Vercel function for real AI answers
assets/                     logo, favicon, fonts, marble texture
tools/                      generate_seed.py (sample data), generate_marble.py and generate_gas.py (background)
tests/                      SQL tests and browser tests (not deployed)
```

The pattern every page follows:

1. `loadAll()` in `db.js` reads every table into one object, `data`, for example `data.research_project`.
2. A page function such as `pageProjects()` builds HTML from `data` with template strings, then attaches click handlers. Every value from the database goes through `esc()`, so typed text can't become HTML.
3. A form in `editors.js` calls a save function in `db.js`. It writes one change, reloads `data`, and the page is drawn again.

**To add a page:** write `function pageSomething()` in a new file in `js/pages/`, add a `<script>` tag for it in `index.html`, and add a line to `ROUTES` in `app.js`.

## Connect Supabase

The Supabase dashboard changes from time to time, so menu names may differ slightly.

**1. Create a project** at <https://supabase.com/dashboard>. Keep the database password in a password manager. TRACE never needs it, and it must never go in this repository.

**2. Install the database.** Open **SQL Editor → New query**, then paste each file and press **Run**, one at a time and in order:

| Order | File | What it does |
| --- | --- | --- |
| 1 | `sql/01_schema.sql` | 21 tables. Stops without changes if TRACE tables already exist. |
| 2 | `sql/02_constraints_and_indexes.sql` | Foreign keys, CHECK and UNIQUE rules, indexes, triggers |
| 3 | `sql/03_security.sql` | Row Level Security, grants, the `trace_editor` allowlist |
| 4 | `sql/04_seed_data.sql` | The fictional sample study. Stops without changes if data already exists. |
| 5 | `sql/06_views.sql` | 9 views and the recursive `trace_lineage` function used by the Database page |
| optional | `sql/05_demo_queries.sql` | Ten read-only queries to show in class |

Only `99_uninstall_trace.sql` deletes anything, and it refuses to run until you uncomment its confirmation line.

**3. Create your editor account.** Go to **Authentication → Users → Add user → Create new user**, enter your email and a password, and tick **Auto Confirm User**. Then, in the SQL Editor:

```sql
insert into public.trace_editor (user_id)
select id from auth.users where email = 'you@example.com';
```

We also recommend turning off public sign-ups (**Authentication → Sign In / Providers**). Even if they stay on, new accounts can only read.

**4. Add the public configuration.** Find the **Project URL** and **Publishable key** under **Project Settings → API Keys / Data API**, and put them in `js/config.js`:

```js
const SUPABASE_URL = 'https://abcdefghijkl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_...';
```

| Value | Safe in the browser and on GitHub? |
| --- | --- |
| Project URL, publishable key (or legacy anon key) | Yes, they are public by design. Row Level Security protects the data. |
| Secret key (`sb_secret_…`), `service_role` key, database password | **Never.** TRACE refuses to start if `config.js` contains one. |

Reload the app. The sidebar should say **Connected to Supabase: Viewing only**. **Sign in** changes it to **Editing as you@example.com**. If the home page says the database is empty, run `sql/04_seed_data.sql`.

## Security model

| Who | Can do |
| --- | --- |
| Visitors | Read every TRACE table and view (the data is fictional and meant to be shown) |
| Signed-in user not in `trace_editor` | Read only |
| Signed-in editor | Create and update records, add and remove links |
| Anyone through the API | Can't delete projects or evidence (projects are archived instead) |

- Row Level Security is on for every table, and views use `security_invoker`, so they obey it too.
- `trace_editor` can't be read through the API. The `trace_is_editor()` function only answers "am I an editor?".
- **Don't store real participant data in this demo.** Public read access is fine only because the data is fictional.
- Every value shown on screen goes through `esc()`. `vercel.json` sets a Content Security Policy that only allows the site's own scripts, plus connections to `*.supabase.co` and the site itself.

## Optional: real AI answers

**Ask TRACE** works without any AI: it answers from your data using the same queries as the charts. To have Claude answer instead, using a short summary of your research as context:

1. Deploy to Vercel (see below).
2. In Vercel → Project → **Settings → Environment Variables**, add `ANTHROPIC_API_KEY` (from <https://console.anthropic.com>). Optionally add `ANTHROPIC_MODEL`; the default in `api/ask.js` is `claude-haiku-5-5`. Check current model names at <https://docs.claude.com/en/api/overview> first.
3. Set `const AI_ASSISTANT = true;` in `js/config.js`, commit and push.

The key stays on the server and never reaches the browser. If the AI can't be reached, Ask TRACE says so and answers from the data instead. Anyone who can open the site can use the endpoint, and that spends your API credit, so turn it off after the demo. **This AI path has not been tested**, because no API key was available while building TRACE.

## Push to GitHub and deploy on Vercel

**GitHub:** create an **empty** repository at <https://github.com/new>, then run:

```bash
cd trace
git remote add origin https://github.com/<your-username>/trace.git
git branch -M main
git push -u origin main
```

Sign in through the browser prompt, or with `gh auth login`. Never paste a token into a chat or a commit. To put your own name on the commits first, run `git commit --amend --reset-author`, since the existing commits use a placeholder author.

**Vercel:** at <https://vercel.com/new>, import the repository. Choose framework preset **Other**, with no build command and the default output directory. No environment variables are needed, unless you enable AI answers. Once it's deployed, open the URL and check that the sidebar says **Connected to Supabase**, that you can sign in, create a project and still see it after reloading, and that the browser console shows no errors.

TRACE uses `#/` addresses, so no rewrite rules are needed. If you use a custom Supabase domain, add it to `connect-src` in `vercel.json`.

## Testing

Results are recorded in `docs/testing-checklist.md`.

| Suite | Command | Needs |
| --- | --- | --- |
| SQL integrity, security, views (33 checks) | `tests/run-sql-tests.sh` | Local PostgreSQL superuser |
| Every user flow in the browser (26 steps; 27 with sign-in) | `node tests/serve.mjs 8080`, then `BASE=http://localhost:8080 node tests/e2e.mjs` | `npm install --no-save playwright && npx playwright install chromium` |
| The same flows against a local Supabase replica | `POSTGREST_BIN=/path/to/postgrest tests/supabase-local/run-e2e.sh` | PostgreSQL, PostgREST, Playwright |

The browser test also runs against your live site: set `BASE`, `TRACE_E2E_EMAIL` and `TRACE_E2E_PASSWORD`.

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| "TRACE cannot start with this configuration" | `js/config.js` is half-filled or contains a secret key. The page names the problem. |
| "The TRACE tables were not found" | Run the SQL files. If you just ran them, run `notify pgrst, 'reload schema';` |
| Query lab says a view doesn't exist | Run `sql/06_views.sql`. |
| Signed in but still view-only | Your user isn't in `trace_editor`. Run the insert in step 3. |
| "Couldn't reach Supabase" | Network problem, or the free project is paused. Restore it in the dashboard. |
| Stuck on "Loading TRACE…" | Open the browser console (F12) and look for a red error. Usually it's a typo in `js/config.js`. |
| The moving background is distracting or slow | Click **Pause motion** at the bottom of the sidebar (the choice is remembered). It also stops automatically if your system has "reduce motion" switched on, and it is skipped on phones. |

## Known limitations

- Real Supabase and Vercel were not reachable while TRACE was built. Supabase mode was tested against a local replica: the same SQL on PostgreSQL 16, PostgREST 12.2.3 and a mock of Supabase Auth's sign-in. Verify sign-in and one write on your real project.
- TRACE loads every table at once and searches in the browser. That's simple and fast for demo-sized data. The Data API returns at most 1,000 rows per request by default, so large datasets would need paging.
- Saving a record and its links takes two requests, which is not one transaction. If the links fail, TRACE says so plainly. A database function would make it atomic. This makes a good discussion point about transactions.
- One editor role, no per-project permissions, no real-time collaboration, no file uploads.
