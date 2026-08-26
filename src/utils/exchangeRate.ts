/**
 * The shop's current IQD exchange rate, readable from non-React code.
 *
 * The rate is a single shop-wide value that CurrencyContext already owns and
 * keeps in sync with global_settings. The problem is that the pricing layer —
 * LocalCartService.getTieredPrice, getEffectiveUnitPrice and the formatters —
 * is called from services, reducers and eight screens that do not all have the
 * context in hand, and it now genuinely needs the rate: a price authored in
 * dinar can only be turned into the dollars the cart does arithmetic in by
 * dividing by it.
 *
 * Threading a rate argument through every one of those call sites would mean a
 * caller that forgets it silently falls back to 1500 and misprices a real order.
 * A single value mirrored from the provider fails safe instead: it is set once
 * on load and on every rate change, and every default parameter reads it live.
 *
 * Explicitly passing a rate still wins, which is what the tests do.
 */
let currentExchangeRateIQD = 1500;

/** Called by CurrencyProvider whenever the shop's rate loads or changes. */
export const setCurrentExchangeRate = (rate: number): void => {
  const n = Number(rate);
  if (Number.isFinite(n) && n > 0) currentExchangeRateIQD = n;
};

/** The rate to use when a caller does not supply one. Never zero. */
export const getCurrentExchangeRate = (): number => currentExchangeRateIQD;
