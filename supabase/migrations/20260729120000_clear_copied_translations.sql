-- =============================================================================
-- Clear Arabic/Kurdish product columns that only hold a copy of the English text
-- =============================================================================
-- Symptom
-- -------
-- An Arabic or Kurdish shopper opens a product and sees an Arabic TITLE above an
-- ENGLISH description, and English category text on the card.
--
-- Cause
-- -----
-- The admin product form used to back-fill the English value whenever a localized
-- box was left blank:
--
--   descriptionAr: formData.descriptionAr || formData.description || ''
--   categoryAr:    formData.categoryAr    || formData.category    || 'General'
--
-- and the category picker did the same (`cat.nameAr || cat.name`). The customer
-- side falls back with `descriptionAr?.trim() ? descriptionAr : description`, so a
-- column holding English can never fall through — the app cannot tell "not
-- translated" from "translated to identical words".
--
-- The form now stores NULL for a blank box, but every product saved before that
-- change still carries the copied English. This migration repairs those rows.
--
-- Safety
-- ------
-- Only clears a column when it is EXACTLY equal to the English source (after
-- trimming). A real translation is never equal to the English, so genuine
-- translations are untouched. Empty strings are normalised to NULL at the same
-- time, since '' defeats the `?.trim()` fallback identically.
--
-- Reversible? Not directly — but nothing is lost: every cleared value was, by
-- definition, a duplicate of the English column still sitting in the same row.
--
-- Run the SELECT first to see the blast radius, then the UPDATEs.
-- =============================================================================

-- Preview: how many rows each statement will touch.
select
  count(*) filter (where btrim(coalesce(name_ar, '')) = btrim(coalesce(name, '')) and coalesce(name_ar, '') <> '') as name_ar_copies,
  count(*) filter (where btrim(coalesce(name_ku, '')) = btrim(coalesce(name, '')) and coalesce(name_ku, '') <> '') as name_ku_copies,
  count(*) filter (where btrim(coalesce(description_ar, '')) = btrim(coalesce(description, '')) and coalesce(description_ar, '') <> '') as description_ar_copies,
  count(*) filter (where btrim(coalesce(description_ku, '')) = btrim(coalesce(description, '')) and coalesce(description_ku, '') <> '') as description_ku_copies,
  count(*) filter (where btrim(coalesce(category_ar, ''))    = btrim(coalesce(category, ''))    and coalesce(category_ar, '')    <> '') as category_ar_copies,
  count(*) filter (where btrim(coalesce(category_ku, ''))    = btrim(coalesce(category, ''))    and coalesce(category_ku, '')    <> '') as category_ku_copies,
  count(*) filter (where description_ar = '' or description_ku = '' or category_ar = '' or category_ku = '') as blank_strings
from public.parts;

-- Names: same rule.
update public.parts
   set name_ar = null
 where name_ar is not null
   and btrim(name_ar) = btrim(coalesce(name, ''));

update public.parts
   set name_ku = null
 where name_ku is not null
   and btrim(name_ku) = btrim(coalesce(name, ''));

-- Descriptions: clear when the localized column is just the English one again.
update public.parts
   set description_ar = null
 where description_ar is not null
   and btrim(description_ar) = btrim(coalesce(description, ''));

update public.parts
   set description_ku = null
 where description_ku is not null
   and btrim(description_ku) = btrim(coalesce(description, ''));

-- Categories: same rule.
update public.parts
   set category_ar = null
 where category_ar is not null
   and btrim(category_ar) = btrim(coalesce(category, ''));

update public.parts
   set category_ku = null
 where category_ku is not null
   and btrim(category_ku) = btrim(coalesce(category, ''));

-- Normalise empty strings to NULL — '' passes an `is not null` check but fails
-- `?.trim()` on the client, so it behaves as "no translation" everywhere except
-- in SQL, which makes these rows confusing to audit later.
update public.parts set name_ar        = null where btrim(coalesce(name_ar, ''))        = '';
update public.parts set name_ku        = null where btrim(coalesce(name_ku, ''))        = '';
update public.parts set description_ar = null where btrim(coalesce(description_ar, '')) = '';
update public.parts set description_ku = null where btrim(coalesce(description_ku, '')) = '';
update public.parts set category_ar    = null where btrim(coalesce(category_ar, ''))    = '';
update public.parts set category_ku    = null where btrim(coalesce(category_ku, ''))    = '';

-- Verify: all four counts should be 0 afterwards.
select
  count(*) filter (where name_ar        is not null and btrim(name_ar)        = btrim(coalesce(name, '')))        as name_ar_copies,
  count(*) filter (where name_ku        is not null and btrim(name_ku)        = btrim(coalesce(name, '')))        as name_ku_copies,
  count(*) filter (where description_ar is not null and btrim(description_ar) = btrim(coalesce(description, ''))) as description_ar_copies,
  count(*) filter (where description_ku is not null and btrim(description_ku) = btrim(coalesce(description, ''))) as description_ku_copies,
  count(*) filter (where category_ar    is not null and btrim(category_ar)    = btrim(coalesce(category, '')))    as category_ar_copies,
  count(*) filter (where category_ku    is not null and btrim(category_ku)    = btrim(coalesce(category, '')))    as category_ku_copies
from public.parts;
