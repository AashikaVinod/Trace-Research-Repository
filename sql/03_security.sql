-- =====================================================================
-- TRACE · 03_security.sql
-- Access model for the Supabase Data API (run after 02).
--
--   Visitors (anon role)        read every TRACE table. The data is
--                               fictional demonstration data, so it is
--                               intentionally public. Do NOT store real
--                               participant data under this model.
--   Signed-in editors           create, update and link records. An editor
--                               is a Supabase Auth user listed in
--                               public.trace_editor.
--   Signed-in non-editors       read only (same as visitors).
--   Nobody via the API          deletes projects or evidence records
--                               (projects are archived). Editors may delete
--                               junction rows, which is how links are removed.
--
-- After running this file, add yourself as an editor:
--   insert into public.trace_editor (user_id)
--   select id from auth.users where email = 'you@example.com';
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Editor allowlist (not exposed through the API: RLS on, no policies,
-- no grants for anon/authenticated)
-- ---------------------------------------------------------------------

create table public.trace_editor (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.trace_editor enable row level security;
revoke all on public.trace_editor from anon, authenticated;

-- security definer: runs as the table owner so it can read trace_editor,
-- but it only ever answers "is the caller an editor?".
create function public.trace_is_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trace_editor e where e.user_id = (select auth.uid())
  );
$$;

revoke all on function public.trace_is_editor() from public;
grant execute on function public.trace_is_editor() to anon, authenticated;

-- Integrity triggers run with the privileges of the user making the change,
-- so signed-in users must be able to execute this read-only helper. It only
-- returns project ids of records that are publicly readable anyway.
revoke all on function public.trace_project_of(text, bigint) from public, anon;
grant execute on function public.trace_project_of(text, bigint) to authenticated;

-- ---------------------------------------------------------------------
-- Grants + RLS policies
-- ---------------------------------------------------------------------

do $$
declare
  t text;
  entity_tables text[] := array[
    'researcher', 'segment', 'research_method', 'research_project', 'participant',
    'research_question', 'research_session', 'observation', 'finding', 'insight',
    'recommendation', 'design_decision'
  ];
  link_tables text[] := array[
    'project_researcher', 'project_method', 'participant_segment', 'session_participant',
    'session_question', 'observation_finding', 'finding_insight', 'insight_recommendation',
    'recommendation_decision'
  ];
begin
  foreach t in array entity_tables || link_tables loop
    execute format('alter table public.%I enable row level security', t);
    -- Start from nothing, then grant exactly what the model needs.
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      t || ': anyone can read', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select public.trace_is_editor()))',
      t || ': editors can insert', t);
  end loop;

  foreach t in array entity_tables loop
    execute format('grant insert, update on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select public.trace_is_editor())) with check ((select public.trace_is_editor()))',
      t || ': editors can update', t);
  end loop;

  foreach t in array link_tables loop
    execute format('grant insert, delete on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select public.trace_is_editor()))',
      t || ': editors can remove links', t);
  end loop;

  -- project_researcher.project_role can be changed in place.
  grant update (project_role) on public.project_researcher to authenticated;
  create policy "project_researcher: editors can update" on public.project_researcher
    for update to authenticated
    using ((select public.trace_is_editor())) with check ((select public.trace_is_editor()));
end
$$;

commit;
