// =============================================================================
// Supabase Edge Function: send-sms-otp   (Auth "Send SMS" Hook → OTPIQ + Twilio)
// =============================================================================
// Supabase generates the OTP, verifies it, handles expiry/rate-limits and the
// session NATIVELY. This hook is ONLY the delivery pipe. Because a "Send SMS"
// hook OVERRIDES the dashboard's native provider for EVERY phone OTP, BOTH
// providers must be routed from inside this one function:
//
//   • Iraq numbers (+964…)      → OTPIQ   (best Iraq deliverability/price)
//   • Everything else (intl)    → Twilio  (Programmable SMS / Messaging Service)
//
// Flow:
//   app: supabase.auth.signInWithOtp({ phone })  ->  Supabase makes the OTP
//        ->  calls THIS hook with { user, sms: { otp } }
//        ->  Iraq: POST to OTPIQ   |   intl: POST to Twilio Messages API
//   app: supabase.auth.verifyOtp({ phone, token, type: 'sms' })  ->  session
//
// SETUP (one-time):
//   OTPIQ (Iraq):
//     supabase secrets set OTPIQ_API_KEY="sk_live_xxx"
//     supabase secrets set OTPIQ_PROVIDER="auto"          # auto | sms | whatsapp
//   Twilio (international) — copy from Twilio console / the Supabase Phone screen:
//     supabase secrets set TWILIO_ACCOUNT_SID="ACxxxxxxxx"
//     supabase secrets set TWILIO_AUTH_TOKEN="your_auth_token"
//     supabase secrets set TWILIO_MESSAGING_SERVICE_SID="MGxxxxxxxx"
//     # (optional) instead of a Messaging Service, a single sender number:
//     # supabase secrets set TWILIO_FROM="+1XXXXXXXXXX"
//   Hook auth + deploy (must skip JWT — Supabase calls it with its own HMAC):
//     supabase secrets set SEND_SMS_HOOK_SECRET="v1,whsec_xxx"
//     supabase functions deploy send-sms-otp --no-verify-jwt
//   Dashboard → Authentication → Hooks → "Send SMS" → enable, point to this fn.
//   Dashboard → Authentication → Providers → Phone → ENABLE.
// =============================================================================

import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

const HOOK_SECRET = Deno.env.get('SEND_SMS_HOOK_SECRET') ?? '';

// OTPIQ (Iraq)
const OTPIQ_API_KEY = Deno.env.get('OTPIQ_API_KEY') ?? '';
const OTPIQ_PROVIDER = Deno.env.get('OTPIQ_PROVIDER') ?? 'auto'; // auto | sms | whatsapp
const OTPIQ_URL = 'https://api.otpiq.com/api/sms';

// Twilio (international)
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const TWILIO_MESSAGING_SERVICE_SID = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID') ?? '';
const TWILIO_FROM = Deno.env.get('TWILIO_FROM') ?? '';

const jsonError = (message: string, status = 500) =>
  new Response(JSON.stringify({ error: { message: message.slice(0, 300) } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// Bare digits, dropping an international 00 prefix. Preserves the rest as typed.
function digitsOnly(p: string): string {
  let d = (p || '').replace(/[^0-9]/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  return d;
}

// Iraq if the E.164 number is +964…, or a bare Iraqi mobile (7xxxxxxxxx / 07xxxxxxxxx).
// The client always sends E.164 with a leading '+', so non-Iraq numbers carry their
// own +CC and are NOT misclassified here.
function isIraqiNumber(p: string): boolean {
  const d = digitsOnly(p);
  if (d.startsWith('964')) return true;
  if (/^7\d{9}$/.test(d)) return true;   // 7xxxxxxxxx (bare local)
  if (/^07\d{9}$/.test(d)) return true;  // 07xxxxxxxxx (bare local)
  return false;
}

// OTPIQ wants bare digits with the 964 country code, e.g. 9647xxxxxxxxx.
function toIraqiMsisdn(p: string): string {
  let d = digitsOnly(p);
  if (d.startsWith('964')) return d;
  if (d.startsWith('0')) d = d.slice(1);          // 07… -> 7…
  if (d.length === 10 && d.startsWith('7')) return '964' + d;
  return '964' + d;
}

// International numbers must reach Twilio in E.164 with a leading '+'.
function toE164(p: string): string {
  const t = (p || '').trim();
  return t.startsWith('+') ? t : '+' + digitsOnly(t);
}

async function deliverViaOtpiq(phone: string, code: string): Promise<Response> {
  const phoneNumber = toIraqiMsisdn(phone);
  const res = await fetch(OTPIQ_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OTPIQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber, smsType: 'verification', verificationCode: code, provider: OTPIQ_PROVIDER }),
  });
  const bodyText = await res.text();
  if (!res.ok) {
    console.error('OTPIQ delivery failed', res.status, bodyText);
    return jsonError(`OTPIQ ${res.status}: ${bodyText}`);
  }
  console.log('OTPIQ accepted OTP for', phoneNumber.slice(0, 6) + '…', 'provider', OTPIQ_PROVIDER);
  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function deliverViaTwilio(phone: string, code: string): Promise<Response> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || (!TWILIO_MESSAGING_SERVICE_SID && !TWILIO_FROM)) {
    console.error('Twilio not configured (missing SID / token / messaging service or from number)');
    return jsonError('international SMS is not configured', 500);
  }
  const to = toE164(phone);
  const params = new URLSearchParams();
  params.set('To', to);
  params.set('Body', `Your verification code is ${code}`);
  if (TWILIO_MESSAGING_SERVICE_SID) params.set('MessagingServiceSid', TWILIO_MESSAGING_SERVICE_SID);
  else params.set('From', TWILIO_FROM);

  const basic = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const bodyText = await res.text();
  if (!res.ok) {
    console.error('Twilio delivery failed', res.status, bodyText);
    return jsonError(`Twilio ${res.status}: ${bodyText}`);
  }
  console.log('Twilio accepted OTP for', to.slice(0, 5) + '…');
  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const payload = await req.text();

  // 1) Verify this really came from Supabase Auth (Standard Webhooks HMAC)
  let user: { phone?: string }; let sms: { otp?: string };
  try {
    const wh = new Webhook(HOOK_SECRET.replace(/^v1,/, ''));
    const headers = Object.fromEntries(req.headers);
    ({ user, sms } = wh.verify(payload, headers) as { user: { phone?: string }; sms: { otp?: string } });
  } catch (e) {
    console.error('signature verification failed:', (e as Error).message);
    return jsonError('invalid signature', 401);
  }

  const rawPhone = user?.phone ?? '';
  const verificationCode = sms?.otp ?? '';
  if (!rawPhone || !/^\d{6}$/.test(verificationCode)) {
    return jsonError('missing phone or otp', 400);
  }

  // 2) Route by country: Iraq → OTPIQ, everything else → Twilio.
  try {
    return isIraqiNumber(rawPhone)
      ? await deliverViaOtpiq(rawPhone, verificationCode)
      : await deliverViaTwilio(rawPhone, verificationCode);
  } catch (e) {
    console.error('SMS delivery error:', (e as Error).message);
    return jsonError('SMS delivery failed');
  }
});
