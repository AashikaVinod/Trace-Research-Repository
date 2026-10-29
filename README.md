# TRACE: a UX research repository

A DBMS course project. TRACE connects UX research evidence step by step, so any design decision can be traced back to what people actually did and said:

**Observation → Finding → Insight → Recommendation → Design decision**

It is a plain HTML/CSS/JavaScript website (no framework, no build step) on top of a **Supabase** (PostgreSQL) database, deployed on **Vercel**. Photos, sketches and scans are stored in Supabase Storage. There is no login: it is built for one person.

> **To set it up, follow [SETUP.md](SETUP.md)**: Supabase, then GitHub, then Vercel. Step by step, about 30 minutes.

## Pages

| Page | What you can do | Main DBMS idea |
| --- | --- | --- |
| **Dashboard** | Totals, research activity, the next session, evidence in use, project progress, sentiment, best-backed decisions, the latest decision | Aggregates, views, GROUP BY |
| **Projects** | A table with team and evidence per project. Create, edit, archive (with Undo), restore, **delete** (when empty). Project pages list sessions and research questions | JOINs, soft delete, triggers, ON DELETE RESTRICT |
| **Sessions** | All sessions with filters; session pages hold observations, sources and notes | Foreign keys, many-to-many junction tables |
| **People** | Participants (by code only), team, methods and segments | Many-to-many, UNIQUE, CHECK |
| **Research library** | The five kinds of evidence in folder tabs, with search. Record pages show what a record is built on and what is built on it. Add the next step from any record | UNION ALL view, ILIKE, junction tables |
| **Evidence trail** | Pick any record and follow it back to the observations and forward to the decisions, with lines for every link | Recursive CTE (`trace_lineage`) |
| **Sources** | Whiteboard photos, sketches and notes in project folders. Upload your own, click a photo to pin numbered notes on it | Exclusive arc, weak entity, Storage |
| **Database** | The schema, which DBMS concept powers each feature, and a query lab that runs the **real SQL views** on your database | Everything, in one place |

Everything can be **added, edited and deleted** in the app (Delete is inside each edit dialog). The database refuses a delete while other records still depend on it, and the app says why. Keyboard: `/` jumps to search, `N` adds something, `Esc` closes a dialog.

## How the code fits together

```
index.html                  the page shell and the order scripts load in
SETUP.md                    step-by-step: Supabase, GitHub, Vercel
vercel.json                 security headers (allows only this site and Supabase)
js/config.js                your Supabase URL and publishable key (the only file you edit)
js/db.js                    ALL data access: loading, saving, deleting, photo upload, statistics
js/helpers.js               small tools: escaping, icons, toasts, dialogs, the form builder
js/editors.js               every add/edit form (each one has a Delete button when editing)
js/attachments.js           sources (photo upload), notes, and pinned notes on photos
js/charts.js                bars, columns, donuts and funnels made from plain HTML + CSS
js/background.js            the moving liquid background (WebGL; you don't need to edit it)
js/app.js                   start-up, sidebar, and which page to show for each address
js/pages/*.js               one file per page
js/icons.js                 icon shapes (Lucide subset)
vendor/                     the Supabase browser library, vendored so nothing loads from a CDN
css/                        tokens.css (colours, spacing) and style.css (everything else)
assets/                     logo, favicon, fonts, the liquid still image, sources/ (four starter photos)
sql/                        the database (see below)
tests/                      SQL tests, browser tests, and a local Supabase stand-in
tools/                      generate_seed.py (starter data), build_install.py, generate_sources.py
docs/                       database design, DBMS concepts for your presentation, testing record
```

1. `loadAll()` reads every table from Supabase into one `data` object.
2. A page function draws itself from `data` with template strings. Every value goes through `esc()`.
3. A form in `editors.js` calls a save function in `db.js`. It writes one change to Supabase, reloads `data`, and the page is drawn again, so a new record appears everywhere (library, trail, dashboard) at once.

**To add a page:** write `function pageSomething()` in a new file in `js/pages/`, add a `<script>` tag for it in `index.html`, and add a line to `ROUTES` in `app.js`.

## The database

Install it by pasting **`sql/install_all.sql`** into the Supabase SQL Editor (SETUP.md, step 2). That file is the files below joined in order by `tools/build_install.py`:

| File | What it does |
| --- | --- |
| `01_schema.sql` | 24 tables: 12 entity tables, 9 many-to-many junction tables, and sources, notes and pins |
| `02_constraints_and_indexes.sql` | Foreign keys with their delete rules, CHECK and UNIQUE rules, indexes, 5 trigger functions |
| `03_security.sql` | Row Level Security and grants: single-user mode, no login |
| `04_seed_data.sql` | The starter study: one fictional project with sessions, evidence and a team |
| `06_views.sql` | 9 views and the recursive `trace_lineage` function used by the Evidence trail and the Database page |
| `07_sources_and_notes.sql` | Sources, notes and annotation pins (an exclusive arc and a weak entity), plus `v_source_owner` |
| `08_sources_seed.sql` | The starter study's four photos, notes and pins |
| `09_storage.sql` | The public Storage bucket `sources` and its policies |
| `05_demo_queries.sql` | Optional read-only queries to show in class (not part of the install) |
| `99_uninstall_trace.sql` | Destructive: removes TRACE (needs a confirmation line uncommented) |

Design notes and the DBMS concepts behind each feature are in `docs/database-design.md` and `docs/dbms-concepts.md`.

## Security model

Single user, **no login**. The app uses Supabase's public (publishable) key, and the policies in `03_security.sql` let that key read, add, change and delete every table. Row Level Security stays on, with one "open access" policy per table, so a table with no policy would be closed. The result: **anyone who has your site's address can edit or delete your data.** Keep the address private, don't store real participant data, and read the Safety section of SETUP.md. To lock it down later, replace `using (true)` in the policies with a check on a signed-in user.

The app refuses to start if `js/config.js` contains a secret key or the `service_role` key.

## Testing

Results are recorded in `docs/testing-checklist.md`. Nothing has been run against a real Supabase project yet; everything was run against a local PostgreSQL + PostgREST + a Storage stand-in.

| Suite | Command |
| --- | --- |
| 43 SQL checks (constraints, triggers, open access, deletes, views, storage, and the one-file install) | `./tests/run-sql-tests.sh` (needs a local PostgreSQL superuser) |
| 30-step browser test against the database | `POSTGREST_BIN=/path/to/postgrest ./tests/supabase-local/run-e2e.sh` (needs `npm install --no-save playwright && npx playwright install chromium`) |
| Fresh-install check of the starter study | `TRACE_DB=trace_test_install E2E_SCRIPT=tests/smoke.mjs POSTGREST_BIN=... ./tests/supabase-local/run-e2e.sh` |

## Known limitations

- Not yet tested against real Supabase and Vercel (see the testing checklist).
- The starter study's photos are **illustrations** (drawn by `tools/generate_sources.py` in a handwriting font), labelled "Illustration" in the viewer. Photos you upload are labelled "Uploaded".
- Supabase returns at most 1,000 rows per table per request by default; TRACE warns when a table reaches that.
- One user, no login, no real-time collaboration. Links between records are saved with separate requests, so a failure partway says exactly what was and wasn't saved.
