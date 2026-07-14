// =============================================================================
// Supabase Edge Function: on-db-change
// =============================================================================
// Replaces the old Firebase Firestore triggers (onOrderCreate / onMessageCreate).
// Invoked by Supabase Database Webhooks on INSERT into `orders` and `messages`.
// Writes an in-app notification row and triggers FCM (via the send-push function).
//
// SETUP:
//   1. Deploy:  supabase functions deploy on-db-change --no-verify-jwt
//      (--no-verify-jwt because the DB webhook authenticates via the service-role
//       key in the Authorization header, which this function trusts implicitly;
//       it is only reachable with that header from the webhook.)
//   2. Dashboard → Database → Webhooks → Create:
//        a) Name: notify_on_order   | Table: orders   | Events: Insert
//           Type: Supabase Edge Function → on-db-change
//        b) Name: notify_on_message | Table: messages | Events: Insert
//           Type: Supabase Edge Function → on-db-change
//      (The dashboard auto-attaches the service-role key.)
//
// Webhook payload: { type: 'INSERT', table, schema, record, old_record }
// =============================================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: Record<string, any> | null;
  old_record: Record<string, any> | null;
}

async function notify(
  supabase: SupabaseClient,
  userIds: string[],
  title: string,
  body: string,
  type: string,
  data: Record<string, unknown>,
): Promise<void> {
  const targets = userIds.filter(Boolean);
  if (targets.length === 0) return;

  // 1. In-app notification rows (delivered instantly via the client's realtime sub)
  await supabase.from('notifications').insert(
    targets.map((uid) => ({ user_id: uid, title, body, type, data })),
  );

  // 2. FCM lock-screen push (reuse the send-push function — single place for FCM logic)
  try {
    await supabase.functions.invoke('send-push', {
      body: { userIds: targets, title, body, data: { type, ...data } },
    });
  } catch (_err) {
    // push is best-effort; the in-app notification already landed
  }
}

Deno.serve(async (req: Request) => {
  const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200 });

  try {
    const payload = (await req.json()) as WebhookPayload;
    if (payload.type !== 'INSERT' || !payload.record) return ok();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    if (payload.table === 'orders') {
      const order = payload.record;
      // tenant_id references users(id) — the admin/owner user is the tenant.
      const adminId = order.tenant_id;
      if (adminId) {
        await notify(
          supabase,
          [adminId],
          'New order',
          `Order ${order.order_number ?? ''} • $${order.total_usd ?? 0}`,
          'order',
          { orderId: order.id },
        );
      }
    } else if (payload.table === 'messages') {
      const msg = payload.record;
      const { data: conv } = await supabase
        .from('conversations')
        .select('user_id, admin_id')
        .eq('id', msg.conversation_id)
        .single();

      if (conv) {
        // Notify the OTHER participant (not the sender).
        const recipientId = msg.sender_type === 'admin' ? conv.user_id : conv.admin_id;
        if (recipientId) {
          // Build a clean, short body. Branch on type FIRST — the `text` column
          // can hold an image/file URL or a long product blob, which must never
          // be shown raw in the notification.
          let body: string;
          switch (msg.type) {
            case 'image': body = '📷 Photo'; break;
            case 'voice': body = '🎤 Voice message'; break;
            case 'file':  body = '📎 Attachment'; break;
            case 'product': body = '🛍️ Product'; break;
            default: {
              const t = (msg.text ?? '').trim();
              if (t.startsWith('{')) {
                // JSON payload embedded in a text message (e.g. a shared product) —
                // never show the raw blob.
                body = t.includes('"id"') && t.includes('"name"') ? '🛍️ Product' : 'New message';
              } else if (!t || /^https?:\/\//i.test(t)) {
                body = msg.attachment_url ? '📎 Attachment' : 'New message';
              } else {
                body = t.length > 120 ? t.slice(0, 119) + '…' : t;
              }
            }
          }
          await notify(
            supabase,
            [recipientId],
            msg.sender_name || 'New message',
            body,
            'chat',
            { conversationId: msg.conversation_id },
          );
        }
      }
    }

    return ok();
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
