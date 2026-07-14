// =============================================================================
// Cloudflare Worker: QiCard domain proxy
// =============================================================================
// QiCard requires the payment URLs to live on the merchant's own domain
// (ASANKARY_DOMAIN_TBD), not *.supabase.co. This Worker reverse-proxies two
// branded paths to the Supabase Edge Functions, keeping ASANKARY_DOMAIN_TBD as
// the host QiCard sees while the real logic still runs on Supabase:
//
//   https://ASANKARY_DOMAIN_TBD/qicard-webhook     -> .../functions/v1/qicard-webhook
//   https://ASANKARY_DOMAIN_TBD/payment-complete   -> .../functions/v1/payment-complete
//
// A reverse proxy (not a redirect) is required: QiCard POSTs to the webhook and
// must keep seeing ASANKARY_DOMAIN_TBD; a 301/302 would bounce it back to
// supabase.co and defeat the requirement.
//
// Deploy: Cloudflare dashboard → Workers & Pages → Create Worker → paste this →
// Deploy. Then add two Routes on the ASANKARY_DOMAIN_TBD zone:
//   ASANKARY_DOMAIN_TBD/qicard-webhook*     -> this worker
//   ASANKARY_DOMAIN_TBD/payment-complete*   -> this worker
// (and make sure the apex has a proxied/orange-cloud DNS record so Cloudflare
// handles the hostname — a dummy A record 192.0.2.1 proxied is fine).
// =============================================================================

const SUPABASE_ORIGIN = 'https://REPLACE_WITH_ASANKARY_SUPABASE_PROJECT_REF.supabase.co';

const ROUTES = {
  '/qicard-webhook': '/functions/v1/qicard-webhook',
  '/payment-complete': '/functions/v1/payment-complete',
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const mapped = ROUTES[url.pathname];

    if (!mapped) {
      return new Response('Not found', { status: 404 });
    }

    // Rebuild the target URL on the Supabase origin, preserving the query string.
    const target = new URL(SUPABASE_ORIGIN);
    target.pathname = mapped;
    target.search = url.search;

    // Forward method, headers, and body unchanged. new Request(target, request)
    // copies them; fetch sets the correct Host for the Supabase origin.
    const proxied = new Request(target.toString(), request);
    return fetch(proxied);
  },
};
