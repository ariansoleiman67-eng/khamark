-- Asankary — extra product-detail columns for the electronics/phone catalog.
-- Adds fields the admin product editor now collects: warranty text, SKU, barcode,
-- and physical dimensions. (specifications jsonb + weight already exist in the
-- initial schema.) Idempotent — safe to re-run.

alter table public.parts add column if not exists warranty   text;
alter table public.parts add column if not exists sku        text;
alter table public.parts add column if not exists barcode    text;
alter table public.parts add column if not exists dimensions jsonb;  -- { length, width, height, unit }

-- Optional lookup by SKU / barcode for quick admin search / scanning.
create index if not exists idx_parts_sku     on public.parts(sku)     where sku is not null;
create index if not exists idx_parts_barcode on public.parts(barcode) where barcode is not null;
