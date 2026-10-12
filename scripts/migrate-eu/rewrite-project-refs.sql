-- =============================================================================
-- EU migration: point everything inside the NEW database at the NEW project.
-- =============================================================================
-- Run against the NEW project only, after the database restore (README step 2),
-- with psql variables for the two project refs:
--
--   psql "$NEW_DB_URL" -v old_ref=ucopzrdubjnyfprbaqus -v new_ref=<new-ref> \
--        -f scripts/migrate-eu/rewrite-project-refs.sql
--
-- The old ref is embedded in two kinds of place, both rewritten here:
--   1. DATA — every stored link to a file in Storage (product photos, logos,
--      banners, avatars, chat attachments ...). Every text / varchar / json /
--      jsonb / text[] column in the public schema is scanned, so a column
--      nobody remembered is not missed.
--   2. CODE — database functions that call an Edge Function by URL (the pg_net
--      notification triggers, the AI auto-reply trigger). Each function whose
--      body mentions the old ref is recreated with the new one.
--
-- Safe to run twice: the second run finds nothing to change.
-- =============================================================================

\set ON_ERROR_STOP on

select set_config('migrate.old_ref', :'old_ref', false),
       set_config('migrate.new_ref', :'new_ref', false);

do $$
declare
  old_ref text := current_setting('migrate.old_ref');
  new_ref text := current_setting('migrate.new_ref');
  col record;
  fn record;
  changed bigint;
  total bigint := 0;
begin
  if old_ref = new_ref or length(old_ref) < 10 or length(new_ref) < 10 then
    raise exception 'Bad refs: old=% new=%', old_ref, new_ref;
  end if;

  -- 1. DATA ------------------------------------------------------------------
  for col in
    select c.table_name, c.column_name, c.data_type, c.udt_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and (c.data_type in ('text', 'character varying', 'json', 'jsonb')
           or (c.data_type = 'ARRAY' and c.udt_name in ('_text', '_varchar')))
  loop
    execute format(
      'update public.%I set %I = replace(%I::text, $1, $2)::%s where %I::text like $3',
      col.table_name, col.column_name, col.column_name,
      case
        when col.data_type = 'ARRAY' then col.udt_name::regtype::text
        when col.data_type = 'character varying' then 'text'
        else col.data_type
      end,
      col.column_name
    ) using old_ref, new_ref, '%' || old_ref || '%';
    get diagnostics changed = row_count;
    if changed > 0 then
      raise notice 'data: %.% — % rows', col.table_name, col.column_name, changed;
      total := total + changed;
    end if;
  end loop;
  raise notice 'data: % rows rewritten in total', total;

  -- 2. CODE ------------------------------------------------------------------
  for fn in
    select p.oid, n.nspname, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.prosrc like '%' || old_ref || '%'
  loop
    execute replace(pg_get_functiondef(fn.oid), old_ref, new_ref);
    raise notice 'code: recreated %.%', fn.nspname, fn.proname;
  end loop;
end
$$;

-- Verify: both should be empty.
select 'function still has old ref' as problem, proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosrc like '%' || :'old_ref' || '%';
