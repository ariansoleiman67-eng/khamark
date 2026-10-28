-- =============================================================================
-- KHAMARK — Initial Administrator Provisioning Script
-- =============================================================================
-- Safely promotes an existing user account to Khamark Store Owner & Administrator.
--
-- Instructions:
--   1. Create an account first via the app (Register screen) OR via Supabase Studio
--      (Authentication -> Users -> Add User).
--   2. Replace 'ADMIN_EMAIL_OR_PHONE_HERE' below with the admin's email or phone number.
--   3. Run this script in Supabase Studio -> SQL Editor.
-- =============================================================================

do $$
declare
  target_identifier text := 'ariansoleiman33@gmail.com';
  target_user_id    uuid;
  tenant_record_id  uuid;
begin
  -- 1. Find the user in auth.users or public.users
  select id into target_user_id
  from auth.users
  where lower(email) = lower(btrim(target_identifier))
     or phone = target_identifier
     or phone = regexp_replace(target_identifier, '[^0-9]', '', 'g')
  limit 1;

  if target_user_id is null then
    select id into target_user_id
    from public.users
    where lower(email) = lower(btrim(target_identifier))
       or phone = target_identifier
       or phone = regexp_replace(target_identifier, '[^0-9]', '', 'g')
    limit 1;
  end if;

  if target_user_id is null then
    raise exception 'User "%" not found! Please register the user in Authentication first.', target_identifier;
  end if;

  -- 2. Promote user to Admin in public.users
  update public.users
  set role = 'admin',
      is_admin = true,
      updated_at = now()
  where id = target_user_id;

  -- 3. Ensure Tenant record exists for this Owner
  insert into public.tenants (
    id,
    owner_id,
    store_name,
    store_name_ar,
    store_name_ku,
    is_active
  ) values (
    target_user_id,
    target_user_id,
    'Khamark',
    'خامارك',
    'خامارک',
    true
  )
  on conflict (id) do update set
    owner_id = target_user_id,
    store_name = excluded.store_name,
    updated_at = now();

  -- 4. Ensure Tenant Settings row exists
  insert into public.tenant_settings (
    tenant_id,
    setting_key,
    setting_value
  ) values (
    target_user_id,
    'general',
    jsonb_build_object(
      'companyName', 'Khamark',
      'companyNameAr', 'خامارك',
      'companyNameKu', 'خامارک',
      'exchangeRate', 1500
    )
  )
  on conflict do nothing;

  raise notice 'Successfully promoted user % (%) to Khamark Store Owner & Admin!', target_identifier, target_user_id;
end;
$$;
