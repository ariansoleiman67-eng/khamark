import { fetch as expoFetch } from 'expo/fetch';
import { SUPABASE_CONFIG } from '../constants/config';
import { createSSEParser, readChatbotFrame } from '../utils/sseParser';

/**
 * Why expo/fetch, and not the global fetch or supabase.functions.invoke:
 *
 * - React Native's global fetch is a polyfill over XMLHttpRequest and exposes no
 *   readable body, so a streamed response cannot be read as it arrives. This is
 *   what normally makes streaming impossible in an RN app.
 * - supabase.functions.invoke buffers the whole body before it resolves, so it
 *   cannot stream by construction.
 * - expo/fetch (Expo SDK 52+) returns a real ReadableStream body. Verified in
 *   node_modules/expo/src/winter/fetch/FetchResponse.ts.
 *
 * The anon key goes in both `apikey` and `Authorization`, which is what the
 * Supabase gateway expects and what functions.invoke sends on our behalf.
 */

export interface StreamRequest {
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  temperature?: number;
}

/**
 * The endpoint answered, but not with a stream — an old deployment, a gateway
 * error page, a JSON error body. Separate from a network failure because the
 * caller's response differs: this one falls back to the buffered call, a network
 * failure does not.
 */
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
    // The function unwraps `data`, matching what safeCallFunction sends, so both
    // paths hand it the same shape.
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
  // Whether ANY frame was readable. A stream that ends without one is a format
  // this build does not know, not an empty answer: report it as unavailable so
  // the caller falls back to the buffered call instead of showing the generic
  // failure for an answer that was actually sent.
  let understood = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // stream: true keeps multi-byte characters intact across chunk boundaries.
      // Kurdish and Arabic are multi-byte throughout, so without it a chunk that
      // splits a character mid-sequence renders as a replacement glyph.
      for (const event of parser.push(decoder.decode(value, { stream: true }))) {
        const frame = readChatbotFrame(event);
        if (!frame) continue;
        understood = true;
        if (frame.kind === 'text') {
          if (frame.text) yield frame.text;
        } else if (frame.kind === 'error') {
          throw new Error(frame.message);
        } else {
          return;
        }
      }
    }
    if (!understood) {
      throw new StreamUnavailableError('askChatbot streamed nothing this app can read');
    }
  } finally {
    // Matters on abort: without releasing, the socket stays open until GC.
    reader.releaseLock();
  }
}
