# SETUP_CHECKLIST.md — Asankary infrastructure (Phase 2)

Ordered console steps to stand up **all-new** backend/services for Asankary. Nothing here reuses a Haryad account, key, or project. Every value maps to a placeholder token already in the code (`REPLACE_WITH_ASANKARY_*`, `EXPO_PUBLIC_*`, `ASANKARY_DOMAIN_TBD`, `TODO_CONTACT_*`).

**Convention**
- Client-safe values → `EXPO_PUBLIC_*` in root `.env` (bundled into the app).
- Server secrets → Supabase secrets / Firebase functions config / EAS secrets. **Never** in `.env` committed or `EXPO_PUBLIC_*`.
- After filling `.env`, restart Metro (`npm start -c`).

---

## 0. Prereqs
- Node 20 LTS, `npm i -g eas-cli supabase firebase-tools`.
- Decide the **domain** first if possible → replaces every `ASANKARY_DOMAIN_TBD`. If not ready, keep the placeholder; deep links + associated domains stay non-functional until set.

---

## 1. Supabase (primary data + auth) — do first
1. https://supabase.com/dashboard → **New project** (org = Asankary). Region closest to Iraq (e.g. `eu-central-1`). Save the DB password.
2. Project → Settings → API. Copy:
   - Project URL → `EXPO_PUBLIC_SUPABASE_URL`
   - `anon` public key → `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → **secret** (step 5), never in the app bundle.
3. Link CLI: `supabase login` → `supabase link --project-ref <NEW_REF>`.
4. **Port schema**: apply the generated migration (see `supabase/migrations/` — regenerated from code table usage; cross-check against the kept `schema.sql` + `update_schema_*.sql`). `supabase db push`.
5. **Edge-function secrets** (`supabase secrets set KEY=value`): `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, plus every secret the 12 functions read (Gemini/OpenAI, FCM service account JSON, QiCard merchant creds, Bunny keys, SMTP, OTPIQ/Twilio). Enumerate per function under `supabase/functions/*`.
6. Deploy all functions: `supabase functions deploy --no-verify-jwt` per function (or loop over `supabase/functions/*`).
7. Auth → providers: enable Email, Phone, Google, Apple, Facebook to match app flows.

## 2. Firebase (phone OTP, FCM push, Bunny upload auth, legacy Cloud Functions)
1. https://console.firebase.google.com → **Add project** "Asankary".
2. Add **Android app**, package `com.asankary.app` → download `google-services.json` → repo root (git-ignored) **and** it will be re-consumed by prebuild.
3. Add **iOS app**, bundle `com.asankary.app` → download `GoogleService-Info.plist` → repo root (git-ignored).
4. Enable **Authentication → Phone**. Add SHA-1/SHA-256 (from the new EAS keystore, step 6) for Android phone auth / Google sign-in.
5. **Cloud Messaging (FCM)**: create a service account (Project settings → Service accounts → generate key) for the `send-push` edge function → store its JSON as a Supabase secret (NOT committed).
6. Deploy legacy Cloud Functions: fill `functions/.env` (see `functions/.env.example`: `OPENAI_API_KEY`, `SMTP_USER/PASS`, `GEMINI_API_KEY`) then `npm run deploy:functions`. Region stays `us-central1`.
7. **Fix stale project bug**: `src/services/videoService.ts` pointed at the old `truckserviceapp-f9712` project — repoint to the new Firebase project ref / Bunny setup.

## 3. Google Maps (3 slots)
1. Google Cloud Console → new project → enable **Maps SDK Android**, **Maps SDK iOS**, **Maps Static API**.
2. Create keys, restrict by app id / referrer. Fill:
   - `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (root `.env`)
   - `app.config.ts` iOS `config.googleMapsApiKey` + Android `config.googleMaps.apiKey` (both currently `REPLACE_WITH_ASANKARY_GOOGLE_MAPS_KEY`)
   - `eas.json` env `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`

## 4. Google Sign-In (OAuth)
1. Cloud Console → Credentials → OAuth client IDs for iOS + Android (+ Web for Supabase).
2. iOS **reversed client ID** → replaces `REPLACE_WITH_ASANKARY_GOOGLE_REVERSED_CLIENT_ID` in `app.config.ts` (`CFBundleURLSchemes` + google-signin `iosUrlScheme`).
3. Wire Web client ID into Supabase Auth Google provider + the google-auth redirect.

## 5. Apple Sign-In
1. Apple Developer → App ID `com.asankary.app` → enable **Sign In with Apple**.
2. Create a Services ID + key for Supabase Apple provider. `usesAppleSignIn: true` already set.

## 6. Facebook Login
1. developers.facebook.com → new app "Asankary". Get **App ID** + **Client Token**.
2. Replace `REPLACE_WITH_ASANKARY_FB_APP_ID` and `REPLACE_WITH_ASANKARY_FB_CLIENT_TOKEN` in `app.config.ts` (also the `fb<APPID>` scheme).
3. Add iOS bundle + Android key hash (from new keystore).

## 7. EAS (build + OTA) — under YOUR account
1. `eas login` (Asankary account) → `eas init` → writes a new `projectId`.
   - Replace `REPLACE_WITH_ASANKARY_EAS_PROJECT_ID` in `app.config.ts` (`extra.eas.projectId` + `updates.url`).
2. `eas credentials` → let EAS **generate a new Android keystore** (never commit it). iOS certs via EAS too.
3. Fix `eas.json` placeholder `API_URL` / env blocks with the real values.
4. `eas build --profile development --platform android` for the dev client.

## 8. Bunny CDN (product video)
1. bunny.net → new **Stream** (or Storage) zone for Asankary.
2. Zone id + API key → Supabase secret / Cloud Function env consumed by `videoService.ts` + the upload function.

## 9. QiCard payment + Cloudflare Worker
1. Obtain Asankary **QiCard merchant** credentials.
2. Deploy `cloudflare/qicard-proxy-worker.js` to a Worker on the Asankary Cloudflare account, route on `ASANKARY_DOMAIN_TBD`.
3. Set merchant secrets as Worker secrets (`wrangler secret put`). Update the app's QiCard base URL to the new worker route.

## 10. SMS OTP (OTPIQ / Twilio)
1. Create OTPIQ (or Twilio) account → API token.
2. Store as Supabase/Firebase secret consumed by the OTP-send function.

## 11. AI keys (env only)
- `OPENAI_API_KEY` (+ model envs) → `functions/.env` / functions config.
- `GEMINI_API_KEY` → `functions/.env` / functions config (visual search; already reads `process.env.GEMINI_API_KEY`).

---

## Value → destination quick map
| Placeholder | Destination file(s) | Source (step) |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | `.env`, `src/services/supabase.ts` (env) | §1 |
| `google-services.json` / `GoogleService-Info.plist` | repo root (git-ignored) | §2 |
| `REPLACE_WITH_ASANKARY_GOOGLE_MAPS_KEY` | `app.config.ts`, `eas.json`, `.env` | §3 |
| `REPLACE_WITH_ASANKARY_GOOGLE_REVERSED_CLIENT_ID` | `app.config.ts` | §4 |
| `REPLACE_WITH_ASANKARY_FB_APP_ID` / `_FB_CLIENT_TOKEN` | `app.config.ts` | §6 |
| `REPLACE_WITH_ASANKARY_EAS_PROJECT_ID` | `app.config.ts` (`projectId` + `updates.url`) | §7 |
| `ASANKARY_DOMAIN_TBD` | `app.config.ts`, `AppNavigator.tsx`, worker, share URLs | §0 |
| `TODO_CONTACT_*` | `src/constants/config.ts` (BRAND) | store owner |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` / `SMTP_*` | `functions/.env` + secrets | §11/§2 |
