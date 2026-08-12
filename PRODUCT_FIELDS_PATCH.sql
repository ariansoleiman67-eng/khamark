-- ============================================================================
-- ASANKARY — TRIM WHITESPACE FROM parts.brand AND parts.category
-- ============================================================================
-- This WRITES to your database. It changes only whitespace at the start and end
-- of two text columns — no row is added, deleted, or otherwise altered.
--
-- WHY: the admin product form saved `brand` and `category` without trimming
-- (every other text field WAS trimmed). Three live rows picked up a trailing
-- space:
--     Spark 50      brand = 'Tecno '
--     Moto G15      brand = 'Motorola '
--     Honor 600 5G  brand = 'Honor '
-- Postgres treats 'Tecno ' and 'Tecno' as different values, so the app shows the
-- same brand twice in filters and a customer filtering by Tecno misses the
-- Spark 50. The website already trims defensively, which is how this surfaced.
--
-- The app-side cause is fixed in src/screens/admin/AdminProductsScreen.tsx
-- (category and brand are now .trim()'d on save), so this will not recur. This
-- file cleans up the rows written before that fix.
--
-- HOW TO RUN
--   1. Run STEP 1 alone and read the output — it shows exactly what will change.
--   2. If it looks right, run STEP 2.
--   3. Run STEP 3 to confirm nothing dirty remains.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- STEP 1 — PREVIEW. Read-only. Shows every row that will be touched.
-- Run this FIRST and check the "after" values are what you expect.
-- ----------------------------------------------------------------------------
select
  name,
  '[' || brand    || ']' as brand_now,
  '[' || btrim(brand)    || ']' as brand_after,
  '[' || category || ']' as category_now,
  '[' || btrim(category) || ']' as category_after
from public.parts
where brand    is distinct from btrim(brand)
   or category is distinct from btrim(category)
order by name;


-- ----------------------------------------------------------------------------
-- STEP 2 — THE FIX. Trims both columns on the affected rows only.
--
-- `is distinct from` (rather than `<>`) so NULLs are handled correctly, and the
-- WHERE clause means untouched rows keep their existing updated_at.
-- ----------------------------------------------------------------------------
update public.parts
set brand    = btrim(brand),
    category = btrim(category)
where brand    is distinct from btrim(brand)
   or category is distinct from btrim(category);


-- ----------------------------------------------------------------------------
-- STEP 3 — VERIFY. Both counts must be 0, and the brand list must have no
-- duplicates differing only by whitespace.
-- ----------------------------------------------------------------------------
select
  (select count(*) from public.parts
     where brand is distinct from btrim(brand))       as brands_still_dirty,
  (select count(*) from public.parts
     where category is distinct from btrim(category)) as categories_still_dirty,
  (select count(distinct brand)    from public.parts where is_active) as distinct_brands,
  (select count(distinct category) from public.parts where is_active) as distinct_categories;

-- Expected after the fix: brands_still_dirty 0, categories_still_dirty 0,
-- distinct_brands 5 (Honor, Tecno, Anker, Motorola, Proove),
-- distinct_categories 2 (Phones, Earphone).
