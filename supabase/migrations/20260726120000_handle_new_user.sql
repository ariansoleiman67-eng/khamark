-- =============================================================================
-- Auto-create public.users when an auth user is created
-- =============================================================================
-- Why this exists
-- ---------------
-- The app created the public.users row client-side, right after auth.signUp()
-- (see AuthService.signUp). That only works when signUp returns a SESSION.
--
-- With "Confirm email" enabled, signUp returns a user but NO session, so
-- auth.uid() is NULL on the follow-up insert and the RLS policy
--   users_self_insert ... with check (id = auth.uid())
-- rejects it. The client never checked that error, so signup looked successful
-- while no profile row existed. On the next sign-in, getCurrentUserFresh()
-- selected from public.users, got PGRST116 (no rows), returned null, and the
-- app fell back to rendering the user as a Guest.
--
-- A SECURITY DEFINER trigger runs as the function owner and bypasses RLS, so
-- the row is created for email signups, phone signups, and OAuth alike —
-- confirmed or not.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
-- Pin search_path: SECURITY DEFINER functions must not resolve unqualified
-- names through a caller-controlled search_path.
set search_path = public, pg_temp
as $$
begin
  insert into public.users (id, name, full_name, email, phone, language)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name',
             new.raw_user_meta_data ->> 'full_name'),
    coalesce(new.raw_user_meta_data ->> 'full_name',
             new.raw_user_meta_data ->> 'name'),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'phone', new.phone),
    coalesce(new.raw_user_meta_data ->> 'language', 'en')
  )
  -- The client still upserts this row once it has a session; whichever runs
  -- second must not error. Never clobber a real value with a null.
  on conflict (id) do update set
    name       = coalesce(excluded.name,       public.users.name),
    full_name  = coalesce(excluded.full_name,  public.users.full_name),
    email      = coalesce(excluded.email,      public.users.email),
    phone      = coalesce(excluded.phone,      public.users.phone),
    language   = coalesce(excluded.language,   public.users.language);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Backfill: users who already signed up and are stuck seeing "Guest" ───────
-- Same shape as the trigger, for auth.users rows with no public.users row.
insert into public.users (id, name, full_name, email, phone, language)
select
  au.id,
  coalesce(au.raw_user_meta_data ->> 'name', au.raw_user_meta_data ->> 'full_name'),
  coalesce(au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'name'),
  au.email,
  coalesce(au.raw_user_meta_data ->> 'phone', au.phone),
  coalesce(au.raw_user_meta_data ->> 'language', 'en')
from auth.users au
left join public.users pu on pu.id = au.id
where pu.id is null
on conflict (id) do nothing;
