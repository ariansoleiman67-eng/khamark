// =============================================================================
// Supabase Edge Function: on-db-change
// =============================================================================
// Replaces the old Firebase Firestore triggers (onOrderCreate / onMessageCreate).
// Invoked on INSERT into `orders`, `messages` and `trade_in_requests`.
// Writes an in-app notification row and triggers FCM (via the send-push function).
//
// WIRED BY SQL TRIGGERS, NOT DASHBOARD WEBHOOKS. Database Webhooks were never
// enabled on this project (the `supabase_functions` schema does not exist), so
// the dashboard steps below could not be followed and NOTHING invoked this
// function — orders, messages and trade-ins all produced silence. The triggers
// now live in supabase/migrations/*_notification_triggers.sql and call this
// function through pg_net directly.
//
// SETUP:
//   1. Deploy:  supabase functions deploy on-db-change --no-verify-jwt
//      (--no-verify-jwt because the pg_net trigger sends no Authorization header.
//       That makes the URL public, which is why the payload is not trusted —
//       see "THE PAYLOAD IS A POINTER" below.)
//   2. Dashboard → Database → Webhooks → Create:
//        a) Name: notify_on_order   | Table: orders   | Events: Insert
//           Type: Supabase Edge Function → on-db-change
//        b) Name: notify_on_message | Table: messages | Events: Insert
//           Type: Supabase Edge Function → on-db-change
//      (The dashboard auto-attaches the service-role key.)
//
// Webhook payload: { type: 'INSERT', table, schema, record, old_record }
//
// THE PAYLOAD IS A POINTER, NOT THE DATA. The SQL trigger calls this with no
// Authorization header at all, so anything that can reach the URL can send a
// payload — and this used to build the notification straight from it: any text,
// to any user id, from the service role. Now only `table` and `record.id` are
// read from the request. The row is re-read from the database and the
// notification is built from THAT, so a forged payload can at most point at a
// real row, and each row is notified once (see alreadyNotified), so it cannot
// be replayed into a flood either.
// =============================================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: Record<string, any> | null;
  old_record: Record<string, any> | null;
}

const NOTIFIED_TABLES = new Set(['orders', 'messages', 'trade_in_requests']);

// One notification per row and recipient. Matched on the same data object
// written below ({ orderId }, { conversationId, messageId }, { tradeInId }), and
// scoped to these recipients and this type: the app writes its own notifications
// that carry an orderId too (status updates to the customer), and one of those
// must never suppress the shop's "New order".
async function alreadyNotified(
  supabase: SupabaseClient,
  userIds: string[],
  type: string,
  once: Record<string, string>,
): Promise<boolean> {
  const { data } = await supabase
    .from('notifications')
    .select('id')
    .in('user_id', userIds)
    .eq('type', type)
    .contains('data', once)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

async function notify(
  supabase: SupabaseClient,
  userIds: string[],
  title: string,
  body: string,
  type: string,
  data: Record<string, string>,
): Promise<void> {
  const targets = userIds.filter(Boolean);
  if (targets.length === 0) return;
  if (await alreadyNotified(supabase, targets, type, data)) return;

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
    if (!NOTIFIED_TABLES.has(payload.table)) return ok();

    const rowId = String(payload.record.id ?? '');
    if (!rowId) return ok();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Everything below reads `row`, never payload.record. A malformed id makes
    // the lookup fail, which is the same as no row: nothing is sent.
    const { data: row } = await supabase.from(payload.table).select('*').eq('id', rowId).maybeSingle();
    if (!row) return ok();

    if (payload.table === 'orders') {
      const order = row;
      // tenant_id references users(id) — the admin/owner user is the tenant.
      const adminId = order.tenant_id;
      if (adminId) {
        await notify(
          supabase,
          [adminId],
          'New order',
          `Order ${order.order_number ?? ''} • $${order.total_usd ?? 0}`,
          'order',
          { orderId: String(order.id) },
        );
      }
    } else if (payload.table === 'messages') {
      const msg = row;
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
            { conversationId: String(msg.conversation_id), messageId: String(msg.id) },
          );
        }
      }
    } else if (payload.table === 'trade_in_requests') {
      const request = row;
      // trade_in_requests.tenant_id holds the shop owner's user id, the same
      // convention orders uses, so the owner is the notification target.
      const adminId = request.tenant_id;
      if (adminId) {
        const device = [request.device_brand, request.device_model]
          .filter(Boolean)
          .join(' ')
          .trim();
        await notify(
          supabase,
          [adminId],
          'New trade-in request',
          device
            ? `${device}${request.contact_name ? ` — ${request.contact_name}` : ''}`
            : 'A customer wants to sell or trade a phone',
          'trade_in',
          { tradeInId: String(request.id) },
        );
      }
    }

    return ok();
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
