/**
 * Minimal start/end timing marks, used to measure how long the admin area takes to
 * become interactive.
 *
 * Enabled in dev automatically. To measure a RELEASE build — which is the number
 * that actually matters, since a dev bundle is unminified and runs dev-mode React —
 * build with EXPO_PUBLIC_PERF_TRACE=1 and read the marks from the device log
 * (Console.app for iOS, `adb logcat -s ReactNativeJS` for Android).
 *
 * Disabled builds pay only a boolean check: no timestamps are taken and no strings
 * are built.
 */

const ENABLED = __DEV__ || process.env.EXPO_PUBLIC_PERF_TRACE === '1';

const marks = new Map<string, number>();

/** Stamp the start of a span. Re-marking an existing name restarts it. */
export const perfStart = (name: string): void => {
  if (!ENABLED) return;
  marks.set(name, Date.now());
};

/**
 * Close a span opened by perfStart and log its duration.
 * No-ops if the span was never started, so callers don't need to guard.
 */
export const perfEnd = (name: string, detail?: string): void => {
  if (!ENABLED) return;
  const startedAt = marks.get(name);
  if (startedAt === undefined) return;
  marks.delete(name);
  const ms = Date.now() - startedAt;
  console.log(`[perf] ${name}: ${ms}ms${detail ? ` (${detail})` : ''}`);
};

/** Log a single point-in-time event, for ordering rather than duration. */
export const perfMark = (name: string): void => {
  if (!ENABLED) return;
  console.log(`[perf] ${name} @ ${Date.now()}`);
};
