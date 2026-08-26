# Product Form Upgrade — Implementation Plan

**Goal:** Per-variant dinar pricing, VIP dinar pricing, an AI auto-fill button, a real
brand picker, a cable spec, and a form that is pleasant to use.

**Scope:** `src/screens/admin/AdminProductsScreen.tsx` (4023 lines) plus the read paths
that consume variant prices.

## What the investigation established

- `variations`, `color_variations` and `storage_options` are **JSONB** columns
  (`productService.ts:47-48`). Adding `priceIQD` to a variant needs **no migration**.
- `vip_price_usd` is a real column, so VIP-in-dinar **does** need one.
- `PricedItem` is `{ priceUSD?, priceIQD? }` (`utils/currency.ts:169`). Give a variant a
  `priceIQD` and it satisfies that interface, so `getPriceUSD` / `getPriceIQD` /
  `formatItemPrice` work on variants **unchanged**. This is the whole trick.
- `askChatbot` is a generic Claude passthrough (`{system, messages} -> text`), not a
  catalogue-specific bot. The AI button can reuse it: no new Edge Function, no new
  secret, no deploy.
- Category already has a picker modal; brand is a bare TextInput with chips
  (`AdminProductsScreen.tsx:2609-2646`). That asymmetry is the complaint.
- `SPEC_PRESETS = ['RAM','Storage','Screen','Battery','Chipset','Camera','OS']` — no cable.

## Decisions taken without asking

1. **A variant's dinar price behaves exactly like the product's.** Set it and that exact
   dinar amount is charged with no conversion and no 250-snap; leave it blank and the
   variant falls back to its USD override, then to the product price. Same rule, same
   helpers, one mental model for the shop.
2. **No migration for variants.** JSONB absorbs the new field.
3. **One migration for `vip_price_iqd`,** additive and nullable.
4. **AI fills a draft, never saves.** Every field it writes stays editable and nothing
   is written to the database until the admin presses Save.

## Phases

### Phase 1 — Variant dinar pricing (data + read paths)
- `priceIQD?: number` on `ProductVariation`, `ColorVariation`, `StorageOption`
- Route every variant price read through `getPriceUSD` / `formatItemPrice`
- Audit: cart total, order total and the customer-facing picker agree for a
  dinar-priced variant

### Phase 2 — VIP dinar price
- Migration: `vip_price_iqd numeric null`
- `vipPriceIQD` through the service map, `getEffectiveUnitPrice`, and the form
- Audit: a VIP sees the pinned dinar figure; a non-VIP is unaffected

### Phase 3 — Brand picker + cable spec
- Brand gets the category picker treatment: searchable modal, tap to choose
- `Cable` joins SPEC_PRESETS with USB-C / Lightning / Micro-USB value suggestions
- Audit: picking a brand files the product under it in all three languages

### Phase 4 — AI auto-fill
- One button on the form; sends the product name (and any typed context) to
  `askChatbot` with a strict JSON contract
- Fills name AR/KU, description ×3, brand, category, specs including cable
- Never overwrites a field the admin has already typed in without confirmation
- Audit: malformed JSON, timeout and refusal all fail soft, leaving the form intact

### Phase 5 — Form UI/UX
- The form is one 4000-line screen; group it, make the save state obvious, keep one
  scroll owner (GOLDEN_RULES), RTL-correct throughout
- Audit: the whole form on a phone in all three languages

## Global constraints
- TypeScript strict; `npm run type-check` and `npm test` clean at every phase
- All new strings in `en.json`, `ar.json`, `ku.json`
- Never `writingDirection: 'rtl'`; numbers via `AppNumber`
- Tenant scoping preserved on every query and cache key
