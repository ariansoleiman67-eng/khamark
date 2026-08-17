// =============================================================================
// Supabase Edge Function: qicard-webhook
// =============================================================================
// Receives webhook POST from QiCard Payment Gateway when a payment status
// changes.
//
// SECURITY: The webhook body is UNTRUSTED. This endpoint is deployed with
// --no-verify-jwt (QiCard has no Supabase session), so anyone could POST a
// forged `status: SUCCESS` here. We therefore NEVER trust the posted status,
// amount or currency. Instead we use the posted paymentId only as a hint and
// re-query QiCard's own status API server-side (with our merchant credentials)
// to obtain the authoritative result, exactly like check-qicard-status does.
// A forged payload cannot mark an order paid because QiCard itself is asked.
//
// QiCard will retry if this endpoint does not return 200 OK.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Ask QiCard directly for the authoritative status of a payment.
// On failure we distinguish TRANSIENT problems (network error / QiCard 5xx),
// where the caller should return a non-200 so QiCard retries the webhook, from
// PERMANENT ones (misconfig / 4xx), where retrying is pointless and the client
// polling path reconciles instead.
type AuthoritativeResult =
  | { ok: true; status: string; amount: unknown; currency: unknown; details?: any; paymentToken?: string }
  | { ok: false; transient: boolean };

async function fetchAuthoritativeStatus(paymentId: string): Promise<AuthoritativeResult> {
  const QICARD_API_HOST = Deno.env.get('QICARD_API_HOST') || 'https://uat-sandbox-3ds-api.qi.iq/api/v1';
  const QICARD_USERNAME = Deno.env.get('QICARD_USERNAME') || '';
  const QICARD_PASSWORD = Deno.env.get('QICARD_PASSWORD') || '';
  const QICARD_TERMINAL_ID = Deno.env.get('QICARD_TERMINAL_ID') || '';

  if (!QICARD_USERNAME || !QICARD_PASSWORD || !QICARD_TERMINAL_ID) {
    console.error('qicard-webhook: gateway credentials not configured — cannot verify');
    return { ok: false, transient: false }; // misconfig — retrying won't help
  }

  const basicAuth = btoa(`${QICARD_USERNAME}:${QICARD_PASSWORD}`);
  try {
    const resp = await fetch(`${QICARD_API_HOST}/payment/${encodeURIComponent(paymentId)}/status`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'X-Terminal-Id': QICARD_TERMINAL_ID,
      },
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error(`qicard-webhook: QiCard status query failed (${resp.status}):`, JSON.stringify(data));
      // 5xx from QiCard is transient (retry); 4xx is permanent (bad/unknown id).
      return { ok: false, transient: resp.status >= 500 };
    }
    return {
      ok: true,
      status: data.status,
      amount: data.amount,
      currency: data.currency,
      details: data.details,
      paymentToken: data.paymentToken,
    };
  } catch (err) {
    console.error('qicard-webhook: error querying QiCard status:', err);
    return { ok: false, transient: true }; // network error — worth a retry
  }
}

Deno.serve(async (req: Request) => {
  // Only accept POST
  if (req.method !== 'POST') {
    return new Response('OK', { status: 200 }); // Don't return errors for non-POST to avoid QiCard retries
  }

  try {
    const payload = await req.json();

    console.log('QiCard webhook received:', JSON.stringify(payload));

    // The paymentId is the only security-relevant field we take from the
    // (untrusted) body. paymentToken/details are non-critical enrichment used
    // only to label a saved card, and only after QiCard itself confirms SUCCESS.
    const paymentId = payload?.paymentId;
    if (!paymentId) {
      console.error('Webhook missing paymentId');
      return new Response('OK', { status: 200 }); // Return 200 to stop retries
    }
    // Strictly validate the shape before it touches any query/URL — this value
    // is attacker-controlled and must never be interpolated as filter syntax.
    if (typeof paymentId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(paymentId)) {
      console.error('Webhook invalid paymentId format');
      return new Response('OK', { status: 200 });
    }
    const bodyPaymentToken: string | undefined = payload?.paymentToken;
    const bodyDetails: any = payload?.details;

    // ── Re-query QiCard for the AUTHORITATIVE result (anti-forgery) ──
    const authoritative = await fetchAuthoritativeStatus(paymentId);
    if (!authoritative.ok) {
      // Could not verify with QiCard. On a transient failure return 503 so
      // QiCard retries the webhook; on a permanent one return 200 and let the
      // client polling path (check-qicard-status) reconcile.
      return new Response(
        authoritative.transient ? 'Temporarily unavailable' : 'OK',
        { status: authoritative.transient ? 503 : 200 },
      );
    }

    const status: string = authoritative.status;
    const amount = authoritative.amount;
    const currency = authoritative.currency;
    const details = authoritative.details ?? bodyDetails;
    const paymentToken = authoritative.paymentToken ?? bodyPaymentToken;

    // ── Initialize Supabase client (service role) ──
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Find the order by qi payment ID ──
    // We stored the paymentId in payment_method.transactionId (and extra_data).
    const { data: orders } = await supabase
      .from('orders')
      .select('id, order_number, payment_status, extra_data, user_id, total_usd, total_iqd, exchange_rate, currency')
      .eq('payment_method->>transactionId', paymentId)
      .limit(1);

    let order = orders?.[0];

    // Fallback: search in extra_data jsonb
    if (!order) {
      const { data: fallbackOrders } = await supabase
        .from('orders')
        .select('id, order_number, payment_status, extra_data, user_id, total_usd, total_iqd, exchange_rate, currency')
        .filter('extra_data->qiCardPayment->>paymentId', 'eq', paymentId)
        .limit(1);
      order = fallbackOrders?.[0];
    }

    if (!order) {
      console.error(`No order found for QiCard paymentId: ${paymentId}`);
      return new Response('OK', { status: 200 }); // Return 200 to stop retries
    }

    // ── Idempotency: skip if already settled as paid ──
    if (order.payment_status === 'paid' && status === 'SUCCESS') {
      console.log(`Order ${order.id} already marked as paid, skipping webhook`);
      return new Response('OK', { status: 200 });
    }

    // ── Defense-in-depth amount/currency check against the AUTHORITATIVE data ──
    // (`status` is a plain let, so it can be safely downgraded on mismatch.)
    let effectiveStatus = status;
    if (effectiveStatus === 'SUCCESS') {
      // An order containing a product priced in dinar carries the exact dinar total it
      // was written with. Re-deriving it from total_usd x exchange_rate would re-apply
      // the rate and the 250-IQD snap to a figure the shop typed, so the charge could
      // differ from what the customer agreed to. NULL on every order without such a
      // product, which keeps the original arithmetic.
      const expectedAmountIQD = order.total_iqd != null && Number(order.total_iqd) > 0
        ? Number(order.total_iqd)
        : Math.round((order.total_usd * order.exchange_rate) * 1000) / 1000;
      const actualAmount = Number(amount);
      if (!Number.isFinite(actualAmount) || Math.abs(actualAmount - expectedAmountIQD) > 0.5) {
        console.error(`[SECURITY ALERT] Order ${order.id}: Amount mismatch! Expected ${expectedAmountIQD}, got ${amount}`);
        effectiveStatus = 'FAILED';
      }
      if (currency !== 'IQD') {
        console.error(`[SECURITY ALERT] Order ${order.id}: Currency mismatch! Expected IQD, got ${currency}`);
        effectiveStatus = 'FAILED';
      }
    }

    // ── Map QiCard status to our payment status ──
    let newPaymentStatus: string;
    let newOrderStatus: string | undefined;

    switch (effectiveStatus) {
      case 'SUCCESS':
        newPaymentStatus = 'paid';
        newOrderStatus = 'confirmed';
        break;
      case 'FAILED':
      case 'AUTHENTICATION_FAILED':
        newPaymentStatus = 'failed';
        break;
      default:
        // CREATED or unknown — don't change
        console.log(`QiCard status ${effectiveStatus} — no order update needed`);
        return new Response('OK', { status: 200 });
    }

    // ── Update the order ──
    const updateData: Record<string, unknown> = {
      payment_status: newPaymentStatus,
      payment_method: {
        type: 'qi_card',
        status: newPaymentStatus,
        transactionId: paymentId,
      },
      extra_data: {
        ...(order.extra_data || {}),
        qiCardPayment: {
          ...(order.extra_data?.qiCardPayment || {}),
          status: effectiveStatus,
          webhookReceivedAt: new Date().toISOString(),
          confirmedAmount: amount,
          details: details || null,
        },
      },
    };

    if (newOrderStatus) {
      updateData.status = newOrderStatus;
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', order.id);

    if (updateError) {
      console.error('Failed to update order from webhook:', updateError);
      // Still return 200 — check-qicard-status can reconcile as a fallback.
    } else {
      console.log(`Order ${order.id} updated: paymentStatus=${newPaymentStatus}, orderStatus=${newOrderStatus || 'unchanged'}`);
    }

    // ── Save Token for Future Checkouts (only on verified success) ──
    if (effectiveStatus === 'SUCCESS' && paymentToken && order.user_id) {
      const cardMask = details?.maskedPan || 'Unknown Card';
      const paymentSystem = details?.paymentSystem || 'Unknown';

      const { error: tokenError } = await supabase
        .from('saved_cards')
        .upsert(
          {
            user_id: order.user_id,
            payment_token: paymentToken,
            card_mask: cardMask,
            payment_system: paymentSystem,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'payment_token' },
        );

      if (tokenError) {
        console.error('Failed to save payment token:', tokenError);
      } else {
        console.log(`Saved payment token for user ${order.user_id}`);
      }
    }

    // ── Send push notification on verified successful payment ──
    if (effectiveStatus === 'SUCCESS' && order.user_id) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        await fetch(`${supabaseUrl}/functions/v1/send-push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            userIds: [order.user_id],
            title: 'Payment Successful ✅',
            body: `Your payment for order ${order.order_number} has been confirmed.`,
            data: {
              type: 'order',
              orderId: order.id,
            },
          }),
        });
      } catch (pushErr) {
        console.error('Failed to send push notification:', pushErr);
        // Non-fatal — order is already updated
      }
    }

    return new Response('OK', { status: 200 });

  } catch (err) {
    console.error('qicard-webhook error:', err);
    // Return 200 even on error to prevent infinite retries
    return new Response('OK', { status: 200 });
  }
});
