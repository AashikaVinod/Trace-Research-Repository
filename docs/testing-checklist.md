# TRACE testing checklist

**Status key**
- ✅ **Verified**: an automated test passed.
- 🟡 **Verified locally**: passed against a local replica of Supabase, not the real service.
- ⬜ **Unverified**: must be checked on the real Supabase project and Vercel deployment (SETUP.md steps 5 and 7).

## How the local replica works

The build environment could not reach `supabase.co` or `vercel.com`, so the app is tested against a replica built from:

- PostgreSQL 16 running the real `sql/` files, plus the Supabase-like roles and storage tables from `tests/sql/00_supabase_local_stubs.sql`;
- **PostgREST**, the engine behind Supabase's Data API;
- `tests/supabase-local/gateway.mjs`, which proxies `/rest/v1` to PostgREST and provides a **mock** of Supabase Storage (upload, public read, delete). The mock is not Supabase Storage;
- headless Chromium running the vendored `supabase-js` 2.117.3 with the production Content-Security-Policy from `vercel.json`.

Run it: `./tests/run-sql-tests.sh`, then `POSTGREST_BIN=/path/to/postgrest ./tests/supabase-local/run-e2e.sh`. For the fresh-install check: `TRACE_DB=trace_test_install E2E_SCRIPT=tests/smoke.mjs POSTGREST_BIN=... ./tests/supabase-local/run-e2e.sh`.

## Results (29 October 2026)

| Suite | Result |
| --- | --- |
| SQL integrity, access, delete, view, sources and storage tests (`tests/run-sql-tests.sh`) | 43 checks passed |
| `sql/install_all.sql` on an empty database | Installs: 1 project, 8 observations, 4 sources, the `sources` bucket |
| Every user flow in the browser (`tests/e2e.mjs`), against PostgreSQL | 30/30 steps passed |
| Fresh-install check of the starter study (`tests/smoke.mjs`) | 16/16 checks passed |
| "Start completely empty" SQL from SETUP.md | Clears everything, keeps team, methods and segments, numbering restarts at 1 |

The browser test covers: creating and editing projects, questions, sessions, participants, team members, methods and segments; all five evidence steps with linking and unlinking; **uploading a photo (it reaches Storage and loads back)** and pinning a note on it; notes; the evidence trail with its lines; search, tabs and filters; duplicate refusal; archive with Undo; **deleting is refused while other records depend on it, a decision can be deleted from its edit dialog and leaves the trail, and deleting a photo removes its row and its file**; and every query in the Database page, which now runs the real SQL views.

## The 20 required checks

| # | Check | Status | Evidence |
| --- | --- | --- | --- |
| 1 | App opens without major console errors | 🟡 | The browser test fails on any page or console error (except the deliberate 400 and 409 refusals) |
| 2 | Navigation works | 🟡 | All pages render; the mobile drawer opens, closes with Escape, navigates |
| 3 | Projects load from Supabase | 🟡 | Dashboard shows the projects read through PostgREST |
| 4 | A project can be created | 🟡 | Created in the browser test |
| 5 | The project can be edited | 🟡 | Edited in the browser test |
| 6 | The project remains after refresh | 🟡 | Page reloaded; row confirmed with `psql` |
| 7 | Participants and sessions can be created and retrieved | 🟡 | Participant with segment; session with participant and question |
| 8 | Observations connect to sessions | 🟡 | Observation created from the session page |
| 9 | Findings connect to observations | 🟡 | Linked record preselected and saved |
| 10 | Insights connect to findings | 🟡 | Same flow |
| 11 | Recommendations connect to insights | 🟡 | Same flow |
| 12 | Design decisions connect to recommendations | 🟡 | Same flow |
| 13 | Evidence Trail shows the correct relationships | 🟡 | New chain shown as "complete story", connectors drawn, back button works, deleted decision leaves the trail |
| 14 | Search and filters return correct results | 🟡 | Run-specific search returns exactly 5 records; type filter returns 1; no-match state shown |
| 15 | Dashboard metrics match the database | 🟡 | Dashboard totals computed from the loaded rows; seed counts match SQL |
| 16 | Invalid form data is rejected | ✅ | Short title, short objective, end date before start, bad participant code |
| 17 | Database errors are communicated clearly | 🟡 | Duplicate title; "This can't be deleted yet: observations still depend on it" |
| 18 | Missing or unsafe configuration is handled | 🟡 | An empty `js/config.js` shows the setup screen (seen when testing). The refusal of secret and `service_role` keys is **not** automatically tested |
| 19 | Deployed site loads and assets work | ⬜ | Needs the Vercel address |
| 20 | Deployed site performs a real database operation | ⬜ | Needs real Supabase and Vercel |

## Not tested

- Anything against a real Supabase project or a real Vercel deployment (checks 19 and 20 above, and the Storage bucket policies as written for Supabase's own `storage` schema, which the replica only imitates).
- The background's smoothness on a machine with a graphics card, and real screen readers.
- What happens above 1,000 rows in one table (the app warns; this is untested).

## Still to verify on the real services (about 10 minutes)

Do SETUP.md steps 2 to 7, then:

1. **Table Editor:** 24 tables; `research_project` 1 row, `observation` 8, `source` 4.
2. **Storage → sources:** after step 3, the four photos are there and appear on the **Sources** page.
3. Add a record on the live site. Find it in **Table Editor**.
4. Add a photo on the live site. Find the file in **Storage → sources**.
5. Delete the photo from its edit dialog. The row and the file disappear.
6. Open the browser console on the live site and look for red errors, especially Content-Security-Policy ones.
