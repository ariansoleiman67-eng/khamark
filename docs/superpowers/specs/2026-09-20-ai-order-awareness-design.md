# AI Order Awareness — Design

**Date:** 2026-09-20
**Status:** awaiting review
**Sub-project 1 of 3** (auto-reply → product entry → shop assistant)

## Goal

Let the automatic reply answer *"where is my order?"* — the single most common
question a shop is asked — for the customer who asked it, and only for them.

## Scope

**In:** `supabase/functions/ai-auto-reply/`, plus a new shared context module.
**Out:** the in-app shop assistant (sub-project 3 adopts this module) and product
entry (sub-project 2). Neither is touched here.

## Why the auto-reply first

It works while the shop sleeps, it is the smallest surface of the three, and it
is the one that most obviously needs order data. It is also where the shared
knowledge module gets built, so the other two inherit it rather than growing
their own copy.

## Global Constraints

- **No fake, demo or placeholder data.** Every fact the AI states comes from a
  live row. If a thing cannot be shown with real data, it is not shown.
- **A customer sees only their own orders. Never another customer's, under any
  phrasing.** This is the single requirement that cannot be got wrong, and it is
  enforced by the QUERY, not by the prompt — see below.
- **Never state a stock quantity.** Available / low / out only. The existing
  function already does this and must keep doing it.
- **Never invent a price, a date, or a delivery promise.**
- Phases are gated: finished, verified, reviewed, then the next.
- `npx tsc --noEmit` and `npx jest __tests__` clean at each phase end.

## The security model, stated plainly

The function runs on the **service role**. It can read every order in the
database. Nothing about the model's behaviour changes that — a prompt instruction
not to reveal other customers' orders is a request, not a control.

So the control is the query. The function already knows who is asking:
`conversations.user_id` (ai-auto-reply/index.ts:88). Order context is built from
exactly that id:

```ts
.from('orders').select(...).eq('user_id', conversation.user_id)
```

The model is never handed a row it may not repeat. It cannot leak what it was
never given — the same principle that fixed the stock-count leak in
`chatbotService`.

Three rules follow from this, and all three are testable:

1. **No lookup by anything the customer types.** Not by order number, not by
   name, not by phone. If a customer quotes someone else's order number, the
   function must not fetch it. The id comes from the conversation row only.
2. **An anonymous conversation gets no order context at all.** When
   `conversation.user_id` is null, the orders section is omitted entirely rather
   than queried with a null filter.
3. **Recent orders only** — a bounded number, newest first, so the prompt cannot
   grow without limit for a long-standing customer.

## What the AI gets to know

Per order, from the customer's own rows:

| Field | Why |
|---|---|
| order number | so the customer can be told which order is which |
| status | the actual question being asked |
| created date | "you ordered this on the 3rd" |
| items: name + quantity | "your two chargers" |
| total | confirming what they paid |
| delivery city / method | answers "when will it come" partially |

**Not included:** cost price, margin, other customers, internal notes, anything
from `parts` that is not already public. The order's own `purchase_price` stamps
are shop margin and must never enter the prompt.

## Architecture

One new module, imported by the function:

| Unit | File | Responsibility |
|---|---|---|
| Shop context | `supabase/functions/_shared/shopContext.ts` *(new)* | Build catalogue and order context blocks from a Supabase client. Pure formatting; no network of its own beyond the queries it is asked to make. |
| Auto-reply | `supabase/functions/ai-auto-reply/index.ts` | Orchestrates: wait, re-read, build context, call Claude, write the reply. |

`_shared/` is the Supabase convention for code imported by more than one
function, and it deploys with each function that imports it. Sub-projects 2 and 3
import the same module rather than reimplementing it.

The catalogue-building code currently inline in `ai-auto-reply` moves into this
module unchanged in behaviour, so the move is reviewable on its own.

## Handoff to a human

The assistant must be able to say "I don't know, the shop will answer". Today it
answers everything it is asked, which is how an AI invents a delivery date.

When the question is outside what the context supports — a refund, a complaint, a
promise about timing the data does not contain — the reply says the shop will
follow up, and the conversation is left for the admin. No new table: the existing
unread state already surfaces it in the admin inbox.

## Error handling

Unchanged in shape from today: the function swallows its own failures so a broken
reply never costs the push notification firing on the same INSERT. That silence
is why the `temperature` breakage went unnoticed for days, so one change is made
alongside: failures are logged with enough detail to be found in the function
logs, even though they are never surfaced to the customer.

## Testing

The order-scoping rules are pure logic and get real tests in `__tests__/`:

- context for a conversation with `user_id` = A contains only A's orders
- a null `user_id` produces no orders section
- an order number quoted in the customer's message does not cause a lookup
- the bounded count holds when a customer has many orders
- cost fields never appear in the built context

The model's behaviour is verified by hand against the live function, in all three
languages, before the phase closes.

## Phases

**Phase 1 — the module.** Move catalogue building into `_shared/shopContext.ts`
with no behaviour change; tests for the formatting. Done when the auto-reply
behaves exactly as before, verified against a real conversation.

**Phase 2 — order context.** Add the order block, scoped by conversation
`user_id`; tests for all five rules above. Done when a real customer asking
"where is my order?" gets their own order back, and a customer quoting someone
else's order number does not.

**Phase 3 — handoff and logging.** The "the shop will answer" path, and failure
logging. Done when an unanswerable question produces a handoff rather than an
invention.
