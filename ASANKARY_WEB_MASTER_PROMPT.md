# ASANKARY — WEB PLATFORM MASTER PROMPT

> Paste this whole document as your brief. It is self-contained.
> Every fact below was verified by reading the live codebase and querying the live
> database on 2026-08-09 — not inferred from filenames. Where something could not be
> verified it says so. **Do not treat any of it as approximate.**

---

## 1. THE MISSION

Build the complete web platform for **Asankary**, a phone and electronics shop in Erbil,
Iraq. It must do **everything the existing mobile app does** — both the customer storefront
and the shop-owner admin panel — and it must be beautiful enough that people screenshot it.

Two audiences, one codebase:

- **Customers** browse, search, compare, add to cart, check out, track orders, chat with the
  shop, and trade in old phones.
- **The shop owner** manages the entire business: products, stock, prices, orders,
  customers, conversations, promotions, analytics and settings.

Three languages — **English, Arabic, Kurdish (Sorani)** — two of which are right-to-left.
This is not a translation layer bolted on at the end. It is a first-class constraint that
shapes every layout decision.

**Scale, so you build for reality:** one shop, 14 active products, 10 categories, 9 brands,
12 customers, 1 order. Do not build pagination, sharding, search indexes or multi-vendor
abstractions. Build something small, fast and exceptional.

---

## 2. THE DESIGN MANDATE

The owner's words: *"most modern, newest, magnificent, smoothest, something never seen
before."* Take that seriously and interpret it with taste rather than decoration.

**What that means here:**

- **Typography is your biggest lever.** The mobile app ships **zero custom fonts** — every
  `fontFamily` is `System`. Choosing a real typeface, with genuine Arabic-script coverage,
  will transform this more than any animation. Arabic and Kurdish must look *designed*, not
  merely supported. Latin and Arabic need to feel like one family, not two.
- **Motion should explain, not decorate.** Shared-element transitions from grid to product.
  Optimistic cart updates. Skeletons that match the shape of what loads. Respect
  `prefers-reduced-motion` everywhere.
- **Density with clarity.** A shop with 14 phones should feel curated, not empty. Use scale,
  whitespace and photography — the product images are large and good.
- **The admin panel deserves the same care as the storefront.** It is where the owner spends
  hours every day. Most e-commerce admin panels are ugly; this one should not be.
- **Mobile-first, genuinely.** Most Iraqi customers arrive on a phone, on mobile data.

**Non-negotiable performance constraint:** product photos are **unresized iPhone JPEGs, up
to 20 MB each**. There is no image transformation in the pipeline. Without correctly sized
responsive images, a single product page can ship 60 MB. Get `sizes` right, derived from
your actual grid — not guessed.

**Brand:** amber `#F5A00A` on a light canvas. Keep the amber; everything else is yours.

---

## 3. ARCHITECTURE — PROVEN, NOT PROPOSED

A working foundation already exists using this stack. It is tested and reviewed. Continue
it rather than restarting.

```
Next.js 16 (App Router) · React 19 · TypeScript strict (noUncheckedIndexedAccess)
Tailwind v4 (CSS-first @theme) · next-intl · Vitest + Testing Library
Supabase (Postgres + Auth + Storage) — the SAME project the mobile app uses
```

**Three data paths, chosen deliberately:**

1. **Public catalogue → cookie-free anon client, statically rendered.** Home, brand and
   category pages are SSG. This matters: a cookie-bound client silently opts every route
   out of static rendering, and the resulting uncached round-trip on Iraqi mobile data is
   the difference between fast and unusable.
2. **Personal data → cookie-bound client, dynamic.** Cart, orders, account, admin.
3. **Live updates → Supabase Realtime.** ⚠️ The `supabase_realtime` publication is currently
   **EMPTY** — no table emits change events. Live sync is real work, not configuration.

**Hard rule:** never let a cookie-bound client into a cached page. One customer's data baked
into a shared cache is the worst bug on this list.

---

## 4. WHAT ALREADY EXISTS — DO NOT REBUILD

A working repo at `/Users/maci/Desktop/Asankary - Web` (**the path contains a space**).
36 commits, 171 tests, reviewed and approved.

**Done and working:**
- Home grid, product detail, search, brand and category pages — all live against real data
- Header with search, brand chips, and a language switcher that preserves the current page
  *and* query string
- Trilingual routing `/en` `/ar` `/ku` with correct RTL (`html lang="ckb"` for Kurdish)
- Pricing, discount and in-stock logic **ported verbatim** from the app and proven identical
  across ~14,000 test cases
- Currency formatting matching the app exactly (USD only for now; IQD helpers ported, unwired)
- Locale files with tests enforcing key parity, no English leaking into ar/ku, and matching
  ICU placeholders
- Graceful translated error states; the build survives with no credentials

**Deliberately not there yet:** cart, checkout, auth, orders, account, and the entire admin
panel. That is your work.

---

## 5. FEATURE PARITY — CUSTOMER

**356 live capabilities were inventoried.** Below is the shape; treat it as the checklist.

### Browsing & discovery
Home feed (paged grid, pull-to-refresh, scroll-to-top) · hero **banner carousel** with
click-through links · **featured products** row · **brands rail** with logos · **per-brand
spotlight carousels** (brands with ≥2 products, top 4) · categories grid · brand and
category listing pages · search · **barcode scanning** · sort and filter · favourites ·
guest browsing with sign-in only at the moment of intent.

### Product detail
Image gallery · product video · **size variations**, **colour variations** (with per-colour
images and stock), **storage options** · **wholesale price tiers** · **VIP pricing** ·
compare-at price with a Save% badge · condition badge (new / used / refurbished) · stock and
low-stock urgency · per-city shipping rates · specifications · warranty · SKU · barcode ·
related products · share.

⚠️ **Tiered products display a price RANGE**, not a single price — low end is the cheapest
tier, high end is `priceUSD`, and the second number omits the currency symbol:
`$5.00 - 12.00`. The web already replicates this. Do not "fix" it.

### Cart & checkout
Add / update quantity / remove · quick-add bottom sheet from a card (skipped for products
with variants) · fly-to-cart animation · **promo codes** · discounts and upsell prompts ·
delivery address selection · per-city shipping cost · payment method choice · **a
price-change guard that blocks the order if the cart repriced** · order placement.

⚠️ **The cart is one row keyed by user id** (`carts.id` IS the user id). App and web share
it literally — not a synced copy. A customer adding on their phone sees it on the laptop.

### Orders & after-sale
Order history · order detail with status timeline · **live delivery tracking** · cancel
(via the `cancel_my_order` RPC, which restores stock — never a direct UPDATE) · reorder ·
notifications with unread badges · **chat with the shop** including attachments · **trade-in
requests**: submit device details, receive a quote, accept or decline.

### Account & identity
**Sign-in methods that are LIVE:** phone OTP (native Supabase — no Firebase), Google, Apple,
email + password, and guest. Profile editing · avatar · language and currency preference ·
VIP status · **addresses** (add, edit, delete, set default, map/GPS picking) · password
change and reset · email and phone verification · connect/disconnect social sign-ins ·
account deletion · blocked-account enforcement.

---

## 6. FEATURE PARITY — ADMIN

This is the larger half and the part most likely to be underestimated.

### Catalogue
Product CRUD · duplicate · **drag-to-reorder** (`sort_order`) · bulk status changes ·
activate/deactivate · feature · availability status (available / coming soon / on the way) ·
condition.

**Every field on the product form must exist on the web**, or the owner cannot run the shop
from it: name + Arabic + Kurdish · part number · category + Arabic + Kurdish · description +
Arabic + Kurdish · brand · price · compare-at price · VIP price · purchase price (admin-only)
· stock · historical stock · initial stock · status · condition · images (upload, reorder,
delete) · video · size variations · colour variations · storage options · price tiers ·
shipping cost · per-city shipping rates · weight · dimensions · warranty · SKU · barcode ·
specifications · featured · active.

Also: categories, brands and banners CRUD · media library · store profile and settings.

### Operations
Orders list with filter and search · order detail · **change status, which moves stock** ·
cancel · delete · **live delivery tracking** · customers list and detail · block/unblock ·
VIP flag · **chat inbox** with replies and attachments · **trade-in inbox**: review, quote,
set status · **analytics**: date-range reports, revenue PDF, stock/reorder report,
receivables · **compose and send push notifications** to customers · global and tenant
settings · exchange rate · delivery cities · store locations.

---

## 7. DESIGN TOKENS — USE THESE EXACT VALUES

Ported from the app so the two surfaces cannot drift.

| Token | Value |
|---|---|
| Brand primary | `#F5A00A` |
| Brand variant | `#FF9F0D` |
| Ink / secondary | `#2B2B2B` |
| Canvas | `#F4F4F6` |
| Surface | `#FFFFFF` |
| Spacing | `xs 4 · sm 8 · md 16 · lg 24 · xl 32` |
| Radius | `sm 6 · md 12 · lg 20 · full 9999` |
| Type | `h1 32/700/40 · h2 24/700/32 · h3 20/600/28 · body 16/400/24 · caption 14/400/20` |
| Motion | `fast 200 · normal 300 · slow 500` (ms) |
| Breakpoints | `mobile 0 · tablet 768 · desktop 1024` |

Card radius 12, padding `md`. Prefer `min-height` and `aspect-ratio` over fixed heights.

---

## 8. LANGUAGE & RTL — RULES, NOT PREFERENCES

- Locales are exactly `en`, `ar`, `ku`. **Both `ar` and `ku` are RTL** — Kurdish here is
  Sorani, written in Arabic script.
- The URL segment is `/ku`, but the HTML attribute must be **`lang="ckb"`**. In CLDR, `ku`
  means Kurmanji Kurdish in *Latin* script — the wrong language for this content.
- **Translation fallback is `ar?.trim() ? ar : en`** — a trim check, never a null check.
  Nothing in the database prevents an empty string or an English copy sitting in `name_ar`,
  and a null check renders a blank product name to Arabic customers. 11 of 14 products have
  Arabic and Kurdish names; the other 3 legitimately fall back.
- **Numbers always render LTR**, even inside RTL text. Wrap them in `dir="ltr"`.
- **Use logical CSS properties** (`start-*`, `end-*`, `ms-`, `me-`) — never `left-*`/`right-*`.
  Layout must mirror from `dir` alone, with no compensating CSS.
- All three message files must carry the identical key set, with matching ICU placeholders,
  and no Arabic or Kurdish value byte-identical to its English counterpart. **The mobile app
  has 18 Arabic and 19 Kurdish keys holding English text — do not inherit that bug.** Enforce
  it with a test.
- Arabic plurals need real ICU categories: `8 نتائج`, not `8 نتيجة`.

---

## 9. DATA MODEL — THE QUIRKS THAT WILL BITE YOU

Verified against the live database. Each of these has already cost someone hours.

- **`parts` is the products table.** 43 columns. Columns are snake_case; map to camelCase.
- **In-stock rule:** in stock only when `(status is null OR 'available')` **AND**
  `(stock_qty > 0 OR any variation stock > 0 OR any colour stock > 0)`. `coming_soon` and
  `on_the_way` hold *incoming* quantity in `stock_qty` and are **not** purchasable. A product
  stocked only through colour rows has `stock_qty = 0` and **is** purchasable.
- **`status` has no database constraint** — validate in application code. `condition` *is*
  constrained to `new|used|refurbished`.
- **PostgREST returns numerics as strings.** Coerce every numeric column, or `"10.50" > 8`
  silently evaluates false.
- **`carts.id` IS the user id.** One row, shared with the app.
- **Addresses live in `public.addresses`.** `users` has **no** `addresses` column — the app's
  `AuthService.addAddress/updateAddress/deleteAddress` are dead code that would throw.
- **`account_id_for_phone` and `lookup_login_email` do not exist** in the live database, even
  though the app calls them. Go straight to `signInWithOtp`.
- **Order cancellation is an RPC** — `cancel_my_order(p_order_id)` locks the row, verifies
  ownership, restores stock. Never a direct UPDATE.
- **`parts.brand` and `parts.category` may carry trailing whitespace.** Three live rows do
  (`"Tecno "`, `"Motorola "`, `"Honor "`). Trim when grouping or filtering, or one brand
  becomes two.
- **All images live in one public Supabase Storage bucket, `media`.**
- **`dimensions` is `{length, width, height}`** — there is no `unit` field despite a SQL
  comment claiming otherwise.

---

## 10. SECURITY — HARD PREREQUISITES

The Supabase key is **public in a browser**. Row Level Security is the only protection.

Hardening has been applied and verified (`anon_writable: []`). But three things **must be
fixed before the web can place orders or run an admin panel**:

1. **`orders_update` has `USING` but no `WITH CHECK`.** In Postgres the new row is then only
   checked against `USING`, so a signed-in customer can rewrite their own order's
   `total_usd` after placing it. Needs a trigger pinning the money columns. **This is a
   blocker for checkout.**
2. **Generate database types** (`supabase gen types`) before writing a single order or cart
   query. Do not hand-transcribe money columns.
3. **`users_admin_select` is `USING (is_admin())` with no tenant scoping.** Latent while one
   shop exists; a real hole the moment there are two.

Also open: `promo_codes` is publicly readable (every code discoverable), and
`get_partner_product_sales` is `SECURITY DEFINER` and anon-executable.

**An admin panel on the web is a much bigger security surface than the storefront.** The
catalogue is public data; the admin writes prices, stock and orders. Treat every admin
mutation as needing a server-side check, not a hidden route.

---

## 11. DO NOT BUILD THESE — 66 VERIFIED DEAD ENDS

The app contains a great deal of code that is unreachable, gated off, or dead. Rebuilding it
is pure waste. Confirmed non-functional:

**Auth/profile:** Facebook sign-in (gated behind `{false && …}`) · referral codes ·
`PhoneLoginScreen` and `LegacyEmailLoginScreen` (unrouted) · onboarding screen · **vehicle
information** (make/model/year/VIN — a leftover from an auto-parts app) · confirm-identity
screen · theme customisation · "Preview as VIP" demo tools.

**Catalogue:** `adminService.addProduct/updateProduct/deleteProduct` (a dead second service
path — the live one is elsewhere) · compatible-models list (saved, no UI) · legacy cosmetic
colour options · **storage options** (readers exist, no writer, no data) · "sync products to
global".

**Admin:** the richer `AdminCategoriesScreen` · the discounts editor · the promo-code manager
· operating-hours editor (and it writes to a different table) · in-store POS · chat archive
and labels · legacy conversations list · invoice download · Firebase/GA analytics service ·
force-update config.

**Customer:** recently-viewed · "Browse Stores" modal · **AI visual search** · **AI chatbot
(Gemini)** · per-device push toggle · store rating and years-in-business cards (hardcoded).

If you believe one of these is worth having, **build it fresh as a new feature and say so** —
do not port the broken version.

---

## 12. HOW TO WORK

- **Verify, do not assume.** Every claim above came from reading a file or querying the
  database. Hold yourself to the same standard. When unsure, check.
- **Test what matters.** Money, stock, and translations. Then *try to break your own tests* —
  mutate the code they cover and confirm they go red. On this project, mutation testing
  found a `Price` component that could bypass the entire pricing engine with 125 tests still
  green.
- **The app and the web must never quote different prices.** Port pricing logic verbatim and
  lock it with parity tests. Watch composition as well as arithmetic — the two surfaces once
  diverged because one rendered a range and the other a single number, while every ported
  function was identical.
- **Ship in reviewable slices**, each independently working.
- **Never commit a key.** `.env.local` only, git-ignored.

---

## 13. SUGGESTED ORDER

1. **Security prerequisites** — `orders_update` trigger, generated types. Blocks everything.
2. **Auth** — phone OTP, Google, Apple, email. Nothing personal works without it.
3. **Cart & checkout** — cash on delivery first; the shared cart row is already there.
4. **Orders & tracking** — history, detail, status, cancel.
5. **Account** — profile, addresses, notifications.
6. **Admin catalogue** — products first; it is the largest single surface.
7. **Admin operations** — orders, customers, chat, trade-ins, analytics.
8. **Realtime, chat, trade-in** — needs tables added to the publication first.
9. **Design pass** — motion, polish, accessibility, performance budget.

---

## 14. DEFINITION OF DONE

- Every live capability in §5 and §6 works on the web.
- All three languages, both directions, with no English leaking into Arabic or Kurdish.
- Prices provably identical to the mobile app.
- Fast on a phone on Iraqi mobile data — measure it, do not assume it.
- The security prerequisites in §10 closed **before** anything writes money.
- It looks like something the owner is proud to send people to.
