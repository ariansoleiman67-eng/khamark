// import { signInWithPhoneNumber, getAuth, signInWithCredential } from '@react-native-firebase/auth'; // REMOVED: Causes crash in Expo Go

/**
 * OTP Service for Phone Verification (Real SMS)
 * 
 * Uses @react-native-firebase/auth to send real SMS codes.
 * Requires:
 * 1. Development Build (native) or Prebuild - NOT Expo Go
 * 2. SHA-1/SHA-256 keys added to Firebase Console (for Android auto-verify)
 * 3. Phone Auth enabled in Firebase Console
 */

export interface OTPResult {
  verificationId: string;
  phoneNumber: string;
}

import { getAuth, signInWithPhoneNumber, PhoneAuthProvider, signInWithCredential, linkWithCredential } from '@react-native-firebase/auth';

// State for rate limiting and confirmation storage
let isSendingOtp = false;
const lastSendByPhone = new Map<string, number>();
const COOLDOWN_MS = 60_000; // 60s
let latestConfirmation: any | null = null; // Store confirmation object

const enforceOtpCooldown = (phoneNumber: string) => {
  const now = Date.now();
  const last = lastSendByPhone.get(phoneNumber) ?? 0;
  const remaining = COOLDOWN_MS - (now - last);

  if (remaining > 0) {
    const seconds = Math.ceil(remaining / 1000);
    throw new Error(`Please wait ${seconds}s before requesting a new code.`);
  }
};

/**
 * Send OTP to phone number (Real SMS)
 */
export const sendOTP = async (
  phoneNumber: string
): Promise<OTPResult> => {
  if (isSendingOtp) {
    throw new Error('OTP request already in progress.');
  }
  
  try {
    console.log('📱 Sending Real SMS OTP to:', phoneNumber);
    
    // Strict validation
    if (!phoneNumber || typeof phoneNumber !== 'string') {
        throw new Error('Phone number is missing (null/undefined) or not a string');
    }

    // Rate limiting
    enforceOtpCooldown(phoneNumber);
    
    isSendingOtp = true; // Set lock

    const auth = getAuth();

    // DEV ONLY: emulators can't pass Play Integrity, so disable app verification
    // for local testing. This NEVER runs in a release build (__DEV__ is false),
    // so production phone auth still uses real Play Integrity.
    // IMPORTANT: while this is on you must test with a Firebase *test* phone number
    // (Auth → Sign-in method → Phone → "Phone numbers for testing") — real numbers
    // get "unusual activity" blocks.
    if (__DEV__) {
      try { (auth as any).settings.appVerificationDisabledForTesting = true; } catch {}
    }

    const confirmation = await signInWithPhoneNumber(auth, phoneNumber);
    
    // Store confirmation object
    latestConfirmation = confirmation;
    
    // Update timestamp
    lastSendByPhone.set(phoneNumber, Date.now());

    console.log('✅ SMS sent successfully', confirmation);
    
    return {
      verificationId: confirmation.verificationId || '',
      phoneNumber,
    };
  } catch (error: any) {
    console.error('❌ Send OTP error details:', {
        code: error.code,
        message: error.message,
    });
    
    if (error.code === 'auth/invalid-phone-number') {
      throw new Error('Invalid phone number format');
    } else if (error.code === 'auth/too-many-requests') {
      throw new Error('Too many requests. Please use a Test Phone Number (Firebase Console) or try again later.');
    } else if (error.code === 'auth/quota-exceeded') {
      throw new Error('SMS quota exceeded. Please try again later');
    } else if (error.message && error.message.includes('app-not-authorized')) {
      throw new Error('App not authorized. Please check SHA-1 keys in Firebase Console or use a Test Phone Number.');
    }
    
    throw new Error(error.message || 'Failed to send OTP');
  } finally {
    isSendingOtp = false; // Release lock
  }
};

/**
 * Verify OTP code (Real SMS)
 */
export const verifyOTP = async (
  verificationId: string, // Kept for API compatibility, but we prefer latestConfirmation
  code: string
): Promise<{ uid: string; phone: string }> => {
  try {
    console.log('🔐 Verifying OTP code...');
    
    if (!code || typeof code !== 'string') {
      throw new Error('Invalid code');
    }

    // Prefer using the stored confirmation object if available
    if (latestConfirmation) {
        console.log('Using stored confirmation object');
        const userCredential = await latestConfirmation.confirm(code);
        return {
            uid: userCredential.user.uid,
            phone: userCredential.user.phoneNumber || '',
        };
    }

    // Fallback to manual credential creation (e.g. if app restarted, though memory would be cleared anyway)
    console.log('⚠️ No stored confirmation, using manual credential');
    if (!verificationId) throw new Error('Invalid verification ID');
    
    const credential = PhoneAuthProvider.credential(verificationId, code);
    const userCredential = await signInWithCredential(getAuth(), credential);
    
    return {
      uid: userCredential.user.uid,
      phone: userCredential.user.phoneNumber || '',
    };
  } catch (error: any) {
    console.error('❌ Verify OTP error:', { code: error.code, message: error.message });
    
    if (error.code === 'auth/invalid-verification-code') {
      throw new Error('Invalid verification code');
    } else if (error.code === 'auth/code-expired') {
      throw new Error('Code expired. Please request a new one');
    } else if (error.code === 'auth/session-expired') {
      throw new Error('Verification session expired. Please request a new code.');
    } else if (error.code === 'auth/provider-already-linked') {
      // Phone was auto-verified by signInWithPhoneNumber — user is already signed in
      console.log('✅ Phone already linked/verified (auto-verify). Treating as success.');
      try {
        const auth = getAuth();
        const currentUser = auth.currentUser;
        if (currentUser) {
          return {
            uid: currentUser.uid,
            phone: currentUser.phoneNumber || '',
          };
        }
      } catch (_) { /* fall through */ }
      throw new Error('Phone already verified. Please try again.');
    } else if (error.code === 'auth/internal-error') {
      throw new Error('Verification failed. Please request a new code and try again.');
    }
    
    throw new Error(error.message || 'Failed to verify OTP');
  }
};

/**
 * Link phone number to current user
 */
export const linkPhone = async (
  verificationId: string,
  code: string
): Promise<void> => {
  try {
    console.log('🔗 Linking phone number...');
    const auth = getAuth();
    
    if (!code) throw new Error('Invalid verification details');

    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('No user logged in to link phone to');
    }

    let credential;
    
    // Use stored confirmation if available to get the credential
    // Note: confirmation.confirm() signs in, which isn't what we want for linking.
    // We need to build the credential manually.
    if (latestConfirmation && latestConfirmation.verificationId) {
         console.log('Using stored verificationId for linking');
         credential = PhoneAuthProvider.credential(latestConfirmation.verificationId, code);
    } else {
         if (!verificationId) throw new Error('Invalid verification ID');
         credential = PhoneAuthProvider.credential(verificationId, code);
    }
    
    // Link credential to current user
    await linkWithCredential(currentUser, credential);
    
    console.log('✅ Phone linked successfully');
  } catch (error: any) {
    console.error('❌ Link Phone error:', { code: error.code, message: error.message });
    
    if (error.code === 'auth/credential-already-in-use') {
      throw new Error('This phone number is already associated with another account.');
    } else if (error.code === 'auth/provider-already-linked') {
      // Phone is already linked to this account — treat as success
      console.log('✅ Phone already linked. Treating as success.');
      return;
    } else if (error.code === 'auth/invalid-verification-code') {
      throw new Error('Invalid verification code');
    } else if (error.code === 'auth/session-expired') {
      throw new Error('Verification session expired. Please request a new code.');
    } else if (error.code === 'auth/internal-error') {
      throw new Error('Verification failed. Please request a new code and try again.');
    }
    
    throw new Error(error.message || 'Failed to link phone');
  }
};

/**
 * Re-send OTP
 */
export const resendOTP = async (
  phoneNumber: string
): Promise<OTPResult> => {
  console.log('🔄 Resending OTP...');
  // Check cooldown first
  enforceOtpCooldown(phoneNumber);
  return sendOTP(phoneNumber);
};

/**
 * Validate OTP code format (6 digits)
 */
export const validateOTPCode = (code: string): boolean => {
  return /^\d{6}$/.test(code);
};



/**
 * Development Notes:
 * 
 * For production deployment, you need to:
 * 
 * 1. Configure Firebase Phone Authentication:
 *    - Enable Phone as sign-in method in Firebase Console
 *    - Set up billing (required for phone auth)
 *    - Configure reCAPTCHA for web or use native flow for mobile
 * 
 * 2. Options for React Native:
 *    a) Use @react-native-firebase/auth (native module)
 *    b) Use a backend service to send SMS (Twilio, AWS SNS, etc.)
 *    c) Use Firebase's REST API with reCAPTCHA v3
 * 
 * 3. For testing:
 *    - Use Firebase test phone numbers (no SMS sent)
 *    - Default test code: 123456
 *    - Add test numbers in Firebase Console > Authentication > Sign-in method
 * 
 * 4. Security:
 *    - Implement rate limiting
 *    - Add phone number validation
 *    - Monitor for abuse
 *    - Use test mode only in development
 */
