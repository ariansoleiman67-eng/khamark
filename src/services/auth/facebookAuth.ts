/**
 * Facebook Login Authentication (Supabase)
 *
 * Uses react-native-fbsdk-next (lazy-loaded to stay Expo-Go safe) to obtain the
 * Facebook access token, then signs into Supabase via signInWithIdToken.
 * NOTE: Facebook login is currently disabled in the UI; kept Supabase-ready.
 */

import { User } from '../../types';
import { supabase } from '../supabase';
import { AuthService } from '../authService';

// Lazy-loaded Facebook Sign In module
let FBSDKModule: typeof import('react-native-fbsdk-next') | null = null;
let isNativeModuleAvailable: boolean | null = null;

/**
 * Check if Facebook Sign-In native module is available.
 */
export const isFacebookSignInAvailable = (): boolean => {
  if (isNativeModuleAvailable !== null) {
    return isNativeModuleAvailable;
  }

  try {
    const { TurboModuleRegistry, NativeModules } = require('react-native');
    const nativeModule = TurboModuleRegistry.get('FBAccessToken') || NativeModules.FBLoginManager;
    isNativeModuleAvailable = nativeModule !== null && nativeModule !== undefined;
  } catch {
    isNativeModuleAvailable = false;
  }

  return isNativeModuleAvailable;
};

/**
 * Lazy-load Facebook SDK.
 */
const getFBSDK = async () => {
  if (!isFacebookSignInAvailable()) {
    throw new Error('Facebook Login is not available in this build. Please use a development build or production APK.');
  }

  if (!FBSDKModule) {
    FBSDKModule = await import('react-native-fbsdk-next');
  }

  return FBSDKModule;
};

/**
 * Sign in with Facebook via Supabase.
 */
export const signInWithFacebook = async (): Promise<User> => {
  try {
    const { LoginManager, AccessToken } = await getFBSDK();

    const result = await LoginManager.logInWithPermissions(['public_profile', 'email']);
    if (result.isCancelled) {
      throw new Error('User cancelled the login process');
    }

    const data = await AccessToken.getCurrentAccessToken();
    if (!data) {
      throw new Error('Something went wrong obtaining Facebook access token');
    }

    const { data: authData, error } = await supabase.auth.signInWithIdToken({
      provider: 'facebook',
      token: data.accessToken,
    });
    if (error) throw error;
    if (!authData.user) throw new Error('Failed to sign in with Facebook');

    let profile = await AuthService.getCurrentUserFresh();

    if (!profile) {
      profile = {
        uid: authData.user.id,
        name: authData.user.user_metadata?.full_name || 'Facebook User',
        email: authData.user.email || '',
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
    }

    return profile;
  } catch (error: any) {
    if (error.message?.includes('not available')) {
      throw error;
    }
    console.error('Facebook Login Error', error);
    throw new Error(error.message || 'Facebook Login failed');
  }
};

/**
 * Sign out from Facebook.
 */
export const signOutFacebook = async (): Promise<void> => {
  try {
    if (!isFacebookSignInAvailable()) return;

    const { LoginManager } = await getFBSDK();
    LoginManager.logOut();
  } catch {
    // Ignore errors during sign out
  }
};
