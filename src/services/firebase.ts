/**
 * Firebase Native SDK Configuration
 * 
 * Uses @react-native-firebase for native performance.
 * The app is configured via google-services.json (Android) and GoogleService-Info.plist (iOS).
 * No need for initializeApp() — native SDK auto-initializes from config files.
 */

import { getAuth } from '@react-native-firebase/auth';
import { getFunctions } from '@react-native-firebase/functions';
import { Platform } from 'react-native';

// Native SDK instances (modular API). Firebase is now kept ONLY for SMS phone
// OTP, FCM push, and authing the Bunny video upload — all data lives on
// Supabase, so Firestore is no longer initialized here.
export const auth = getAuth();
export const functions = getFunctions();
// Storage is lazy-loaded only in imageService.ts (native module may not be built)

// Firebase Error Handler
export const handleFirebaseError = (error: any): string => {
  const errorCode = error.code;
  const errorMessage = error.message;
  
  // Log additional details for Android debugging
  if (Platform.OS === 'android' && __DEV__) {
    console.log('Android Firebase Error:', {
      code: errorCode,
      message: errorMessage,
      platform: Platform.OS,
      timestamp: new Date().toISOString()
    });
  }

  switch (errorCode) {
    case 'auth/user-not-found':
      return 'No user found with this email address.';
    case 'auth/wrong-password':
      return 'Incorrect password. Please try again.';
    case 'auth/invalid-credential':
      return 'Invalid login credentials. Please check your email and password.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters long.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.';
    case 'firestore/permission-denied':
      return 'Permission denied. Please make sure you are logged in.';
    case 'firestore/unavailable':
      return 'Service temporarily unavailable. Please try again.';
    case 'storage/unauthorized':
      return 'Unauthorized access to storage.';
    case 'storage/canceled':
      return 'Upload was canceled.';
    case 'storage/quota-exceeded':
      return 'Storage quota exceeded.';
    default:
      console.error('Firebase Error:', errorCode, errorMessage);
      return 'An unexpected error occurred. Please try again.';
  }
};

// Development helpers
export const isDevelopment = __DEV__;

export default {};
