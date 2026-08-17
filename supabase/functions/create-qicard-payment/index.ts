// =============================================================================
// Supabase Edge Function: create-qicard-payment
// =============================================================================
// Creates a payment in the QiCard Payment Gateway and returns the formUrl
// for the mobile app to open in a WebView.
//
// Request body: { orderId: string, amountIQD: number, customerInfo?: object }
// Response:     { paymentId, requestId, formUrl, status }
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  // Only accept POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const { orderId, amountIQD, customerInfo, needPaymentToken, paymentToken, accountId, locale } = await req.json();
    // Map app language -> QiCard hosted-page locale (defaults to English).
    const qiLocale = locale === 'ar' || locale === 'ku' ? 'ar_IQ' : 'en_US';

    if (!orderId) {
      return new Response(
        JSON.stringify({ error: 'orderId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── Read QiCard credentials from Supabase secrets ──
    const QICARD_API_HOST = Deno.env.get('QICARD_API_HOST') || 'https://uat-sandbox-3ds-api.qi.iq/api/v1';
    const QICARD_USERNAME = Deno.env.get('QICARD_USERNAME') || '';
    const QICARD_PASSWORD = Deno.env.get('QICARD_PASSWORD') || '';
    const QICARD_TERMINAL_ID = Deno.env.get('QICARD_TERMINAL_ID') || '';

    if (!QICARD_USERNAME || !QICARD_PASSWORD || !QICARD_TERMINAL_ID) {
      console.error('QiCard credentials not configured');
      return new Response(
        JSON.stringify({ error: 'Payment gateway not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── Initialize Supabase client ──
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Authenticate the caller ──
    // The gateway's verify_jwt is satisfied by the public anon key, so we must
    // validate a REAL user session here and bind the payment to its owner.
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── Verify the order exists ──
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, total_usd, total_iqd, currency, exchange_rate, payment_status, status, user_id')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: 'Order not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── Ownership check (prevent IDOR) ──
    if (order.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── Prevent double payment ──
    if (order.payment_status === 'paid') {
      return new Response(
        JSON.stringify({ error: 'Order is already paid' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── Generate unique requestId ──
    const requestId = crypto.randomUUID();

    // ── Build the webhook + return URLs on the merchant's OWN domain ──
    // QiCard rejects *.supabase.co and requires both URLs under the company
    // domain. QICARD_PUBLIC_BASE (e.g. https://ASANKARY_DOMAIN_TBD) fronts the
    // Supabase functions through a Cloudflare Worker proxy
    // (cloudflare/qicard-proxy-worker.js):
    //   {base}/qicard-webhook    -> functions/v1/qicard-webhook
    //   {base}/payment-complete  -> functions/v1/payment-complete
    // Falls back to the raw Supabase host when the env isn't set (local/dev).
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const publicBase = (Deno.env.get('QICARD_PUBLIC_BASE') || '').replace(/\/+$/, '');
    const webhookUrl = publicBase
      ? `${publicBase}/qicard-webhook`
      : `${supabaseUrl}/functions/v1/qicard-webhook`;
    // Same host as the webhook (QiCard's one-domain rule) and a real 200 page so
    // the return URL resolves. The app still intercepts it by the
    // "payment-complete" substring before the WebView loads.
    const finishPaymentUrl = publicBase
      ? `${publicBase}/payment-complete`
      : `${supabaseUrl}/functions/v1/payment-complete`;

    // ── Compute the charge amount SERVER-SIDE from the order (never trust the
    // client-supplied amountIQD, which a caller could tamper to underpay). This
    // matches the client's convertToIQD (Math.round(total_usd * exchange_rate))
    // and what the webhook / status endpoints validate against. ──
    // An order containing a product priced in dinar carries the exact dinar total it
    // was written with. Re-deriving it from total_usd x exchange_rate would re-apply
    // the rate and the 250-IQD snap to a figure the shop typed, so the charge could
    // differ from what the customer agreed to. NULL on every order without such a
    // product, which keeps the original arithmetic.
    const formattedAmount = order.total_iqd != null && Number(order.total_iqd) > 0
      ? Number(order.total_iqd)
      : Math.round((order.total_usd || 0) * (order.exchange_rate || 0));
    if (!(formattedAmount > 0)) {
      return new Response(
        JSON.stringify({ error: 'Order amount could not be determined' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── Build QiCard create payment request ──
    const qiPayload: Record<string, unknown> = {
      requestId,
      amount: formattedAmount,
      currency: 'IQD',
      locale: qiLocale,
      finishPaymentUrl,
      notificationUrl: webhookUrl,
      appChannel: false, // WebView-based, not native SDK
    };

    if (needPaymentToken && accountId) {
      qiPayload.needPaymentToken = true;
      qiPayload.tokenType = 'AUTH';
      if (!qiPayload.customerInfo) {
        qiPayload.customerInfo = { accountId: accountId };
      } else {
        (qiPayload.customerInfo as any).accountId = accountId;
      }
    }

    if (paymentToken) {
      qiPayload.paymentType = 'PAYMENT_TOKEN';
      qiPayload.paymentToken = paymentToken;
    }

    // Add optional customer info if provided
    if (customerInfo) {
      qiPayload.customerInfo = customerInfo;
    }

    // Add order reference in additionalInfo
    qiPayload.additionalInfo = {
      orderId: orderId,
      orderNumber: order.order_number,
    };

    // ── Encode Basic Auth ──
    const basicAuth = btoa(`${QICARD_USERNAME}:${QICARD_PASSWORD}`);

    // ── Call QiCard API ──
    console.log(`Creating QiCard payment for order ${orderId}, amount: ${formattedAmount} IQD`);

    const qiResponse = await fetch(`${QICARD_API_HOST}/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${basicAuth}`,
        'X-Terminal-Id': QICARD_TERMINAL_ID,
      },
      body: JSON.stringify(qiPayload),
    });

    const qiData = await qiResponse.json();

    if (!qiResponse.ok) {
      console.error('QiCard API error:', JSON.stringify(qiData));
      const errorDesc = qiData?.error?.description || 'Payment creation failed';
      const errorCode = qiData?.error?.code || 0;
      return new Response(
        JSON.stringify({ error: errorDesc, code: errorCode }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── Store QiCard payment reference on the order ──
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        payment_status: 'awaiting_payment',
        payment_method: {
          type: 'qi_card',
          status: 'awaiting_payment',
          transactionId: qiData.paymentId,
        },
        extra_data: supabase.rpc ? undefined : {
          // We merge into existing extra_data
        },
      })
      .eq('id', orderId);

    // Also merge qi payment info into extra_data without overwriting existing data
    await supabase.rpc('jsonb_merge_extra_data', {
      p_order_id: orderId,
      p_data: {
        qiCardPayment: {
          paymentId: qiData.paymentId,
          requestId: requestId,
          formUrl: qiData.formUrl,
          status: qiData.status,
          createdAt: qiData.creationDate,
        },
      },
    }).then(() => {}).catch(async () => {
      // Fallback: if RPC doesn't exist, do a direct update
      const { data: existing } = await supabase
        .from('orders')
        .select('extra_data')
        .eq('id', orderId)
        .single();
      
      const mergedExtra = {
        ...(existing?.extra_data || {}),
        qiCardPayment: {
          paymentId: qiData.paymentId,
          requestId: requestId,
          formUrl: qiData.formUrl,
          status: qiData.status,
          createdAt: qiData.creationDate,
        },
      };

      await supabase
        .from('orders')
        .update({
          payment_status: 'awaiting_payment',
          payment_method: {
            type: 'qi_card',
            status: 'awaiting_payment',
            transactionId: qiData.paymentId,
          },
          extra_data: mergedExtra,
        })
        .eq('id', orderId);
    });

    if (updateError) {
      console.error('Failed to update order with QiCard info:', updateError);
      // Don't fail the request — the payment was created successfully
    }

    console.log(`QiCard payment created: ${qiData.paymentId} for order ${orderId}`);

    // ── Return payment info to app ──
    return new Response(
      JSON.stringify({
        paymentId: qiData.paymentId,
        requestId: requestId,
        formUrl: qiData.formUrl,
        status: qiData.status,
        amount: qiData.amount,
        currency: qiData.currency,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('create-qicard-payment error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
