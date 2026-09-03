import { useEffect, useRef, useState } from 'react';

/**
 * Smooths chunky streaming into something that reads as typing.
 *
 * The Supabase edge runtime buffers the SSE response and flushes roughly every
 * 500ms, so text arrives in ~100-character blocks rather than token by token.
 * Rendering each arrival immediately makes the answer land in visible slabs.
 *
 * This holds the arrived text and reveals it at a catch-up rate: the further
 * behind it is, the faster it moves, so it never falls behind the stream and
 * never stalls waiting for the next chunk. When streaming stops it snaps to the
 * full text immediately — a finished answer must never be gated behind an
 * animation.
 */
export function useRevealedText(target: string, streaming: boolean): string {
  const [count, setCount] = useState(streaming ? 0 : target.length);

  // Held in a ref so the interval below reads the latest text without being torn
  // down and recreated on every delta, which would reset its cadence several
  // times a second and produce a visible stutter.
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    if (!streaming) {
      setCount(targetRef.current.length);
      return;
    }

    const timer = setInterval(() => {
      setCount(current => {
        const remaining = targetRef.current.length - current;
        if (remaining <= 0) return current;
        // Proportional catch-up: quick when a fresh chunk lands, gentle as it
        // closes the gap. The +1 floor guarantees forward progress over the last
        // few characters, where the proportion rounds down to zero.
        return current + Math.max(1, Math.ceil(remaining * 0.12));
      });
    }, 16);

    return () => clearInterval(timer);
  }, [streaming]);

  return target.slice(0, Math.min(count, target.length));
}
