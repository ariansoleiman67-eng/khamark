# Supabase Edge Functions — deploy & setup

These replace the Firebase Cloud Functions. Run all commands with **your** Supabase
login (use the `!` prefix in Claude Code so they run in your shell):

> **Deploy functions with `--project-ref utttnhpdzsdwgkneqrnq` (or after `npx supabase link`).**
> Ensure your Supabase CLI is logged into the account that owns the Khamark project (`utttnhpdzsdwgkneqrnq`).

```bash
# Link the repo to your Khamark Supabase project:
npx supabase link --project-ref utttnhpdzsdwgkneqrnq
```

## 1. Secrets (one-time)

```bash
# Anthropic API key for AI auto-reply / Claude chatbot
npx supabase secrets set ANTHROPIC_API_KEY="sk-ant-..."
# Or OpenAI key if using OpenAI fallback
npx supabase secrets set OPENAI_API_KEY="sk-..."

# QiCard Payment Gateway (Sandbox credentials by default)
npx supabase secrets set QICARD_API_HOST="https://uat-sandbox-3ds-api.qi.iq/api/v1"
npx supabase secrets set QICARD_USERNAME="paymentgatewaytest"
npx supabase secrets set QICARD_PASSWORD="WHaNFE5C3qlChqNbAzH4"
npx supabase secrets set QICARD_TERMINAL_ID="237984"

# QiCard requires the webhook + return URLs on the merchant's OWN domain (not
# *.supabase.co). A Cloudflare Worker (cloudflare/qicard-proxy-worker.js) proxies
# khamark.com/qicard-webhook and /payment-complete to these functions.
# Point create-qicard-payment at that domain:
npx supabase secrets set QICARD_PUBLIC_BASE="https://khamark.com"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — do not set them.

## 2. Deploy the functions

```bash
npx supabase functions deploy askChatbot
# send-push is called server-to-server by on-db-change and qicard-webhook (service
# role) and by the admin app (staff login). It checks its caller itself, so the
# gateway flag is not what protects it: the anon key is a valid JWT and would pass.
npx supabase functions deploy send-push
npx supabase functions deploy on-db-change --no-verify-jwt
npx supabase functions deploy login --no-verify-jwt
npx supabase functions deploy verifyAdminActionPassword --no-verify-jwt
npx supabase functions deploy resetPassword --no-verify-jwt

# QiCard Payment Gateway
npx supabase functions deploy create-qicard-payment
npx supabase functions deploy check-qicard-status
# qicard-webhook is called by QiCard servers without a Supabase JWT, so it MUST bypass verification
npx supabase functions deploy qicard-webhook --no-verify-jwt
# payment-complete is the finishPaymentUrl landing page — public, no JWT
npx supabase functions deploy payment-complete --no-verify-jwt
# payment-complete is QiCard's finishPaymentUrl landing (same host as the webhook,
# returns a real 200). Hit by QiCard/the browser without a JWT, so --no-verify-jwt.
npx supabase functions deploy payment-complete --no-verify-jwt
```

`resetPassword` powers forgot-password-by-phone: it verifies the Firebase SMS-OTP
ID token (reuses `FIREBASE_WEB_API_KEY`) and then sets the new password in Supabase
with the service role. Until it's deployed, the phone "reset password" flow fails.

## Auth setting (so new sign-ups work)
Dashboard → **Authentication → Providers → Email** → turn **OFF “Confirm email”**.
(The app never verified emails before; phone sign-ups use a synthetic email that
can't receive a confirmation link, so this must be off for sign-up to complete.)

## 3. Database Webhooks (replace the old Firestore triggers)

Dashboard → **Database → Webhooks → Create a new hook** (do this twice):

| Name              | Table      | Events  | Type                          | Edge Function |
|-------------------|------------|---------|-------------------------------|---------------|
| `notify_on_order` | `orders`   | Insert  | Supabase Edge Function        | `on-db-change`|
| `notify_on_message`| `messages`| Insert  | Supabase Edge Function        | `on-db-change`|

The dashboard auto-attaches the service-role key in the Authorization header.

## What each function does

- **askChatbot** — OpenAI proxy for the in-app AI assistant (client builds the prompt/RAG/messages).
- **send-push** — sends FCM (HTTP v1) to a list of user ids. Called by the admin
  "send notification" flow and by `on-db-change`.
- **on-db-change** — on new `orders` row → push to the tenant/admin; on new
  `messages` row → push to the other chat participant. Writes the in-app
  notification row too.
- **login** — lazy credential migration: verifies an email/phone password
  against Firebase, copies it into Supabase Auth, returns the credential for the
  client to `signInWithPassword`. Zero-lockout cutover; retire once logins drain.
- **create-qicard-payment** — calls QiCard API to generate a `formUrl` for WebView.
- **check-qicard-status** — polls QiCard for payment status updates.
- **qicard-webhook** — receives POST requests from QiCard when payment completes, updates order status to `paid`.

## Still on Firebase (later phases)
- Auth functions (admin password verify, email/phone OTP, etc.) — Phase 5.
- Product video upload (Bunny CDN) — deferred to cutover.
