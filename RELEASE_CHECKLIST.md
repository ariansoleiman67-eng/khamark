# Khamark — Pre-Release Operational Checklist

This checklist tracks actionable requirements before submitting **Khamark v1.0.0** to the Apple App Store and Google Play Console.

---

## 1. Mobile Release Engineer Tasks

- [ ] **EAS Project Initialization:**
  - Run `eas init` to link the Khamark Expo project and populate `extra.eas.projectId` in `app.config.ts`.
- [x] **Replace Google Services Files:**
  - Create the `com.khamark.app` project in Firebase Console. (Completed: project `khamark`, number `697952713775`)
  - Download and replace `google-services.json` in the project root. (Completed)
  - Download and replace `GoogleService-Info.plist` in the project root. (Completed)
  - Synchronized native iOS (`ios/Asankary/GoogleService-Info.plist`) and Android (`android/app/google-services.json`).
- [ ] **Google Sign-in Client ID:**
  - When Google OAuth is enabled in Firebase Authentication, add the generated iOS URL scheme to `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` and Web Client ID to `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. (Currently hidden safely).
- [ ] **Signing Credentials:**
  - iOS: Generate or import App Store Distribution Certificate and Provisioning Profile via EAS (`eas credentials`).
  - Android: Generate or upload the Google Play upload keystore via EAS (`eas credentials`).
- [ ] **Build Pipeline Execution:**
  - Create Preview build: `npm run build:preview` (tests release configuration in an internal APK/TestFlight build).
  - Create Production build: `npm run build:production` (generates `.aab` for Play Store and `.ipa` for App Store).

---

## 2. Supabase & Backend Engineer Tasks

- [x] **Schema Application:**
  - Verified that `supabase/khamark_schema.sql` is executed on production Supabase project (`utttnhpdzsdwgkneqrnq`).
  - Restored `SELECT` grant on `public.parts` to `anon` and `authenticated`.
- [x] **RLS Policy Verification:**
  - Verified `trg_prevent_privilege_escalation` trigger on `public.users`.
  - Confirmed `orders_admin_update` is enforced so customers cannot modify created orders.
  - Confirmed admin user `ariansoleiman33@gmail.com` has `is_admin: true`.
- [x] **Storage Buckets & Permissions:**
  - Verified `media` storage bucket is created with public read access for catalogue assets.
  - Confirmed RLS on `storage.objects` protects uploads.
- [x] **Authentication URL Configuration:**
  - Configured in Supabase Auth via API:
    - **Site URL:** `https://khamark.com`
    - **Redirect URLs:** `khamark://*`, `khamark://auth-callback`, `khamark://reset-password`, `khamark://payment-complete`, `https://khamark.com/*`, `https://www.khamark.com/*`
- [ ] **Edge Functions Deployment (Optional):**
  - Deploy `askChatbot` and `ai-auto-reply` functions if AI assistant features are enabled.

---

## 3. Product Owner & Store Management Tasks

- [ ] **Contact Information:**
  - Update `BRAND.contactPhone` in `src/constants/brand.ts` with the official store customer service phone number.
- [ ] **Website Legal Pages:**
  - Upload `legal/index.html` to `https://khamark.com/privacy`.
  - Upload `legal/support.html` to `https://khamark.com/support`.
  - Upload `legal/verified.html` to `https://khamark.com/auth/verify`.
- [ ] **App Store Connect Setup:**
  - Create new App with Bundle ID `com.khamark.app`.
  - Set Primary Category to *Shopping*.
  - Set Content Rights & Age Rating (12+ or 4+ based on physical shopping).
  - Provide App Review demo credentials (phone/password).
- [ ] **Google Play Console Setup:**
  - Create new App with Package Name `com.khamark.app`.
  - Complete Data Safety Questionnaire using responses from `STORE_SUBMISSION_DRAFT.md`.
  - Complete App Content & Privacy declarations.
  - Set up internal testing track before promoting to Production.

---

## 4. Rollback & Emergency Plan

1. **Client App Rollback:**
   - Because `updates.enabled` is `false` (native releases only, no OTA), client updates must go through standard store distribution.
   - If an urgent bug occurs, bump build number (`buildNumber: "2"`, `versionCode: 2`) and submit an expedited hotfix.
2. **Backend Configuration Freeze:**
   - In the event of backend issues, activate the force update modal via `app_config` in Supabase to pause traffic while keeping data intact.
   - Database rollbacks must be handled through versioned migration reversals without dropping transactional order records.
