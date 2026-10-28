#!/usr/bin/env bash
# LOCAL TESTING ONLY: rebuilds a throwaway "trace_test" database from the
# real sql/ files and runs the integrity + security tests. Needs psql access
# as a superuser (default: the postgres OS user).
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${TRACE_TEST_DB:-trace_test}
PSQL="psql -v ON_ERROR_STOP=1 -q"
run() { su postgres -c "$PSQL $*"; }
run "-c 'drop database if exists $DB' -c 'create database $DB'" >/dev/null 2>&1
for f in tests/sql/00_supabase_local_stubs.sql sql/01_schema.sql sql/02_constraints_and_indexes.sql \
         sql/03_security.sql sql/04_seed_data.sql; do
  run "-d $DB -f $PWD/$f" >/dev/null
  echo "applied $f"
done
run "-d $DB -f $PWD/sql/05_demo_queries.sql" >/dev/null && echo "ran sql/05_demo_queries.sql"
run "-d $DB -f $PWD/tests/sql/10_integrity_and_security_tests.sql" 2>&1 \
  | grep -E 'PASS|FAIL|ERROR|passed' | sed -E 's/^(psql:[^ ]+ )?NOTICE: +//' | cut -c1-120
