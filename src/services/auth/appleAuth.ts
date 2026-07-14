/**
 * Apple Sign-In Authentication (Supabase)
 *
 * Availability is checked via expo-apple-authentication; the actual sign-in
 * delegates to AuthService (Supabase signInWithIdToken + users upsert).
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';
import { User } from '../../types';
import { AuthService } from '../authService';

/**
 * Check if Apple Sign-In is available on this device.
 */
export const isAppleSignInAvailable = async (): Promise<boolean> => {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
};

/**
 * Sign in with Apple via Supabase.
 */
export const signInWithApple = async (): Promise<User> => {
  return AuthService.signInWithApple();
};
