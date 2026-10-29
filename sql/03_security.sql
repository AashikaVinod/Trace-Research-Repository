-- =====================================================================
-- TRACE · 03_security.sql
-- Access model for the Supabase Data API (run after 02).
--
-- SINGLE-USER MODE, NO LOGIN. The app talks to the database with the
-- public (anon / publishable) key, and these policies let that key read,
-- add, change and delete every TRACE table. Row Level Security stays ON,
-- so a table with no policy would be closed; here every table has one
-- "open access" policy.
--
-- What that means: anyone who has your site's URL could edit or delete
-- your data. That is fine for a private project; do not share the link,
-- and do not store real participant data under this model.
--
-- To lock it down later, replace the "open access" policies with policies
-- that check a signed-in user (Supabase Auth) instead of `true`.
-- =====================================================================

begin;

-- The integrity triggers call this read-only helper as the user making the
-- change, so the app's role needs to be allowed to run it.
revoke all on function public.trace_project_of(text, bigint) from public;
grant execute on function public.trace_project_of(text, bigint) to anon, authenticated;

do $$
declare
  t text;
  tables text[] := array[
    'researcher', 'segment', 'research_method', 'research_project', 'participant',
    'research_question', 'research_session', 'observation', 'finding', 'insight',
    'recommendation', 'design_decision',
    'project_researcher', 'project_method', 'participant_segment', 'session_participant',
    'session_question', 'observation_finding', 'finding_insight', 'insight_recommendation',
    'recommendation_decision'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (true) with check (true)',
      t || ': open access', t);
  end loop;
end
$$;

commit;
