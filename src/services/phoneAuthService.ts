import { supabase } from './supabase';

export function normalizePhoneToE164(raw: string): string {
  const trimmed = (raw || '').trim();
  const compact = trimmed.replace(/\s+/g, '').replace(/-/g, '');

  if (compact.startsWith('+')) return compact;
  if (compact.startsWith('00964')) return `+${compact.slice(2)}`;
  if (compact.startsWith('964')) return `+${compact}`;

  const digits = compact.replace(/\D/g, '');
  const local = digits.startsWith('0') ? digits.slice(1) : digits;
  return `+964${local}`;
}

export const PhoneAuthService = {
  normalizePhoneToE164,

  checkPhoneExists: async (phoneNumber: string): Promise<string | null> => {
    try {
      const phoneE164 = normalizePhoneToE164(phoneNumber);
      // Resolve via a SECURITY DEFINER RPC: the locked-down RLS blocks a direct
      // pre-auth read of `users` (which made sign-in say "Account Not Found"),
      // and this also matches phone-derived login emails (e.g. the admin, whose
      // users.phone is null but whose email is {digits}@khamark.admin).
      const { data, error } = await supabase.rpc('account_id_for_phone', { p_phone: phoneE164 });
      if (error || !data) return null;
      return data as string;
    } catch (error) {
      console.error('Error checking phone existence:', error);
      return null;
    }
  },

  linkPhoneToUser: async (uid: string, phoneNumber: string): Promise<void> => {
    try {
      const phoneE164 = normalizePhoneToE164(phoneNumber);

      const { data: session } = await supabase.auth.getSession();
      const sessionUid = session?.session?.user?.id;
      
      if (!sessionUid) {
        throw new Error('Not authenticated. Please sign in again before linking a phone.');
      }
      if (sessionUid !== uid) {
        throw new Error('Security error: session user does not match target uid.');
      }

      const existingUid = await PhoneAuthService.checkPhoneExists(phoneE164);
      if (existingUid && existingUid !== uid) {
        throw new Error('This phone number is already linked to another account.');
      }

      // Update auth user phone (sends OTP if confirm phone change is enabled in Supabase)
      // or we just update the user profile if it's already verified
      const { error: updateError } = await supabase.from('users').update({ phone: phoneE164 }).eq('id', uid);
      if (updateError) throw updateError;
      
      console.log(`Phone ${phoneE164} successfully linked to user ${uid}`);
    } catch (error) {
      console.error('Error linking phone to user:', error);
      throw error;
    }
  },

  validateSession: async (sessionUid: string, phoneNumber: string): Promise<boolean> => {
    const phoneE164 = normalizePhoneToE164(phoneNumber);
    const linkedUid = await PhoneAuthService.checkPhoneExists(phoneE164);
    if (!linkedUid) return false;
    return linkedUid === sessionUid;
  },

  verifyMapping: async (uid: string, phoneNumber: string): Promise<boolean> => {
    return PhoneAuthService.validateSession(uid, phoneNumber);
  },
};
