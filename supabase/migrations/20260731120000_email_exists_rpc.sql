-- =============================================================================
-- public.email_exists(text) — pre-signup "is this email taken?" check
-- =============================================================================
-- Symptom
-- -------
--   "We couldn't check whether this account already exists. Please try again."
-- on EVERY email signup, blocking account creation entirely.
--
-- Cause
-- -----
-- src/services/auth/legacyEmailAuth.ts:19 calls
--     supabase.rpc('email_exists', { p_email })
-- but the function was never created. The call therefore always errors, and
-- isEmailRegistered deliberately fails CLOSED (it throws rather than returning
-- false, because a false would read as "not registered" and let signup proceed
-- on an email that already has an account). Correct behaviour, missing function
-- — so the guard blocked everyone instead of nobody.
--
-- Why SECURITY DEFINER
-- --------------------
-- The check runs pre-authentication, as `anon`. auth.users is not readable by
-- anon under any policy, and public.users is locked down by RLS, so a direct
-- select cannot work from the client.
--
-- Reads auth.users, not public.users: auth.users is the authority on whether a
-- login exists. A row can exist in auth.users while its public.users profile is
-- missing (that was the "Guest" bug), and such an account is still taken.
--
-- PRIVACY NOTE
-- ------------
-- Granting this to anon creates an email-enumeration oracle: anyone can ask
-- whether an address has an account here. That is the accepted cost of telling a
-- real user "you already have an account" before they type a password. It is
-- narrow — it returns only a boolean, never a row — but if you would rather not
-- expose it, the alternative is to drop the pre-check and let signUp reject the
-- duplicate, which gives a worse message at a later step.
-- =============================================================================

create or replace function public.email_exists(p_email text)
returns boolean
language sql
security definer
stable
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
      from auth.users
     where lower(email) = lower(btrim(p_email))
  );
$$;

-- anon is required: the caller has no session yet at signup time.
revoke all on function public.email_exists(text) from public;
grant execute on function public.email_exists(text) to anon, authenticated;

-- Verify: should return false for an address you have never registered.
-- select public.email_exists('definitely-not-registered@example.com');
