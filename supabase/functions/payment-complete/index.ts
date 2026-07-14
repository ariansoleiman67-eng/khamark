// =============================================================================
// Supabase Edge Function: payment-complete
// =============================================================================
// Static 200 landing page used as QiCard's finishPaymentUrl.
//
// The app's WebView intercepts any URL containing "payment-complete" BEFORE it
// loads (QiCardPaymentScreen.onShouldStartLoadWithRequest → returns false), so a
// real user never actually sees this page. It exists so the return URL:
//   1. sits on the SAME host as the webhook (QiCard requires one shared domain), and
//   2. resolves to a genuine 200 instead of the API gateway's
//      {"error":"requested path is invalid"} — which QiCard could reject.
//
// Deploy PUBLIC: `supabase functions deploy payment-complete --no-verify-jwt`
// (QiCard / the browser hit it with no Supabase JWT).
// =============================================================================

const HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Payment complete</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0B1F4D;color:#fff;text-align:center}
  .c{padding:24px}.m{font-size:56px;line-height:1}
  .t{font-size:20px;font-weight:700;margin:14px 0 6px}
  .s{font-size:14px;opacity:.8}
</style></head>
<body><div class="c">
  <div class="m">&#9989;</div>
  <div class="t">Payment complete</div>
  <div class="s">You can return to the Asankary app.</div>
</div></body></html>`;

Deno.serve(() =>
  new Response(HTML, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
);
