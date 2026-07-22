-- ============================================================================
-- ASANKARY — Supabase Storage bucket for images (product/brand/category/profile).
-- Run once in the SQL Editor. The app (ImageService) already uploads to the
-- 'media' bucket and reads back the public URL — it only needs the bucket to exist.
-- Free tier includes 1 GB storage (~thousands of product photos).
-- ============================================================================

-- 1. Public 'media' bucket (public = anyone can VIEW an image by URL; that's what
--    product photos need). 20 MB per-file cap.
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 20971520)
on conflict (id) do update set public = true, file_size_limit = 20971520;

-- 2. Access policies on storage.objects, scoped to this bucket. Permissive to
--    match the rest of the schema (app/edge layer enforces who can act). Tighten
--    the write/delete policies to `auth.role() = 'authenticated'` once the app
--    authenticates through Supabase Auth.
drop policy if exists "media_public_read" on storage.objects;
create policy "media_public_read" on storage.objects
  for select using (bucket_id = 'media');

drop policy if exists "media_insert" on storage.objects;
create policy "media_insert" on storage.objects
  for insert with check (bucket_id = 'media');

drop policy if exists "media_update" on storage.objects;
create policy "media_update" on storage.objects
  for update using (bucket_id = 'media');

drop policy if exists "media_delete" on storage.objects;
create policy "media_delete" on storage.objects
  for delete using (bucket_id = 'media');
