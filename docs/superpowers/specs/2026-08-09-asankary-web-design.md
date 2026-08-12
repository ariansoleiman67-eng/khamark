# Asankary Web — Design Specification

**Date:** 2026-08-09
**Status:** Awaiting user review
**Target:** `/Users/maci/Desktop/Asankary - Web`
**Companion to:** the Asankary React Native app (`/Users/maci/Desktop/Asankary`)

---

## 1. Goal

A customer storefront on the web for Asankary, sharing the same Supabase project as
the mobile app so that data is live in both directions: a product, price, cart or
order changed in one surface appears in the other without manual sync.

The site must be fast on Iraqi mobile connections, fully trilingual (English /
Arabic / Kurdish) with correct RTL, and visually distinctive.

## 2. Scope

**In scope (v1):**

- Marketplace browsing across all shops, plus per-shop store pages
- Search, category and brand navigation, filters
- Product detail pages (variations, colours, storage options, price tiers, condition)
- Cart shared with the app
- Checkout — **cash on delivery only**
- Accounts: phone OTP, Google, email/password
- Order history and order tracking
- Addresses
- Trilingual UI with RTL

**Explicitly out of scope (v1):**

- Admin dashboard (stays mobile-only)
- Online payment (Qi Card, FIB)
- Apple Sign In
- Chat / messaging
- Trade-in submission
- Favourites — *no `favorites` table exists in Supabase; the app keeps them
  locally. Web favourites would require new schema and is deferred.*

## 3. Decisions taken

| Question | Decision |
|---|---|
| Scope | Full customer storefront |
| Payments | Cash on delivery only |
| Sign-in | Phone OTP + Google + email/password (no Apple) |
| Framework | Next.js 15 App Router, React 19 |
| Hosting | Vercel |
| Backend | The existing Supabase project — no new backend |

## 4. Verified ground truth

Every fact below was read from the repository and independently fact-checked.
Facts marked **(confirm live)** could not be settled from files and are resolved by
running `WEB_READINESS_DIAGNOSTIC.sql` (see §14).

### 4.1 Schema authority

The authoritative schema is `supabase/migrations/*.sql` applied in filename order
(15 files, `20260101000000_initial_schema.sql` → `20260801120000_trade_in_requests.sql`).
Root-level `schema.sql` and `update_schema_*.sql` are a superseded earlier
generation. `SUPABASE_SETUP.sql` is a hand-copied idempotent duplicate of seven
migrations.

**Implication:** generate TypeScript types with `supabase gen types` against the live
database. Do not hand-transcribe from any `.sql` file.

### 4.2 Products (`parts`)

43 columns. Localised in three pairs: `name`/`name_ar`/`name_ku`,
`description`/`description_ar`/`description_ku`, `category`/`category_ar`/`category_ku`.
`brand`, `warranty`, `sku`, `part_number` are **not** localised.

JSONB columns: `price_tiers`, `variations`, `color_variations`, `storage_options`,
`image_urls`, `shipping_rates`, `dimensions`, `specifications`, `extra_data`.

`condition` is DB-constrained to `('new','used','refurbished')`. **`status` has no
DB constraint** — Postgres accepts any string; its three values
(`available`, `coming_soon`, `on_the_way`) exist only as a SQL comment and a
TypeScript union.

**In-stock rule (must be replicated exactly):**

```
inStock = (status == null || status === 'available')
  && (stock_qty > 0
      || variations.some(v => v.stockQuantity > 0)
      || color_variations.some(v => v.stockQuantity > 0))
```

`coming_soon` and `on_the_way` hold *incoming* quantity in `stock_qty` and are not
purchasable.

**Translation fallback (must be replicated exactly):** use
`ar?.trim() ? ar : en`, not a null check. A one-time repair migration nulled copied
translations, but no constraint prevents an English string or `''` being written
back into `name_ar`.

`dimensions` is `{length, width, height}` in code. The SQL comment mentions a `unit`
field that **does not exist** — rendering it would print `undefined`.

### 4.3 Cart

`carts.id` **is** the user id (primary key referencing `users(id)`). One row per
user, holding the items. The website writes to that same row, so the cart is not
copied between app and web — it is literally one cart.

### 4.4 Orders

`createOrderDirectly` inserts: `user_id`, `order_number` (`ORD-${Date.now()}-${rand}`),
`currency` (default `USD`), `exchange_rate` (default `1500`), `items`, `subtotal_usd`,
`shipping_usd`, `tax_usd` (always 0), `discount_usd` (null when 0), `total_usd`,
`payment_method` jsonb, `shipping_address` jsonb (a denormalised PII snapshot).

Customer cancellation is **not** an UPDATE. It calls the SECURITY DEFINER RPC
`cancel_my_order(p_order_id uuid)`, which locks the row, verifies ownership, is
idempotent for already-cancelled orders, rejects any status outside
`('pending','confirmed')`, and restores stock via `move_part_stock`.

### 4.5 Authentication — phone OTP is native Supabase

**This is the single most consequential finding for effort estimation.** Phone OTP
does **not** use Firebase and does **not** call a Cloud Function. The client calls
`supabase.auth.signInWithOtp({ phone })` and
`supabase.auth.verifyOtp({ phone, token, type: 'sms' })`, which returns a real
Supabase session. It therefore works from a browser unchanged.

(The `phone-otp-session` Edge Function that swaps a Firebase token is dead code —
its guard condition is unreachable.)

`public.users` rows are created by a SECURITY DEFINER trigger `on_auth_user_created`
→ `handle_new_user()`, which reads `auth.users.raw_user_meta_data`. The website
passes metadata in `options.data` and must **never** insert the row itself.

Google on web uses `signInWithOAuth({ provider:'google', options:{ redirectTo } })`
plus `exchangeCodeForSession` in a callback route. The site's origin and redirect
URL must be added to both the Supabase allowed-redirect list and the Google Cloud
OAuth client.

**Web Supabase client config** (differs from the app deliberately):

```ts
createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,   // app sets false only because RN has no URL bar
    flowType: 'pkce',
    // no `lock: processLock` — that is the RN substitute for navigator.locks
  },
})
```

Pre-login RPCs the app calls: `account_id_for_phone`, `lookup_login_email`,
`email_exists`. Only `email_exists` and `delete_user` are defined in the repo; the
other two exist solely in the live database **(confirm live)**.

### 4.6 Media

All images live in **one public Supabase Storage bucket, `media`**, at
`https://<project-ref>.supabase.co/storage/v1/object/public/media/<path>`.
20 MB per-file limit.

Two problems the website must solve:

1. **No optimisation exists.** `getOptimizedImageUrl()` returns the URL unchanged;
   no `transform:` option is ever passed and no `/render/image` endpoint is used.
2. **iOS uploads are unresized.** `processImage` early-returns on iOS, so catalogue
   photos taken on an iPhone are full-size camera JPEGs.

Product video also lives in `media` (`videos/...`), max 20 MB / 60 s, no transcoding,
no HLS.

### 4.7 Design tokens (verified values)

| Token | Value |
|---|---|
| Spacing | `xs 4, sm 8, md 16, lg 24, xl 32` |
| Radius (live) | `sm 6, md 12, lg 20, full 9999` |
| Typography | `h1 32/700/40`, `h2 24/700/32`, `h3 20/600/28`, `body 16/400/24`, `caption 14/400/20` |
| Animation | `FAST 200, NORMAL 300, SLOW 500` (ms) |
| Breakpoints | `mobile 0, tablet 768, desktop 1024` |
| Default theme | `amber-retail`, primary `#F5A00A` |

Eight theme presets exist. The app ships **zero custom fonts** — every `fontFamily`
is `System`, `monospace` or `sans-serif`.

### 4.8 i18n

One i18next namespace (`translation`), 51 top-level objects. Languages `en`, `ar`,
`ku`; persisted to `users.language`.

**Known defects the website must not inherit:** 18 keys in `ar.json` and 19 in
`ku.json` hold values byte-identical to English, and `formatDateRelative` returns
hardcoded English. Date formatting maps `ar → ar-IQ`, `ku → ckb-IQ`, which render
Arabic-Indic digits.

## 5. Security — the launch gate

The app's anon key is embedded in a binary. On the web it is visible in every
browser's dev tools, so **Row Level Security and Storage policies become the only
protection**. The audit found the following, which must be fixed **before** the site
is publicly reachable.

| # | Issue | Impact |
|---|---|---|
| S1 | `media` bucket `insert`/`update`/`delete` policies have **no auth condition** | Anyone can delete or replace every product image |
| S2 | `devices` is `permissive_all using(true)` | FCM push tokens keyed to user ids readable and writable by anyone |
| S3 | `promo_codes` is `permissive_all using(true)` | Anyone can read **and create** discount codes |
| S4 | `admin_action_logs` has RLS **never enabled** | Audit log fully exposed |
| S5 | `orders_update` has `USING` but no `WITH CHECK` | A customer can rewrite their own order's `total_usd` after placing it |
| S6 | `users_admin_select` is `using (is_admin())` with no tenant scoping | Any shop owner can read every customer in the marketplace |
| S7 | `parts_write` `WITH CHECK (tenant_id = auth.uid())` | Any signed-in user can publish products into the public catalogue |
| S8 | `RLS_HARDENING.sql` is untracked and absent from `supabase/migrations/` | Not reproducible; unclear whether it is even applied **(confirm live)** |
| S9 | `SUPABASE_SETUP.sql` (tracked, labelled *"idempotent. Paste ALL → Run"*) recreates `permissive_all` on 19 tables | Running the "safe" setup file silently reopens every hardened table |

**Required work:** convert the hardening into a tracked migration, close S1–S7, and
neutralise S9 so the reopening file cannot be run by accident. This is a phase of the
implementation plan, not a footnote.

**Anon must be able to read exactly:** `parts` where `is_active`, plus `categories`,
`brands`, `banners`, `tenants`, `store_locations`, and active `discounts`. Nothing else.

## 6. Architecture

```
Next.js 15 App Router  ·  React 19  ·  TypeScript strict
Tailwind v4  ·  Motion  ·  next-intl
        │
        ├── Server Components ──→ @supabase/ssr server client ──┐
        │   public catalogue, SEO, caching                      │
        │                                                       ├──→ Supabase
        ├── Client Components ──→ browser client (user session) ─┤    (same project
        │   cart, checkout, account, orders                      │     as the app)
        │                                                        │
        └── Realtime channels ──→ postgres_changes ─────────────┘
```

**Three deliberate data paths:**

1. **Public pages render on the server.** Product, category, store and listing pages
   fetch through the server client, are cached, and revalidate on a timer. This gives
   Google indexable HTML and a fast first paint on slow connections.
2. **Personal data renders on the client.** Cart, orders, addresses and account use
   the browser client with the user's session, so per-customer data is never baked
   into a shared cached page.
3. **Live changes arrive over Realtime.** Subscriptions on `carts`, `orders` and
   `parts`.

**Realtime caveat:** a table absent from the `supabase_realtime` publication emits no
events. Which tables are published is **(confirm live)**; adding them is part of the
work if they are not.

Realtime handlers follow the app's dominant pattern — **ignore the payload, refetch**
— except where the app itself reads `payload.new` (cart).

## 7. Business logic to port

These files are pure TypeScript and port with no rewrite:

- `src/utils/pricingUtils.ts` — `getDisplayUnitPrice`, `hasCompareAtDiscount`,
  `getDiscountPercent`, `getEffectiveStock`
- `src/services/discountService.ts` — percent vs USD, bundles, `subtotalForItems`
- `src/utils/tradeIn.ts` (not needed in v1)

These import React Native / AsyncStorage / Expo and must be rewritten for web:
`productService`, `cartService`, `OrderService`, `authService`, `imageService`.

**Rule:** the web must compute price, discount and total identically to the app. A
customer seeing one price on their phone and another on the laptop is a
correctness bug, not a cosmetic one. Ported pricing functions get unit tests that
assert the same outputs as the app's existing `__tests__/utils/pricingUtils.test.ts`.

## 8. Routes

```
/[locale]                          home — banners, categories, featured, brands
/[locale]/search                   search + filters
/[locale]/c/[category]             category listing
/[locale]/b/[brand]                brand listing
/[locale]/p/[id]                   product detail
/[locale]/s/[tenant]               shop home
/[locale]/s/[tenant]/products      shop catalogue
/[locale]/cart                     cart
/[locale]/checkout                 address → review → place (COD)
/[locale]/orders                   order history
/[locale]/orders/[id]              order detail + tracking
/[locale]/account                  profile, addresses, language
/[locale]/auth/sign-in             phone OTP · Google · email
/auth/callback                     OAuth code exchange (not localised)
```

`locale ∈ {en, ar, ku}`, with `ar` and `ku` served `dir="rtl"`.

## 9. Design and motion

**Principle:** distinctive but recognisably Asankary. The amber `#F5A00A` and the
token scales in §4.7 carry over; the web adds what a phone cannot.

- **Typography is the biggest available upgrade.** The app has no custom font. The
  web will use a real typeface with genuine Arabic and Kurdish support (Arabic
  script coverage is a hard requirement, not a nicety), paired with a Latin face.
- **Motion budget.** Durations reuse the app's `200 / 300 / 500`. Every animation
  must respect `prefers-reduced-motion`. Animation may not delay first paint or
  block interaction.
- **Layout.** Card radius `12`, padding `SPACING.md`, `minHeight`/`aspect-ratio`
  over fixed heights — the same rules as `GOLDEN_RULES.md`.
- **Mobile first.** Breakpoints `768 / 1024` match the app's constants.

Visual direction is deliberately not frozen here; it is settled with real mockups
during implementation, against these constraints.

## 10. Performance

Non-negotiable, because catalogue images are currently full-size camera JPEGs:

- All product images go through `next/image` with the Supabase Storage host
  allow-listed in `next.config`, serving AVIF/WebP at device-appropriate widths.
- Supabase image transformation is enabled and used, or a resize step is added at
  upload. **Serving a 20 MB JPEG to a phone on mobile data is not acceptable.**
- Budget: LCP under 2.5 s on a 4× throttled connection.

## 11. Error handling

- Every Supabase call returns `{ data, error }`; `error` is handled explicitly —
  never ignored, never `!`-asserted.
- Pre-auth existence RPCs **fail closed**: a thrown error must never be read as
  "not registered".
- The checkout price-change gate from the app is preserved: if validation reports
  a repriced cart, the order is blocked and the customer is shown the new total
  before they can continue.
- Route-level `error.tsx` and `not-found.tsx`; network failures show a retry, not a
  blank screen.
- No customer-facing raw Postgres errors.

## 12. Testing

- **Unit:** ported pricing/discount logic, asserting parity with the app's tests.
- **Integration:** cart round-trip against a real Supabase instance — add on web,
  read back as the app's shape.
- **Security:** an automated check that, with only the anon key, every table in §5
  returns zero rows or an error. This runs in CI so a future migration cannot
  silently reopen the database.
- **E2E:** browse → add to cart → sign in → checkout → order appears, in all three
  locales, LTR and RTL.
- **Accessibility:** keyboard navigation and contrast on the amber palette.

## 13. Deployment

Vercel. Environment: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(supplied out-of-band — they are not in the repo). No service-role key is used in
v1; if one is ever needed it stays server-only and is never prefixed `NEXT_PUBLIC_`.

A custom domain is required for Google OAuth redirects. The app's
`ASANKARY_DOMAIN_TBD` placeholder must be replaced with the real domain when chosen.

## 14. Open questions — resolved by diagnostic, not by guessing

`WEB_READINESS_DIAGNOSTIC.sql` (repo root, read-only) answers these. **Task 1 of the
implementation plan is to run it and record the results.**

**ALL RESOLVED 2026-08-09** by running the diagnostic against the live database.

| # | Question | ANSWER |
|---|---|---|
| Q1 | Is `RLS_HARDENING.sql` actually applied live? | **YES.** All 23 tables have RLS enabled, and `users`, `orders`, `carts`, `addresses`, `conversations`, `messages`, `push_tokens`, `saved_cards`, `trade_in_requests` are owner-scoped. An `rls_auto_enable` event trigger keeps new tables covered. **But** 12 tables remained `permissive_all using(true) with check(true)` and the `media` bucket had unconditioned write policies — both closed by `RLS_PHASE2_HARDENING.sql`, verified `HARDENED, anon_writable: []`. |
| Q2 | Do addresses live in `users.addresses` or `public.addresses`? | **`public.addresses`.** `users` has no `addresses` column at all (error 42703 confirmed it; only a singular `address` text field). NOTE: `AuthService.addAddress/updateAddress/deleteAddress` write the non-existent `users.addresses` and would throw — they are dead code; the UI correctly uses `addressService` → `public.addresses`. |
| Q3 | Grants for `account_id_for_phone` / `lookup_login_email` | **Neither function exists in the live database.** The app calls them and they fail (it fails closed, so login still proceeds). The web must NOT call them — go straight to `signInWithOtp`. `email_exists` DOES exist and `anon` may execute it. |
| Q4 | Which tables are in `supabase_realtime`? | **NONE — the publication is empty.** Live app↔web sync therefore requires adding tables to the publication first. This is real work, not configuration. |
| Q5 | Live `parts` columns | **43 columns, matching §4.2.** Notable: `price_usd` is `numeric NOT NULL`, `stock_qty` `integer NOT NULL`, `status` and `condition` both `text NOT NULL`. So a null price is unreachable in practice. |

### Scale (live, 2026-08-09)

14 products (all active) · 10 categories · 9 brands · **1 shop** · 12 customers · 1 order.

**This changes two design assumptions.** There is only one tenant, so the
"marketplace across many shops" framing is aspirational — build the home page as
*the* storefront, with per-shop pages deferred. And at 14 products, pagination and a
search index are premature; the whole catalogue fits in one query.

### Still open after the diagnostic

- `orders_update` has `USING` but no `WITH CHECK`, so a customer can rewrite their own
  order's `total_usd`. Needs a trigger pinning the money columns, not a policy.
- `users_admin_select` is `using (is_admin())` with no tenant scoping — latent while
  only one tenant exists.
- `get_partner_product_sales` is `SECURITY DEFINER` and anon-executable.
- `promo_codes` is publicly readable, so every code is discoverable. Closing it means
  moving validation into an RPC, which changes app behaviour.

## 15. Phasing

The scope is too large for one implementation plan. Proposed order, each phase
independently shippable and reviewable:

1. **Security + foundation** — diagnostic, RLS migration, storage lockdown, Next.js
   scaffold, Supabase clients, generated types, i18n/RTL shell, design tokens
2. **Catalogue** — home, listings, search, filters, product detail, store pages
3. **Commerce** — auth, cart, checkout (COD), orders, tracking, account
4. **Polish** — motion, performance budget, accessibility, E2E

Only phase 1 unblocks the rest; phases 2 and 3 are where the visible product lands.
