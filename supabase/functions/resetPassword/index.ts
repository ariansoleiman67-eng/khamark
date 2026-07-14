// =============================================================================
// Supabase Edge Function: resetPassword  (FORGOT-PASSWORD VIA PHONE OTP)
// =============================================================================
// The forgot-password-by-phone flow has NO Supabase session (the user forgot
// their password). Phone ownership is proven by a Firebase SMS-OTP session
// created client-side in VerifyPhoneScreen (SMS stays on Firebase). This
// function verifies that proof server-side, then writes the new password into
// Supabase Auth with the service role.
//
// Security: the client passes the Firebase ID token from the just-completed
// SMS OTP. We verify it against Firebase (accounts:lookup) and require that the
// token's phone_number matches the phone being reset. No token / mismatch →
// rejected, so nobody can reset an arbitrary account's password.
//
// SETUP:
//   supabase secrets set FIREBASE_WEB_API_KEY="AIza..."   # same key as `login`
//   supabase functions deploy resetPassword --no-verify-jwt
//
// Request body (via safeCallFunction): { data: { phone, newPassword, idToken } }
// Response: { success: boolean, error?: string }
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FIREBASE_LOOKUP_URL =
  'https://identitytoolkit.googleapis.com/v1/accounts:lookup';

function digitsOnly(s: string): string {
  return (s || '').replace(/[^\d]/g, '');
}

/** Verify the Firebase ID token and return the phone number it proves ownership of. */
async function phoneFromFirebaseToken(idToken: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(`${FIREBASE_LOOKUP_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.users?.[0]?.phoneNumber ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });

  try {
    const apiKey = Deno.env.get('FIREBASE_WEB_API_KEY');
    if (!apiKey) return json({ success: false, error: 'Auth bridge not configured' });

    const body = await req.json().catch(() => ({}));
    const { phone, newPassword, idToken } = body?.data ?? body ?? {};
    if (!phone || !newPassword) return json({ success: false, error: 'phone and newPassword required' });
    if (String(newPassword).length < 8) return json({ success: false, error: 'Password too short' });
    if (!idToken) return json({ success: false, error: 'Phone verification required' });

    // 1. Verify phone ownership via the Firebase SMS-OTP token.
    const provenPhone = await phoneFromFirebaseToken(idToken, apiKey);
    if (!provenPhone || digitsOnly(provenPhone) !== digitsOnly(phone)) {
      return json({ success: false, error: 'Phone verification failed' });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 2. Resolve the Supabase user from the proven phone.
    const { data: userRow } = await supabase
      .from('users')
      .select('id')
      .eq('phone', `+${digitsOnly(phone)}`)
      .maybeSingle();
    if (!userRow) return json({ success: false, error: 'Account not found' });

    // 3. Write the new password.
    const { error: updateErr } = await supabase.auth.admin.updateUserById(userRow.id, {
      password: newPassword,
    });
    if (updateErr) return json({ success: false, error: 'Could not reset password' });

    return json({ success: true });
  } catch (err) {
    return json({ success: false, error: String(err) });
  }
});
