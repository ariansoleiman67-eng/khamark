-- =============================================================================
-- One brand is one brand: stop whitespace splitting it in two
-- =============================================================================
-- `parts.brand` and `parts.category` are the two columns the storefront GROUPS
-- and FILTERS by. A trailing space makes "Honor " a different brand from
-- "Honor": the brand tile filters with brand = 'Honor', the padded row does not
-- match, and the shop's own phone vanishes from its own brand page.
--
-- Three live rows already carried it -- "Tecno ", "Honor ", "Motorola ", all
-- under Phones -- so three phones were invisible behind their brand tile.
--
-- The admin form has trimmed both fields since 20260830 (AdminProductsScreen),
-- but the form is not the only writer: import scripts, SQL edits and the
-- Supabase table editor all write this column directly. So the rule belongs in
-- the database, where every writer passes through it.
--
-- Two parts:
--   1. Clean the rows that are already dirty.
--   2. A BEFORE INSERT/UPDATE trigger that trims on the way in, forever.
--
-- The trigger trims and nothing else. It does not touch NULL-vs-empty: the app
-- reads both as blank already, and rewriting that would make every UPDATE edit a
-- column nobody asked it to change.
--
-- Rollback:  drop trigger parts_trim_text on public.parts;
--            drop function public.parts_trim_text();
-- =============================================================================

-- 1 -- CLEAN WHAT IS ALREADY THERE -------------------------------------------
update public.parts
   set brand = btrim(brand)
 where brand is not null
   and brand <> btrim(brand);

update public.parts
   set category = btrim(category)
 where category is not null
   and category <> btrim(category);

-- The translated twins group nothing, but they sit next to the value they
-- translate, so a stray space is still a visible defect.
update public.parts
   set category_ar = btrim(category_ar)
 where category_ar is not null
   and category_ar <> btrim(category_ar);

update public.parts
   set category_ku = btrim(category_ku)
 where category_ku is not null
   and category_ku <> btrim(category_ku);

-- 2 -- KEEP IT CLEAN ----------------------------------------------------------
-- Plain (INVOKER) function: it touches only the row being written, so it needs
-- no privilege the writer does not already hold. `set search_path` regardless --
-- a trigger function without one resolves btrim/nullif through the caller's
-- path.
create or replace function public.parts_trim_text()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- btrim ONLY. NULL stays NULL and '' stays '', because the app already treats
  -- the two the same everywhere it reads these ((p.brand || '').trim()), and a
  -- trigger that also rewrote emptiness would silently edit rows it was never
  -- asked to touch -- every UPDATE would flip a NULL brand to ''.
  new.brand       := btrim(new.brand);
  new.category    := btrim(new.category);
  new.category_ar := btrim(new.category_ar);
  new.category_ku := btrim(new.category_ku);
  return new;
end;
$$;

drop trigger if exists parts_trim_text on public.parts;

create trigger parts_trim_text
  before insert or update on public.parts
  for each row
  execute function public.parts_trim_text();

-- 3 -- PROOF ------------------------------------------------------------------
-- Expect 0 rows. Anything returned here means the update above missed a column.
select id, brand, category
  from public.parts
 where brand    <> btrim(brand)
    or category <> btrim(category);
