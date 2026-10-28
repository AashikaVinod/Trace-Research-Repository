#!/usr/bin/env bash
# LOCAL TESTING ONLY: rebuilds trace_test from sql/, starts PostgREST + the
# mock Supabase gateway + the static server, then runs the browser tests
# in Supabase mode. Needs: PostgreSQL superuser access, a postgrest binary
# (POSTGREST_BIN), Node 18+, Playwright with Chromium.
set -euo pipefail
cd "$(dirname "$0")/../.."
export JWT_SECRET="local-test-secret-local-test-secret-1234"
POSTGREST_BIN=${POSTGREST_BIN:-postgrest}
./tests/run-sql-tests.sh > /tmp/trace-sql.log 2>&1 || { cat /tmp/trace-sql.log; exit 1; }
su postgres -c "psql -q -d trace_test -c \"insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1','editor@example.org'), ('00000000-0000-0000-0000-0000000000a1','viewer@example.org'); insert into public.trace_editor (user_id) values ('00000000-0000-0000-0000-0000000000e1');\""
PGRST_DB_URI="postgres://authenticator:local-test-only@127.0.0.1:5432/trace_test" PGRST_DB_SCHEMAS=public \
PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$JWT_SECRET" PGRST_SERVER_PORT=3000 "$POSTGREST_BIN" > /tmp/postgrest.log 2>&1 &
P1=$!
node tests/supabase-local/mock-supabase.mjs > /tmp/mock.log 2>&1 &
P2=$!
# A legacy-style anon key (role "anon") signed with the local JWT secret.
ANON=$(node --input-type=module -e "
import crypto from 'node:crypto'; const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const h = b({ alg: 'HS256', typ: 'JWT' }), p = b({ role: 'anon', iss: 'local-test' });
console.log(h + '.' + p + '.' + crypto.createHmac('sha256', process.env.JWT_SECRET).update(h + '.' + p).digest('base64url'));")
TRACE_TEST_URL="http://localhost:54321" TRACE_TEST_KEY="$ANON" node tests/serve.mjs 8090 > /tmp/serve-sb.log 2>&1 &
P3=$!
trap 'kill $P1 $P2 $P3 2>/dev/null || true' EXIT
sleep 1.5
BASE=http://localhost:8090 TRACE_E2E_EMAIL=editor@example.org TRACE_E2E_PASSWORD=editor-pass node ${E2E_SCRIPT:-tests/e2e.mjs}
echo "--- rows written to PostgreSQL by the browser test:"
su postgres -c "psql -At -d trace_test -c \"select 'project', title from research_project where title like 'Demo project%' union all select 'decision', title from design_decision where title like 'Decision %'\""
