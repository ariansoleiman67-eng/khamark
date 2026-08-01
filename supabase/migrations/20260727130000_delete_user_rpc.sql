-- =============================================================================
-- public.delete_user() — in-app account deletion (App Store Guideline 5.1.1(v))
-- =============================================================================
-- Symptom
-- -------
--   Could not find the function public.delete_user without parameters
--   in the schema cache
-- AuthContext.deleteAccount has always called supabase.rpc('delete_user'), but
-- the function was never created, so Delete Account has never worked. App Review
-- tests account deletion directly, so this blocks submission.
--
-- Why SECURITY DEFINER
-- --------------------
-- Removing the login itself means deleting from auth.users, which a client JWT
-- cannot do. Deleting only public.users would leave the auth identity orphaned:
-- the profile row disappears but the credentials still work, so the person can
-- "log in" to an account that no longer exists. public.users.id references
-- auth.users(id) on delete cascade, so removing the auth row takes the profile
-- and every cascading row (orders, addresses, conversations, favourites) with it.
--
-- Scope is the caller and only the caller: the id comes from auth.uid(), never
-- from an argument, so this cannot be aimed at another account.
--
-- Store owners are refused
-- ------------------------
-- Across the schema tenant_id references users(id) on delete cascade, and for a
-- store owner tenant_id IS their own user id. Deleting an owner would therefore
-- erase the entire shop — every product, order, banner and conversation, for all
-- of that store's customers — from one tap in a profile screen. tenants.owner_id
-- also has no on-delete action, so the statement would fail with a raw foreign
-- key error partway through anyway. Owners get a clear message instead; their
-- deletion is a support process, not a self-service button.
-- =============================================================================

create or replace function public.delete_user()
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Not authenticated'
      using errcode = '28000';
  end if;

  if exists (select 1 from public.tenants where owner_id = caller) then
    raise exception 'Store owner accounts cannot be deleted from the app. Please contact support.'
      using errcode = 'P0001';
  end if;

  -- Cascades to public.users and every table keyed on it.
  delete from auth.users where id = caller;
end;
$$;

-- Callable only by a signed-in user. anon has no account to delete, and leaving
-- it granted would let an unauthenticated caller probe the function.
revoke all on function public.delete_user() from public, anon;
grant execute on function public.delete_user() to authenticated;
