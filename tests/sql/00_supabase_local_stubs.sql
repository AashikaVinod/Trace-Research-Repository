-- LOCAL TESTING ONLY. Never run this in Supabase.
-- Recreates the small parts of a Supabase database that TRACE relies on
-- (the anon and authenticated roles, and the storage tables), so the real
-- sql/ files can be validated against plain PostgreSQL.
-- Roles are cluster-wide, so only create them once.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit password 'local-test-only';
  end if;
end $$;
grant anon, authenticated to authenticator;

create schema storage;
grant usage on schema storage to anon, authenticated;
create table storage.buckets (id text primary key, name text not null, public boolean default false);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text);
alter table storage.objects enable row level security;
grant all on storage.objects to anon, authenticated;

-- Supabase grants broad default privileges on public; emulate them so the
-- tests prove 03_security.sql sets access deliberately.
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
