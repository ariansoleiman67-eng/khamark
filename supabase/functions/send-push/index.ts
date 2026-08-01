// =============================================================================
// Supabase Edge Function: send-push
// =============================================================================
// FCM lock-screen delivery for admin notifications, on Supabase (replaces the
// old Firebase Cloud Function fan-out). Reads each target user's fcm_token from
// Supabase and sends via the FCM HTTP v1 API using a Google service account.
//
// SETUP (one-time, run locally with your Supabase login):
//   1. In the Firebase console → Project Settings → Service accounts → Generate
//      new private key. You get a JSON file.
//   2. Set it as a secret (single line):
//        supabase secrets set FCM_SERVICE_ACCOUNT="$(cat service-account.json)"
//   3. Deploy:
//        supabase functions deploy send-push
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// Request body: { userIds: string[], title: string, body: string, data?: object }
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

// ---- Google OAuth2 access token from a service account (RS256 JWT) ----------
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function base64url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)),
  );
  const jwt = `${unsigned}.${base64url(sig)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`OAuth token error: ${JSON.stringify(json)}`);
  return json.access_token;
}

Deno.serve(async (req: Request) => {
  try {
    const { userIds, title, body, data } = await req.json();
    if (!Array.isArray(userIds) || userIds.length === 0 || !title) {
      return new Response(JSON.stringify({ error: 'userIds[] and title required' }), { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ---------------------------------------------------------------------
    // Honour the in-app "Push Notifications" switch.
    //
    // The app stores that preference per device in `devices.notifications_enabled`
    // (NotificationService.setDevicePushEnabled). This function used to read only
    // users.fcm_token and push_tokens, neither of which carries the flag — so
    // turning the switch off changed nothing and alerts kept arriving.
    //
    // Two rules, because a token can be reached by more than one route:
    //   1. Drop any token belonging to a device that is explicitly disabled.
    //   2. If a user has device rows and EVERY one of them is disabled, drop that
    //      user's tokens entirely — users.fcm_token and push_tokens can hold a
    //      stale token that no longer matches any current device row, and without
    //      this that stale copy would keep delivering.
    // A user with no device rows at all is left alone and still receives: absence
    // of a row means "never expressed a preference", not "opted out".
    // ---------------------------------------------------------------------
    const { data: deviceRows } = await supabase
      .from('devices')
      .select('uid, fcm_token, notifications_enabled, is_active')
      .in('uid', userIds);

    const disabledTokens = new Set<string>();
    const hasAnyDevice = new Set<string>();
    const hasEnabledDevice = new Set<string>();

    (deviceRows || []).forEach((d: { uid: string | null; fcm_token: string | null; notifications_enabled: boolean | null; is_active: boolean | null }) => {
      if (!d.uid) return;
      // A retired device still counts for "disabled" (its token must not receive)
      // but must NOT count as an enabled device, or one stale row left over from an
      // old handset would keep a user deliverable after they switched push off on
      // the phone they actually use.
      const retired = d.is_active === false;
      if (d.notifications_enabled === false) {
        hasAnyDevice.add(d.uid);
        if (d.fcm_token) disabledTokens.add(d.fcm_token);
      } else if (!retired) {
        hasAnyDevice.add(d.uid);
        hasEnabledDevice.add(d.uid);
      }
    });

    const optedOutUsers = new Set(
      [...hasAnyDevice].filter((uid) => !hasEnabledDevice.has(uid)),
    );

    const deliverableUserIds = userIds.filter((id: string) => !optedOutUsers.has(id));
    if (deliverableUserIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, note: 'all targets have push disabled' }), { status: 200 });
    }

    // Collect FCM tokens for the target users (users.fcm_token + active push_tokens),
    // remembering which language each token belongs to so the lock-screen banner can
    // be sent in the recipient's own language. The admin composer already collects
    // Arabic and Kurdish copies and ships them inside `data`; before this every
    // recipient got the English banner regardless of their app language.
    const tokens = new Set<string>();
    const langByToken = new Map<string, string>();
    const langByUser = new Map<string, string>();

    const { data: users } = await supabase
      .from('users')
      .select('id, fcm_token, language')
      .in('id', deliverableUserIds);
    (users || []).forEach((u: { id: string; fcm_token: string | null; language: string | null }) => {
      const lang = (u.language || 'en').toLowerCase();
      langByUser.set(u.id, lang);
      if (u.fcm_token) {
        tokens.add(u.fcm_token);
        langByToken.set(u.fcm_token, lang);
      }
    });

    const { data: pt } = await supabase
      .from('push_tokens')
      .select('user_id, token')
      .in('user_id', deliverableUserIds)
      .eq('active', true);
    (pt || []).forEach((p: { user_id: string; token: string | null }) => {
      if (!p.token) return;
      tokens.add(p.token);
      langByToken.set(p.token, langByUser.get(p.user_id) || 'en');
    });

    // Rule 1: a device switched off never receives, even when another device of the
    // same user is still on.
    disabledTokens.forEach((tok) => tokens.delete(tok));

    if (tokens.size === 0) {
      return new Response(JSON.stringify({ sent: 0, note: 'no tokens for targets' }), { status: 200 });
    }

    const sa: ServiceAccount = JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT')!);
    const accessToken = await getAccessToken(sa);
    const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

    // Stringify data values — FCM v1 requires all data fields to be strings.
    const stringData: Record<string, string> = {};
    for (const [k, v] of Object.entries(data || {})) {
      if (v != null) stringData[k] = String(v);
    }

    // Localized copies ride in `data` as titleAr/titleKu/bodyAr/bodyKu. A blank or
    // missing translation falls back to the English the admin typed, so a partially
    // translated notification still reaches everyone.
    const localized = (lang: string): { title: string; body: string } => {
      const suffix = lang.startsWith('ar') ? 'Ar' : lang.startsWith('ku') ? 'Ku' : '';
      if (!suffix) return { title, body };
      return {
        title: (stringData[`title${suffix}`] || '').trim() || title,
        body: (stringData[`body${suffix}`] || '').trim() || body,
      };
    };

    let sent = 0;
    let failed = 0;
    await Promise.all(
      [...tokens].map(async (token) => {
        const copy = localized(langByToken.get(token) || 'en');
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: copy.title, body: copy.body },
              data: stringData,
              android: { priority: 'high', notification: { channel_id: 'default_v1' } },
            },
          }),
        });
        if (r.ok) sent++;
        else failed++;
      }),
    );

    return new Response(JSON.stringify({ sent, failed, targets: tokens.size }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
