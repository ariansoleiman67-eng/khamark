// =============================================================================
// Supabase Edge Function: check-qicard-status
// =============================================================================
// Polls the QiCard API for the current payment status. Used as a fallback
// when the webhook is delayed or the app needs immediate status after the
// WebView redirect.
//
// Request body: { paymentId: string }
// Response:     { status, paymentId, amount, canceled, ... }
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const { paymentId } = await req.json();

    if (!paymentId) {
      return new Response(
        JSON.stringify({ error: 'paymentId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    // Strictly validate shape before it touches any query/URL (never interpolate
    // caller-controlled input as PostgREST filter syntax).
    if (typeof paymentId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(paymentId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid paymentId' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── Authenticate the caller (verify_jwt is satisfied by the anon key, so we
    // must validate a real user session and later enforce order ownership). ──
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── Read QiCard credentials ──
    const QICARD_API_HOST = Deno.env.get('QICARD_API_HOST') || 'https://uat-sandbox-3ds-api.qi.iq/api/v1';
    const QICARD_USERNAME = Deno.env.get('QICARD_USERNAME') || '';
    const QICARD_PASSWORD = Deno.env.get('QICARD_PASSWORD') || '';
    const QICARD_TERMINAL_ID = Deno.env.get('QICARD_TERMINAL_ID') || '';

    if (!QICARD_USERNAME || !QICARD_PASSWORD || !QICARD_TERMINAL_ID) {
      return new Response(
        JSON.stringify({ error: 'Payment gateway not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── Encode Basic Auth ──
    const basicAuth = btoa(`${QICARD_USERNAME}:${QICARD_PASSWORD}`);

    // ── Call QiCard GET status API ──
    const qiResponse = await fetch(`${QICARD_API_HOST}/payment/${encodeURIComponent(paymentId)}/status`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'X-Terminal-Id': QICARD_TERMINAL_ID,
      },
    });

    const qiData = await qiResponse.json();

    if (!qiResponse.ok) {
      console.error('QiCard status check error:', JSON.stringify(qiData));
      return new Response(
        JSON.stringify({
          error: qiData?.error?.description || 'Failed to check payment status',
          code: qiData?.error?.code || 0,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── If status is SUCCESS or FAILED, also update the order in our DB ──
    // (in case the webhook hasn't arrived yet)
    if (qiData.status === 'SUCCESS' || qiData.status === 'FAILED' || qiData.status === 'AUTHENTICATION_FAILED') {
      try {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        // Find the order
        const { data: orders } = await supabase
          .from('orders')
          .select('id, payment_status, extra_data, total_usd, exchange_rate, user_id')
          .eq('payment_method->>transactionId', paymentId)
          .limit(1);

        let order = orders?.[0];
        if (!order) {
          const { data: fallbackOrders } = await supabase
            .from('orders')
            .select('id, payment_status, extra_data, total_usd, exchange_rate, user_id')
            .filter('extra_data->qiCardPayment->>paymentId', 'eq', paymentId)
            .limit(1);
          order = fallbackOrders?.[0];
        }

        // Ownership check (prevent IDOR): only the order's owner may sync it.
        if (order && order.user_id !== user.id) {
          return new Response(
            JSON.stringify({ error: 'Forbidden' }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (order && order.payment_status !== 'paid') {
          // ── SECURITY VALIDATION ──
          const expectedAmountIQD = Math.round((order.total_usd * order.exchange_rate) * 1000) / 1000;
          const actualAmount = Number(qiData.amount);
          
          if (qiData.status === 'SUCCESS') {
            if (Math.abs(actualAmount - expectedAmountIQD) > 0.5) {
              console.error(`[SECURITY ALERT] Polling Order ${order.id}: Amount mismatch! Expected ${expectedAmountIQD}, got ${actualAmount}`);
              qiData.status = 'FAILED';
            }
            if (qiData.currency !== 'IQD') {
              console.error(`[SECURITY ALERT] Polling Order ${order.id}: Currency mismatch!`);
              qiData.status = 'FAILED';
            }
          }

          const newPaymentStatus = qiData.status === 'SUCCESS' ? 'paid' : 'failed';
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
                status: qiData.status,
                statusCheckedAt: new Date().toISOString(),
              },
            },
          };

          if (qiData.status === 'SUCCESS') {
            updateData.status = 'confirmed';
          }

          await supabase.from('orders').update(updateData).eq('id', order.id);
          console.log(`Order ${order.id} updated via status check: ${newPaymentStatus}`);
        }
      } catch (dbErr) {
        console.error('Failed to update order during status check:', dbErr);
        // Non-fatal — we still return the status to the app
      }
    }

    // ── Return status to the app ──
    return new Response(
      JSON.stringify({
        paymentId: qiData.paymentId,
        requestId: qiData.requestId,
        status: qiData.status,
        canceled: qiData.canceled,
        amount: qiData.amount,
        currency: qiData.currency,
        creationDate: qiData.creationDate,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('check-qicard-status error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
