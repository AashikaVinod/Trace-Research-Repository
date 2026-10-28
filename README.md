# TRACE

**Every design decision has a story.**

TRACE is a UX research repository. It stores research projects, participants, sessions, and the evidence they produce, and it connects that evidence step by step:

**Observation → Finding → Insight → Recommendation → Design decision**

The **Evidence trail** page lets you pick any record and follow it back to the observations it rests on, or forward to the decisions it shaped. Every link is a row in a PostgreSQL junction table.

> All projects, people, participants and results in the sample data are **fictional**. They demonstrate the product and are not real research.

This is a Database Management Systems course project at demonstration scale: small, but every feature in it works.

---

## Contents

1. [Features](#features)
2. [Technology](#technology)
3. [Project structure](#project-structure)
4. [Run it locally (demo mode)](#run-it-locally-demo-mode)
5. [Connect Supabase](#connect-supabase)
6. [Security model](#security-model)
7. [Push to GitHub](#push-to-github)
8. [Deploy on Vercel](#deploy-on-vercel)
9. [Testing](#testing)
10. [Troubleshooting](#troubleshooting)
11. [Known limitations](#known-limitations)

---

## Features

| Area | What works |
| --- | --- |
| **Dashboard** | Totals for projects, sessions, participants and insights; record counts at each evidence stage; recent projects, sessions and insights. All counts come from the active data source. |
| **Projects** | List, search, filter by status, create, edit, archive and restore, and a detail page. The detail page covers research questions, sessions, evidence counts, methods and team. |
| **Research library** | Search across record text and filter by project and record type. Create and edit any of the five record types, and view each record's upstream and downstream links. |
| **Evidence trail** | Interactive lineage view built from the database's link tables, with SVG connectors between cards. Click any card to re-centre on it; the browser's back button steps back. It also lists complete trails and the gaps in the evidence. |
| **Sessions** | Create and edit sessions linked to a project, method, facilitator, participants and research questions. Record observations against a session. |
| **Participants** | Fictional codes (`P-01`), age bands and segments. No names or contact details. |
| **Team and methods** | Manage researchers, research methods and participant segments. |

TRACE runs in one of two clearly labelled modes:

- **Demo mode** is used when `js/config.js` is empty. The sample data loads into the browser and changes are kept in `localStorage`. **Nothing is written to PostgreSQL**, and a banner says so.
- **Supabase mode** is used when `js/config.js` has your project URL and publishable key. All reads and writes go to PostgreSQL. A write is reported as saved only after PostgreSQL returns the saved row.

TRACE never switches from Supabase mode to demo mode by itself. If the database can't be reached, you see an error and a retry button, never local data pretending to be the database.

## Technology

- HTML5, CSS3 and vanilla JavaScript (ES modules). No framework, no build step.
- **Supabase**: PostgreSQL, the Data API (PostgREST) and Auth. The official client, `@supabase/supabase-js` 2.117.3, is vendored in `vendor/`.
- **Lucide** icons (a 32-icon subset in `js/icons-data.js`).
- Self-hosted fonts: Schibsted Grotesk for the interface and Newsreader for research text.
- **GitHub** for source control and **Vercel** for static hosting.
- Chart.js is not used. The dashboard shows exact counts, and no chart added information the numbers didn't already give.

Third-party files and their licences are listed in `vendor/LICENSES.md`.

## Project structure

```
trace/
  index.html                 App shell
  vercel.json                Security headers for Vercel
  assets/                    Favicon and fonts
  css/
    tokens.css               Colours, type scale, spacing, evidence-stage colours
    base.css                 Reset and element defaults
    layout.css               Sidebar, top bar, page scaffolding
    components.css           Buttons, forms, tables, dialogs, evidence trail
    responsive.css           Tablet and phone layouts
  js/
    app.js                   Start-up, shell, routes
    config.js                Public Supabase URL + publishable key (empty = demo mode)
    supabase-client.js       Config validation (refuses secret keys) and client creation
    data-access.js           All data operations, used by every page
    backends/
      supabase-backend.js    PostgreSQL through the Supabase Data API
      demo-backend.js        localStorage store enforcing the same rules
    demo-data.js             Sample data (generated, identical to sql/04)
    evidence.js              Evidence chain model and graph traversal
    rules.js                 Validation rules mirroring the SQL constraints
    errors.js                Readable messages for database errors
    auth.js                  Sign-in and editor checks
    router.js                Hash router
    ui.js / forms.js         Safe DOM helpers, dialogs, toasts, form builder
    icons-data.js            Lucide icon subset
    pages/                   dashboard, projects, library, trail, sessions, participants, reference
  sql/
    01_schema.sql            Tables
    02_constraints_and_indexes.sql  Foreign keys, CHECK/UNIQUE, indexes, triggers
    03_security.sql          Row Level Security, grants, editor allowlist
    04_seed_data.sql         Fictional sample data (generated)
    05_demo_queries.sql      Read-only demonstration queries
    99_uninstall_trace.sql   Removes TRACE (refuses to run unless confirmed)
  docs/
    database-design.md       Entities, keys, relationships, normalisation
    testing-checklist.md     What was tested, how, and what is still unverified
  tests/                     Unit, SQL and browser tests (not deployed)
  tools/generate_seed.py     Regenerates sql/04 and js/demo-data.js from one dataset
  vendor/                    supabase-js browser build and licences
```

## Run it locally (demo mode)

ES modules don't load from `file://`, so serve the folder over HTTP. Either of these works:

```bash
cd trace
python3 -m http.server 8080
# or: node tests/serve.mjs 8080
```

Then open <http://localhost:8080>. With `js/config.js` empty, TRACE starts in demo mode with the sample data. **Reset demo data** in the banner restores the original sample.

## Connect Supabase

The Supabase dashboard changes from time to time, so menu names below may differ slightly from what you see.

### 1. Create the project

1. Sign in at <https://supabase.com/dashboard> and create a new project.
2. Supabase asks for a **database password**. Keep it in a password manager. TRACE never needs it, and it must never go into this repository.

### 2. Install the database (SQL Editor)

Open **SQL Editor**, then **New query**. For each file below, paste the whole file and press **Run**, one file at a time and in this order:

| Order | File | What it does |
| --- | --- | --- |
| 1 | `sql/01_schema.sql` | Creates 21 tables. Stops without changes if TRACE tables already exist. |
| 2 | `sql/02_constraints_and_indexes.sql` | Foreign keys, CHECK and UNIQUE rules, indexes, integrity triggers |
| 3 | `sql/03_security.sql` | Row Level Security, grants, the `trace_editor` allowlist |
| 4 | `sql/04_seed_data.sql` | Fictional sample data. Stops without changes if data already exists. |
| optional | `sql/05_demo_queries.sql` | Ten read-only queries to show in class. Run them one at a time. |

None of these files drops or overwrites anything. `99_uninstall_trace.sql` is the only destructive file. It refuses to run until you deliberately uncomment its confirmation line.

### 3. Create your editor account

1. Go to **Authentication → Users → Add user → Create new user**. Enter your email and a strong password, and tick **Auto Confirm User**.
2. In the SQL Editor, make that account an editor:

   ```sql
   insert into public.trace_editor (user_id)
   select id from auth.users where email = 'you@example.com';
   ```
3. Recommended: turn off public sign-ups under **Authentication → Sign In / Providers** ("Allow new users to sign up"). Even if sign-ups stay on, new accounts can only read, because writing requires a row in `trace_editor`.

### 4. Add the public configuration

Find the **Project URL** and **Publishable key** under **Project Settings → API Keys** and **Data API**. The legacy "anon public" key also works. Put both in `js/config.js`:

```js
export const SUPABASE_URL = 'https://abcdefghijkl.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_...';
```

**Public or secret?**

| Value | Safe in the browser and on GitHub? |
| --- | --- |
| Project URL | Yes. It's public. |
| Publishable key (`sb_publishable_…`) or legacy anon key | Yes. It's designed to be public. Row Level Security protects the data. |
| Secret key (`sb_secret_…`) or `service_role` key | **Never.** It bypasses all security. |
| Database password | **Never.** |

Anything delivered to a browser can be read by anyone, so TRACE doesn't pretend these values are hidden. It refuses to start if `js/config.js` contains a secret or `service_role` key, and shows a configuration error instead.

Reload the app. The top bar should say **Supabase: read-only**. Choose **Sign in**, use your editor account, and it changes to **Supabase: editing**.

## Security model

Defined in `sql/03_security.sql` and tested in `tests/sql/10_integrity_and_security_tests.sql`.

| Who | Can do |
| --- | --- |
| Visitors (not signed in) | Read every TRACE table. This is deliberate, because the data is fictional and meant to be shown. |
| Signed-in user **not** in `trace_editor` | Read only |
| Signed-in user in `trace_editor` | Create and update records, create and remove links |
| Anyone through the API | Can't delete projects or evidence records. Projects are archived instead. |

- Row Level Security is enabled on all 22 tables. Every table's grants are revoked first, then granted exactly as needed.
- `trace_editor` has RLS enabled and no policies, so it can't be read through the API. The `trace_is_editor()` function only answers "is the caller an editor?".
- **Do not store real participant data in this demo.** Public read access is appropriate only because the data is fictional. For real research, change the `select` policies to require signing in.
- User text is always inserted with `textContent`, never `innerHTML`. `vercel.json` adds a Content Security Policy, which only allows scripts from the site itself and connections to `*.supabase.co`.

## Push to GitHub

The repository is already initialised with a first commit. To publish it:

1. On <https://github.com/new>, create an **empty** repository (no README, licence or .gitignore), for example `trace`.
2. In a terminal inside the `trace` folder:

   ```bash
   git remote add origin https://github.com/<your-username>/trace.git
   git branch -M main
   git push -u origin main
   ```
3. If Git asks you to authenticate, sign in through the browser prompt (Git Credential Manager) or run `gh auth login` with the GitHub CLI. Never paste a personal access token into a chat or commit it.

Before every push, `git status` should show no `.env` files or keys. The `.gitignore` already excludes common secret files.

## Deploy on Vercel

1. At <https://vercel.com/new>, import your GitHub repository.
2. Framework preset: **Other**. Leave the build command empty and the output directory at its default (the repository root). TRACE is plain static files, so there is nothing to build.
3. **No environment variables are needed.** The two public values live in `js/config.js`. Don't add secrets to Vercel for this app.
4. Deploy, then open the `*.vercel.app` URL and check:
   - the top bar shows **Supabase: read-only** and the dashboard shows your data,
   - after signing in, you can create a project, reload, and still see it,
   - the browser console shows no errors.
5. TRACE uses email and password sign-in only, so no redirect URLs are required. Optionally, set **Authentication → URL Configuration → Site URL** to your Vercel URL.

Every push to `main` redeploys automatically. TRACE uses hash URLs (`/#/projects`), so no rewrite rules are needed.

> If you use a custom Supabase domain instead of `*.supabase.co`, add it to `connect-src` in `vercel.json`.

## Testing

Full details and results: `docs/testing-checklist.md`.

| Suite | Command | Needs |
| --- | --- | --- |
| Unit tests (data layer, evidence graph, config guard, seed integrity) | `node --test tests/unit.test.mjs` | Node 18+ |
| SQL integrity and RLS tests (29) | `tests/run-sql-tests.sh` | Local PostgreSQL superuser |
| Browser workflow test (19–20 steps) | `node tests/serve.mjs 8080 &` then `BASE=http://localhost:8080 node tests/e2e.mjs` | `npm install --no-save playwright && npx playwright install chromium` |
| Supabase-mode browser test against a local replica | `POSTGREST_BIN=/path/to/postgrest tests/supabase-local/run-e2e.sh` | PostgreSQL, PostgREST, Playwright |

`tests/e2e.mjs` also runs against your real deployment. It signs in when you set `BASE`, `TRACE_E2E_EMAIL` and `TRACE_E2E_PASSWORD`, and it creates clearly named `E2E …` records.

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| "TRACE cannot start with this configuration" | `js/config.js` is half-filled, malformed, or contains a secret key. The page lists the exact problem. |
| "The TRACE tables were not found" | The SQL files weren't run, or the API schema cache is stale. Run `notify pgrst, 'reload schema';` in the SQL Editor. |
| Signed in but still "read-only" | Your user isn't in `trace_editor`. Run the insert from step 3. |
| "Couldn't reach Supabase" | Network problem, or the project is paused. Free projects pause when inactive; restore it from the dashboard. |
| Blank page when opening `index.html` directly | ES modules need HTTP. Use a local server, as shown above. |

## Known limitations

- **Real Supabase and Vercel were not reachable from the environment that built TRACE.** Supabase mode was tested against a local replica: the same SQL files on PostgreSQL 16, with PostgREST 12.2.3 serving the API. Sign-in was tested against a **mock** of Supabase Auth. Verify sign-in and one write on your real project; see `docs/testing-checklist.md`.
- Search and filtering run in the browser over fully loaded tables. That's fine for demonstration-sized data. The Data API returns at most 1,000 rows per request by default, so large datasets would need server-side search and pagination.
- Saving a record and its links takes two requests. If the links fail after the record is saved, TRACE says exactly that rather than claiming success. A database function would make this atomic.
- One editor role, no per-project permissions, no real-time collaboration, no file uploads. These were deliberately left out of scope.
- Records can't be deleted through the app. Projects are archived, and evidence links can be removed by editing a record.
