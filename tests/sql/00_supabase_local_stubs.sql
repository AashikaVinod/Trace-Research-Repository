-- LOCAL TESTING ONLY. Never run this in Supabase.
-- Recreates the small parts of a Supabase database that TRACE relies on,
-- so the real sql/ files can be validated against plain PostgreSQL.
-- Roles are cluster-wide, so only create them once.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit password 'local-test-only';
  end if;
end $$;
grant anon, authenticated to authenticator;

create schema auth;
grant usage on schema auth to anon, authenticated;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique);
-- Mirrors Supabase's auth.uid(): the "sub" claim of the request JWT.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
                         nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated;

-- Supabase grants broad default privileges on public; emulate them so the
-- tests prove 03_security.sql narrows access deliberately.
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
