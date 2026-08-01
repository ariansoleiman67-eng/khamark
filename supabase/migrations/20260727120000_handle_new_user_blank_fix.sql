-- =============================================================================
-- handle_new_user: never write empty strings into unique columns
-- =============================================================================
-- Symptom
-- -------
--   "Database error saving new user"
-- on the second and every later EMAIL signup. Supabase surfaces any exception
-- raised inside a trigger on auth.users with that generic message.
--
-- Cause
-- -----
-- public.users declares `email text unique` and `phone text unique`. Email
-- registration has no phone number and passed an empty string rather than null,
-- so the first signup stored phone = '' and the next one collided with it:
--   duplicate key value violates unique constraint "users_phone_key"
-- '' is a real value to a unique index; only NULL is exempt from the constraint.
--
-- Fix: nullif() every value that feeds a unique column, so "absent" is stored as
-- NULL. The client no longer sends '' either (AuthService.signUp), but the trigger
-- must not depend on callers behaving — an empty string from any future caller
-- would break signup again.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.users (id, name, full_name, email, phone, language)
  values (
    new.id,
    nullif(coalesce(new.raw_user_meta_data ->> 'name',
                    new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(coalesce(new.raw_user_meta_data ->> 'full_name',
                    new.raw_user_meta_data ->> 'name'), ''),
    nullif(new.email, ''),
    nullif(coalesce(new.raw_user_meta_data ->> 'phone', new.phone), ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'language', ''), 'en')
  )
  on conflict (id) do update set
    name       = coalesce(excluded.name,      public.users.name),
    full_name  = coalesce(excluded.full_name, public.users.full_name),
    email      = coalesce(excluded.email,     public.users.email),
    phone      = coalesce(excluded.phone,     public.users.phone),
    language   = coalesce(excluded.language,  public.users.language);

  return new;
end;
$$;

-- Repair rows already written with '' by the previous version, or the unique
-- index keeps rejecting new signups.
update public.users set phone = null where phone = '';
update public.users set email = null where email = '';
