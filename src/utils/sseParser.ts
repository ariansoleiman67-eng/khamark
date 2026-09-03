/**
 * Server-Sent Events framing.
 *
 * Network chunks do not align with events: one chunk can carry several events, or
 * half of one, or end exactly on the blank line that terminates a frame. All of
 * that boundary handling lives here, so the transport can treat a stream as a
 * list of events and these rules can be tested without a network.
 *
 * Pure by design — no fetch, no React, no timers. That is what makes it testable
 * in this project, which runs jest over plain TypeScript with no native harness.
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
    // A leading ':' opens a comment. Proxies send these as keep-alives, and they
    // carry no payload — dropping them here keeps the caller from seeing noise.
    if (line.startsWith(':')) continue;

    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      // Exactly one leading space is part of the framing, not the payload.
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
  }

  // A frame with no data line at all is not an event. A frame whose data line is
  // empty IS one — `event: done` with `data: ` is how a stream signals the end.
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}
