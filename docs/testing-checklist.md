# TRACE testing checklist

**Status key**
- ✅ **Verified**: an automated test passed.
- 🟡 **Verified locally**: passed against a local replica of Supabase, not the real service.
- ⬜ **Unverified**: must be checked on the real Supabase project and Vercel deployment.

## How the local replica worked

The build environment could not reach `supabase.co` or `vercel.com`. Supabase mode was tested against a replica built from:

- PostgreSQL 16 running the real `sql/01`–`04` files, plus Supabase-like roles (`anon`, `authenticated`, `auth.uid()`) from `tests/sql/00_supabase_local_stubs.sql`;
- **PostgREST 12.2.3**, the engine behind Supabase's Data API;
- `tests/supabase-local/mock-supabase.mjs`, which proxies `/rest/v1` and provides a **mock** password sign-in. The mock is not Supabase Auth.

The browser was headless Chromium running the vendored `supabase-js` 2.117.3, with the production Content-Security-Policy from `vercel.json` applied.

## Results (28 October 2026)

| Suite | Result |
| --- | --- |
| Unit tests (`tests/unit.test.mjs`) | 9/9 passed |
| SQL integrity and security tests (`tests/run-sql-tests.sh`) | 29/29 passed |
| Browser workflow, demo mode (`tests/e2e.mjs`) | 19/19 passed |
| Browser access checks, Supabase replica (`tests/supabase-local/readonly.mjs`) | 6/6 passed |
| Browser workflow, Supabase replica, signed in as editor | 20/20 passed. Rows confirmed in PostgreSQL afterwards. |
| Layout check at 390 px and 820 px wide | No horizontal overflow on dashboard, trail, library or project pages; mobile navigation works |

## The 20 required checks

| # | Check | Status | Evidence |
| --- | --- | --- | --- |
| 1 | App opens without major console errors | ✅ | Every e2e run fails on any page error or console error |
| 2 | Navigation works | ✅ | All 11 routes render; mobile drawer opens, closes with Escape, navigates |
| 3 | Projects load from Supabase | 🟡 | Dashboard shows 4 projects read through PostgREST |
| 4 | A project can be created | 🟡 ✅ | Both modes |
| 5 | The project can be edited | 🟡 ✅ | Both modes |
| 6 | The project remains after refresh | 🟡 ✅ | Page reloaded; row confirmed with `psql` |
| 7 | Participants and sessions can be created and retrieved | 🟡 ✅ | Participant with segment; session with participant and question |
| 8 | Observations connect to sessions | 🟡 ✅ | Observation created from the session page |
| 9 | Findings connect to observations | 🟡 ✅ | Linked record preselected and saved |
| 10 | Insights connect to findings | 🟡 ✅ | |
| 11 | Recommendations connect to insights | 🟡 ✅ | |
| 12 | Design decisions connect to recommendations | 🟡 ✅ | |
| 13 | Evidence Trail shows the correct relationships | 🟡 ✅ | New chain shown as "complete trail", connectors drawn, back button works |
| 14 | Search and filters return correct results | ✅ | Run-specific search returns exactly 5 records; type filter returns 1; no-match state shown |
| 15 | Dashboard metrics match the database | 🟡 ✅ | Dashboard total equals the project list; seed counts match SQL |
| 16 | Invalid form data is rejected | ✅ | Short title, short objective, end date before start, bad participant code |
| 17 | Database errors are communicated clearly | 🟡 ✅ | Duplicate title message, permission message, wrong password message |
| 18 | Missing or unsafe configuration is handled | ✅ | Empty config gives demo mode; half-filled, secret or `service_role` keys give a configuration error (unit-tested) |
| 19 | Deployed site loads and assets work | ⬜ | Needs the Vercel URL |
| 20 | Deployed site performs a real database operation | ⬜ | Needs real Supabase and Vercel |

Security checks covered by the SQL tests include:

- visitors can't write;
- signed-in non-editors can't write or link evidence (their updates affect 0 rows);
- editors can write through the integrity triggers;
- nobody can delete projects or evidence through the API;
- `trace_editor` is unreadable;
- cross-project links, project changes and new work in archived projects are refused.

A bug was found and fixed during this testing. Editors couldn't save observations through the API, because a helper used by the triggers wasn't executable by the `authenticated` role. A SQL test now runs writes directly as the API role, so this can't regress.

## Still to verify on the real services (manual, about 10 minutes)

1. After running `sql/01`–`04` in Supabase, run Q1 in `05_demo_queries.sql`. It should show 3 projects in use, 1 archived, 13 sessions, 12 participants and 7 insights.
2. Open the site locally with `js/config.js` filled in. The top bar should say **Supabase: read-only**, with the same numbers.
3. Sign in with your editor account. The top bar should say **Supabase: editing**. This is the first test against **real** Supabase Auth.
4. Create a project, reload, and confirm it's still there. In **Table Editor → research_project**, confirm the row exists.
5. Sign out and click **New project**. A sign-in prompt should appear, and nothing should be saved.
6. Deploy to Vercel and repeat steps 2–4 on the `*.vercel.app` URL. Check the browser console for errors, especially Content-Security-Policy ones.
7. Optional: run the full browser suite against the live site:
   `BASE=https://<your-app>.vercel.app TRACE_E2E_EMAIL=… TRACE_E2E_PASSWORD=… node tests/e2e.mjs`
   It creates records whose names start with `E2E`. Archive the `E2E project` afterwards.
