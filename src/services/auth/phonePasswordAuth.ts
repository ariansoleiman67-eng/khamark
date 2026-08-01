import { getAuth } from '@react-native-firebase/auth';
import i18n from '../../locales';
import { User } from '../../types';
import { formatPhone } from '../../utils/phoneUtils';
import { phoneToEmail } from '../../utils/hashUtils';
import { AuthService } from '../authService';
import { supabase } from '../supabase';
import { safeCallFunction } from '../safeCallFunction';

export interface RegistrationData {
  phone: string;
  password?: string;
  name: string;
  language?: 'en' | 'ar' | 'ku';
  role?: 'customer' | 'admin';
}

export const registerWithPhone = async (data: RegistrationData): Promise<User> => {
  try {
    const formattedPhone = formatPhone(data.phone);

    // Iraqi/OTPIQ path: the phone was verified via Supabase OTP, so a session already
    // exists for this user. Finish by updating that account (optional password +
    // profile) instead of creating a new one. `data.password` omitted = passwordless.
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const updates: any = { data: { full_name: data.name } };
      if (data.password) updates.password = data.password;
      const { error: upErr } = await supabase.auth.updateUser(updates);
      if (upErr && !/different from the old|should be different/i.test(upErr.message)) throw upErr;
      // Deliberately NOT writing role/is_admin: the prevent_privilege_escalation
      // trigger rejects any client-side change to those fields, which aborted this
      // WHOLE upsert — so the admin's name was never saved and they rendered blank
      // everywhere. Admin is granted by the create_admin_account RPC the caller runs
      // right after (SECURITY DEFINER), which is the supported path.
      const { error: profileErr } = await supabase.from('users').upsert({
        id: session.user.id,
        name: data.name,
        full_name: data.name,
        phone: formattedPhone,
        language: data.language || 'en',
      });
      if (profileErr) throw profileErr;
      const fresh = await AuthService.getCurrentUserFresh();
      if (fresh) {
        if (data.role === 'admin') { fresh.role = 'admin'; (fresh as any).isAdmin = true; }
        return fresh;
      }
      return {
        uid: session.user.id, name: data.name, fullName: data.name,
        email: session.user.email || '', phone: formattedPhone, language: data.language || 'en',
        addresses: [], role: data.role || 'customer', isAdmin: data.role === 'admin',
      } as unknown as User;
    }

    // Phone users sign in via a deterministic synthetic email ("<digits>@asankaryapp.internal"),
    // which the login bridge already understands. Create the Supabase account with that.
    const syntheticEmail = phoneToEmail(formattedPhone);
    const password = data.password || `Hy${Math.random().toString(36).slice(2, 12)}!A`;

    const user = await AuthService.signUp(syntheticEmail, password, {
      name: data.name,
      phone: formattedPhone,
      language: data.language,
    });

    if (data.role === 'admin') {
      // Deliberately NOT writing role/is_admin here. The prevent_privilege_escalation
      // trigger (RLS_HARDENING.sql) rejects any client-side change to those fields —
      // auth.uid() is set on this request — so the update threw and took the whole
      // registration down with it.
      //
      // The caller (SetNewPasswordScreen) invokes the create_admin_account RPC right
      // after this, which is SECURITY DEFINER and is the supported way to grant admin.
      // These local flags just keep the returned object consistent for the caller;
      // AuthContext re-reads the real values from the users row on refreshUser().
      user.role = 'admin';
      user.isAdmin = true;
    }

    console.log('✅ User registered:', formattedPhone);
    return user;
  } catch (error: any) {
    console.error('❌ Registration error:', error);
    throw new Error(error.message || 'Registration failed');
  }
};

export const registerWithoutPassword = async (data: Omit<RegistrationData, 'password'>): Promise<User> => {
  return registerWithPhone(data);
};

export const loginWithPhone = async (phone: string, password: string): Promise<User> => {
  // Supabase Auth with lazy credential migration (verifies vs Firebase on first login).
  return AuthService.signInWithIdentifier(formatPhone(phone), password);
};

/**
 * International passwordless code login. Firebase SMS-OTP has just proved phone
 * ownership on the client; exchange that proof (its ID token) for a Supabase
 * session via the `phone-otp-session` Edge Function, then verify the returned
 * magic-link token to establish the session. (Iraqi numbers don't use this —
 * they go through Supabase OTP / OTPIQ directly.)
 */
export const mintSupabaseSessionFromFirebase = async (phone: string): Promise<void> => {
  const formattedPhone = formatPhone(phone);
  const fbUser = getAuth().currentUser;
  const idToken = fbUser ? await fbUser.getIdToken() : null;
  if (!idToken) throw new Error('Verification expired. Please request a new code.');

  const res: any = await safeCallFunction('phone-otp-session', { phone: formattedPhone, idToken });
  const result = res?.data;
  if (!result?.success || !result?.token_hash) {
    throw new Error(result?.error || 'Could not complete sign-in');
  }
  const { error } = await supabase.auth.verifyOtp({ token_hash: result.token_hash, type: 'magiclink' });
  if (error) throw error;
};

/**
 * Reset a forgotten password after the phone has been proven via SMS OTP.
 *
 * The forgot-password flow has NO Supabase session (the user can't log in —
 * they forgot the password), so the password is set server-side by the
 * `resetPassword` Edge Function (service role). Phone ownership is proven by
 * the Firebase SMS-OTP session created moments earlier in VerifyPhoneScreen;
 * we pass its ID token so the Edge Function can verify the phone match before
 * writing the new Supabase password.
 */
export const resetPasswordAfterOTP = async (phone: string, newPassword: string): Promise<void> => {
  const formattedPhone = formatPhone(phone);

  // Iraqi/OTPIQ path: a Supabase session exists from the just-completed OTP, so set the
  // password directly — no Edge Function / Firebase token needed.
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message || 'Failed to reset password');
    return;
  }

  // Proof of phone ownership = the Firebase ID token from the just-completed SMS OTP.
  let idToken: string | undefined;
  try {
    const fbUser = getAuth().currentUser;
    if (fbUser) idToken = await fbUser.getIdToken();
  } catch { /* token optional; Edge Function decides whether to require it */ }

  const res: any = await safeCallFunction('resetPassword', {
    phone: formattedPhone,
    newPassword,
    idToken,
  });
  const result = res?.data;
  if (!result?.success) {
    throw new Error(result?.error || 'Failed to reset password');
  }
};

export const isPhoneRegistered = async (phone: string): Promise<boolean> => {
  // SECURITY DEFINER RPC — locked-down RLS blocks a direct pre-auth users read.
  // A failed lookup must NOT return false: that reads as "not registered" and pushes
  // the caller into signup/OTP for a phone that already HAS an account. Fail closed.
  try {
    const { data, error } = await supabase.rpc('account_id_for_phone', { p_phone: formatPhone(phone) });
    if (error) throw error;
    return !!data;
  } catch {
    throw new Error(i18n.t('auth.accountCheckFailed'));
  }
};
