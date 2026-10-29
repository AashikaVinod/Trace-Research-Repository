-- =====================================================================
-- TRACE · 09_storage.sql   (run after 08; needs Supabase Storage)
-- Creates the public bucket "sources" for photos, sketches and scans, and
-- lets the app's public key add, replace and delete files in it (single
-- user, no login: see 03_security.sql). source.file_url holds a file's
-- name in this bucket.
-- =====================================================================

begin;

insert into storage.buckets (id, name, public)
values ('sources', 'sources', true)
on conflict (id) do update set public = true;

create policy "sources: anyone can read"   on storage.objects for select to anon, authenticated using (bucket_id = 'sources');
create policy "sources: anyone can add"    on storage.objects for insert to anon, authenticated with check (bucket_id = 'sources');
create policy "sources: anyone can change" on storage.objects for update to anon, authenticated using (bucket_id = 'sources') with check (bucket_id = 'sources');
create policy "sources: anyone can delete" on storage.objects for delete to anon, authenticated using (bucket_id = 'sources');

commit;
