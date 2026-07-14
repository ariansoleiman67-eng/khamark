/**
 * Google Sign-In Authentication
 * 
 * Handles Google OAuth2 sign-in using @react-native-google-signin/google-signin
 * and Supabase Authentication (signInWithIdToken).
 *
 * NOTE: This module uses lazy-loading to avoid crashes in Expo Go where the
 * native RNGoogleSignin module is not available.
 */

import { Platform, Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '../supabase';
import { AuthService } from '../authService';
import { User } from '../../types';

// Lets the OAuth browser session close and hand control back to the app.
WebBrowser.maybeCompleteAuthSession();

// Establish a Supabase session from the OAuth redirect URL — handles both the
// PKCE `?code=` shape and the implicit `#access_token=` shape.
const createSessionFromUrl = async (url: string): Promise<void> => {
  const parsed = new URL(url);
  const qp = new URLSearchParams(parsed.search);
  const hp = new URLSearchParams((parsed.hash || '').replace(/^#/, ''));
  const get = (k: string) => qp.get(k) || hp.get(k) || undefined;

  const err = get('error_description') || get('error_code') || get('error');
  if (err) throw new Error(err);

  const code = get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return;
  }
  const access_token = get('access_token');
  const refresh_token = get('refresh_token');
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) throw error;
    return;
  }
  throw new Error('No session returned from Google');
};

const buildProfileFromSession = async (): Promise<User> => {
  const existing = await AuthService.getCurrentUserFresh();
  if (existing) return existing;
  const { data: { user: au } } = await supabase.auth.getUser();
  if (!au) throw new Error('Google Sign-In failed');
  const meta: any = au.user_metadata || {};
  const name = meta.full_name || meta.name || 'User';
  const photo = meta.avatar_url || meta.picture || '';
  await supabase.from('users').upsert({
    id: au.id, name, full_name: name, email: au.email || '', profile_image_url: photo, language: 'en',
  });
  return { uid: au.id, name, fullName: name, email: au.email || '', phone: '', profileImageUrl: photo, language: 'en', addresses: [] } as unknown as User;
};

/**
 * Android Google sign-in via Supabase's browser OAuth flow.
 * Requires NO Android SHA-1 — only a Web client + redirect URL configured in
 * the Supabase dashboard. (The native SDK needs an Android OAuth client whose
 * SHA is currently trapped in a suspended Google Cloud project.)
 */
const signInWithGoogleWeb = async (): Promise<User> => {
  const redirectTo = makeRedirectUri({ scheme: 'haryad', path: 'auth-callback' });
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Could not start Google sign-in');

  // The redirect to our custom `haryad://` scheme can be delivered to the app's
  // own deep-link handler instead of being returned by the auth session (the
  // scheme is a registered intent filter). Capture it via Linking too, so the
  // session URL is never lost — whichever path Android takes.
  let capturedUrl: string | undefined;
  const sub = Linking.addEventListener('url', ({ url }) => {
    if (url && url.includes('auth-callback')) capturedUrl = url;
  });

  try {
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    let callbackUrl =
      result.type === 'success' && result.url ? result.url : capturedUrl;

    // Browser closed without handing back the URL (Android routed the redirect
    // to the app). Give the deep-link event a brief window to arrive.
    if (!callbackUrl) {
      callbackUrl = await new Promise<string | undefined>((resolve) => {
        let waited = 0;
        const iv = setInterval(() => {
          waited += 250;
          if (capturedUrl || waited >= 4000) {
            clearInterval(iv);
            resolve(capturedUrl);
          }
        }, 250);
      });
    }

    if (!callbackUrl) throw new Error('Sign in was cancelled');

    await createSessionFromUrl(callbackUrl);
    return await buildProfileFromSession();
  } finally {
    sub.remove();
  }
};

// Web Client ID from google-services.json (client_type: 3)
const WEB_CLIENT_ID = '677342244115-ssbp46l1hk7oga6q6eu5bhlp26v09pi6.apps.googleusercontent.com';

// Lazy-loaded Google Sign In module
let GoogleSigninModule: typeof import('@react-native-google-signin/google-signin') | null = null;
let isConfigured = false;
let isNativeModuleAvailable: boolean | null = null;

/**
 * Check if Google Sign-In native module is available
 */
export const isGoogleSignInAvailable = (): boolean => {
  if (isNativeModuleAvailable !== null) {
    return isNativeModuleAvailable;
  }
  
  try {
    // Try to require the native module
    const { TurboModuleRegistry } = require('react-native');
    const nativeModule = TurboModuleRegistry.get('RNGoogleSignin');
    isNativeModuleAvailable = nativeModule !== null;
  } catch {
    isNativeModuleAvailable = false;
  }
  
  return isNativeModuleAvailable;
};

/**
 * Lazy-load and configure Google Sign-In
 */
const getGoogleSignin = async () => {
  if (!isGoogleSignInAvailable()) {
    throw new Error('Google Sign-In is not available in this build. Please use a development build or production APK.');
  }
  
  if (!GoogleSigninModule) {
    GoogleSigninModule = await import('@react-native-google-signin/google-signin');
  }
  
  if (!isConfigured) {
    GoogleSigninModule.GoogleSignin.configure({
      webClientId: WEB_CLIENT_ID,
      iosClientId: '677342244115-l2rbot0d1pfd27sl3tphrmn6k1f6gksu.apps.googleusercontent.com',
    });
    isConfigured = true;
  }
  
  return GoogleSigninModule;
};

/**
 * Sign in with Google
 * - Triggers Google Sign-In prompt (native, needs Google Play Services)
 * - Exchanges the Google ID token for a Supabase session (signInWithIdToken)
 * - Creates/updates the user row in Supabase
 */
const signInWithGoogleNative = async (): Promise<User> => {
  try {
    const { GoogleSignin, statusCodes } = await getGoogleSignin();
    
    // Check if Google Play Services are available
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    // Trigger Google Sign-In
    const signInResult = await GoogleSignin.signIn();
    
    // v15+: Handle Credential Manager result types
    const resultType = (signInResult as any).type;
    if (resultType && resultType !== 'success') {
      console.warn('[GoogleAuth] signIn returned type:', resultType);
      if (resultType === 'noSavedCredentialFound') {
        throw new Error('No Google account found on this device. Please add a Google account in your device settings.');
      }
      throw new Error(`Google Sign-In returned unexpected result: ${resultType}`);
    }

    const idToken = signInResult.data?.idToken;

    if (!idToken) {
      console.error('[GoogleAuth] signInResult:', JSON.stringify(signInResult, null, 2));
      throw new Error('Failed to get ID token from Google. Please check your internet connection and try again.');
    }

    // Sign in to Supabase with the Google ID token (matches existing users by email).
    const { data: authData, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });
    if (error) throw error;
    const authUser = authData.user;
    if (!authUser) throw new Error('Google Sign-In failed');

    // Existing profile?
    const { data: existing } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (existing) {
      return {
        uid: existing.id,
        name: existing.name,
        fullName: existing.full_name,
        email: existing.email,
        phone: existing.phone,
        profileImageUrl: existing.profile_image_url,
        language: existing.language || 'en',
        role: existing.role,
        isAdmin: existing.is_admin,
        addresses: [],
      } as unknown as User;
    }

    // New user — create their profile.
    const userName = authUser.user_metadata?.full_name || signInResult.data?.user?.name || '';
    const photo = authUser.user_metadata?.avatar_url || signInResult.data?.user?.photo || '';
    await supabase.from('users').upsert({
      id: authUser.id,
      name: userName,
      full_name: userName,
      email: authUser.email || '',
      profile_image_url: photo,
      language: 'en',
    });

    return {
      uid: authUser.id,
      name: userName,
      fullName: userName,
      email: authUser.email || '',
      phone: '',
      profileImageUrl: photo,
      language: 'en',
      addresses: [],
    } as unknown as User;
  } catch (error: any) {
    // Log the FULL error for debugging
    console.error('[GoogleAuth] Sign-in error:', {
      code: error.code,
      message: error.message,
      fullError: JSON.stringify(error),
    });

    // Handle native module not available
    if (error.message?.includes('not available')) {
      throw error;
    }
    
    // Handle specific error codes from the google-signin library
    try {
      const { statusCodes } = await getGoogleSignin();
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        throw new Error('Sign in was cancelled');
      } else if (error.code === statusCodes.IN_PROGRESS) {
        throw new Error('Sign in is already in progress');
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Google Play Services not available');
      }
    } catch (innerError: any) {
      // Only ignore if this is the statusCodes lookup failing,
      // NOT if it's a re-thrown error from above
      if (innerError.message === 'Sign in was cancelled' ||
          innerError.message === 'Sign in is already in progress' ||
          innerError.message === 'Google Play Services not available') {
        throw innerError;
      }
    }

    // Raw Android error codes that don't have a friendly statusCodes constant.
    const codeStr = String(error?.code ?? '');
    const msgStr = String(error?.message ?? '');

    // 10 = DEVELOPER_ERROR → OAuth client / SHA-1 mismatch (a real config bug).
    if (codeStr === '10' || msgStr.includes('DEVELOPER_ERROR')) {
      throw new Error(
        'Google Sign-In is misconfigured (DEVELOPER_ERROR). The app\'s signing SHA-1 or OAuth client doesn\'t match google-services.json.'
      );
    }

    // 12500 = SIGN_IN_FAILED ("A non-recoverable sign in failure occurred").
    // With a verified-correct OAuth config this almost always means the *device*
    // is the problem: an emulator that isn't Google-certified (e.g. Genymotion)
    // or has outdated/missing Google Play Services. Google blocks sign-in there.
    if (codeStr === '12500' || msgStr.includes('non-recoverable')) {
      throw new Error(
        'Google Sign-In couldn\'t complete on this device. This usually means the emulator isn\'t Google-certified or Play Services is outdated — try on a real Android device, or an Android Studio image that includes the Play Store.'
      );
    }

    throw new Error(error.message || 'Google Sign-In failed');
  }
};

/**
 * Sign in with Google.
 * - Android: tries the NATIVE one-tap flow first; only if the native flow can't
 *   run (e.g. SHA-1 not yet registered, or a non-Google-certified emulator) does
 *   it fall back to the browser OAuth flow. User cancellations are NOT retried.
 * - iOS: always native.
 */
export const signInWithGoogle = async (): Promise<User> => {
  // Native first on every platform. On iOS the Google id_token carries a nonce
  // that the classic GoogleSignin.signIn() API can't surface, so Supabase must
  // have "Skip Nonce Check" enabled for the Google provider (Authentication →
  // Providers → Google) — then native sign-in works. The browser OAuth flow is
  // kept only as a fallback for genuine native config failures (e.g. Android
  // DEVELOPER_ERROR / module unavailable), never for the normal iOS flow.
  try {
    return await signInWithGoogleNative();
  } catch (error: any) {
    const code = String(error?.code ?? '');
    const msg = String(error?.message ?? '');
    const configProblem =
      code === '10' || msg.includes('DEVELOPER_ERROR') || msg.includes('misconfigured') ||
      code === '12500' || msg.includes('non-recoverable') || msg.includes("couldn't complete on this device") ||
      msg.includes('not available');
    if (configProblem) {
      console.warn('[GoogleAuth] native flow unavailable — falling back to web OAuth:', msg);
      return signInWithGoogleWeb();
    }
    throw error; // nonce/cancelled/network errors propagate as-is
  }
};

/**
 * Sign out from Google
 */
export const signOutGoogle = async (): Promise<void> => {
  try {
    if (!isGoogleSignInAvailable()) return;
    
    const { GoogleSignin } = await getGoogleSignin();
    await GoogleSignin.signOut();
  } catch {
    // Ignore errors during sign out
  }
};

/**
 * Get current Google user info (if signed in)
 */
export const getCurrentGoogleUser = async () => {
  try {
    if (!isGoogleSignInAvailable()) return null;
    
    const { GoogleSignin } = await getGoogleSignin();
    const currentUser = await GoogleSignin.getCurrentUser();
    return currentUser?.user || null;
  } catch {
    return null;
  }
};
