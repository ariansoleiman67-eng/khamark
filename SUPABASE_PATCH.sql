-- Quick patch: parts columns the app needs (safe to run once).
alter table public.parts add column if not exists shipping_cost        numeric(10,2);
alter table public.parts add column if not exists historical_stock_qty integer;
alter table public.parts add column if not exists initial_stock        integer;
alter table public.parts add column if not exists sort_order           integer default 0;
alter table public.parts add column if not exists vip_price_usd        numeric(10,2);
alter table public.parts add column if not exists compare_at_price_usd numeric(10,2);
alter table public.parts add column if not exists storage_options      jsonb default '[]'::jsonb;
