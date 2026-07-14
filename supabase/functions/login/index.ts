// =============================================================================
// Supabase Edge Function: login  (LAZY CREDENTIAL MIGRATION)
// =============================================================================
// Existing users were imported into Supabase Auth with a DUMMY password — their
// real passwords still live in Firebase Auth. This function makes the cutover
// seamless (zero lockout):
//
//   On a password login, it verifies the password against Firebase Auth (REST).
//   If valid, it copies that password into Supabase Auth (admin.updateUserById)
//   and tells the client which credential to use. The client then does a normal
//   supabase.auth.signInWithPassword(). After the first login, the user is fully
//   on Supabase; Firebase can be retired once logins have drained over.
//
// Phone users have synthetic emails ("<digits>@haryadapp.internal" from
// phoneToEmail, or "<firebase_uid>@haryadapp.internal"). We try all candidates.
//
// SETUP:
//   supabase secrets set FIREBASE_WEB_API_KEY="AIza..."   # Firebase console → Project settings → Web API Key
//   supabase functions deploy login --no-verify-jwt
//
// Request body (via safeCallFunction): { data: { identifier: string, password: string } }
//   identifier = email OR phone (E.164 or local digits)
// Response: { success: boolean, email?: string|null, phone?: string|null, error?: string }
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FIREBASE_VERIFY_URL =
  'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword';

function digitsOnly(s: string): string {
  return (s || '').replace(/[^\d]/g, '');
}

async function verifyAgainstFirebase(email: string, password: string, apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${FIREBASE_VERIFY_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    return res.ok; // 200 → credentials valid
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });

  try {
    const apiKey = Deno.env.get('FIREBASE_WEB_API_KEY');
    if (!apiKey) return json({ success: false, error: 'Auth bridge not configured' });

    const body = await req.json().catch(() => ({}));
    const { identifier, password } = body?.data ?? body ?? {};
    if (!identifier || !password) return json({ success: false, error: 'identifier and password required' });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Resolve the Supabase user from the identifier (email or phone).
    const isEmail = String(identifier).includes('@');
    let query = supabase.from('users').select('id, email, phone');
    if (isEmail) {
      query = query.eq('email', identifier);
    } else {
      // phone — match on normalized digits (stored as +<digits>)
      query = query.eq('phone', `+${digitsOnly(identifier)}`);
    }
    const { data: userRow } = await query.maybeSingle();
    if (!userRow) return json({ success: false, error: 'Account not found' });

    // 2. Pull the auth user to learn its email/phone + firebase_uid metadata.
    const { data: authData } = await supabase.auth.admin.getUserById(userRow.id);
    const authUser = authData?.user;
    const firebaseUid = (authUser?.user_metadata as any)?.firebase_uid;

    // 3. Build Firebase email candidates and verify the password against Firebase.
    const candidates = new Set<string>();
    if (isEmail) candidates.add(String(identifier));
    if (userRow.email) candidates.add(userRow.email);
    if (authUser?.email) candidates.add(authUser.email);
    const phoneDigits = digitsOnly(userRow.phone || (isEmail ? '' : identifier));
    if (phoneDigits) candidates.add(`${phoneDigits}@haryadapp.internal`);
    if (firebaseUid) candidates.add(`${firebaseUid}@haryadapp.internal`);

    let verified = false;
    for (const email of candidates) {
      if (await verifyAgainstFirebase(email, password, apiKey)) {
        verified = true;
        break;
      }
    }

    if (!verified) return json({ success: false, error: 'Incorrect password' });

    // 4. Sync the verified password into Supabase Auth so future logins are native.
    const { error: updateErr } = await supabase.auth.admin.updateUserById(userRow.id, { password });
    if (updateErr) return json({ success: false, error: 'Could not finalize sign-in' });

    // 5. Tell the client which credential to sign in with.
    return json({
      success: true,
      email: authUser?.email ?? userRow.email ?? null,
      phone: authUser?.phone ? `+${digitsOnly(authUser.phone)}` : (userRow.phone ?? null),
    });
  } catch (err) {
    return json({ success: false, error: String(err) });
  }
});
