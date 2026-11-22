#!/usr/bin/env bash
# LOCAL TESTING ONLY: rebuilds a throwaway \"trace_test\" database from the
# real sql/ files (with the full four-project demo data) and runs the
# integrity, access and delete tests. It then installs the one-file installer
# sql/install_all.sql on an empty database to prove it works.
# Needs psql access as a superuser (default: the postgres OS user).
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${TRACE_TEST_DB:-trace_test}
PSQL="psql -v ON_ERROR_STOP=1 -q"
run() { su postgres -c "$PSQL $*"; }
run "-c 'drop database if exists $DB' -c 'create database $DB' -c 'drop database if exists ${DB}_install' -c 'create database ${DB}_install'" >/dev/null 2>&1
for f in tests/sql/00_supabase_local_stubs.sql sql/01_schema.sql sql/02_constraints_and_indexes.sql sql/03_security.sql \
         tests/sql/full_04_seed.sql sql/06_views.sql sql/07_sources_and_notes.sql tests/sql/full_08_sources_seed.sql sql/09_storage.sql; do
  run "-d $DB -f $PWD/$f" >/dev/null
  echo "applied $f"
done
run "-d $DB -f $PWD/sql/05_demo_queries.sql" >/dev/null && echo "ran sql/05_demo_queries.sql"
run "-d $DB -f $PWD/tests/sql/10_integrity_and_security_tests.sql" 2>&1 \
  | grep -E 'PASS|FAIL|ERROR|passed' | sed -E 's/^(psql:[^ ]+ )?NOTICE: +//' | cut -c1-130

# The one-file installer, exactly as you would paste it into Supabase.
run "-d ${DB}_install -f $PWD/tests/sql/00_supabase_local_stubs.sql" >/dev/null
run "-d ${DB}_install -f $PWD/sql/install_all.sql" >/dev/null
printf 'select (select count(*) from public.research_project) as projects, (select count(*) from public.observation) as observations, (select count(*) from public.source) as sources, (select count(*) from storage.buckets where id = $$sources$$) as bucket;' > /tmp/trace_check.sql
echo "PASS  sql/install_all.sql installs on an empty database: $(su postgres -c "psql -d ${DB}_install -At -F ', ' -f /tmp/trace_check.sql") (projects, observations, sources, bucket)"
