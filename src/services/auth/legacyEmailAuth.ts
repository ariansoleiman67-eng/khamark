import { AuthService } from '../authService';
import { supabase } from '../supabase';
import { isSyntheticEmail } from '../../utils/hashUtils';
import { User } from '../../types';

/**
 * Email + Password Authentication (Supabase)
 *
 * Thin wrappers over AuthService so screens keep a stable import surface.
 */

export const isEmailRegistered = async (email: string): Promise<boolean> => {
  try {
    // SECURITY DEFINER RPC — locked-down RLS blocks a direct pre-auth users read.
    const { data } = await supabase.rpc('email_exists', { p_email: email.trim() });
    return !!data;
  } catch {
    return false;
  }
};

export const loginWithEmail = async (
  email: string,
  password: string
): Promise<User> => {
  // Supabase Auth with lazy credential migration (verifies vs Firebase on first login).
  return AuthService.signInWithIdentifier(email, password);
};

export const sendPasswordResetEmail = async (email: string): Promise<void> => {
  // Supabase sends the reset link from the project's configured SMTP.
  await AuthService.resetPassword(email);
};

export const isLegacyAccount = (email: string): boolean => {
  return !isSyntheticEmail(email);
};

export const registerWithEmail = async (
  email: string,
  password: string,
  name: string
): Promise<User> => {
  const cleanEmail = email.trim();

  // If the email was just verified via Supabase OTP, a session already exists
  // for this exact email — finish that account (set password + profile) instead
  // of creating a duplicate. Mirrors registerWithPhone's session-aware path.
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user && (session.user.email || '').toLowerCase() === cleanEmail.toLowerCase()) {
    const { error: upErr } = await supabase.auth.updateUser({ password, data: { full_name: name } });
    if (upErr && !/different from the old|should be different/i.test(upErr.message)) throw upErr;
    await supabase.from('users').upsert({
      id: session.user.id,
      name,
      full_name: name,
      email: cleanEmail,
      language: 'en',
    });
    const fresh = await AuthService.getCurrentUserFresh();
    if (fresh) return fresh;
    return {
      uid: session.user.id, name, fullName: name, email: cleanEmail,
      phone: '', language: 'en', addresses: [], role: 'customer', isAdmin: false,
    } as unknown as User;
  }

  // No verified session → plain Supabase email+password signup.
  return AuthService.signUp(cleanEmail, password, { name, phone: '' });
};
