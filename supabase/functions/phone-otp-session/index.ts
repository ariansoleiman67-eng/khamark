// =============================================================================
// Supabase Edge Function: phone-otp-session
// =============================================================================
// International passwordless code login. Firebase SMS-OTP proves the user owns
// the phone (on the client); this function verifies that proof server-side and
// mints a Supabase session for the matching account — so non-Iraqi users can
// "Sign in with a code" without a password and without OTPIQ.
//
// Flow:
//   client: Firebase signInWithPhoneNumber -> confirm(code)  (proves the phone)
//           -> getIdToken()  -> calls this fn with { phone, idToken }
//   here:   verify idToken via Firebase (accounts:lookup), confirm the phone,
//           find the Supabase user, generateLink(magiclink) -> token_hash
//   client: supabase.auth.verifyOtp({ token_hash, type:'magiclink' }) -> session
//
// SETUP:
//   (FIREBASE_WEB_API_KEY is already set for the `login` function.)
//   supabase functions deploy phone-otp-session --no-verify-jwt
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// Request:  { phone: string, idToken: string }   (or wrapped in { data: {...} })
// Response: { success: boolean, token_hash?: string, error?: string }
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LOOKUP_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup';
const digits = (s: string) => (s || '').replace(/[^\d]/g, '');

Deno.serve(async (req: Request) => {
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });

  try {
    const apiKey = Deno.env.get('FIREBASE_WEB_API_KEY');
    if (!apiKey) return json({ success: false, error: 'Auth bridge not configured' });

    const body = await req.json().catch(() => ({}));
    const { phone, idToken } = (body?.data ?? body ?? {}) as { phone?: string; idToken?: string };
    if (!phone || !idToken) return json({ success: false, error: 'phone and idToken required' });

    // 1) Verify the Firebase ID token + extract the phone it proves.
    const fbRes = await fetch(`${LOOKUP_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!fbRes.ok) return json({ success: false, error: 'Invalid or expired verification' });
    const fbData = await fbRes.json();
    const fbPhone = digits(fbData?.users?.[0]?.phoneNumber || '');
    if (!fbPhone) return json({ success: false, error: 'Verification did not include a phone number' });

    // 2) The proven phone must match the requested one (no impersonation).
    if (fbPhone !== digits(phone)) return json({ success: false, error: 'Phone mismatch' });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 3) Find the Supabase account for this phone and its auth email.
    const { data: userRow } = await supabase
      .from('users').select('id, email').eq('phone', `+${fbPhone}`).maybeSingle();
    if (!userRow) return json({ success: false, error: 'Account not found. Please register first.' });

    const { data: authData } = await supabase.auth.admin.getUserById(userRow.id);
    const email = authData?.user?.email ?? userRow.email;
    if (!email) return json({ success: false, error: 'Account has no email identity' });

    // 4) Mint a one-time magic-link token the client exchanges for a session.
    const { data: link, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (linkErr || !link?.properties?.hashed_token) {
      return json({ success: false, error: 'Could not create session' });
    }

    return json({ success: true, token_hash: link.properties.hashed_token });
  } catch (err) {
    return json({ success: false, error: String(err) });
  }
});
