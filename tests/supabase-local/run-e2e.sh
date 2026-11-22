#!/usr/bin/env bash
# LOCAL TESTING ONLY: rebuilds the test databases from sql/, starts PostgREST
# + the local Supabase gateway + the static server, then runs a browser test
# against them. Needs: PostgreSQL superuser access, a postgrest binary
# (POSTGREST_BIN), Node 18+, Playwright with Chromium.
#   TRACE_DB=trace_test           the full four-project demo data (default)
#   TRACE_DB=trace_test_install   the starter study from sql/install_all.sql
set -euo pipefail
cd "$(dirname "$0")/../.."
POSTGREST_BIN=${POSTGREST_BIN:-postgrest}
TRACE_DB=${TRACE_DB:-trace_test}
./tests/run-sql-tests.sh > /tmp/trace-sql.log 2>&1 || { cat /tmp/trace-sql.log; exit 1; }
PGRST_DB_URI="postgres://authenticator:local-test-only@127.0.0.1:5432/$TRACE_DB" PGRST_DB_SCHEMAS=public \
PGRST_DB_ANON_ROLE=anon PGRST_SERVER_PORT=3000 "$POSTGREST_BIN" > /tmp/postgrest.log 2>&1 &
P1=$!
node tests/supabase-local/gateway.mjs > /tmp/gateway.log 2>&1 &
P2=$!
TRACE_TEST_URL="http://localhost:54321" TRACE_TEST_KEY="sb_publishable_local_test_key" node tests/serve.mjs 8090 > /tmp/serve-sb.log 2>&1 &
P3=$!
trap 'kill $P1 $P2 $P3 2>/dev/null || true' EXIT
sleep 2
BASE=http://localhost:8090 node ${E2E_SCRIPT:-tests/e2e.mjs}
printf "select 'project' as what, title from research_project where title like 'Demo project%%' union all select 'decision (deleted by the test)', title from design_decision where title like 'Decision %%' union all select 'finding', title from finding where title like 'Finding %%';" > /tmp/trace_rows.sql
echo "--- rows the browser test left in PostgreSQL:"
su postgres -c "psql -At -d $TRACE_DB -f /tmp/trace_rows.sql"
