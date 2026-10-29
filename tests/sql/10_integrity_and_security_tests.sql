-- LOCAL TESTING ONLY. Validates constraints, triggers and RLS after
-- running tests/sql/00_supabase_local_stubs.sql and sql/01..09 (with the full demo data).
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

-- ---- Open access: the app uses the public (anon) role for everything ------
select pg_temp.expect_ok('ACCESS: the app can read projects', 'anon', null,
  $q$select count(*) from public.research_project$q$);
select pg_temp.expect_ok('ACCESS: the app can create projects (identity id works without a sequence grant)', 'anon', null,
  $q$insert into public.research_project (title, research_objective, start_date) values ('App project', 'Objective long enough', '2026-01-01')$q$);
select pg_temp.expect_ok('ACCESS: the app can edit and archive projects', 'anon', null,
  $q$update public.research_project set archived_at = now() where title = 'App project'$q$);
select pg_temp.expect_ok('ACCESS: the app can link evidence', 'anon', null,
  $q$insert into public.observation_finding (observation_id, finding_id) values (2, 1)$q$);
select pg_temp.expect_ok('ACCESS: the app can remove links', 'anon', null,
  $q$delete from public.observation_finding where observation_id = 2 and finding_id = 1$q$);

-- ---- Deleting ---------------------------------------------------------------
select pg_temp.expect_ok('DELETE: an empty project can be deleted', 'anon', null,
  $q$delete from public.research_project where title = 'App project'$q$);
select pg_temp.expect_error('DELETE: a project with records is protected (RESTRICT)', 'anon', null,
  $q$delete from public.research_project where id = 1$q$, '23503');
select pg_temp.expect_error('DELETE: a session with observations is protected (RESTRICT)', 'anon', null,
  $q$delete from public.research_session where id = 1$q$, '23503');
select pg_temp.expect_error('DELETE: a researcher who wrote notes is protected (RESTRICT)', 'anon', null,
  $q$delete from public.researcher where id in (select author_id from public.note limit 1)$q$, '23503');


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

-- ---- Sources, notes and pins (sql/07) ---------------------------------
select pg_temp.expect_error('EXCLUSIVE ARC: a source cannot belong to two records', 'postgres', null,
  $q$insert into public.source (title, file_url, finding_id, insight_id) values ('Two parents', 'x.webp', 1, 1)$q$, '23514');
select pg_temp.expect_error('EXCLUSIVE ARC: a source must belong to something', 'postgres', null,
  $q$insert into public.source (title, file_url) values ('No parent', 'x.webp')$q$, '23514');
select pg_temp.expect_error('CHECK: source kind vocabulary', 'postgres', null,
  $q$insert into public.source (title, kind, file_url, finding_id) values ('Bad kind', 'video', 'x.webp', 1)$q$, '23514');
select pg_temp.expect_error('CHECK: annotation pins stay on the image', 'postgres', null,
  $q$insert into public.annotation (source_id, x, y, body, author_id) values (1, 1.2, 0.5, 'Off the edge', 1)$q$, '23514');
select pg_temp.expect_error('FK: a note needs a real author', 'postgres', null,
  $q$insert into public.note (body, author_id, finding_id) values ('Who wrote this?', 999, 1)$q$, '23503');
do $$
declare n int;
begin
  delete from public.source where id = 1;
  select count(*) into n from public.annotation where source_id = 1;
  if n = 0 then raise notice 'PASS  WEAK ENTITY: deleting a source deletes its pins (ON DELETE CASCADE)';
  else raise exception 'FAIL  % pins left behind', n; end if;
end $$;
select pg_temp.expect_ok('ACCESS: the app can add and delete notes', 'anon', null,
  $q$with n as (insert into public.note (body, author_id, insight_id) values ('App note', 1, 1) returning id) delete from public.note where id in (select id from n)$q$);
select pg_temp.expect_ok('ACCESS: the app can add and delete pins', 'anon', null,
  $q$with p as (insert into public.annotation (source_id, x, y, body, author_id) values (2, 0.5, 0.5, 'App pin', 1) returning id) delete from public.annotation where id in (select id from p)$q$);
select pg_temp.expect_ok('STORAGE: the app can add and delete files in the sources bucket', 'anon', null,
  $q$with f as (insert into storage.objects (bucket_id, name) values ('sources', 'test.webp') returning id) delete from storage.objects where id in (select id from f)$q$);
select pg_temp.expect_error('STORAGE: other buckets stay closed', 'anon', null,
  $q$insert into storage.objects (bucket_id, name) values ('somewhere-else', 'x.webp')$q$, '42501');

-- Writes performed directly as the API role (not inside a helper function),
-- exactly as PostgREST runs them, so trigger permissions are exercised.
set local role anon;
insert into public.observation (session_id, title, description) values (1, 'App observation', 'Inserted as the API role');
insert into public.observation_finding (observation_id, finding_id)
  select id, 1 from public.observation where title = 'App observation';
insert into public.finding (project_id, title, description) values (1, 'App finding', 'Inserted as the API role');
update public.observation set session_id = 2 where title = 'App observation';
reset role;
\echo 'PASS  API role: the app inserts observations, links and findings through the triggers'

-- ---- Destructive delete tests run last (earlier tests use these records) ------
do $$
declare links_before int; links_after int; obs_before int; obs_after int;
begin
  select count(*) into links_before from public.observation_finding where finding_id = 1;
  select count(*) into obs_before from public.observation;
  perform pg_temp.run_as('anon', null, 'delete from public.finding where id = 1');
  select count(*) into links_after from public.observation_finding where finding_id = 1;
  select count(*) into obs_after from public.observation;
  if links_before > 0 and links_after = 0 and obs_before = obs_after then
    raise notice 'PASS  DELETE: deleting a finding removes its links but not its observations (CASCADE on the junction)';
  else raise exception 'FAIL  finding delete: links % -> %, observations % -> %', links_before, links_after, obs_before, obs_after; end if;
end $$;
do $$
declare links_before int; links_after int; target bigint;
begin
  select participant_id into target from public.session_participant limit 1;
  select count(*) into links_before from public.session_participant where participant_id = target;
  perform pg_temp.run_as('anon', null, format('delete from public.participant where id = %s', target));
  select count(*) into links_after from public.session_participant where participant_id = target;
  if links_before > 0 and links_after = 0 then raise notice 'PASS  DELETE: deleting a participant removes their session links (CASCADE)';
  else raise exception 'FAIL  participant delete: links % -> %', links_before, links_after; end if;
end $$;
select pg_temp.expect_ok('DELETE: a session without observations can be deleted', 'anon', null,
  $q$delete from public.research_session where not exists (select 1 from public.observation o where o.session_id = research_session.id) and id = (select min(id) from public.research_session s where not exists (select 1 from public.observation o where o.session_id = s.id))$q$);

rollback;
\echo 'All SQL tests passed.'
