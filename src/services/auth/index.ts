/**
 * Authentication Services
 * Unified export for all auth functionality
 */

// Phone + Password Auth (Main method for new users/admins)
export {
  registerWithPhone,
  loginWithPhone,
  resetPasswordAfterOTP,
  mintSupabaseSessionFromFirebase,
  isPhoneRegistered,
  type RegistrationData,
} from './phonePasswordAuth';

// OTP Service (Verification only)
export {
  sendOTP,
  verifyOTP,
  resendOTP,
  validateOTPCode,
  linkPhone,
  type OTPResult,
} from './otpService';

// Email Auth (Supabase)
export {
  loginWithEmail,
  isLegacyAccount,
  isEmailRegistered,
  sendPasswordResetEmail,
  registerWithEmail,
} from './legacyEmailAuth';

// Google Sign-In
export {
  signInWithGoogle,
  signOutGoogle,
  getCurrentGoogleUser,
  isGoogleSignInAvailable,
} from './googleAuth';

// Facebook Sign-In
export {
  signInWithFacebook,
  signOutFacebook,
  isFacebookSignInAvailable,
} from './facebookAuth';

// Apple Sign-In
export {
  signInWithApple,
  isAppleSignInAvailable,
} from './appleAuth';

// Security Service (Account & Security operations)
export {
  getAuthState,
  getProviders,
  reloadUser,
  runSensitiveAction,
  getBestReauthMethod,
  reauthWithPassword,
  reauthWithApple,
  canUnlink,
  assertCanUnlink,
  requireAtLeastOneProviderAfter,
  mapFirebaseError,
  sendEmailVerification,
  requestEmailChange,
  changePassword as changePasswordSecure,
  setPassword,
  linkApple,
  unlinkApple,
  unlinkGoogle,
  unlinkPhone,
  canChangePhone,
  type AuthState,
  type ReauthMethod,
} from './securityService';
