<p align="center"><img src="assets/logo-mark.svg" width="64" height="64" alt="TRACE logo"></p>

# TRACE

**Every design decision has a story.**

TRACE is a UX research repository built for a Database Management Systems course. It stores research projects, participants, sessions and evidence in PostgreSQL. It connects the evidence step by step:

**1 Observation → 2 Finding → 3 Insight → 4 Recommendation → 5 Design decision**

Pick any decision and TRACE shows the real observations behind it. Every link is a row in a junction table, and the trail is computed with a recursive SQL query.

> All projects, people, participants and results in the sample data are **fictional**.

## Contents

1. [What's in the app](#whats-in-the-app)
2. [Run it now](#run-it-now)
3. [How the code fits together](#how-the-code-fits-together)
4. [The database (sql folder)](#the-database-sql-folder)
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
| **Home** | A front page: a headline from real numbers, the latest decision with its evidence chain, an "in numbers" box, how sessions felt, and the five-step pipeline | Aggregates, views, recursive CTE |
| **Projects** | Search, filter, create, edit, archive with Undo, restore. Project pages have a funnel, sentiment and question coverage. | JOINs, soft delete, triggers |
| **Research library** | Folder tabs for the five evidence types, search, project filter, document cards | UNION ALL view, WHERE / ILIKE |
| **Evidence trail** | Trace any record up and down the chain, with live connector lines; strongest decisions; gaps to close | Recursive CTE, anti-join |
| **Sessions** | Charts of sessions per month and methods used; create and edit sessions; record observations | Foreign keys, M:N junctions |
| **People** | Participants (codes only), segments chart, age chart, team, methods, segments | M:N, UNIQUE, CHECK |
| **Database** | Schema diagram, rows per table, a feature-to-concept map, and a query lab that runs the real views | Everything, in one place |
| **Quick answers** | A reference panel: pick a common question or type your own (key insights, strongest decisions, gaps, pain points, project summaries) | Each answer names the query it used |

Every page ends with a **"How the database does this"** panel that names the concepts behind it and shows the SQL.

**Keyboard shortcuts:** `/` search, `N` add something new, `A` quick answers, `?` show shortcuts, `Esc` close.

**Demo data:** TRACE opens with a fictional sample study (the same rows as `sql/04_seed_data.sql`). Anything you add is kept in this browser with localStorage, so it is still there after a reload. To start again from the original sample, clear the site's data in your browser settings.

**Background:** a WebGL shader (`js/background.js`) draws slowly flowing liquid in the TRACE colours. **Pause motion** in the sidebar stops it. It also stops for people who ask their system for reduced motion, and it is skipped on phones.

## Run it now

Double-click `index.html`. It opens with the sample study loaded. No setup is needed.

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
js/config.js                the optional AI switch
js/icons.js                 icon shapes (Lucide)
js/sample-data.js           the fictional sample study (generated from tools/generate_seed.py)
js/helpers.js               esc() for safe HTML, icons, dates, toasts, dialogs, the form builder
js/charts.js                bar, column, donut, ring and funnel charts made from HTML + CSS
js/db.js                    ALL data access: loadAll(), save functions, statistics, the views
js/editors.js               every add/edit form
js/assistant.js             Quick answers
js/pages/*.js               one file per page: home, projects, library, trail, sessions, people, database
js/app.js                   start-up, sidebar, shortcuts, and which page to show for each address
js/background.js            the moving liquid background (WebGL; you don't need to edit it)
css/tokens.css              brand colours, spacing, type (change the design here)
css/style.css               all styles, in numbered sections
sql/                        01 schema, 02 constraints, 03 security, 04 seed, 05 queries, 06 views, 99 uninstall
api/ask.js                  optional Vercel function for real AI answers
assets/                     logo, favicon, fonts, liquid.webp (still image used if WebGL is unavailable)
tools/                      generate_seed.py (sample data)
tests/                      SQL tests and browser tests (not deployed)
```

The pattern every page follows:

1. `loadAll()` in `db.js` reads every table into one object, `data`, for example `data.research_project`.
2. A page function such as `pageProjects()` builds HTML from `data` with template strings, then attaches click handlers. Every value from the database goes through `esc()`, so typed text can't become HTML.
3. A form in `editors.js` calls a save function in `db.js`. It writes one change, reloads `data`, and the page is drawn again.

**To add a page:** write `function pageSomething()` in a new file in `js/pages/`, add a `<script>` tag for it in `index.html`, and add a line to `ROUTES` in `app.js`.

## The database (sql folder)

The app runs as a browser demo, but the database behind its design is real PostgreSQL. You can install it anywhere PostgreSQL runs (a local install, or a free Supabase project's SQL Editor) and show it in class. Run the files in this order:

| Order | File | What it does |
| --- | --- | --- |
| 1 | `sql/01_schema.sql` | 21 tables. Stops without changes if TRACE tables already exist. |
| 2 | `sql/02_constraints_and_indexes.sql` | Foreign keys, CHECK and UNIQUE rules, indexes, triggers |
| 3 | `sql/03_security.sql` | Row Level Security, grants, the `trace_editor` allowlist (needs Supabase's `auth` schema, or the stubs in `tests/sql/00_supabase_local_stubs.sql`) |
| 4 | `sql/04_seed_data.sql` | The same fictional study the app shows |
| 5 | `sql/06_views.sql` | 9 views and the recursive `trace_lineage` function, the ones in the Database page's query lab |
| optional | `sql/05_demo_queries.sql` | Ten read-only queries to show in class |

Only `99_uninstall_trace.sql` deletes anything, and it refuses to run until you uncomment its confirmation line.

The app's Database page computes each view in the browser with the same logic, so the demo works offline. The SQL tests check the real views against the same data. An earlier version of the app could also read and write a live Supabase database; it is in the git history (commit `b57b688`) if you want to bring that back later.

## Security model

This is designed into `sql/03_security.sql` and tested by the SQL tests. The browser demo has no sign-in.

| Who | Can do |
| --- | --- |
| Visitors | Read every TRACE table and view (the data is fictional and meant to be shown) |
| Signed-in user not in `trace_editor` | Read only |
| Signed-in editor | Create and update records, add and remove links |
| Anyone through the API | Can't delete projects or evidence (projects are archived instead) |

- Row Level Security is on for every table, and views use `security_invoker`, so they obey it too.
- `trace_editor` can't be read through the API. The `trace_is_editor()` function only answers "am I an editor?".
- **Don't store real participant data in this demo.** Public read access is fine only because the data is fictional.
- Every value shown on screen goes through `esc()`. `vercel.json` sets a Content Security Policy that only allows the site's own scripts and connections.

## Optional: real AI answers

**Quick answers** works without any AI: it answers from your data using the same queries as the charts. To have Claude answer instead, using a short summary of your research as context:

1. Deploy to Vercel (see below).
2. In Vercel → Project → **Settings → Environment Variables**, add `ANTHROPIC_API_KEY` (from <https://console.anthropic.com>). Optionally add `ANTHROPIC_MODEL`; the default in `api/ask.js` is `claude-haiku-5-5`. Check current model names at <https://docs.claude.com/en/api/overview> first.
3. Set `const AI_ASSISTANT = true;` in `js/config.js`, commit and push.

The key stays on the server and never reaches the browser. If the AI can't be reached, Quick answers says so and answers from the data instead. Anyone who can open the site can use the endpoint, and that spends your API credit, so turn it off after the demo. **This AI path has not been tested**, because no API key was available while building TRACE.

## Push to GitHub and deploy on Vercel

**GitHub:** create an **empty** repository at <https://github.com/new>, then run:

```bash
cd trace
git remote add origin https://github.com/<your-username>/trace.git
git branch -M main
git push -u origin main
```

Sign in through the browser prompt, or with `gh auth login`. Never paste a token into a chat or a commit. To put your own name on the commits first, run `git commit --amend --reset-author`, since the existing commits use a placeholder author.

**Vercel:** at <https://vercel.com/new>, import the repository. Choose framework preset **Other**, with no build command and the default output directory. No environment variables are needed, unless you enable AI answers. Once it's deployed, open the URL and check that the sample study appears, that you can add a project and still see it after reloading, and that the browser console shows no errors.

TRACE uses `#/` addresses, so no rewrite rules are needed.

## Testing

Results are recorded in `docs/testing-checklist.md`.

| Suite | Command | Needs |
| --- | --- | --- |
| SQL integrity, security, views (33 checks) | `tests/run-sql-tests.sh` | Local PostgreSQL superuser |
| Every user flow in the browser (25 steps) | `node tests/serve.mjs 8080`, then `BASE=http://localhost:8080 node tests/e2e.mjs` | `npm install --no-save playwright && npx playwright install chromium` |

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| Stuck on "Loading TRACE…" | Open the browser console (F12) and look for a red error. Usually a file is missing from the folder. |
| The background is still, not moving | Your browser may not support WebGL, or "reduce motion" is on, or Pause motion was pressed. The still image shows instead, and everything else works. |
| The background feels heavy on an older laptop | Click **Pause motion** at the bottom of the sidebar (the choice is remembered). |
| I want the original sample back | Clear this site's data in your browser settings (it is stored in localStorage). |

## Known limitations

- The app is a browser demo: data lives in this browser's localStorage. The real PostgreSQL design, with constraints, triggers, views, RLS and seed data, is in `sql/` and is tested separately.
- The liquid background needs a graphics card to run smoothly. It was built and checked on a machine without one (about 4 frames a second there), so real-device smoothness hasn't been measured. It draws at 40% resolution and at most 30 frames a second to stay light.
- The optional AI answers (`api/ask.js`) are untested, because no API key was available.
- One user, no sign-in, no real-time collaboration, no file uploads.
