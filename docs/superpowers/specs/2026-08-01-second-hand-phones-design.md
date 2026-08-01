# Second-hand phones — trade-in requests and used listings

**Date:** 2026-08-01
**Status:** Approved, ready for implementation planning

## Problem

Customers walk into the shop wanting to sell or trade a used phone. Today this is
entirely offline: they describe what has been repaired or replaced, the shop works
out what it is worth, and a price is agreed verbally. Nothing is recorded, the
customer cannot start the process before arriving, and the shop has no history of
what it has offered or bought.

The shop also wants to see, while pricing a used phone, what it sells that model
for new.

## Scope

**In scope (phase 1):**

- Customer submits a trade-in request from the app: model, condition questionnaire, photos
- Admin reviews the request and sends a price
- Customer accepts or declines
- Settlement in cash, in person
- Phones the shop buys are listed as normal products marked `used`
- Admin sees the new price for that model while quoting

**Deferred (phase 2):**

- In-app trade-in credit the customer can spend at checkout

**Explicitly not building:**

- Automatic valuation. No estimate is shown to the customer at any point; the admin
  sets every price by hand. This removes the need for a per-model value table and
  per-fault deduction rules, which would need constant upkeep as phone values move.
- Customer-to-customer marketplace. All used stock is owned by the shop.
- Merging used and new onto a single product page. Used phones are separate listings.

## Why phase the credit

The request-and-quote loop is the feature and delivers value on its own. In-app
credit is a money-like balance that must never be spendable twice, must survive a
failed checkout, and interacts with the existing discount and promo-code paths.
Those paths are where this codebase's money bugs have lived — an audit on
2026-07-29 found a promo that discounted the wrong store's items and a cart
revalidation that could charge a total the shopper was never shown. Adding a credit
balance to that same code before it has run on a device compounds the risk.

Phase 1 also produces real data on which condition questions matter, before the
questionnaire is set in stone.

## Data model

### New table: `trade_in_requests`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `tenant_id` | uuid not null | The shop. Every query filters on it. |
| `user_id` | uuid | The customer. Nullable — see below. |
| `contact_name` | text not null | Snapshot of the customer's name at submission |
| `contact_phone` | text not null | Snapshot of their phone at submission |
| `device_brand` | text not null | e.g. `Apple` |
| `device_model` | text not null | e.g. `iPhone 13 Pro` |
| `storage` | text | e.g. `256GB` |
| `questions_version` | int not null | Which questionnaire version produced `answers` |
| `answers` | jsonb not null | Question key → answer |
| `photos` | text[] | Hosted image URLs |
| `customer_note` | text | |
| `status` | text not null | `submitted` \| `quoted` \| `accepted` \| `declined` \| `completed` \| `cancelled` |
| `offer_usd` | numeric(10,2) | Set by the admin |
| `offer_note` | text | e.g. "screen is aftermarket, -$40" |
| `offer_type` | text | `cash` in phase 1; `credit` reserved for phase 2 |
| `reviewed_by` | uuid | Admin who quoted |
| `created_at`, `updated_at`, `quoted_at` | timestamptz | |

`user_id` is `ON DELETE SET NULL`, deliberately **not** cascade. A customer deleting
their account must not erase the shop's record of a phone it bought and paid for.
This matches the published account-deletion page, which states that business records
for completed transactions are retained while the profile is removed.

The column is therefore nullable, but **every request in phase 1 is created by a
signed-in customer**. There is no admin-created walk-in entry; a null `user_id` only
ever results from a later account deletion. Admin screens must handle a null customer
by falling back to `contact_name` and `contact_phone` rather than assuming a joined
user row exists.

`contact_name` and `contact_phone` are snapshots taken at submission, not looked up
through `user_id` at read time. Two reasons: the record must remain usable after the
account is deleted, and a customer who later changes their phone number should not
silently change the number attached to a deal the shop has already agreed.

**Why `answers` is jsonb rather than columns:** the right set of questions is not yet
known. Changing the questionnaire must not require a migration. `questions_version`
records which version produced a given answer set, so an old request still renders
correctly after the questions change.

### Changed table: `parts`

Add `condition text` — `new` | `used` | `refurbished`, defaulting to `new`.

`Product.condition` already exists in `src/types/index.ts` but is absent from
`PART_COLUMN_MAP` in `src/services/productService.ts`, so it has never persisted.
This is why the product page's Condition card always read "Available" and was removed
on 2026-07-31.

The field must be added in **four** places or it silently will not reach customers:

1. The `parts` column (migration)
2. `PART_COLUMN_MAP` — otherwise writes are dropped
3. `LIST_COLUMNS` — otherwise it is absent from card queries
4. `mapProduct` — otherwise it never reaches the domain object

### Row level security

- Customer: may `select` and `insert` their own rows (`user_id = auth.uid()`), and may
  `update` only `status` to `accepted`, `declined` or `cancelled` on their own rows.
- Admin: full access limited to rows matching their `tenant_id`.

Client-side filtering alone is insufficient. The same audit found that brands, promos
and banners were filtered only in the app, which let any admin read, edit and
permanently delete another shop's records.

## The questionnaire

`TRADE_IN_QUESTIONS` v1, defined in `src/constants/`, translated into en / ar / ku.

| Key | Question | Answers |
|---|---|---|
| `powers_on` | Does it power on? | Yes / No |
| `screen` | Screen | Original / Replaced / Cracked |
| `battery_health` | Battery health | Percentage, or "don't know" |
| `charging_port` | Charging port | Works / Faulty / Replaced |
| `cameras` | Cameras | All work / Some faulty |
| `biometrics` | Face ID or fingerprint | Works / Doesn't work |
| `water_damage` | Water damage | Yes / No / Don't know |
| `account_removed` | iCloud or Google account removed | Yes / No |
| `body` | Body | Like new / Light scratches / Dents or cracks |
| `box_charger` | Box and charger included | Yes / No |

`account_removed` matters most commercially: a locked device cannot be resold and is
worth nothing to the shop. Asking before the customer travels saves both sides a trip.

## Customer flow

1. Profile → **Sell or trade your phone**
2. Pick brand → model → storage, with a free-text fallback for models not in the catalogue
3. Answer the questionnaire — one scrollable screen, every answer a tap except battery health
4. Add photos (front, back, screen powered on). Optional but encouraged.
5. Optional note
6. Submit. Confirmation states that a price will follow after review.
7. Request is listed under **My trade-ins** with its current status
8. When the admin quotes, the customer receives a push notification and sees the offer,
   with **Accept** and **Decline**

No figure is shown to the customer at any point before the admin's quote.

Reuses existing infrastructure: `imageService` for photo upload, the notification path,
and the `brands` table plus product catalogue for the model picker.

## Admin flow

New tenant-scoped **Trade-ins** screen in the admin area, badged with the number of
requests awaiting review.

**List:** newest first, filterable by status. Each row shows a thumbnail, model,
customer name, age and status.

**Detail:**

- Device and storage
- All answers, laid out plainly
- Photos, tappable to full screen
- Customer name and phone, with tap-to-call
- **New price comparison** — looks up the shop's own catalogue for that brand and
  model where `condition = 'new'` and shows the price, or "not stocked"
- Offer amount, optional note, **Send quote**

Sending a quote sets `status = 'quoted'`, stamps `quoted_at` and `reviewed_by`, and
notifies the customer.

Once accepted, two actions:

- **Mark completed** — cash paid, deal closed
- **Create listing from this** — opens the existing product form pre-filled with the
  brand, model, storage, the customer's photos, `condition = 'used'`, `stockQty = 1`
  and a generated name such as *"iPhone 13 Pro 256GB — Used"*. The admin sets the
  selling price and publishes.

Without the second action the admin would retype data the app already holds.

`offer_type` is written as `cash` throughout phase 1. The column exists so phase 2 adds
an option rather than a migration.

## Storefront

- **Used** badge on `MasonryProductCard`. That is the only card component in use —
  `ProductCard.tsx` and `RelatedProductCard.tsx` have no importers.
- Condition row restored on the product detail page, now backed by real data.
- Each used phone is a single unit (`stockQty = 1`) and sells out after one purchase
  through the existing effective-stock logic. No new stock handling.

## Failure cases

| Case | Handling |
|---|---|
| Photo upload fails | Alert and block submission. Never store a local `file://` path as a fallback — the Brand Manager did this, rendering correctly on the admin's own device while every customer saw a blank image. |
| Double submit | Button disables on first tap. A request from the same user with the same model and answers within 60 seconds is treated as a duplicate. |
| Two admins quote at once | The update is conditional on `status = 'submitted'`; the loser is told it is already quoted rather than silently overwriting. |
| Customer deletes account | `user_id` set to null; the row survives with `contact_name` and `contact_phone` intact, so the shop keeps a usable record. |
| Model not in catalogue | Comparison shows "not stocked". Not an empty state, not a crash. |
| Request submitted with no session | Blocked at the UI: the entry point requires sign-in, since the request must belong to a customer. |

## Testing

No test suite covers screens in this project. Verification is:

- `npx tsc --noEmit` clean
- All three locale files parse, with identical key sets — every string here is new
- Device pass: submit a request → quote it → accept → create the listing → confirm the
  Used badge appears on the card → buy it → confirm stock reaches zero
- One Arabic pass over the same path, checking RTL layout and that no English fallback
  text appears

## Open questions for phase 2

- Whether trade-in credit is a balance or a single-use code
- How credit interacts with an existing promo code in the same cart
- Whether credit expires
