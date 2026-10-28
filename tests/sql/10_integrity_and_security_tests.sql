-- LOCAL TESTING ONLY. Validates constraints, triggers and RLS after
-- running tests/sql/00_supabase_local_stubs.sql and sql/01..04.
-- Every test runs inside a transaction that is rolled back.
\set ON_ERROR_STOP on
begin;

create function pg_temp.run_as(r text, claims jsonb, stmt text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', coalesce(claims::text, ''), true);
  perform set_config('role', r, true);
  execute stmt;
  perform set_config('role', 'postgres', true);
exception when others then
  perform set_config('role', 'postgres', true);
  raise;
end $$;

create function pg_temp.expect_error(label text, r text, claims jsonb, stmt text, state text) returns void language plpgsql as $$
declare ok boolean := false;
begin
  begin
    perform pg_temp.run_as(r, claims, stmt);
  exception when others then
    if sqlstate = state then
      raise notice 'PASS  %  (% %)', label, sqlstate, sqlerrm;
      ok := true;
    else
      raise exception 'FAIL  %: expected %, got % %', label, state, sqlstate, sqlerrm;
    end if;
  end;
  if not ok then raise exception 'FAIL  %: statement succeeded but should have failed', label; end if;
end $$;

create function pg_temp.expect_ok(label text, r text, claims jsonb, stmt text) returns void language plpgsql as $$
begin
  perform pg_temp.run_as(r, claims, stmt);
  raise notice 'PASS  %', label;
exception when others then
  raise exception 'FAIL  %: % %', label, sqlstate, sqlerrm;
end $$;

-- Test users: one editor, one signed-in non-editor.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'editor@example.org'),
  ('00000000-0000-0000-0000-0000000000a1', 'viewer@example.org');
insert into public.trace_editor (user_id) values ('00000000-0000-0000-0000-0000000000e1');

\set editor '\'{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}\''
\set viewer '\'{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}\''

-- ---- Integrity (as table owner) ------------------------------------
select pg_temp.expect_error('FK: observation needs a real session', 'postgres', null,
  $q$insert into public.observation (session_id, title, description) values (999, 'Ghost', 'No such session')$q$, '23503');
select pg_temp.expect_error('CHECK: project status vocabulary', 'postgres', null,
  $q$insert into public.research_project (title, research_objective, status, start_date) values ('Bad status', 'Objective long enough', 'bogus', '2026-01-01')$q$, '23514');
select pg_temp.expect_error('CHECK: end date before start date', 'postgres', null,
  $q$insert into public.research_project (title, research_objective, start_date, end_date) values ('Bad dates', 'Objective long enough', '2026-02-01', '2026-01-01')$q$, '23514');
select pg_temp.expect_error('CHECK: participant code format', 'postgres', null,
  $q$insert into public.participant (participant_code) values ('Alice')$q$, '23514');
select pg_temp.expect_error('UNIQUE: participant code', 'postgres', null,
  $q$insert into public.participant (participant_code) values ('P-01')$q$, '23505');
select pg_temp.expect_error('UNIQUE: project title is case-insensitive', 'postgres', null,
  $q$insert into public.research_project (title, research_objective, start_date) values ('MOBILE BANKING ONBOARDING', 'Objective long enough', '2026-01-01')$q$, '23505');
select pg_temp.expect_error('UNIQUE: duplicate evidence link', 'postgres', null,
  $q$insert into public.observation_finding (observation_id, finding_id) values (1, 1)$q$, '23505');
select pg_temp.expect_error('TRIGGER: links stay within one project', 'postgres', null,
  $q$insert into public.observation_finding (observation_id, finding_id) values (9, 1)$q$, '23514');
select pg_temp.expect_error('TRIGGER: decision links stay within one project', 'postgres', null,
  $q$insert into public.recommendation_decision (recommendation_id, decision_id) values (5, 1)$q$, '23514');
select pg_temp.expect_error('TRIGGER: project of a finding is locked', 'postgres', null,
  $q$update public.finding set project_id = 2 where id = 1$q$, '23514');
select pg_temp.expect_error('TRIGGER: observation cannot move to another project', 'postgres', null,
  $q$update public.observation set session_id = 5 where id = 1$q$, '23514');
select pg_temp.expect_ok('TRIGGER: observation can move within its project', 'postgres', null,
  $q$update public.observation set session_id = 2 where id = 2$q$);
select pg_temp.expect_error('TRIGGER: archived projects reject new records', 'postgres', null,
  $q$insert into public.finding (project_id, title, description) values (4, 'Late finding', 'Should be refused')$q$, '23514');
select pg_temp.expect_error('RESTRICT: projects with records cannot be deleted', 'postgres', null,
  $q$delete from public.research_project where id = 1$q$, '23503');

do $$
declare before timestamptz; after timestamptz;
begin
  select updated_at into before from public.insight where id = 1;
  update public.insight set impact = 'medium' where id = 1;
  select updated_at into after from public.insight where id = 1;
  if after > before then raise notice 'PASS  TRIGGER: updated_at is maintained';
  else raise exception 'FAIL  updated_at did not change'; end if;
end $$;

-- ---- Row Level Security ----------------------------------------------
select pg_temp.expect_ok('RLS: visitors can read projects', 'anon', null,
  $q$select count(*) from public.research_project$q$);
select pg_temp.expect_error('RLS: visitors cannot create projects', 'anon', null,
  $q$insert into public.research_project (title, research_objective, start_date) values ('Anon project', 'Objective long enough', '2026-01-01')$q$, '42501');
select pg_temp.expect_error('RLS: visitors cannot read the editor list', 'anon', null,
  $q$select * from public.trace_editor$q$, '42501');
select pg_temp.expect_error('RLS: signed-in non-editors cannot create projects', 'authenticated', :viewer,
  $q$insert into public.research_project (title, research_objective, start_date) values ('Viewer project', 'Objective long enough', '2026-01-01')$q$, '42501');
select pg_temp.expect_error('RLS: signed-in non-editors cannot link evidence', 'authenticated', :viewer,
  $q$insert into public.observation_finding (observation_id, finding_id) values (2, 1)$q$, '42501');
select pg_temp.expect_ok('RLS: editors can create projects (identity id without sequence grant)', 'authenticated', :editor,
  $q$insert into public.research_project (title, research_objective, start_date) values ('Editor project', 'Objective long enough', '2026-01-01')$q$);
select pg_temp.expect_ok('RLS: editors can update and archive projects', 'authenticated', :editor,
  $q$update public.research_project set archived_at = now() where title = 'Editor project'$q$);
select pg_temp.expect_ok('RLS: editors can link evidence', 'authenticated', :editor,
  $q$insert into public.observation_finding (observation_id, finding_id) values (2, 1)$q$);
select pg_temp.expect_ok('RLS: editors can remove links', 'authenticated', :editor,
  $q$delete from public.observation_finding where observation_id = 2 and finding_id = 1$q$);
select pg_temp.expect_error('GRANT: nobody deletes projects through the API', 'authenticated', :editor,
  $q$delete from public.research_project where title = 'Editor project'$q$, '42501');
select pg_temp.expect_error('GRANT: nobody deletes evidence records through the API', 'authenticated', :editor,
  $q$delete from public.observation where id = 2$q$, '42501');

do $$
declare n int;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', true);
  update public.finding set title = 'Hijacked' where id = 1;
  get diagnostics n = row_count;
  perform set_config('role', 'postgres', true);
  if n = 0 then raise notice 'PASS  RLS: non-editor updates affect zero rows';
  else raise exception 'FAIL  non-editor updated % rows', n; end if;
end $$;

select pg_temp.expect_ok('RPC: trace_is_editor is callable by visitors', 'anon', null,
  $q$select public.trace_is_editor()$q$);

-- ---- Views and the recursive lineage function ------------------------
do $$
declare n int;
begin
  select count(*) into n from public.trace_lineage('design_decision', 1) where record_type = 'observation';
  if n = 4 then raise notice 'PASS  VIEW+CTE: decision 1 traces back to 4 observations';
  else raise exception 'FAIL  lineage found % observations', n; end if;
  select count(*) into n from public.v_evidence_gap where record_type = 'recommendation';
  if n = 2 then raise notice 'PASS  VIEW: gap view finds the 2 recommendations without a decision';
  else raise exception 'FAIL  gap view found %', n; end if;
  select observations into n from public.v_decision_strength where id = 1;
  if n = 4 then raise notice 'PASS  VIEW: decision strength counts distinct observations';
  else raise exception 'FAIL  strength %', n; end if;
end $$;
select pg_temp.expect_ok('VIEW: visitors can read views and call trace_lineage', 'anon', null,
  $q$select (select count(*) from public.v_project_summary) + (select count(*) from public.trace_lineage('finding', 1))$q$);

-- Writes performed directly as the API role (not inside a helper function),
-- exactly as PostgREST runs them, so trigger permissions are exercised.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
insert into public.observation (session_id, title, description) values (1, 'Editor observation', 'Inserted as the API role');
insert into public.observation_finding (observation_id, finding_id)
  select id, 1 from public.observation where title = 'Editor observation';
insert into public.finding (project_id, title, description) values (1, 'Editor finding', 'Inserted as the API role');
update public.observation set session_id = 2 where title = 'Editor observation';
reset role;
\echo 'PASS  API role: editor inserts observations, links and findings through the triggers'

rollback;
\echo 'All SQL tests passed.'
