# AI Assistant Screen — Design

**Date:** 2026-09-03
**Status:** approved, ready for planning
**Screen:** `src/screens/ChatbotScreen.tsx` (982 lines today)

## Goal

Make the in-app AI assistant read and behave like a current-generation chat
product: answers that stream in as they are written, formatted text instead of
walls of prose, tappable product cards instead of product descriptions, and a
layout that does not fight Kurdish and Arabic.

## Why now

The screen works and the backend is healthy (`askChatbot` answers in 1.47s), but
three things make it feel dated:

1. The whole answer lands at once after a blank wait.
2. Claude writes markdown; the screen renders it as literal asterisks.
3. The assistant *describes* products in prose. The shop has a catalogue with
   photos and prices, and none of it reaches the conversation.

## Global Constraints

These bind every phase. They are the house rules this codebase already enforces,
plus the two the shop asked for directly.

- **No fake, demo, seeded or placeholder data. Anywhere.** No mock product
  cards, no sample conversations, no lorem text, no hardcoded "example" answers.
  Every product shown comes from the live `parts` table. If a thing cannot be
  shown with real data, it is not shown. This project already carries scars from
  seeded demo rows leaking into production (`brands` had nine).
- **Phase gates.** Each phase is finished, verified on a real device, and
  reviewed before the next begins. No phase starts while the previous one is
  unproven.
- **One vertical scroll owner per screen.** The message list is it.
- **RTL is not an afterthought.** Every new component takes `isRTL` and is
  checked in Kurdish before its phase closes. Never `writingDirection: 'rtl'`.
- **Every user-facing string goes through i18next** and is added to all three
  locale files (`en`, `ar`, `ku`) in the same commit that introduces it.
- **Never `select('*')` on `parts`.** Column-level grants make it a 42501 for
  customers. Use the existing `CATALOG_COLUMNS`.
- **`tsc --noEmit`, `eslint` and `jest` clean at the end of every phase.**
- Numbers render through `AppNumber`; prices through the existing currency
  helpers. No new price formatting.

## Architecture

Five units, each with one responsibility and a testable boundary.

| Unit | File | Responsibility | Depends on |
|---|---|---|---|
| Streaming proxy | `supabase/functions/askChatbot/index.ts` | `stream: true` → SSE; without it, unchanged | Anthropic SDK |
| Stream transport | `src/services/chatbotStream.ts` *(new)* | `expo/fetch` + SSE parse → async iterable of text deltas | `expo/fetch` |
| Conversation logic | `src/services/chatbotService.ts` | `sendMessageStreaming(message, onDelta)`; existing method kept | transport, catalogue |
| Message rendering | `src/components/chat/*` *(new)* | `AssistantMessage`, `ProductCardStrip`, `QuickChips`, `TypingDots` | theme, i18n |
| Screen | `src/screens/ChatbotScreen.tsx` | Layout, keyboard, list, state | all of the above |

`ChatbotScreen.tsx` is 982 lines. Moving message rendering into
`src/components/chat/` is part of the work, not a side quest — the redesign is
not reviewable while every bubble style is inline in a thousand-line file.

### Why `expo/fetch`

React Native's global `fetch` is a polyfill over XHR and exposes no readable
body, which is what normally makes streaming impossible in RN. Expo SDK 54 ships
`expo/fetch`, whose `FetchResponse` exposes a real `ReadableStream`
(`node_modules/expo/src/winter/fetch/FetchResponse.ts:24`). Verified present in
this project. No new dependency is required for streaming.

`supabase.functions.invoke` buffers the whole body and cannot stream, so the
transport calls the function URL directly with the anon key in `apikey` and
`Authorization` headers. Verified working: a plain POST with those headers
returned 200 and a completed answer.

## Product-card protocol

The system prompt gains one instruction: when an answer recommends specific
products, end it with a marker naming their ids.

```
<<products:99244efe-07dc-4929-9445-e9ed5df9e007,40d1e82d-8b62-4a21-9be4-7db526a4ec94>>
```

The client strips the marker before display and renders those products as cards,
in the order given.

Models forget instructions, so the client treats the marker as optional:

- **Marker absent** — no cards. The answer still renders. Not an error.
- **Marker names an unknown id** — that id is skipped; the rest still render.
- **Marker split across stream chunks** (`<<prod` then `ucts:abc>>`) — the
  visible buffer withholds any trailing partial marker, so the raw text never
  flashes on screen. This is the single most likely streaming bug and it gets a
  unit test.
- **Marker with no valid ids at all** — treated as absent.

Cards are looked up against the catalogue the client already holds
(`getActiveProductCatalog`), so rendering them costs no extra network call.

## Streaming data flow

```
user sends
  ├─ user bubble appears immediately (optimistic)
  ├─ assistant row appears with animated dots
  ├─ first delta (~400ms) → dots replaced by text, caret blinks at the end
  ├─ deltas append as PLAIN TEXT
  ├─ stream ends
  └─ parse markdown once · strip marker · resolve ids · fade cards in
```

Markdown is parsed once, on completion, never per chunk. Re-parsing a growing
document on every delta would re-render the whole tree dozens of times a second.
The swap from plain to formatted is invisible because the text does not reflow
noticeably — the same words occupy the same lines.

## Error handling

Every failure keeps whatever the user already has on screen.

| Failure | Behaviour |
|---|---|
| Network drops mid-stream | Keep the partial text, append a Retry chip beneath it |
| Function returns 500, or a non-SSE body | Fall back to the existing non-streaming call, once, automatically |
| Stream opens then closes with no content | Treat as failure; Retry chip |
| User taps Stop | Abort the request, keep what arrived, mark the message complete |
| Catalogue lookup fails | Answer renders, no cards. Never blocks the text |
| Anthropic returns an error event | Surface the function's message, not a raw stack |

No failure path shows a placeholder answer or invented content.

## Visual design

**Assistant messages** run full width with a 28pt avatar at the leading edge and
no bubble. This is what handles long Kurdish and Arabic answers without wrapping
every line, and it is the only layout in which product cards do not look
cramped.

**User messages** keep an orange bubble, aligned to the trailing edge, max 80%
width.

Additionally:

- Quick action chips move from `ListHeaderComponent` (where they scroll away
  after the first message and never return) to a pinned row above the input.
- A designed empty state replaces the lone greeting bubble in a void.
- Messages enter with a spring fade+slide.
- Date separators between days; consecutive messages from the same side group
  with tighter spacing.
- Real animated typing dots replace the current `'.'` → `'..'` → `'...'` string.

## Markdown rendering

The shop chose `react-native-markdown-display`. Recorded risk, so the decision
is on the record: version 7.0.2 was published 2023-12-11, and it depends on
`react-native-fit-image`, last published 2019-11-14. That is a seven-year-old
transitive dependency entering RN 0.81 with the New Architecture enabled. This
project has already lost an App Store submission to a stale package.

It is therefore gated behind Phase 0, a spike whose only job is to answer
"does it work here". Fallback if it does not: a purpose-built renderer handling
bold, bullets and line breaks — roughly 80 lines, no dependency, full RTL
control. Nothing else in this design changes if the fallback is taken.

## Phases

Each phase ends with: `tsc --noEmit` clean, `eslint` clean, `jest` green,
verified on a physical device through the dev build, and reviewed. The next
phase does not begin until that is done.

### Phase 0 — Markdown decision (gate)

Install the library, render one real Kurdish assistant answer in the dev build.

**Done when:** it renders correctly in Kurdish with no New Architecture warnings,
or it does not and the fallback renderer is written instead. Either way the
answer is recorded here before Phase 1 starts.

### Phase 1 — Streaming, end to end

`stream: true` in the Edge Function, `chatbotStream.ts`, and
`sendMessageStreaming` in the service. Existing non-streaming path untouched and
still used by `aiProductFill`.

**Done when:** text visibly appears progressively on the device, first words
inside ~600ms; killing Wi-Fi mid-answer keeps the partial text and shows Retry;
`aiProductFill` still works.

### Phase 2 — Message rendering extracted and redesigned

`AssistantMessage`, `TypingDots` and the user bubble move into
`src/components/chat/`. Full-width assistant layout lands here.

**Done when:** the conversation renders in the new layout in all three
languages, `ChatbotScreen.tsx` is meaningfully smaller, and no visual regression
in voice messages.

### Phase 3 — Product cards

Prompt marker, parser, `ProductCardStrip`, tap-through to `ProductDetails`.

**Done when:** asking "what chargers do you have?" shows real cards for real
catalogue rows with real photos and prices, tapping one opens that product, and
an answer with no marker renders cleanly with no empty space where cards would
be.

### Phase 4 — Chrome and motion

Pinned chips, empty state, entrance animation, date separators, grouping,
header polish.

**Done when:** all of it works in RTL, and the screen still has exactly one
vertical scroll owner.

### Phase 5 — Review pass

Read the whole screen fresh: dead code from the old layout removed, all strings
in three locale files, no leftover debug logging, no orphaned styles.

**Done when:** a full read of the diff finds nothing left over.

## Testing

Real tests, in `__tests__/utils/`, for the pure logic — this is where streaming
bugs actually live:

- SSE frame parser: multi-line frames, `[DONE]`, keep-alives, split frames.
- Product marker extraction: present, absent, malformed, unknown ids.
- Partial-marker suppression: marker split across two and three chunks.

The visual half is verified on the device, per phase. There is no snapshot
testing in this project and this design does not add one.

## Out of scope

- The admin AI (`aiProductFill`) keeps its current non-streaming path.
- Voice messages keep their current implementation.
- No changes to `ChatThreadScreen` or the human messenger.
- No new model. `claude-haiku-4-5` stays; `ANTHROPIC_MODEL` still overrides.
