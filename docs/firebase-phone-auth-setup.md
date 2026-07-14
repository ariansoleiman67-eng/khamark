# Firebase Phone Authentication Setup Guide

This guide helps you configure Firebase phone authentication for both Android and iOS platforms in your React Native Expo app.

## Prerequisites

1. **Firebase Project**: Ensure you have a Firebase project created
2. **Firebase Console Access**: You need admin access to your Firebase console
3. **Platform Registration**: Your Android and iOS apps should be registered in Firebase

## Platform-Specific Setup

### Android Setup

#### 1. Add SHA Fingerprints
Phone authentication requires SHA fingerprints for Android apps:

```bash
# For debug builds (development)
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android

# For release builds (production)
keytool -list -v -keystore your-release-key.keystore -alias your-key-alias
```

**Add these fingerprints to Firebase Console:**
1. Go to Project Settings > Your Android App
2. Add both SHA-1 and SHA-256 fingerprints
3. Click "Save"

#### 2. Enable SafetyNet
1. Go to Google Cloud Console
2. Enable SafetyNet API for your project
3. This prevents spam and abuse during phone verification

#### 3. Test Phone Numbers (Optional)
For development, add test phone numbers:
1. Firebase Console > Authentication > Sign-in method > Phone
2. Add test phone numbers with verification codes (e.g., +1234567890 → 123456)

### iOS Setup

#### 1. Enable Phone Authentication
1. Firebase Console > Authentication > Sign-in method
2. Enable "Phone" provider
3. Configure APNs authentication

#### 2. APNs Configuration
**Option A: APNs Authentication Key (Recommended)**
1. Apple Developer Console > Certificates, IDs & Profiles > Keys
2. Create new key with APNs enabled
3. Upload the .p8 file to Firebase Console
4. Add Key ID and Team ID

**Option B: APNs Certificate**
1. Create APNs certificate in Apple Developer Console
2. Upload .p12 file to Firebase Console

#### 3. Bundle ID Configuration
Ensure your iOS Bundle ID in Firebase matches your Expo app configuration:
```json
// app.json
{
  "expo": {
    "ios": {
      "bundleIdentifier": "com.yourcompany.yourapp"
    }
  }
}
```

## Code Integration Checklist

### ✅ Dependencies Installed
- [x] `expo-firebase-recaptcha` - For reCAPTCHA verification
- [x] `firebase` - Firebase SDK

### ✅ Firebase Configuration
Ensure your `.env` contains:
```env
EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
```

### ✅ Components Updated
- [x] `AuthService` - Phone auth methods with reCAPTCHA
- [x] `SimplePhoneModal` - Firebase reCAPTCHA integration
- [x] `VerificationCodeModal` - Firebase confirmation result handling
- [x] `LoginScreen` - Real Firebase phone auth flow

## Testing Phone Authentication

### Development Testing
1. **Use Test Phone Numbers**: Configure test numbers in Firebase Console
2. **Debug SHA**: Ensure debug SHA fingerprint is added for Android
3. **iOS Simulator**: May require additional APNs setup

### Production Testing
1. **Release SHA**: Add production SHA fingerprints
2. **Real Phone Numbers**: Test with actual phone numbers
3. **Rate Limiting**: Be aware of Firebase's rate limits

## Common Issues & Solutions

### Android Issues

**Issue: "Play Integrity API error"**
- **Solution**: Ensure SafetyNet API is enabled and SHA fingerprints are correct

**Issue: "reCAPTCHA failed"**
- **Solution**: Check if your app's package name matches Firebase configuration

**Issue: "SMS not received"**
- **Solution**: Verify phone number format (+country_code + number)

### iOS Issues

**Issue: "APNs device token not set"**
- **Solution**: Configure APNs properly in Firebase Console

**Issue: "reCAPTCHA not loading"**
- **Solution**: Ensure Bundle ID matches Firebase configuration

**Issue: "Silent push notifications"**
- **Solution**: Check APNs certificate/key is valid and uploaded

## Security Considerations

1. **Rate Limiting**: Firebase automatically rate limits phone auth requests
2. **reCAPTCHA**: Required to prevent automated abuse
3. **Country Restrictions**: Consider restricting to specific countries if needed
4. **Test Numbers**: Remove test numbers before production

## Environment Variables Required

```env
# Firebase configuration
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

## Verification Checklist

Before going to production:
- [ ] Android SHA fingerprints added (debug + release)
- [ ] iOS APNs properly configured
- [ ] Phone authentication enabled in Firebase Console
- [ ] SafetyNet API enabled (Android)
- [ ] Test phone numbers removed (production)
- [ ] Rate limiting understood and documented
- [ ] Error handling tested with invalid phone numbers
- [ ] SMS delivery tested in target regions

## Support

If you encounter issues:
1. Check Firebase Console logs
2. Enable debug logging in your app
3. Test with Firebase's test phone numbers first
4. Verify platform-specific configuration is complete

## Implementation Status

✅ **Completed**:
- Firebase Auth Service updated with phone authentication
- reCAPTCHA verifier integration
- Phone number modal with Firebase integration
- Verification code modal with confirmation result handling
- LoginScreen updated with real Firebase flow

🚀 **Ready for Testing**: The phone authentication implementation is complete and ready for platform-specific configuration and testing.
