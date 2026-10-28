# Khamark — Production Release Readiness Assessment

**Document Status:** Complete & Reviewed  
**Release Target:** Apple App Store & Google Play Store  
**Version:** 1.0.0 (Build 1, Android versionCode 1)  
**Evaluated Date:** October 27, 2026  
**Final Verdict:** **Ready for Internal / Beta Testing** (Pending client-provided external account IDs)

---

## 1. Executive Summary

The Khamark mobile shopping application has been audited and prepared for production release on iOS and Android. Active codebase artifacts, configuration files, and backend connections were inspected to ensure complete separation from the legacy Asankary baseline. 

All core code quality, security, and functional checks have passed:
- **TypeScript:** 0 compilation errors (`npx tsc --noEmit`).
- **Unit & Integration Tests:** 22/22 test suites passed, 277/277 tests passed (`npm test`).
- **Linting:** 0 errors (322 non-blocking warnings).
- **Approved Design:** 100% preserved (luxury crimson `#A61920` and white branding, compact brand strip, custom 5-tab curved bottom bar with floating indicator, compact product cards).
- **Account Lifecycle:** Apple Guideline 5.1.1(v) compliant in-app account deletion is implemented and verified.

---

## 2. Architecture & Framework Baseline

The audited codebase conforms to the following production stack:

| Component | Verified Version / Specification | Status |
| :--- | :--- | :--- |
| **Framework** | Expo SDK `~54.0.36` (React Native `0.81.5`) | ✅ Verified |
| **React Core** | React `19.1.0` | ✅ Verified |
| **Architecture** | New Architecture Enabled (`RCT_NEW_ARCH_ENABLED: 1`) | ✅ Verified |
| **Navigation** | `@react-navigation/native` `^7.1.17` (native-stack + custom bottom-tabs) | ✅ Verified |
| **Backend SDK** | `@supabase/supabase-js` `^2.106.2` | ✅ Verified |
| **iOS Target** | Deployment target `15.1` (Supports iOS 15.0 through 18+) | ✅ Verified |
| **Android Target** | `compileSdkVersion: 36`, `targetSdkVersion: 36` (Exceeds Google Play min 34) | ✅ Verified |
| **Internationalization** | 3 Locales: English (`en`), Arabic (`ar`, RTL), Kurdish (`ku`, RTL) | ✅ Verified (3,296 keys) |

---

## 3. Brand Independence & Separation Audit

All references to the previous client project were audited to ensure Khamark cannot update, conflict with, or connect to Asankary services:

| Asset / Parameter | Khamark Production Value | Independence Status |
| :--- | :--- | :--- |
| **App Name** | `Khamark` | ✅ Independent |
| **Bundle Identifier (iOS)** | `com.khamark.app` | ✅ Independent |
| **Package Name (Android)** | `com.khamark.app` | ✅ Independent |
| **Custom URL Scheme** | `khamark://` | ✅ Isolated (Legacy `asankary://` removed) |
| **Associated Domains** | `applinks:khamark.com`, `applinks:www.khamark.com` | ✅ Independent |
| **Deep Link Prefixes** | `https://khamark.com`, `https://www.khamark.com`, `khamark://` | ✅ Purged legacy scheme |
| **Payment Return Whitelist** | `khamark://payment-complete` | ✅ Isolated |
| **Primary Backend URL** | `https://utttnhpdzsdwgkneqrnq.supabase.co` | ✅ Independent Khamark project |
| **Legal Documentation** | `legal/index.html` (Privacy), `legal/support.html` (Support) | ✅ Updated with Khamark branding |
| **App Branding Assets** | 2400×1072 transparent vector-quality wordmarks & crimson logos | ✅ Verified in `assets/images/` |

---

## 4. Prioritized Issues & Release Blockers

### P0: Security & Critical Transaction Integrity
*No active P0 vulnerabilities remain in client code.*
- **Client Privilege Escalation:** Prevented by PostgreSQL trigger `trg_prevent_privilege_escalation` on `public.users`.
- **Order Price Tampering:** Orders update is restricted to store administrators (`orders_admin_update` RLS policy).
- **Cart Price Revalidation:** `CartService.validateCart()` queries the authoritative database prices and active stock before checkout can proceed.
- **Order Submission Idempotency:** Guarded by `isSubmittingRef` to prevent double-taps and duplicate order creation.

---

### P1: Release Blockers (Requires Owner Action / Credentials)

1. **Google Services Configuration (`google-services.json` & `GoogleService-Info.plist`):**
   - *Status:* Both files in the repository currently contain credentials from the legacy `asankary-8f8af` Firebase project with package `com.asankary.app`.
   - *Requirement:* The client must create a **Khamark** project in Firebase / Google Cloud, register Android package `com.khamark.app` and iOS bundle ID `com.khamark.app`, download the new `google-services.json` and `GoogleService-Info.plist`, and place them in the project root.
   - *Risk if unaddressed:* Native Android build will fail (`No matching client found for package com.khamark.app`), and iOS push notifications / Google Sign-in will fail.

2. **EAS Project ID (`app.config.ts`):**
   - *Status:* `extra.eas.projectId` is set to placeholder `"REPLACE_WITH_KHAMARK_EAS_PROJECT_ID"`.
   - *Requirement:* The release engineer must run `eas init --id <id>` with the Khamark Expo account to link the cloud build pipeline.

3. **Google Sign-In iOS URL Scheme (`app.config.ts` & `app.json`):**
   - *Status:* `iosUrlScheme` in the Google Sign-In plugin currently references OAuth client `com.googleusercontent.apps.22285264318-9ipslo5beas3b4l0a2c969eq1fqnnk2j`.
   - *Requirement:* Replace with the reversed client ID from the new Khamark `GoogleService-Info.plist`.

4. **Production Contact Phone & Store URLs:**
   - *Status:* `BRAND.contactPhone` in `src/constants/brand.ts` is set to placeholder `+964 750 123 4567`.
   - *Requirement:* Supply official business phone number and customer support contact.

---

### P2: Polish & Non-Blocking Improvements

1. **Android Adaptive Icon Masking:**
   - The current `assets/adaptive-icon.png` is 432×432 with a pre-baked crimson square background. Placing a transparent foreground logo centered inside the 66% safe diameter will provide optimal parallax rendering across diverse Android OEM launchers.
2. **ESLint Cleanup:**
   - 322 non-blocking warnings (primarily unused imports and arguments).

---

## 5. Security & Privacy Compliance Checklist

- [x] **Apple Guideline 5.1.1(v) — Account Deletion:** Verified in `AuthContext.tsx` and `ProfileScreen.tsx`. Invokes `supabase.rpc('delete_user')` and completely purges local session caches.
- [x] **Store Disclosures:** Export encryption exemption set (`ITSAppUsesNonExemptEncryption: false`).
- [x] **Sensitive Data Leakage:** `.env` and service role keys are excluded from version control via `.gitignore`.
- [x] **Permissions Usage Descriptions:** Clear, user-facing explanations configured for Camera, Microphone, Photo Library, and Location in `app.config.ts`.
- [x] **Background Location:** No background location requested (`ACCESS_BACKGROUND_LOCATION` absent).
- [x] **Privacy Policy & Support:** Standalone responsive HTML pages available in `legal/` ready for hosting at `https://khamark.com/privacy` and `https://khamark.com/support`.
