import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { safeCallFunction } from './safeCallFunction';
import { User } from '../types';
import { GOOGLE_AUTH, EMAIL_VERIFY_REDIRECT_URL } from '../constants/config';

export class AuthService {
  static async signIn(email: string, password: string): Promise<User> {
    try {
      await AsyncStorage.multiRemove(['user_data', '@asankary_user_profile']);

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('No user returned from Supabase');

      // Fetch user profile from public.users
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (userError && userError.code !== 'PGRST116') {
        throw userError;
      }

      let profile: User;

      if (!userData) {
        // Create profile if missing
        profile = {
          uid: authData.user.id,
          name: authData.user.user_metadata?.full_name || 'User',
          email: authData.user.email || '',
          phone: authData.user.phone || '',
          addresses: [],
          language: 'en',
          createdAt: new Date().toISOString() as any,
          updatedAt: new Date().toISOString() as any,
        };

        await supabase.from('users').insert({
          id: profile.uid,
          name: profile.name,
          // null, not '': users.email and users.phone are UNIQUE, and every
          // empty string collides with every other empty string.
          email: profile.email || null,
          phone: profile.phone || null,
          language: profile.language,
        });
      } else {
        profile = {
          uid: userData.id,
          name: userData.name,
          fullName: userData.full_name,
          email: userData.email,
          phone: userData.phone,
          profileImageUrl: userData.profile_image_url,
          coverUrl: userData.cover_url,
          address: userData.address,
          city: userData.city,
          region: userData.region,
          gender: userData.gender,
          preferredCurrency: userData.preferred_currency,
          language: userData.language,
          role: userData.role,
          isAdmin: userData.is_admin,
          isPartner: userData.is_partner,
          isBlocked: userData.is_blocked,
          addresses: userData.addresses || [],
          createdAt: userData.created_at,
          updatedAt: userData.updated_at,
        };
      }

      await AsyncStorage.setItem('user_data', JSON.stringify(profile));
      return profile;
    } catch (error: any) {
      throw new Error(error.message || 'Error signing in');
    }
  }

  /**
   * Email/phone password sign-in with LAZY credential migration.
   * Existing users' real passwords live in Firebase (imported into Supabase Auth
   * with a dummy password). The `login` Edge Function verifies the password
   * against Firebase, copies it into Supabase Auth, and returns the credential to
   * use here. After the first login the user is fully native to Supabase.
   * `identifier` = email or phone.
   */
  static async signInWithIdentifier(identifier: string, password: string): Promise<User> {
    // 1) Try a NATIVE Supabase sign-in first. The password lives in Supabase for
    //    accounts created in the new app, for users already migrated by the
    //    bridge on a previous login, and after a phone password reset. The old
    //    code went straight to the Firebase bridge below, so all of those cases
    //    failed with "incorrect password" even when the password was correct.
    let nativeEmail: string | null = identifier.includes('@') ? identifier : null;
    if (!nativeEmail) {
      const digits = identifier.replace(/[^\d]/g, '');
      // Resolve phone -> email via a SECURITY DEFINER RPC. A direct SELECT on
      // users returns 0 rows pre-auth under the locked-down RLS, which made
      // phone+password login fail with "incorrect password".
      const { data } = await supabase.rpc('lookup_login_email', { p_phone: `+${digits}` });
      nativeEmail = (typeof data === 'string' ? data : null) || null;
    }
    if (nativeEmail) {
      try {
        return await this.signIn(nativeEmail, password);
      } catch {
        // Not a native Supabase credential yet — fall back to the bridge below.
      }
    } else {
      // Phone account with NO email: OTP-created accounts set their password via
      // updateUser (phone, no email), so lookup_login_email returns nothing and the
      // email path above never runs. Try the native phone credential directly before
      // the Firebase bridge — this is what made phone+password re-login fail.
      const digits = identifier.replace(/[^\d]/g, '');
      try {
        const { data: authData, error } = await supabase.auth.signInWithPassword({ phone: `+${digits}`, password });
        if (!error && authData?.user) {
          const fresh = await this.getCurrentUserFresh();
          if (fresh) return fresh;
        }
      } catch {
        // fall through to the bridge
      }
    }

    // 2) Firebase lazy-migration bridge: verifies the password against Firebase
    //    Auth for legacy users not yet migrated, then copies it into Supabase.
    const res: any = await safeCallFunction('login', { identifier, password });
    const result = res?.data;
    if (!result?.success) {
      throw new Error(result?.error || 'Incorrect password');
    }

    // Prefer email sign-in (synthetic "<digits>@asankaryapp.internal" for phone users).
    if (result.email) {
      return this.signIn(result.email, password);
    }

    // Phone-only fallback.
    await AsyncStorage.multiRemove(['user_data', '@asankary_user_profile']);
    const { error } = await supabase.auth.signInWithPassword({ phone: result.phone, password });
    if (error) throw new Error(error.message || 'Incorrect password');
    const user = await this.getCurrentUserFresh();
    if (!user) throw new Error('Could not load profile');
    return user;
  }

  static async signUp(
    email: string,
    password: string,
    userData: { name: string; phone: string; language?: 'en' | 'ar' | 'ku' }
  ): Promise<User> {
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Read by the on_auth_user_created trigger to populate public.users.
          // The trigger is what actually creates the row when "Confirm email"
          // is on, because signUp returns no session in that case.
          data: {
            full_name: userData.name,
            name: userData.name,
            // Omit rather than send '' — users.phone is UNIQUE, and an empty
            // string is a real value to that index, so the second phone-less
            // signup collided with the first.
            ...(userData.phone ? { phone: userData.phone } : {}),
            language: userData.language || 'en',
          },
          // Without this, Supabase falls back to the project's Site URL, which
          // shipped as http://localhost:3000 — so confirmation links opened on
          // any device other than the dev machine failed to connect.
          emailRedirectTo: EMAIL_VERIFY_REDIRECT_URL,
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Failed to create account');

      await AsyncStorage.multiRemove([
        'user_data',
        'cart',
        'recent_searches',
        '@asankary_user_profile',
        '@user_theme',
        '@user_language',
      ]);

      const profile: User = {
        uid: authData.user.id,
        name: userData.name,
        email: authData.user.email || '',
        phone: userData.phone,
        addresses: [],
        language: userData.language || 'en',
        createdAt: new Date().toISOString() as any,
        updatedAt: new Date().toISOString() as any,
      };

      // Best-effort. With "Confirm email" on there is no session here, so RLS
      // (users_self_insert: id = auth.uid()) rejects this and the row is created
      // by the on_auth_user_created trigger instead. Log rather than throw — the
      // account itself was created successfully. This used to fail silently,
      // which is how accounts ended up with no profile row and rendered as Guest.
      const { error: profileError } = await supabase.from('users').upsert({
        id: profile.uid,
        name: profile.name,
        full_name: profile.name,
        // null, not '' — both columns are UNIQUE and '' is not exempt the way
        // NULL is, so two phone-less accounts would collide.
        email: profile.email || null,
        phone: profile.phone || null,
        language: profile.language,
      });
      if (profileError) {
        console.log('users upsert skipped (expected pre-confirmation):', profileError.message);
      }

      await AsyncStorage.setItem('user_data', JSON.stringify(profile));
      return profile;
    } catch (error: any) {
      throw new Error(error.message || 'Error signing up');
    }
  }

  static async signOut(): Promise<void> {
    try {
      await supabase.auth.signOut();
    } catch (error: any) {
      throw new Error(error.message);
    } finally {
      // Always purge local data even if the network sign-out failed (offline logout,
      // token already invalid). Sequencing this in `finally` guarantees a stale profile
      // or the previous user's cart can never survive on-device / on a shared device.
      await AsyncStorage.multiRemove([
        'user_data',
        'cart',
        'recent_searches',
        '@asankary_user_profile',
        '@user_theme',
        '@user_language',
      ]);
    }
  }

  static async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    try {
      // Re-authenticate with the CURRENT password before changing it. Supabase's
      // updateUser() alone does NOT verify the old password, so without this an
      // already-unlocked session could reset the password without knowing it.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      if (user.email) {
        const { error: verifyErr } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
        });
        if (verifyErr) throw new Error('Current password is incorrect');
      } else if (user.phone) {
        // Phone-only account (no email): verify against the phone credential.
        const phone = user.phone.startsWith('+') ? user.phone : `+${user.phone}`;
        const { error: verifyErr } = await supabase.auth.signInWithPassword({
          phone,
          password: currentPassword,
        });
        if (verifyErr) throw new Error('Current password is incorrect');
      } else {
        throw new Error('Cannot verify current password');
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  static async resetPassword(email: string): Promise<void> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  static async updateUserProfile(
    userId: string,
    updates: Partial<User>
  ): Promise<void> {
    try {
      const dbUpdates: any = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.fullName !== undefined) dbUpdates.full_name = updates.fullName;
      if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
      if (updates.profileImageUrl !== undefined) dbUpdates.profile_image_url = updates.profileImageUrl;
      if (updates.coverUrl !== undefined) dbUpdates.cover_url = updates.coverUrl;
      if (updates.address !== undefined) dbUpdates.address = updates.address;
      if (updates.city !== undefined) dbUpdates.city = updates.city;
      if (updates.region !== undefined) dbUpdates.region = updates.region;
      if (updates.gender !== undefined) dbUpdates.gender = updates.gender;
      if (updates.language !== undefined) dbUpdates.language = updates.language;
      if (updates.preferredCurrency !== undefined) dbUpdates.preferred_currency = updates.preferredCurrency;

      const { error } = await supabase
        .from('users')
        .update(dbUpdates)
        .eq('id', userId);

      if (error) throw error;

      const cachedData = await AsyncStorage.getItem('user_data');
      if (cachedData) {
        const userData = JSON.parse(cachedData);
        const updatedData = { ...userData, ...updates };
        await AsyncStorage.setItem('user_data', JSON.stringify(updatedData));
      }
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  static async getCurrentUser(): Promise<User | null> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      const cachedData = await AsyncStorage.getItem('user_data');
      if (cachedData) {
        return JSON.parse(cachedData) as User;
      }

      return await this.getCurrentUserFresh();
    } catch (error) {
      return null;
    }
  }

  static async getCurrentUserFresh(): Promise<User | null> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      let { data: userData, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single();

      // A genuine "no rows" (PGRST116) means the profile doesn't exist yet (brand-new signup) or
      // was deleted — return null so the caller (e.g. OTP register) creates it. Do NOT refresh/
      // retry (a missing row won't appear) and do NOT fall back to a stale cached profile.
      if (error && (error as any).code === 'PGRST116') return null;

      // Any OTHER failure is likely a token/network hiccup, not a missing row. Refresh once and
      // retry, so the user gets their live profile AND the client holds a valid token afterwards.
      if (error || !userData) {
        try {
          const { data: refreshed } = await supabase.auth.refreshSession();
          if (refreshed?.session) {
            const retry = await supabase.from('users').select('*').eq('id', refreshed.session.user.id).single();
            if (retry.error && (retry.error as any).code === 'PGRST116') return null;
            userData = retry.data; error = retry.error;
          }
        } catch { /* refresh failed — fall through to the cached profile */ }
      }

      if (error || !userData) {
        // Couldn't load the profile (refresh failed / network blip). Returning null would kick a
        // logged-in user to the login screen on every reopen ("it doesn't save my account"). Fall
        // back to the last cached profile — but ONLY if a session still exists, so a genuinely
        // signed-out user (session cleared by a failed refresh) is NOT shown via stale cache.
        try {
          const { data: still } = await supabase.auth.getSession();
          if (still.session) {
            const cached = await AsyncStorage.getItem('user_data');
            if (cached) return JSON.parse(cached) as User;
          }
        } catch { /* no usable cache / no session */ }
        return null;
      }

      const profile: User = {
        uid: userData.id,
        name: userData.name,
        fullName: userData.full_name,
        email: userData.email,
        phone: userData.phone,
        profileImageUrl: userData.profile_image_url,
        coverUrl: userData.cover_url,
        address: userData.address,
        city: userData.city,
        region: userData.region,
        gender: userData.gender,
        preferredCurrency: userData.preferred_currency,
        language: userData.language,
        role: userData.role,
        isAdmin: userData.is_admin,
        isPartner: userData.is_partner,
        isBlocked: userData.is_blocked,
        // Reflect the REAL confirmation status from Supabase Auth, not a stale
        // public.users flag — otherwise the "Verify your email" banner shows even
        // for already-confirmed accounts (Supabase auto-confirms on sign-up).
        emailVerified: !!session.user.email_confirmed_at,
        phoneVerified: (userData.phone_verified ?? false) || !!(session.user as any)?.phone_confirmed_at,
        addresses: userData.addresses || [],
        createdAt: userData.created_at,
        updatedAt: userData.updated_at,
      };

      await AsyncStorage.setItem('user_data', JSON.stringify(profile));
      return profile;
    } catch (error) {
      // Same defensive fallback on any thrown error: only keep the user in if a session still
      // exists (so a genuinely signed-out user is NOT shown as logged in via a stale cache).
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          const cached = await AsyncStorage.getItem('user_data');
          if (cached) return JSON.parse(cached) as User;
        }
      } catch { /* fall through to logged-out */ }
      return null;
    }
  }

  static onAuthStateChanged(callback: (user: any | null) => void) {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // Map to Firebase-like user object for compatibility
      callback(session ? { ...session.user, uid: session.user.id } : null);
    });
    return () => data.subscription.unsubscribe();
  }

  static async sendPhoneVerification(phoneNumber: string): Promise<any> {
    try {
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+964${phoneNumber.replace(/^0/, '')}`;
      
      const { error } = await supabase.auth.signInWithOtp({
        phone: formattedPhone,
      });

      if (error) throw error;

      // Return a mock confirmationResult to maintain compatibility with existing UI
      return {
        phone: formattedPhone,
        confirm: async (code: string) => {
          return await this.verifyPhoneCode(formattedPhone, code);
        }
      };
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  static async verifyPhoneCode(phoneOrConfirmationResult: any, code: string): Promise<User> {
    try {
      let formattedPhone = phoneOrConfirmationResult;
      
      // If passing the mock confirmationResult object
      if (typeof phoneOrConfirmationResult === 'object' && phoneOrConfirmationResult.phone) {
        formattedPhone = phoneOrConfirmationResult.phone;
      }

      const { data: authData, error } = await supabase.auth.verifyOtp({
        phone: formattedPhone,
        token: code,
        type: 'sms',
      });

      if (error) throw error;
      if (!authData.user) throw new Error('Failed to verify code.');

      let profile = await this.getCurrentUserFresh();

      if (!profile) {
        profile = {
          uid: authData.user.id,
          name: authData.user.user_metadata?.full_name || 'Phone User',
          email: authData.user.email || '',
          phone: authData.user.phone || formattedPhone,
          addresses: [],
          language: 'en',
          createdAt: new Date().toISOString() as any,
          updatedAt: new Date().toISOString() as any,
        };

        await supabase.from('users').upsert({
          id: profile.uid,
          name: profile.name,
          phone: profile.phone,
        });
        
        await AsyncStorage.setItem('user_data', JSON.stringify(profile));
      }

      return profile;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  static async signInWithGoogle(): Promise<User> {
    try {
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      const webClientId = GOOGLE_AUTH.WEB_CLIENT_ID;
      
      GoogleSignin.configure({ webClientId, offlineAccess: true });
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken || userInfo.idToken;
      
      if (!idToken) throw new Error('Failed to get ID token from Google');

      const { data: authData, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });

      if (error) throw error;
      if (!authData.user) throw new Error('Failed to sign in with Google');

      let profile = await this.getCurrentUserFresh();

      if (!profile) {
        profile = {
          uid: authData.user.id,
          name: authData.user.user_metadata?.full_name || userInfo.data?.user?.name || 'User',
          email: authData.user.email || userInfo.data?.user?.email || '',
          phone: authData.user.phone || '',
          addresses: [],
          language: 'en',
          profileImageUrl: authData.user.user_metadata?.avatar_url || userInfo.data?.user?.photo || undefined,
          createdAt: new Date().toISOString() as any,
          updatedAt: new Date().toISOString() as any,
        };

        await supabase.from('users').upsert({
          id: profile.uid,
          name: profile.name,
          email: profile.email,
          profile_image_url: profile.profileImageUrl,
        });
        
        await AsyncStorage.setItem('user_data', JSON.stringify(profile));
      }

      return profile;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  static async signInWithApple(): Promise<User> {
    try {
      const { isAvailableAsync, signInAsync, AppleAuthenticationScope } = require('expo-apple-authentication');
      if (!(await isAvailableAsync())) throw new Error('Apple Sign In is not available');

      // requestedScopes must be the numeric enum constants, NOT the strings
      // 'fullName'/'email' (the native side casts them to Int and crashes otherwise).
      const credential = await signInAsync({
        requestedScopes: [AppleAuthenticationScope.FULL_NAME, AppleAuthenticationScope.EMAIL],
      });
      
      const { data: authData, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });

      if (error) throw error;
      if (!authData.user) throw new Error('Failed to sign in with Apple');

      let profile = await this.getCurrentUserFresh();

      if (!profile) {
        const fullName = credential.fullName;
        const displayName = fullName ? `${fullName.givenName || ''} ${fullName.familyName || ''}`.trim() : 'User';
        
        profile = {
          uid: authData.user.id,
          name: displayName,
          email: authData.user.email || credential.email || '',
          phone: authData.user.phone || '',
          addresses: [],
          language: 'en',
          createdAt: new Date().toISOString() as any,
          updatedAt: new Date().toISOString() as any,
        };

        await supabase.from('users').upsert({
          id: profile.uid,
          name: profile.name,
          email: profile.email,
        });
        
        await AsyncStorage.setItem('user_data', JSON.stringify(profile));
      }

      return profile;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  // Address mutations do a read-modify-write on the whole `addresses` JSON array
  // (getCurrentUserFresh -> mutate -> update). Overlapping calls would both read the
  // same snapshot and the second write would clobber the first (classic lost update).
  // Serialize them through a single promise chain so each read happens strictly after
  // the previous write completes — no operation is dropped.
  private static addressMutationQueue: Promise<unknown> = Promise.resolve();

  private static enqueueAddressMutation<T>(task: () => Promise<T>): Promise<T> {
    const run = this.addressMutationQueue.then(task, task);
    // Keep the chain alive even if a mutation rejects, but let the caller still see
    // the rejection via the returned `run`.
    this.addressMutationQueue = run.catch(() => {});
    return run;
  }

  static async addAddress(userId: string, address: any): Promise<void> {
    return this.enqueueAddressMutation(async () => {
      try {
        const profile = await this.getCurrentUserFresh();
        if (profile) {
          const updatedAddresses = [...(profile.addresses || []), address];

          const { error } = await supabase
            .from('users')
            .update({ addresses: updatedAddresses })
            .eq('id', userId);

          if (error) throw error;

          profile.addresses = updatedAddresses;
          await AsyncStorage.setItem('user_data', JSON.stringify(profile));
        }
      } catch (error: any) {
        throw new Error(error.message);
      }
    });
  }

  static async updateAddress(userId: string, addressId: string, updates: any): Promise<void> {
    return this.enqueueAddressMutation(async () => {
      try {
        const profile = await this.getCurrentUserFresh();
        if (profile) {
          const updatedAddresses = (profile.addresses || []).map((addr: any) =>
            addr.id === addressId ? { ...addr, ...updates } : addr
          );

          const { error } = await supabase
            .from('users')
            .update({ addresses: updatedAddresses })
            .eq('id', userId);

          if (error) throw error;

          profile.addresses = updatedAddresses;
          await AsyncStorage.setItem('user_data', JSON.stringify(profile));
        }
      } catch (error: any) {
        throw new Error(error.message);
      }
    });
  }

  static async removeAddress(userId: string, addressId: string): Promise<void> {
    return this.enqueueAddressMutation(async () => {
      try {
        const profile = await this.getCurrentUserFresh();
        if (profile) {
          const updatedAddresses = (profile.addresses || []).filter((addr: any) => addr.id !== addressId);

          const { error } = await supabase
            .from('users')
            .update({ addresses: updatedAddresses })
            .eq('id', userId);

          if (error) throw error;

          profile.addresses = updatedAddresses;
          await AsyncStorage.setItem('user_data', JSON.stringify(profile));
        }
      } catch (error: any) {
        throw new Error(error.message);
      }
    });
  }
}

export default AuthService;
