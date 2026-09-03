# AI Assistant Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the in-app AI assistant screen so answers stream in as they are written, render formatted text, and show real tappable product cards from the live catalogue.

**Architecture:** The Edge Function gains a `stream: true` branch that returns Server-Sent Events; without the flag it behaves exactly as today. A new transport module consumes that stream with `expo/fetch` (the only fetch in React Native that exposes a readable body) and yields text deltas. Message rendering moves out of the 982-line screen into `src/components/chat/`. Product cards come from a marker the model appends to its own answer, resolved against the catalogue the client already holds.

**Tech Stack:** React Native 0.81 / Expo SDK 54 (New Architecture), TypeScript strict, Supabase Edge Functions (Deno), `@anthropic-ai/sdk`, `expo/fetch`, i18next.

**Spec:** `docs/superpowers/specs/2026-09-03-ai-assistant-screen-design.md`

## Global Constraints

- **No fake, demo, seeded or placeholder data. Anywhere.** No mock product cards, no sample conversations, no lorem text, no hardcoded example answers. Every product shown comes from the live `parts` table. If a thing cannot be shown with real data, it is not shown.
- **Phase gates.** Each phase is finished, verified on a real device, and reviewed before the next begins.
- **One vertical scroll owner per screen.** The message `FlatList` is it. Never nest a vertical scroller.
- **RTL:** every new component takes `isRTL` and is checked in Kurdish before its phase closes. Use `textAlign` + `I18nManager.isRTL`. Never `writingDirection: 'rtl'` — it breaks Android.
- **Every user-facing string goes through i18next** and is added to `src/locales/en.json`, `ar.json` and `ku.json` in the same commit that introduces it.
- **Never `select('*')` on `parts`.** Column-level grants make it `42501` for customers. Use the existing `CATALOG_COLUMNS` constant in `chatbotService.ts`.
- **`npx tsc --noEmit`, `npx eslint <changed files>` and `npx jest __tests__` must be clean at the end of every task.**
- Numbers render through the `AppNumber` component; prices through existing currency helpers. No new price formatting.
- Commit after every task. Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/utils/sseParser.ts` | create | Pure: bytes → SSE events. No network, no React. |
| `src/utils/chatMarkers.ts` | create | Pure: strip `<<products:…>>`, extract ids, suppress partial markers mid-stream. |
| `src/services/chatbotStream.ts` | create | Transport: `expo/fetch` POST → async generator of text deltas. |
| `src/services/chatbotService.ts` | modify | Add `sendMessageStreaming`. Existing `sendMessage` untouched. |
| `supabase/functions/askChatbot/index.ts` | modify | Add `stream: true` branch returning SSE. |
| `src/components/chat/TypingDots.tsx` | create | Three animated dots. |
| `src/components/chat/AssistantMessage.tsx` | create | Full-width assistant row: avatar, markdown body, caret. |
| `src/components/chat/UserBubble.tsx` | create | Right-aligned orange bubble. |
| `src/components/chat/ProductCardStrip.tsx` | create | Horizontal strip of real product cards. |
| `src/components/chat/QuickChips.tsx` | create | Pinned suggestion chips above the input. |
| `src/screens/ChatbotScreen.tsx` | modify | Layout, keyboard, list, state. Shrinks as rendering moves out. |
| `__tests__/utils/sseParser.test.ts` | create | Tests for the parser. |
| `__tests__/utils/chatMarkers.test.ts` | create | Tests for the marker logic. |

---

# PHASE 0 — Markdown decision (gate)

### Task 1: Decide the markdown renderer

**Files:**
- Modify: `package.json`
- Modify: `src/screens/ChatbotScreen.tsx` (temporary, reverted at the end of this task)

**Interfaces:**
- Consumes: nothing.
- Produces: a recorded decision. Either `react-native-markdown-display` is a dependency, or `src/components/chat/MarkdownLite.tsx` exists with signature `({ text, isRTL, color }: { text: string; isRTL: boolean; color: string }) => JSX.Element`.

This task exists because `react-native-markdown-display@7.0.2` was published 2023-12-11 and depends on `react-native-fit-image@1.5.5`, published 2019-11-14. That is a seven-year-old transitive dependency entering RN 0.81 with the New Architecture on. Find out in twenty minutes rather than in Phase 4.

- [ ] **Step 1: Install the library**

```bash
cd /Users/maci/Desktop/Asankary
npm install react-native-markdown-display
```

- [ ] **Step 2: Check Expo agrees with the versions it pulled**

```bash
npx expo install --check
```

Expected: no complaint naming `react-native-markdown-display` or `react-native-fit-image`. If it flags either, that is a fail — record it and go to Step 6.

> This project has lost an App Store submission to a version `expo install --check` had flagged. A flag here is a real signal, not noise.

- [ ] **Step 3: Render one real answer in Kurdish**

Temporarily replace the assistant `<Text>` in `renderMessage` in `src/screens/ChatbotScreen.tsx` with:

```tsx
import Markdown from 'react-native-markdown-display';

// ...inside renderMessage, in place of the assistant <Text>:
<Markdown style={{ body: { color: theme.colors.text, fontSize: 15, textAlign: isRTL ? 'right' : 'left' } }}>
  {item.content}
</Markdown>
```

- [ ] **Step 4: Run it on the physical device**

```bash
cd /Users/maci/Desktop/Asankary && npx expo start --dev-client
```

Switch the app to Kurdish. Ask the assistant: `چ شارژەرێکتان هەیە؟`

Expected: bullet lists render as bullets, `**bold**` renders bold, Kurdish text is right-aligned, no red box, no yellow warning about deprecated lifecycles or `findNodeHandle`.

- [ ] **Step 5: Record the outcome in the spec**

Append to `docs/superpowers/specs/2026-09-03-ai-assistant-screen-design.md` under "Markdown rendering", one of:

```markdown
**Phase 0 outcome (2026-09-03):** react-native-markdown-display renders correctly
in Kurdish on RN 0.81 New Architecture, no warnings. Kept.
```

or

```markdown
**Phase 0 outcome (2026-09-03):** react-native-markdown-display failed — <exact
symptom>. Removed. MarkdownLite is used instead.
```

- [ ] **Step 6: If it failed, remove it and build MarkdownLite**

```bash
npm uninstall react-native-markdown-display
```

Create `src/components/chat/MarkdownLite.tsx`:

```tsx
import React, { useMemo } from 'react';
import { View, Text } from 'react-native';

interface Props {
  text: string;
  isRTL: boolean;
  color: string;
}

/**
 * Bold, bullets and paragraphs. Nothing else — Claude is instructed to write
 * plain prose with simple lists, and a full markdown engine costs a seven-year-old
 * transitive dependency for headings and tables the assistant never emits.
 */
const MarkdownLite: React.FC<Props> = ({ text, isRTL, color }) => {
  const blocks = useMemo(() => text.split('\n'), [text]);
  const align = isRTL ? ('right' as const) : ('left' as const);

  return (
    <View>
      {blocks.map((line, i) => {
        const bullet = /^\s*[-*•]\s+/.test(line);
        const body = bullet ? line.replace(/^\s*[-*•]\s+/, '') : line;
        if (!body.trim()) return <View key={i} style={{ height: 8 }} />;
        return (
          <View
            key={i}
            style={{ flexDirection: isRTL ? 'row-reverse' : 'row', marginBottom: 2 }}
          >
            {bullet && (
              <Text
                allowFontScaling={false}
                style={{ color, fontSize: 15, lineHeight: 22, ...(isRTL ? { marginLeft: 6 } : { marginRight: 6 }) }}
              >
                •
              </Text>
            )}
            <Text
              allowFontScaling={false}
              style={{ color, fontSize: 15, lineHeight: 22, flex: 1, textAlign: align, includeFontPadding: false }}
            >
              {renderInline(body, color)}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

/** `**bold**` only. Everything else is left as typed. */
function renderInline(line: string, color: string): React.ReactNode {
  const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <Text key={i} style={{ fontWeight: '700', color }}>
        {part.slice(2, -2)}
      </Text>
    ) : (
      part
    ),
  );
}

export default React.memo(MarkdownLite);
```

- [ ] **Step 7: Revert the temporary edit to ChatbotScreen**

```bash
git checkout src/screens/ChatbotScreen.tsx
```

The real integration happens in Task 7. This task only decides which renderer exists.

- [ ] **Step 8: Verify and commit**

```bash
npx tsc --noEmit && npx jest __tests__
git add -A
git commit -m "chore(chat): decide the markdown renderer for the assistant

<one line: which one won and why, with the exact symptom if the library lost>

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# PHASE 1 — Streaming, end to end

### Task 2: SSE parser

**Files:**
- Create: `src/utils/sseParser.ts`
- Test: `__tests__/utils/sseParser.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `createSSEParser(): { push(chunk: string): SSEEvent[] }` where `SSEEvent = { event: string; data: string }`.

A network chunk is not a message. One chunk may hold three events, or half of one. The parser owns that boundary problem so the transport does not have to.

- [ ] **Step 1: Write the failing test**

Create `__tests__/utils/sseParser.test.ts`:

```ts
import { createSSEParser } from '../../src/utils/sseParser';

describe('createSSEParser', () => {
  it('parses a single complete event', () => {
    const p = createSSEParser();
    expect(p.push('event: content\ndata: {"t":"hi"}\n\n')).toEqual([
      { event: 'content', data: '{"t":"hi"}' },
    ]);
  });

  it('parses several events in one chunk', () => {
    const p = createSSEParser();
    const out = p.push('event: a\ndata: 1\n\nevent: b\ndata: 2\n\n');
    expect(out).toEqual([
      { event: 'a', data: '1' },
      { event: 'b', data: '2' },
    ]);
  });

  it('holds a partial event until the rest arrives', () => {
    const p = createSSEParser();
    expect(p.push('event: content\ndata: {"t":"he')).toEqual([]);
    expect(p.push('llo"}\n\n')).toEqual([{ event: 'content', data: '{"t":"hello"}' }]);
  });

  it('joins multi-line data with newlines, per the SSE spec', () => {
    const p = createSSEParser();
    expect(p.push('data: one\ndata: two\n\n')).toEqual([{ event: 'message', data: 'one\ntwo' }]);
  });

  it('ignores comment keep-alives', () => {
    const p = createSSEParser();
    expect(p.push(': keep-alive\n\n')).toEqual([]);
  });

  it('defaults the event name to message when only data is sent', () => {
    const p = createSSEParser();
    expect(p.push('data: plain\n\n')).toEqual([{ event: 'message', data: 'plain' }]);
  });

  it('tolerates CRLF line endings', () => {
    const p = createSSEParser();
    expect(p.push('event: a\r\ndata: 1\r\n\r\n')).toEqual([{ event: 'a', data: '1' }]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest __tests__/utils/sseParser.test.ts
```

Expected: FAIL — `Cannot find module '../../src/utils/sseParser'`.

- [ ] **Step 3: Write the parser**

Create `src/utils/sseParser.ts`:

```ts
/**
 * Server-Sent Events framing.
 *
 * Network chunks do not align with events: one chunk can carry several events, or
 * half of one. Everything about that boundary lives here, so the transport can
 * treat the stream as a list of events and the tests can run without a network.
 *
 * Pure by design — no fetch, no React, no timers. That is what makes it testable
 * in this project, which has no native test harness.
 */
export interface SSEEvent {
  event: string;
  data: string;
}

export function createSSEParser() {
  let buffer = '';

  return {
    push(chunk: string): SSEEvent[] {
      buffer += chunk.replace(/\r\n/g, '\n');
      const events: SSEEvent[] = [];

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseFrame(raw);
        if (parsed) events.push(parsed);
        boundary = buffer.indexOf('\n\n');
      }

      return events;
    },
  };
}

function parseFrame(raw: string): SSEEvent | null {
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of raw.split('\n')) {
    // ':' opens a comment. Anthropic and most proxies send these as keep-alives.
    if (line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
  }

  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}
```

- [ ] **Step 4: Run the tests**

```bash
npx jest __tests__/utils/sseParser.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit && npx eslint src/utils/sseParser.ts
git add src/utils/sseParser.ts __tests__/utils/sseParser.test.ts
git commit -m "feat(chat): SSE frame parser

Network chunks do not align with SSE events — one chunk may carry several, or
half of one. The parser owns that boundary so the transport does not have to,
and stays pure so it can be tested without a network.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 3: Streaming branch in the Edge Function

**Files:**
- Modify: `supabase/functions/askChatbot/index.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `POST /functions/v1/askChatbot` with `{ data: { messages, stream: true } }` responds `Content-Type: text/event-stream` emitting `event: delta` with `data: {"text":"..."}`, then `event: done` with `data: {}`, or `event: error` with `data: {"error":"..."}`.

- [ ] **Step 1: Add the streaming branch**

In `supabase/functions/askChatbot/index.ts`, extend the destructure to read the flag:

```ts
    const { messages, max_tokens, temperature, stream } = payload as {
      messages?: IncomingMessage[];
      max_tokens?: number;
      temperature?: number;
      stream?: boolean;
    };
```

Then, immediately before the existing `const response = await client.messages.create({`, insert:

```ts
    // STREAMING BRANCH.
    //
    // Only taken when the caller explicitly asks. Without the flag every line
    // below this block runs exactly as it did before, which is what keeps
    // aiProductFill and the admin AI safe from this change.
    if (stream === true) {
      const sse = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          const send = (event: string, data: unknown) =>
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

          try {
            const anthropicStream = client.messages.stream({
              model: DEFAULT_MODEL,
              max_tokens: max_tokens ?? 700,
              temperature: temperature ?? 0.2,
              ...(systemPrompt ? { system: systemPrompt } : {}),
              messages: conversation,
            });

            for await (const event of anthropicStream) {
              if (
                event.type === 'content_block_delta' &&
                event.delta.type === 'text_delta' &&
                event.delta.text
              ) {
                send('delta', { text: event.delta.text });
              }
            }

            send('done', {});
          } catch (streamErr) {
            // The client has already shown partial text by now, so an error event
            // is more useful than a status code it will never see.
            const message = streamErr instanceof Error ? streamErr.message : String(streamErr);
            send('error', { error: message });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(sse, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }
```

- [ ] **Step 2: Deploy it**

```bash
cd /Users/maci/Desktop/Asankary
npx supabase functions deploy askChatbot
```

- [ ] **Step 3: Prove the non-streaming path is unchanged**

```bash
node -e '
const fs=require("fs");
const env=Object.fromEntries(fs.readFileSync(".env","utf8").split("\n").filter(l=>l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim()]));
const url=env.EXPO_PUBLIC_SUPABASE_URL,key=env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
fetch(url+"/functions/v1/askChatbot",{method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"},
 body:JSON.stringify({data:{messages:[{role:"system",content:"Answer in one short sentence."},{role:"user",content:"Do you sell chargers?"}],max_tokens:100}})})
 .then(async r=>console.log(r.status, (await r.text()).slice(0,200)));
'
```

Expected: `200 {"success":true,"text":"..."}` — the same shape as before this task.

- [ ] **Step 4: Prove the streaming path works**

```bash
node -e '
const fs=require("fs");
const env=Object.fromEntries(fs.readFileSync(".env","utf8").split("\n").filter(l=>l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim()]));
const url=env.EXPO_PUBLIC_SUPABASE_URL,key=env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const t0=Date.now();
fetch(url+"/functions/v1/askChatbot",{method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"},
 body:JSON.stringify({data:{messages:[{role:"system",content:"Answer in three sentences."},{role:"user",content:"Do you sell chargers?"}],max_tokens:200,stream:true}})})
 .then(async r=>{
   console.log("status",r.status,"content-type",r.headers.get("content-type"));
   const reader=r.body.getReader(); const dec=new TextDecoder(); let first=null, frames=0;
   while(true){const {done,value}=await reader.read(); if(done)break;
     const s=dec.decode(value); frames+=(s.match(/event:/g)||[]).length;
     if(first===null&&s.includes("event: delta")) first=Date.now()-t0;}
   console.log("first delta after",first,"ms; frames:",frames);
 });
'
```

Expected: `content-type text/event-stream`, a first delta in well under 1500ms, and more than one frame. More than one frame is the point — one frame would mean it buffered rather than streamed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/askChatbot/index.ts
git commit -m "feat(chat): stream askChatbot responses as SSE when asked

Adds a stream:true branch returning text/event-stream. Without the flag every
line runs exactly as before, which is what keeps aiProductFill and the admin AI
out of the blast radius.

Verified against the deployed function: non-streaming still returns
{success:true,text}, streaming returns text/event-stream with the first delta
well inside the old 1.5s round trip and many frames rather than one.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 4: Stream transport

**Files:**
- Create: `src/services/chatbotStream.ts`

**Interfaces:**
- Consumes: `createSSEParser` from `src/utils/sseParser.ts`.
- Produces: `streamChatbot(body: StreamRequest, signal?: AbortSignal): AsyncGenerator<string, void, void>` where `StreamRequest = { messages: Array<{ role: string; content: string }>; max_tokens?: number; temperature?: number }`. Yields text deltas. Throws `StreamUnavailableError` when the response is not SSE, so the caller can fall back.

- [ ] **Step 1: Write the transport**

Create `src/services/chatbotStream.ts`:

```ts
import { fetch as expoFetch } from 'expo/fetch';
import { SUPABASE_CONFIG } from '../constants/config';
import { createSSEParser } from '../utils/sseParser';

/**
 * Why expo/fetch and not the global fetch, and not supabase.functions.invoke:
 *
 * - React Native's global fetch is a polyfill over XMLHttpRequest and exposes no
 *   readable body, so a streamed response cannot be read progressively.
 * - supabase.functions.invoke buffers the entire body before resolving.
 * - expo/fetch (Expo SDK 52+) returns a real ReadableStream body. Verified in
 *   node_modules/expo/src/winter/fetch/FetchResponse.ts.
 *
 * The anon key goes in both apikey and Authorization, which is what the Supabase
 * gateway expects and what functions.invoke sends on our behalf.
 */

export interface StreamRequest {
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  temperature?: number;
}

/** Thrown when the endpoint answered but not with a stream. The caller falls back. */
export class StreamUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StreamUnavailableError';
  }
}

export async function* streamChatbot(
  body: StreamRequest,
  signal?: AbortSignal,
): AsyncGenerator<string, void, void> {
  const response = await expoFetch(`${SUPABASE_CONFIG.URL}/functions/v1/askChatbot`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_CONFIG.ANON_KEY,
      Authorization: `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: { ...body, stream: true } }),
    signal,
  });

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !contentType.includes('text/event-stream') || !response.body) {
    throw new StreamUnavailableError(
      `askChatbot did not stream (status ${response.status}, type ${contentType || 'none'})`,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSSEParser();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      for (const event of parser.push(decoder.decode(value, { stream: true }))) {
        if (event.event === 'delta') {
          const text = safeText(event.data);
          if (text) yield text;
        } else if (event.event === 'error') {
          throw new Error(safeError(event.data));
        } else if (event.event === 'done') {
          return;
        }
      }
    }
  } finally {
    // Releasing matters on abort: without it the socket stays open until GC.
    reader.releaseLock();
  }
}

function safeText(data: string): string {
  try {
    const parsed = JSON.parse(data);
    return typeof parsed?.text === 'string' ? parsed.text : '';
  } catch {
    return '';
  }
}

function safeError(data: string): string {
  try {
    const parsed = JSON.parse(data);
    return typeof parsed?.error === 'string' ? parsed.error : 'AI stream failed';
  } catch {
    return 'AI stream failed';
  }
}
```

- [ ] **Step 2: Verify it compiles and lints**

```bash
npx tsc --noEmit && npx eslint src/services/chatbotStream.ts
```

Expected: both clean. If `expo/fetch` has no types, the import resolves through `node_modules/expo/fetch.d.ts` — do not add `@ts-ignore`; if it genuinely fails, stop and report rather than silencing it.

- [ ] **Step 3: Commit**

```bash
git add src/services/chatbotStream.ts
git commit -m "feat(chat): streaming transport over expo/fetch

RN's global fetch exposes no readable body and functions.invoke buffers, so
neither can stream. expo/fetch returns a real ReadableStream, verified in
node_modules/expo/src/winter/fetch/FetchResponse.ts.

Throws StreamUnavailableError when the endpoint answers with something other
than SSE, so the caller can fall back to the buffered path instead of failing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 5: `sendMessageStreaming` in the service

**Files:**
- Modify: `src/services/chatbotService.ts`

**Interfaces:**
- Consumes: `streamChatbot`, `StreamUnavailableError` from `src/services/chatbotStream.ts`.
- Produces: `chatbotService.sendMessageStreaming(message: string, opts: { language?: ChatLanguage | string; sessionId?: string; signal?: AbortSignal; onDelta: (chunk: string) => void }): Promise<string>` — returns the complete text, having called `onDelta` as it arrived.

- [ ] **Step 1: Add the method**

In `src/services/chatbotService.ts`, add these imports at the top:

```ts
import { streamChatbot, StreamUnavailableError } from './chatbotStream';
```

Then add the method to the `ChatbotService` class, directly after the existing `sendMessage` implementation:

```ts
  /**
   * Same conversation logic as sendMessage — same retrieval, same system prompt,
   * same history — but the answer arrives in pieces.
   *
   * Falls back to sendMessage once, silently, when the endpoint cannot stream.
   * A shopper on an old deployment should get a slower answer, not an error.
   */
  async sendMessageStreaming(
    message: string,
    opts: {
      language?: ChatLanguage | string;
      sessionId?: string;
      signal?: AbortSignal;
      onDelta: (chunk: string) => void;
    },
  ): Promise<string> {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return '';

    const { language, sessionId } = this.resolveOptions(
      opts.sessionId ? { language: opts.language, sessionId: opts.sessionId } : opts.language,
      trimmedMessage,
    );

    const retrievalMessage = trimmedMessage.slice(0, MAX_SEARCHABLE_MESSAGE_CHARS);
    const productContext = await this.buildProductContext(retrievalMessage);
    const systemPrompt = productContext
      ? `${SYSTEM_PROMPTS[language]}\n\n${productContext}`
      : SYSTEM_PROMPTS[language];

    const openAIMessages = this.buildOpenAIMessages(sessionId, systemPrompt, trimmedMessage);

    let full = '';
    try {
      for await (const delta of streamChatbot(
        { messages: openAIMessages, max_tokens: 700, temperature: 0.2 },
        opts.signal,
      )) {
        full += delta;
        opts.onDelta(delta);
      }
    } catch (error: unknown) {
      if (error instanceof StreamUnavailableError) {
        // Endpoint cannot stream. One buffered attempt, then give up honestly.
        const buffered = await this.sendMessage(trimmedMessage, { language, sessionId });
        opts.onDelta(buffered);
        return buffered;
      }

      // Aborted by the user, or the connection dropped. Whatever arrived is real
      // and stays on screen; the caller decides whether to offer a retry.
      if (full.trim()) {
        this.appendHistory(sessionId, 'user', trimmedMessage);
        this.appendHistory(sessionId, 'model', this.sanitizeAssistantText(full));
      }
      throw error;
    }

    const aiText = this.sanitizeAssistantText(full) || RESPONSE_COPY[language].genericFailure;
    this.appendHistory(sessionId, 'user', trimmedMessage);
    this.appendHistory(sessionId, 'model', aiText);
    return aiText;
  }
```

- [ ] **Step 2: Check `resolveOptions` accepts both shapes**

```bash
grep -n "private resolveOptions" -A 20 src/services/chatbotService.ts
```

If it does not accept an object with `{ language, sessionId }`, adapt the call above to match its real signature rather than changing `resolveOptions` — every existing caller depends on it.

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit && npx eslint src/services/chatbotService.ts && npx jest __tests__
```

Expected: all clean, 181+ tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/services/chatbotService.ts
git commit -m "feat(chat): sendMessageStreaming, with a silent fallback to the buffered call

Same retrieval, system prompt and history as sendMessage — only the delivery
differs. StreamUnavailableError falls back to sendMessage once, so a shopper on
an older deployment gets a slower answer rather than an error.

A drop or an abort keeps whatever text arrived and records it in history, so the
next question still has the conversation behind it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 6: Wire streaming into the screen

**Files:**
- Modify: `src/screens/ChatbotScreen.tsx:206-250` (the `sendMessage` callback)
- Modify: `src/services/chatbotService.ts` (the `ChatMessage` interface at line 9)
- Modify: `src/locales/en.json`, `src/locales/ar.json`, `src/locales/ku.json`

**Interfaces:**
- Consumes: `chatbotService.sendMessageStreaming` from Task 5.
- Produces: `ChatMessage` gains `streaming?: boolean`. A message with `streaming: true` is still being written.

- [ ] **Step 1: Extend the message type**

In `src/services/chatbotService.ts`, add one field to `ChatMessage`:

```ts
export interface ChatMessage {
  id: string;
  role: HistoryRole;
  content: string;
  timestamp: Date;
  type?: 'text' | 'voice' | string;
  /** True while the text is still arriving. Drives the caret and suppresses markdown. */
  streaming?: boolean;
  attachmentUrl?: string | null;
  fileMetadata?: {
    duration?: number;
    name?: string;
    size?: number;
    mimeType?: string;
    waveform?: number[];
  } | null;
}
```

- [ ] **Step 2: Add the retry string to all three locale files**

`src/locales/en.json`, under `chatbot`:

```json
"retry": "Retry"
```

`src/locales/ar.json`, under `chatbot`:

```json
"retry": "إعادة المحاولة"
```

`src/locales/ku.json`, under `chatbot`:

```json
"retry": "هەوڵدانەوە"
```

- [ ] **Step 3: Replace the send callback**

Replace the body of `sendMessage` in `src/screens/ChatbotScreen.tsx` with:

```tsx
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
      };

      // The assistant row exists before a single byte arrives, so the dots appear
      // in the conversation where the answer will be, not in a separate widget.
      const aiId = `ai-${Date.now()}`;
      const aiMessage: ChatMessage = {
        id: aiId,
        role: 'model',
        content: '',
        timestamp: new Date(),
        streaming: true,
      };

      setMessages(prev => [...prev, userMessage, aiMessage]);
      setInputText('');
      setIsLoading(true);
      setTimeout(() => scrollToBottom(true), 50);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const messageLanguage = detectMessageLanguage(trimmed);
        await chatbotService.sendMessageStreaming(trimmed, {
          language: messageLanguage,
          signal: controller.signal,
          onDelta: chunk => {
            setMessages(prev =>
              prev.map(m => (m.id === aiId ? { ...m, content: m.content + chunk } : m)),
            );
          },
        });

        setMessages(prev => prev.map(m => (m.id === aiId ? { ...m, streaming: false } : m)));
      } catch (error: any) {
        // Whatever arrived stays. An empty answer becomes the error text; a partial
        // one keeps its words and is simply marked finished.
        setMessages(prev =>
          prev.map(m =>
            m.id === aiId
              ? {
                  ...m,
                  streaming: false,
                  content: m.content || error?.message || t('chatbot.errorMessage'),
                }
              : m,
          ),
        );
      } finally {
        abortRef.current = null;
        setIsLoading(false);
        setTimeout(() => scrollToBottom(true), 50);
      }
    },
    [isLoading, scrollToBottom, t],
  );
```

- [ ] **Step 4: Add the abort ref**

Next to the other refs near the top of the component:

```tsx
  const abortRef = useRef<AbortController | null>(null);
```

And abort on unmount, so leaving the screen mid-answer does not leave a socket open:

```tsx
  useEffect(() => () => abortRef.current?.abort(), []);
```

- [ ] **Step 5: Render streaming text**

In `renderMessage`, the assistant branch must show the dots while `streaming` is true and `content` is empty. Replace the assistant `<Text>` block's content expression with:

```tsx
{item.role !== 'user' && item.streaming && !item.content
  ? t('chatbot.typing')
  : item.content}
```

The permanent version of this lands in Task 8; this step only keeps the screen coherent between tasks.

- [ ] **Step 6: Verify on the device**

```bash
cd /Users/maci/Desktop/Asankary && npx expo start --dev-client
```

Ask "what chargers do you have?" and confirm:
1. Text appears progressively rather than all at once.
2. Turning Wi-Fi off mid-answer leaves the partial text on screen, not a blank bubble.
3. Leaving the screen mid-answer does not warn about setting state on an unmounted component.

- [ ] **Step 7: Verify aiProductFill is untouched**

In the admin app: Products → any product → type a name → AI fill. It must still work. It uses `safeCallFunction` without the flag, so it takes the unchanged path.

- [ ] **Step 8: Commit**

```bash
npx tsc --noEmit && npx eslint src/screens/ChatbotScreen.tsx && npx jest __tests__
git add -A
git commit -m "feat(chat): stream the answer into the conversation

The assistant row is created before the first byte, so the waiting state lives
where the answer will be instead of in a separate widget below the list.

A drop or an abort keeps the partial text: it is real output, and deleting it to
show an error would throw away the only thing the shopper can act on. Leaving the
screen aborts the request rather than writing to an unmounted component.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

**PHASE 1 GATE:** streaming visible on the device, partial text survives a dropped connection, `aiProductFill` still works. Stop here for review.

---

# PHASE 2 — Rendering extracted and redesigned

### Task 7: `AssistantMessage`, `UserBubble`, `TypingDots`

**Files:**
- Create: `src/components/chat/TypingDots.tsx`
- Create: `src/components/chat/AssistantMessage.tsx`
- Create: `src/components/chat/UserBubble.tsx`
- Modify: `src/screens/ChatbotScreen.tsx` (`renderMessage`)

**Interfaces:**
- Consumes: `ChatMessage` from `src/services/chatbotService.ts`; the markdown renderer chosen in Task 1.
- Produces:
  - `TypingDots: ({ color }: { color: string }) => JSX.Element`
  - `AssistantMessage: ({ text, streaming, isRTL, theme, time }: { text: string; streaming: boolean; isRTL: boolean; theme: any; time?: string }) => JSX.Element`
  - `UserBubble: ({ text, isRTL, theme, time }: { text: string; isRTL: boolean; theme: any; time?: string }) => JSX.Element`

- [ ] **Step 1: Write TypingDots**

Create `src/components/chat/TypingDots.tsx`:

```tsx
import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';

/**
 * Three dots breathing in sequence. Replaces the old string that grew '.' → '..'
 * → '...', which re-rendered the whole message row on a timer and reflowed the
 * list every 400ms.
 */
const TypingDots: React.FC<{ color: string }> = ({ color }) => {
  const dots = [useRef(new Animated.Value(0.35)).current, useRef(new Animated.Value(0.35)).current, useRef(new Animated.Value(0.35)).current];

  useEffect(() => {
    const animations = dots.map((value, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(value, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(value, { toValue: 0.35, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.delay((2 - i) * 160),
        ]),
      ),
    );
    animations.forEach(a => a.start());
    return () => animations.forEach(a => a.stop());
  }, [dots]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 22 }}>
      {dots.map((value, i) => (
        <Animated.View
          key={i}
          style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, opacity: value, marginRight: i < 2 ? 4 : 0 }}
        />
      ))}
    </View>
  );
};

export default React.memo(TypingDots);
```

- [ ] **Step 2: Write AssistantMessage**

Create `src/components/chat/AssistantMessage.tsx`. Import the renderer Task 1 chose — `Markdown from 'react-native-markdown-display'` if it survived, otherwise `MarkdownLite from './MarkdownLite'`:

```tsx
import React from 'react';
import { View, Text, Image } from 'react-native';
import { SPACING } from '../../constants/theme';
import TypingDots from './TypingDots';
import MarkdownLite from './MarkdownLite';

interface Props {
  text: string;
  streaming: boolean;
  isRTL: boolean;
  theme: any;
  time?: string;
}

/**
 * Full width, no bubble, small avatar at the leading edge.
 *
 * A bubble capped at 75% forced a line break every few words in Kurdish and
 * Arabic, whose words are longer than the English this layout was designed
 * against. Running the text to the edge is also the only way a product card
 * strip fits without looking wedged in.
 *
 * While streaming the text renders PLAIN. Parsing markdown on every delta would
 * rebuild the whole tree dozens of times a second; the swap on completion is
 * invisible because the words do not move.
 */
const AssistantMessage: React.FC<Props> = ({ text, streaming, isRTL, theme, time }) => {
  return (
    <View
      style={{
        flexDirection: isRTL ? 'row-reverse' : 'row',
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm,
        alignItems: 'flex-start',
      }}
    >
      <Image
        source={require('../../../assets/images/asankarylogo.png')}
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          ...(isRTL ? { marginLeft: SPACING.sm } : { marginRight: SPACING.sm }),
        }}
      />

      <View style={{ flex: 1 }}>
        {streaming && !text ? (
          <TypingDots color={theme.colors.textSecondary} />
        ) : streaming ? (
          <Text
            allowFontScaling={false}
            style={{
              fontSize: 15,
              lineHeight: 22,
              color: theme.colors.text,
              textAlign: isRTL ? 'right' : 'left',
              includeFontPadding: false,
            }}
          >
            {text}
          </Text>
        ) : (
          <MarkdownLite text={text} isRTL={isRTL} color={theme.colors.text} />
        )}

        {!!time && !streaming && (
          <Text
            allowFontScaling={false}
            style={{
              fontSize: 11,
              color: theme.colors.textSecondary,
              marginTop: 4,
              textAlign: isRTL ? 'right' : 'left',
            }}
          >
            {time}
          </Text>
        )}
      </View>
    </View>
  );
};

export default React.memo(AssistantMessage);
```

- [ ] **Step 3: Write UserBubble**

Create `src/components/chat/UserBubble.tsx`:

```tsx
import React from 'react';
import { View, Text, Platform } from 'react-native';
import { SPACING } from '../../constants/theme';

interface Props {
  text: string;
  isRTL: boolean;
  theme: any;
  time?: string;
}

/** The user keeps a bubble: it is what makes the two voices readable apart. */
const UserBubble: React.FC<Props> = ({ text, isRTL, theme, time }) => (
  <View style={{ paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, alignItems: isRTL ? 'flex-start' : 'flex-end' }}>
    <View
      style={{
        maxWidth: '80%',
        backgroundColor: theme.colors.primary,
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm,
        borderRadius: 18,
        ...(isRTL ? { borderTopLeftRadius: 4 } : { borderTopRightRadius: 4 }),
      }}
    >
      <Text
        allowFontScaling={false}
        style={{
          fontSize: 15,
          lineHeight: Platform.OS === 'android' ? 24 : 22,
          color: '#FFFFFF',
          textAlign: isRTL ? 'right' : 'left',
          includeFontPadding: false,
        }}
      >
        {text}
      </Text>
    </View>
    {!!time && (
      <Text allowFontScaling={false} style={{ fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 }}>
        {time}
      </Text>
    )}
  </View>
);

export default React.memo(UserBubble);
```

- [ ] **Step 4: Use them in the screen**

In `src/screens/ChatbotScreen.tsx`, add the imports:

```tsx
import AssistantMessage from '../components/chat/AssistantMessage';
import UserBubble from '../components/chat/UserBubble';
```

Then replace the non-voice branch of `renderMessage` so the whole function reads:

```tsx
  const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
    const isUser = item.role === 'user';
    const showTimestamp =
      index === messages.length - 1 ||
      (messages[index + 1] &&
        new Date(messages[index + 1].timestamp).getTime() - new Date(item.timestamp).getTime() > 60000);
    const time = showTimestamp ? formatTime(new Date(item.timestamp)) : undefined;

    if (item.type === 'voice') {
      return (
        <View style={{ marginVertical: SPACING.xs, paddingHorizontal: SPACING.md }}>
          <View style={{ flexDirection: 'row', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
            <VoiceBubble
              mine={isUser}
              attachmentUrl={item.attachmentUrl}
              fileMetadata={item.fileMetadata as any}
              theme={theme}
              time={formatTime(new Date(item.timestamp))}
            />
          </View>
        </View>
      );
    }

    return isUser ? (
      <UserBubble text={item.content} isRTL={isRTL} theme={theme} time={time} />
    ) : (
      <AssistantMessage
        text={item.content}
        streaming={!!item.streaming}
        isRTL={isRTL}
        theme={theme}
        time={time}
      />
    );
  };
```

- [ ] **Step 5: Delete the now-dead code**

Remove `renderTypingIndicator` and its `ListFooterComponent={renderTypingIndicator()}` prop — the waiting state now lives inside the assistant row. Confirm nothing else references it:

```bash
grep -n "renderTypingIndicator\|typingDots" src/screens/ChatbotScreen.tsx
```

Expected: no matches. Also remove the `typingDots` state and the `useEffect` that animated it.

- [ ] **Step 6: Verify on the device, in all three languages**

Switch language in Profile between English, Arabic and Kurdish. In each: send a message, confirm the assistant text is full width and correctly aligned, the avatar is on the leading edge, and a voice message still plays.

- [ ] **Step 7: Commit**

```bash
npx tsc --noEmit && npx eslint src/components/chat src/screens/ChatbotScreen.tsx && npx jest __tests__
git add -A
git commit -m "feat(chat): full-width assistant messages, extracted from the screen

A 75%-capped bubble broke a line every few words in Kurdish and Arabic, whose
words are longer than the English the layout was tuned against. Assistant text
now runs full width with a 28pt avatar; the user keeps a bubble, which is what
keeps the two voices apart.

Markdown is parsed once, on completion — never per delta, which would rebuild
the tree dozens of times a second while streaming.

The old typing widget and its 400ms string timer are gone: the waiting state is
now the assistant row itself.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

**PHASE 2 GATE:** new layout verified in English, Arabic and Kurdish; voice messages unaffected. Stop for review.

---

# PHASE 3 — Product cards

### Task 8: Marker parsing

**Files:**
- Create: `src/utils/chatMarkers.ts`
- Test: `__tests__/utils/chatMarkers.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `extractProductIds(text: string): string[]`
  - `stripProductMarker(text: string): string`
  - `visibleDuringStream(text: string): string` — hides a trailing partial marker.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/utils/chatMarkers.test.ts`:

```ts
import { extractProductIds, stripProductMarker, visibleDuringStream } from '../../src/utils/chatMarkers';

const A = '99244efe-07dc-4929-9445-e9ed5df9e007';
const B = '40d1e82d-8b62-4a21-9be4-7db526a4ec94';

describe('extractProductIds', () => {
  it('reads the ids out of the marker', () => {
    expect(extractProductIds(`Try this.\n<<products:${A},${B}>>`)).toEqual([A, B]);
  });

  it('returns nothing when there is no marker', () => {
    expect(extractProductIds('We have several chargers.')).toEqual([]);
  });

  it('ignores an empty marker', () => {
    expect(extractProductIds('Text\n<<products:>>')).toEqual([]);
  });

  it('drops blanks and duplicates', () => {
    expect(extractProductIds(`x\n<<products:${A},,${A},${B}>>`)).toEqual([A, B]);
  });
});

describe('stripProductMarker', () => {
  it('removes the marker and the whitespace before it', () => {
    expect(stripProductMarker(`Answer here.\n\n<<products:${A}>>`)).toBe('Answer here.');
  });

  it('leaves text without a marker untouched', () => {
    expect(stripProductMarker('Just an answer.')).toBe('Just an answer.');
  });
});

describe('visibleDuringStream', () => {
  it('hides a complete marker', () => {
    expect(visibleDuringStream(`Answer.\n<<products:${A}>>`)).toBe('Answer.');
  });

  it('hides a marker that is still arriving', () => {
    expect(visibleDuringStream('Answer.\n<<produ')).toBe('Answer.');
    expect(visibleDuringStream(`Answer.\n<<products:${A.slice(0, 8)}`)).toBe('Answer.');
  });

  it('hides a bare opening bracket pair', () => {
    expect(visibleDuringStream('Answer.\n<<')).toBe('Answer.');
  });

  it('does not eat ordinary text containing a single angle bracket', () => {
    expect(visibleDuringStream('Use a cable < 2m long')).toBe('Use a cable < 2m long');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx jest __tests__/utils/chatMarkers.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

Create `src/utils/chatMarkers.ts`:

```ts
/**
 * The assistant ends product recommendations with a machine-readable marker:
 *
 *     <<products:uuid,uuid,uuid>>
 *
 * The shopper must never see it. Three cases matter, and the third is the one
 * that bites: while streaming, the marker arrives a few characters at a time, so
 * a naive strip shows "<<produ" on screen for a frame or two before it completes.
 */
const COMPLETE = /\n*\s*<<products:([^>]*)>>\s*$/;
/** Any trailing prefix of the opening sequence, however short. */
const PARTIAL = /\n*\s*<(?:<(?:p(?:r(?:o(?:d(?:u(?:c(?:t(?:s(?::[^>]*)?)?)?)?)?)?)?)?)?)?$/;

export function extractProductIds(text: string): string[] {
  const match = text.match(COMPLETE);
  if (!match) return [];
  const seen = new Set<string>();
  return match[1]
    .split(',')
    .map(id => id.trim())
    .filter(id => {
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

export function stripProductMarker(text: string): string {
  return text.replace(COMPLETE, '').trimEnd();
}

/**
 * What to show while the answer is still arriving: the complete marker if it has
 * landed, and any partial one that has not.
 */
export function visibleDuringStream(text: string): string {
  return stripProductMarker(text).replace(PARTIAL, '').trimEnd();
}
```

- [ ] **Step 4: Run the tests**

```bash
npx jest __tests__/utils/chatMarkers.test.ts
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit && npx eslint src/utils/chatMarkers.ts
git add src/utils/chatMarkers.ts __tests__/utils/chatMarkers.test.ts
git commit -m "feat(chat): parse the product marker, including while it streams

The marker arrives a few characters at a time, so a naive strip flashes '<<produ'
on screen before it completes. visibleDuringStream withholds any trailing prefix
of the opening sequence, and that case is what the tests are mostly about.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 9: Ask the model for the marker

**Files:**
- Modify: `src/services/chatbotService.ts` (the `SYSTEM_PROMPTS` object)

**Interfaces:**
- Consumes: nothing.
- Produces: assistant answers that end with `<<products:…>>` when they recommend specific products.

- [ ] **Step 1: Find the prompts**

```bash
grep -n "SYSTEM_PROMPTS" -A 6 src/services/chatbotService.ts | head -30
```

- [ ] **Step 2: Append the instruction to each language's prompt**

Append this to the English prompt, and translate the same instruction into the Arabic and Kurdish prompts. The marker itself and the ids stay in Latin characters in all three:

```
When you recommend specific products from the catalogue above, end your reply with a line in exactly this form, using the product ids given in the catalogue:
<<products:ID1,ID2>>
List at most three, most relevant first. Never mention this line, never explain it, and never write it when you are not recommending specific products.
```

- [ ] **Step 3: Verify against the deployed function with real ids**

```bash
node -e '
const fs=require("fs");
const env=Object.fromEntries(fs.readFileSync(".env","utf8").split("\n").filter(l=>l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim()]));
const url=env.EXPO_PUBLIC_SUPABASE_URL,key=env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const h={apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"};
(async()=>{
  const rows=await fetch(url+"/rest/v1/parts?select=id,name,price_usd&is_active=eq.true&limit=4",{headers:h}).then(r=>r.json());
  const catalogue=rows.map(r=>`- id=${r.id} name=${r.name} price=$${r.price_usd}`).join("\n");
  const sys=`You are a shop assistant.\n\nCATALOGUE:\n${catalogue}\n\nWhen you recommend specific products from the catalogue above, end your reply with a line in exactly this form, using the product ids given in the catalogue:\n<<products:ID1,ID2>>\nList at most three, most relevant first. Never mention this line, never explain it, and never write it when you are not recommending specific products.`;
  const r=await fetch(url+"/functions/v1/askChatbot",{method:"POST",headers:h,body:JSON.stringify({data:{messages:[{role:"system",content:sys},{role:"user",content:"Which charger should I buy?"}],max_tokens:250}})});
  const j=await r.json();
  console.log(j.text);
  console.log("\nMARKER PRESENT:", /<<products:[^>]+>>/.test(j.text||""));
})();
'
```

Expected: the answer ends with a marker naming ids that appear in the catalogue block. If the model omits it more than occasionally, strengthen the wording before moving on — the fallback is "no cards", which is acceptable but wasteful.

- [ ] **Step 4: Commit**

```bash
npx tsc --noEmit && npx jest __tests__
git add src/services/chatbotService.ts
git commit -m "feat(chat): ask the model to name the products it recommends

One instruction per language prompt. The marker is optional by construction: an
answer without one renders normally and simply shows no cards, so a forgotten
instruction degrades instead of breaking.

Verified against the deployed function with real catalogue ids.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 10: Product card strip

**Files:**
- Create: `src/components/chat/ProductCardStrip.tsx`
- Modify: `src/components/chat/AssistantMessage.tsx`
- Modify: `src/screens/ChatbotScreen.tsx`
- Modify: `src/services/chatbotService.ts` (expose a lookup)
- Modify: `src/locales/en.json`, `ar.json`, `ku.json`

**Interfaces:**
- Consumes: `extractProductIds`, `visibleDuringStream`, `stripProductMarker` from `src/utils/chatMarkers.ts`.
- Produces:
  - `chatbotService.getProductsByIds(ids: string[]): Promise<ProductRecord[]>` — resolves against the cached catalogue, preserving the given order, skipping unknown ids.
  - `ProductCardStrip: ({ ids, isRTL, theme, onOpen }: { ids: string[]; isRTL: boolean; theme: any; onOpen: (id: string) => void }) => JSX.Element | null`

- [ ] **Step 1: Add the lookup to the service**

In `src/services/chatbotService.ts`, add to the `ChatbotService` class:

```ts
  /**
   * Resolve marker ids against the catalogue already in memory. Order is the
   * model's, because it ranked them. Unknown ids are skipped rather than
   * rendered as blanks — a hallucinated id must cost nothing.
   */
  async getProductsByIds(ids: string[]): Promise<ProductRecord[]> {
    if (!ids.length) return [];
    const catalog = await this.getActiveProductCatalog();
    const byId = new Map(catalog.map(p => [p.id, p]));
    return ids.map(id => byId.get(id)).filter((p): p is ProductRecord => !!p);
  }
```

Export the record type if it is not already exported:

```bash
grep -n "^export interface ProductRecord\|^interface ProductRecord" src/services/chatbotService.ts
```

If it is not exported, add `export` to it.

- [ ] **Step 2: Add the strings**

`en.json` under `chatbot`:

```json
"outOfStock": "Out of stock"
```

`ar.json`:

```json
"outOfStock": "غير متوفر"
```

`ku.json`:

```json
"outOfStock": "نەماوە"
```

- [ ] **Step 3: Write the strip**

Create `src/components/chat/ProductCardStrip.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { SPACING } from '../../constants/theme';
import { chatbotService } from '../../services/chatbotService';
import AppNumber from '../AppNumber';

interface Props {
  ids: string[];
  isRTL: boolean;
  theme: any;
  onOpen: (id: string) => void;
}

/**
 * Real catalogue rows only. Ids the model invented resolve to nothing and are
 * skipped, so a hallucination costs an absent card rather than a broken one.
 *
 * Horizontal ScrollView, not a FlatList: the strip holds at most three cards, and
 * a nested vertical list would break the screen's single-scroll-owner rule.
 */
const ProductCardStrip: React.FC<Props> = ({ ids, isRTL, theme, onOpen }) => {
  const { t } = useTranslation();
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    let alive = true;
    chatbotService
      .getProductsByIds(ids)
      .then(rows => {
        if (alive) setProducts(rows);
      })
      .catch(() => {
        // A card strip is an enhancement. If the catalogue is unreachable the
        // answer above it is still the useful part.
        if (alive) setProducts([]);
      });
    return () => {
      alive = false;
    };
  }, [ids]);

  if (!products.length) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingVertical: SPACING.sm, gap: SPACING.sm }}
      style={{ marginTop: SPACING.xs }}
    >
      {products.map(product => {
        const inStock = (product.stockQty ?? 0) > 0;
        return (
          <Pressable
            key={product.id}
            onPress={() => onOpen(product.id)}
            style={({ pressed }) => ({
              width: 150,
              borderRadius: 12,
              overflow: 'hidden',
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Image
              source={{ uri: product.imageUrls?.[0] }}
              style={{ width: '100%', aspectRatio: 1, backgroundColor: theme.colors.background }}
              contentFit="cover"
              transition={120}
            />
            <View style={{ padding: SPACING.sm }}>
              <Text
                allowFontScaling={false}
                numberOfLines={2}
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: theme.colors.text,
                  textAlign: isRTL ? 'right' : 'left',
                  minHeight: 34,
                }}
              >
                {product.name}
              </Text>
              <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', marginTop: 4 }}>
                <AppNumber value={product.priceUSD} prefix="$" style={{ fontSize: 14, fontWeight: '700', color: theme.colors.primary }} />
              </View>
              {!inStock && (
                <Text
                  allowFontScaling={false}
                  style={{ fontSize: 11, color: theme.colors.error, marginTop: 2, textAlign: isRTL ? 'right' : 'left' }}
                >
                  {t('chatbot.outOfStock')}
                </Text>
              )}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

export default React.memo(ProductCardStrip);
```

> Check `AppNumber`'s real props before finalising this file: `grep -n "interface\|Props" src/components/AppNumber.tsx | head`. Match its actual signature rather than the `value`/`prefix` guessed here.

Also confirm the catalogue record carries images:

```bash
grep -n "imageUrls\|image_urls" src/services/chatbotService.ts | head
```

If `mapPartRow` does not map `image_urls`, add it there and add `image_urls` to `CATALOG_COLUMNS` — it is granted to `anon`, verified by the existing product grid which reads it.

- [ ] **Step 4: Render the strip under the answer**

In `AssistantMessage.tsx`, add two props and use the marker helpers:

```tsx
import { stripProductMarker, visibleDuringStream, extractProductIds } from '../../utils/chatMarkers';
import ProductCardStrip from './ProductCardStrip';

// add to Props:
//   onOpenProduct?: (id: string) => void;

// inside the component, replace the text expressions:
const visible = streaming ? visibleDuringStream(text) : stripProductMarker(text);
const productIds = streaming ? [] : extractProductIds(text);

// ...render `visible` instead of `text` in both the streaming and finished branches,
// and after the body:
{!streaming && productIds.length > 0 && onOpenProduct && (
  <ProductCardStrip ids={productIds} isRTL={isRTL} theme={theme} onOpen={onOpenProduct} />
)}
```

- [ ] **Step 5: Pass the navigation handler from the screen**

In `renderMessage` in `src/screens/ChatbotScreen.tsx`:

```tsx
      <AssistantMessage
        text={item.content}
        streaming={!!item.streaming}
        isRTL={isRTL}
        theme={theme}
        time={time}
        onOpenProduct={(id: string) => navigation.navigate('ProductDetails', { productId: id })}
      />
```

Confirm the route name and param key against the navigator before running:

```bash
grep -n "ProductDetails" src/navigation/AppNavigator.tsx | head -3
```

- [ ] **Step 6: Verify on the device with real data**

Ask "what chargers do you have?". Expected: real cards with real photos and prices, tapping one opens that product. Then ask "what are your delivery times?" — an answer with no marker — and confirm no empty space is left where cards would be.

- [ ] **Step 7: Commit**

```bash
npx tsc --noEmit && npx eslint src/components/chat src/screens/ChatbotScreen.tsx src/services/chatbotService.ts && npx jest __tests__
git add -A
git commit -m "feat(chat): real product cards under the answer

Ids come from the model's own marker and resolve against the catalogue already
in memory, so a card costs no extra request. Unknown ids are skipped rather than
rendered as blanks — a hallucinated id must cost nothing.

Horizontal ScrollView rather than a list, so the screen keeps exactly one
vertical scroll owner.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

**PHASE 3 GATE:** cards render from live data and open the right product; an answer without a marker looks correct. Stop for review.

---

# PHASE 4 — Chrome and motion

### Task 11: Pinned chips, empty state, entrance animation

**Files:**
- Create: `src/components/chat/QuickChips.tsx`
- Modify: `src/screens/ChatbotScreen.tsx`
- Modify: `src/locales/en.json`, `ar.json`, `ku.json`

**Interfaces:**
- Consumes: nothing new.
- Produces: `QuickChips: ({ items, isRTL, theme, onPress }: { items: Array<{ key: string; label: string }>; isRTL: boolean; theme: any; onPress: (key: string) => void }) => JSX.Element`

- [ ] **Step 1: Write the chips**

Create `src/components/chat/QuickChips.tsx`:

```tsx
import React from 'react';
import { ScrollView, Pressable, Text } from 'react-native';
import { SPACING } from '../../constants/theme';

interface Props {
  items: Array<{ key: string; label: string }>;
  isRTL: boolean;
  theme: any;
  onPress: (key: string) => void;
}

/**
 * Pinned above the input rather than sitting in ListHeaderComponent, where they
 * scrolled off after the first message and never came back — which is when a
 * shopper most needs a next step.
 */
const QuickChips: React.FC<Props> = ({ items, isRTL, theme, onPress }) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={{
      paddingHorizontal: SPACING.md,
      paddingBottom: SPACING.sm,
      gap: SPACING.sm,
      flexDirection: isRTL ? 'row-reverse' : 'row',
    }}
    keyboardShouldPersistTaps="always"
  >
    {items.map(item => (
      <Pressable
        key={item.key}
        onPress={() => onPress(item.key)}
        style={({ pressed }) => ({
          paddingHorizontal: SPACING.md,
          paddingVertical: 8,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: pressed ? theme.colors.primary + '14' : theme.colors.background,
        })}
      >
        <Text allowFontScaling={false} style={{ fontSize: 13, color: theme.colors.text }}>
          {item.label}
        </Text>
      </Pressable>
    ))}
  </ScrollView>
);

export default React.memo(QuickChips);
```

- [ ] **Step 2: Mount the chips in the bottom bar**

In `src/screens/ChatbotScreen.tsx`, inside the absolutely-positioned bottom bar, above `renderSecondaryActions()`:

```tsx
          {messages.length < 8 && (
            <QuickChips
              items={quickActions.map(a => ({ key: a.key, label: a.label }))}
              isRTL={isRTL}
              theme={theme}
              onPress={handleQuickAction}
            />
          )}
```

They disappear once the conversation is properly underway; suggestions stop helping and start taking space.

- [ ] **Step 3: Remove them from the list header**

```tsx
// delete this prop from the FlatList:
ListHeaderComponent={renderQuickActions}
```

Then delete `renderQuickActions` itself and confirm:

```bash
grep -n "renderQuickActions" src/screens/ChatbotScreen.tsx
```

Expected: no matches.

- [ ] **Step 4: Empty state**

Replace the seeded greeting message in `useState<ChatMessage[]>([...])` with an empty array, and give the list an `ListEmptyComponent`:

```tsx
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 64, paddingHorizontal: SPACING.xl }}>
            <Image
              source={require('../../assets/images/asankarylogo.png')}
              style={{ width: 56, height: 56, borderRadius: 28, marginBottom: SPACING.md }}
            />
            <Text
              allowFontScaling={false}
              style={{ fontSize: 18, fontWeight: '700', color: theme.colors.text, textAlign: 'center' }}
            >
              {t('chatbot.emptyTitle')}
            </Text>
            <Text
              allowFontScaling={false}
              style={{
                fontSize: 14,
                color: theme.colors.textSecondary,
                textAlign: 'center',
                marginTop: 6,
                lineHeight: 20,
              }}
            >
              {t('chatbot.emptyBody')}
            </Text>
          </View>
        }
```

Add to `en.json`:

```json
"emptyTitle": "Ask about anything in the shop",
"emptyBody": "Prices, stock, delivery, or your orders. Answers come from the live catalogue."
```

`ar.json`:

```json
"emptyTitle": "اسأل عن أي شيء في المتجر",
"emptyBody": "الأسعار، التوفر، التوصيل، أو طلباتك. الإجابات من الكتالوج المباشر."
```

`ku.json`:

```json
"emptyTitle": "پرسیار لە هەر شتێکی فرۆشگا بکە",
"emptyBody": "نرخ، بوونی کاڵا، گەیاندن، یان داواکاریەکانت. وەڵامەکان لە کاتالۆگی زیندووەوە دێن."
```

> The greeting was a fake assistant message in the transcript — it looked like something the assistant had said when nothing had been asked. The empty state says the same thing without pretending to be a turn in the conversation.

- [ ] **Step 5: Entrance animation**

Wrap the returned row in `renderMessage` with Reanimated's `FadeInDown`, which the project already uses:

```tsx
import Animated, { FadeInDown } from 'react-native-reanimated';

// wrap the returned element:
<Animated.View entering={FadeInDown.duration(220).springify().damping(18)}>
  {/* the UserBubble or AssistantMessage */}
</Animated.View>
```

Do not animate a message while it is streaming — the row is already mounted and re-animating on every delta would make the text jump. Gate it:

```tsx
entering={item.streaming ? undefined : FadeInDown.duration(220).springify().damping(18)}
```

- [ ] **Step 6: Verify on the device in Kurdish**

Chips reachable after several messages, chips gone after eight, empty state correct on a cleared chat (trash icon), messages animating in once and not re-animating as they stream.

- [ ] **Step 7: Commit**

```bash
npx tsc --noEmit && npx eslint src/components/chat src/screens/ChatbotScreen.tsx && npx jest __tests__
git add -A
git commit -m "feat(chat): pinned suggestions, a real empty state, entrance motion

Chips move out of ListHeaderComponent, where they scrolled away after the first
message and never returned — exactly when a shopper needs a next step. They
retire once the conversation is underway.

The seeded greeting is gone. It was a fabricated assistant turn sitting in the
transcript before anything had been asked; the empty state says the same thing
without pretending to be part of the conversation.

Messages animate in once. Streaming rows are excluded, or the text would jump on
every delta.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

**PHASE 4 GATE:** verified in RTL, single scroll owner intact. Stop for review.

---

# PHASE 5 — Review pass

### Task 12: Read the whole diff and finish it

**Files:**
- Modify: whatever the read turns up.

**Interfaces:**
- Consumes: everything above.
- Produces: nothing new.

- [ ] **Step 1: Read the complete diff**

```bash
git diff --stat main...HEAD
git diff main...HEAD -- src/screens/ChatbotScreen.tsx | head -400
```

- [ ] **Step 2: Confirm no dead code survived**

```bash
grep -n "typingDots\|renderTypingIndicator\|renderQuickActions" src/screens/ChatbotScreen.tsx
```

Expected: no matches.

- [ ] **Step 3: Confirm every new string exists in all three locales**

```bash
for k in retry outOfStock emptyTitle emptyBody; do
  for l in en ar ku; do
    printf "%s %s: " "$l" "$k"
    python3 -c "
import json,sys
d=json.load(open('src/locales/$l.json'))
print('OK' if '$k' in d.get('chatbot',{}) else 'MISSING')"
  done
done
```

Expected: twelve `OK` lines.

- [ ] **Step 4: Confirm no fake data was introduced**

```bash
grep -rniE "lorem|placeholder product|sample (product|answer|message)|demo (product|answer)|fake" src/components/chat src/utils/chatMarkers.ts src/services/chatbotStream.ts
```

Expected: no matches. This is the shop's explicit constraint.

- [ ] **Step 5: Confirm the screen actually shrank**

```bash
wc -l src/screens/ChatbotScreen.tsx
```

Expected: meaningfully below the 982 lines it started at. If it grew, the extraction did not happen properly — say so rather than accepting it.

- [ ] **Step 6: Full verification**

```bash
npx tsc --noEmit && npx eslint src/ --ext .ts,.tsx && npx jest __tests__
```

- [ ] **Step 7: Device pass, all three languages**

English, Arabic, Kurdish. Send a message, watch it stream, tap a product card, clear the chat, check the empty state, send a voice message, drop Wi-Fi mid-answer.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore(chat): review pass over the assistant redesign

Dead code from the old layout removed, every new string present in en/ar/ku,
no fabricated data anywhere in the feature, screen file reduced from 982 lines.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-review notes

**Spec coverage:** streaming (Tasks 2-6), markdown (Task 1, integrated Task 7), product cards (Tasks 8-10), full-width layout (Task 7), chips/empty state/motion (Task 11), review pass (Task 12), error handling (Tasks 4-6), tests for pure logic (Tasks 2, 8). Every phase in the spec has tasks.

**Known soft spots, deliberately left for the implementer to resolve against the real code rather than guessed at here:**

- `AppNumber`'s exact props (flagged inline in Task 10 with the command to check).
- Whether `resolveOptions` accepts an object (flagged inline in Task 5 with the command to check).
- Whether `mapPartRow` maps `image_urls` (flagged inline in Task 10, with the fix if it does not).
- The Arabic and Kurdish wording of the marker instruction in Task 9 — the English is exact; the translations are the implementer's, following the existing prompt voice.
