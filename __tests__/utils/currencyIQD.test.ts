/**
 * Products priced in IQD.
 *
 * The invariant worth protecting: a dinar figure the shop typed must come back
 * out byte-for-byte identical, no matter what the exchange rate is doing. The
 * two ways it can be corrupted are the rate itself and roundIQD's 250-dinar
 * snap, so both are pinned here.
 */
import {
  convertIQDToUSD,
  convertUSDToIQD,
  formatItemPrice,
  getPriceIQD,
  getPriceUSD,
  isIQDPriced,
} from '../../src/utils/currency';

const RATE = 1500;

describe('isIQDPriced', () => {
  it('is false for a normal USD product', () => {
    expect(isIQDPriced({ priceUSD: 100 })).toBe(false);
  });

  it('is false when the dinar price is absent, null or zero', () => {
    expect(isIQDPriced({ priceUSD: 100, priceIQD: undefined })).toBe(false);
    expect(isIQDPriced({ priceUSD: 100, priceIQD: null })).toBe(false);
    // Zero means "not priced in dinar", not "free" — the admin form writes null
    // for an empty input, but a 0 that slips through must not flip the mode.
    expect(isIQDPriced({ priceUSD: 100, priceIQD: 0 })).toBe(false);
  });

  it('is true once a dinar price is set', () => {
    expect(isIQDPriced({ priceIQD: 1237000 })).toBe(true);
  });

  it('tolerates null and undefined items', () => {
    expect(isIQDPriced(null)).toBe(false);
    expect(isIQDPriced(undefined)).toBe(false);
  });
});

describe('the typed dinar figure survives intact', () => {
  const product = { priceUSD: 824.67, priceIQD: 1237000 };

  it('is returned verbatim', () => {
    expect(getPriceIQD(product, RATE)).toBe(1237000);
  });

  it('is not snapped to the nearest 250 the way the USD path would be', () => {
    // 1,237,000 is itself a multiple of 250, so it survives the old path by
    // luck. 1,237,123 is the honest test: routing it through USD and back
    // rewrites it, and that rewriting is what this feature exists to stop.
    const typed = 1237123;
    expect(getPriceIQD({ priceIQD: typed }, RATE)).toBe(typed);
    expect(convertUSDToIQD(typed / RATE, RATE)).not.toBe(typed);
    expect(convertUSDToIQD(typed / RATE, RATE)).toBe(1237000); // 123 dinar rewritten away
  });

  it('does not move when the exchange rate changes', () => {
    expect(getPriceIQD(product, 1500)).toBe(1237000);
    expect(getPriceIQD(product, 1600)).toBe(1237000);
    expect(getPriceIQD(product, 999)).toBe(1237000);
  });

  it('formats verbatim with thousands separators', () => {
    expect(formatItemPrice(product, 'IQD', RATE)).toBe('IQD 1,237,000');
    expect(formatItemPrice(product, 'IQD', 1600)).toBe('IQD 1,237,000');
  });

  it('keeps a figure that is not a multiple of 250', () => {
    const odd = { priceIQD: 1237123 };
    expect(getPriceIQD(odd, RATE)).toBe(1237123);
    expect(formatItemPrice(odd, 'IQD', RATE)).toBe('IQD 1,237,123');
  });
});

describe('the dollar side is derived from the dinar figure', () => {
  const product = { priceUSD: 999, priceIQD: 1237000 };

  it('divides by the rate and ignores the stored USD column', () => {
    // 1237000 / 1500 = 824.666… -> 824.67. The stale 999 must not win.
    expect(getPriceUSD(product, RATE)).toBe(824.67);
    expect(formatItemPrice(product, 'USD', RATE)).toBe('$824.67');
  });

  it('moves with the rate', () => {
    expect(getPriceUSD(product, 1600)).toBe(773.13);
  });

  it('round-trips back to the same dinar figure at the same rate', () => {
    const usd = getPriceUSD({ priceIQD: 1500000 }, RATE);
    expect(usd).toBe(1000);
    expect(convertIQDToUSD(1500000, RATE)).toBe(1000);
  });

  it('does not divide by zero or a missing rate', () => {
    expect(convertIQDToUSD(1237000, 0)).toBe(0);
    expect(convertIQDToUSD(1237000, NaN)).toBe(0);
    expect(convertIQDToUSD(1237000, -5)).toBe(0);
  });
});

describe('USD-priced products are untouched', () => {
  const product = { priceUSD: 100 };

  it('still converts and snaps exactly as before', () => {
    expect(getPriceIQD(product, RATE)).toBe(convertUSDToIQD(100, RATE));
    expect(getPriceUSD(product, RATE)).toBe(100);
    expect(formatItemPrice(product, 'USD', RATE)).toBe('$100.00');
    expect(formatItemPrice(product, 'IQD', RATE)).toBe('IQD 150,000');
  });

  it('handles a missing price without producing NaN', () => {
    expect(getPriceUSD({}, RATE)).toBe(0);
    expect(getPriceIQD({}, RATE)).toBe(0);
    expect(formatItemPrice({}, 'USD', RATE)).toBe('$0.00');
    expect(formatItemPrice(null, 'IQD', RATE)).toBe('IQD 0');
  });
});

// --- the product-level helpers ------------------------------------------------
import { formatLineTotal, formatUnitPrice } from '../../src/utils/pricingUtils';

describe('formatUnitPrice / formatLineTotal', () => {
  const dinar = { priceUSD: 824.75, priceIQD: 1237123 };

  it('shows the dinar figure verbatim for one unit', () => {
    expect(formatUnitPrice(dinar, false, 'IQD', RATE)).toBe('IQD 1,237,123');
    expect(formatUnitPrice(dinar, false, 'USD', RATE)).toBe('$824.75');
  });

  it('keeps a line total in dinar so it agrees with the unit price', () => {
    // The point of the whole helper: 3 x 1,237,123 exactly, not the dollar total
    // converted back and snapped to a different number.
    expect(formatLineTotal(dinar, false, 'IQD', RATE, {}, 3)).toBe('IQD 3,711,369');
  });

  it('hands back to the dollar path when a wholesale tier applies', () => {
    // Tiers are authored in dollars, so at qty 10 the dinar figure is not what is
    // being charged and must not be shown verbatim.
    const tiered = { ...dinar, priceTiers: [{ minQty: 5, priceUSD: 800 }] as any };
    expect(formatUnitPrice(tiered, false, 'USD', RATE, {}, 10)).toBe('$800.00');
    expect(formatUnitPrice(tiered, false, 'IQD', RATE, {}, 10)).toBe('IQD 1,200,000');
    // ...but qty 1 is still the base price, so the dinar figure comes back.
    expect(formatUnitPrice(tiered, false, 'IQD', RATE, {}, 1)).toBe('IQD 1,237,123');
  });

  it('hands back to the dollar path for a VIP price', () => {
    const vip = { ...dinar, vipPriceUSD: 700 };
    expect(formatUnitPrice(vip, true, 'IQD', RATE)).toBe('IQD 1,050,000');
    expect(formatUnitPrice(vip, false, 'IQD', RATE)).toBe('IQD 1,237,123');
  });

  it('hands back to the dollar path when a storage surcharge applies', () => {
    expect(formatUnitPrice(dinar, false, 'IQD', RATE, {}, 1, 50)).not.toBe('IQD 1,237,123');
    expect(formatUnitPrice(dinar, false, 'IQD', RATE, {}, 1, 0)).toBe('IQD 1,237,123');
  });

  it('leaves USD-priced products exactly as they were', () => {
    const usd = { priceUSD: 100 };
    expect(formatUnitPrice(usd, false, 'IQD', RATE)).toBe('IQD 150,000');
    expect(formatLineTotal(usd, false, 'IQD', RATE, {}, 3)).toBe('IQD 450,000');
    expect(formatLineTotal(usd, false, 'USD', RATE, {}, 3)).toBe('$300.00');
  });
});

// --- orders -------------------------------------------------------------------
import { computeOrderTotalIQD, formatOrderLineTotal, formatOrderTotal } from '../../src/utils/currency';

describe('order totals', () => {
  const dinarLine = { priceUSD: 824.75, priceIQD: 1237123, quantity: 2 };
  const usdLine = { priceUSD: 100, quantity: 1 };

  it('returns null when nothing was priced in dinar, leaving orders untouched', () => {
    expect(computeOrderTotalIQD([usdLine], 100, RATE)).toBeNull();
    expect(computeOrderTotalIQD([], 0, RATE)).toBeNull();
  });

  it('sums the dinar lines in dinar and converts only the remainder', () => {
    // 2 x 1,237,123 = 2,474,246 exactly. Shipping of $10 converts to 15,000.
    const totalUSD = 824.75 * 2 + 10;
    expect(computeOrderTotalIQD([dinarLine], totalUSD, RATE)).toBe(2474246 + 15000);
  });

  it('mixes a dinar line and a dollar line without corrupting either', () => {
    const totalUSD = 824.75 * 2 + 100;
    expect(computeOrderTotalIQD([dinarLine, usdLine], totalUSD, RATE)).toBe(2474246 + 150000);
  });

  it('ignores a line whose dinar price is absent or quantity is zero', () => {
    expect(computeOrderTotalIQD([{ ...dinarLine, quantity: 0 }], 0, RATE)).toBeNull();
  });

  it('displays the snapshotted total verbatim, at the order rate', () => {
    const order = { totalUSD: 1659.5, totalIQD: 2489246, exchangeRate: 1500 };
    expect(formatOrderTotal(order, 'IQD', 9999)).toBe('IQD 2,489,246');
    // A later rate change must not move a total that was already charged.
    expect(formatOrderTotal({ ...order, exchangeRate: 1800 }, 'IQD', RATE)).toBe('IQD 2,489,246');
  });

  it('falls back to the old conversion for an order with no dinar total', () => {
    const order = { totalUSD: 100, exchangeRate: 1500 };
    expect(formatOrderTotal(order, 'IQD', RATE)).toBe('IQD 150,000');
    expect(formatOrderTotal(order, 'USD', RATE)).toBe('$100.00');
  });

  it('keeps an order line total in dinar', () => {
    expect(formatOrderLineTotal(dinarLine, 'IQD', RATE)).toBe('IQD 2,474,246');
    expect(formatOrderLineTotal(usdLine, 'IQD', RATE)).toBe('IQD 150,000');
  });
});

// --- admin revenue reporting --------------------------------------------------
import { revenueToIQD } from '../../src/utils/currency';

describe('revenueToIQD', () => {
  it('is the plain conversion when nothing was priced in dinar', () => {
    // The exact arithmetic the analytics screen used before, so existing
    // revenue/profit figures do not shift for shops with no dinar products.
    expect(revenueToIQD(1000, 0, 0, RATE)).toBe(1500000);
    expect(revenueToIQD(1000, 0, 0, 1520)).toBe(1520000);
  });

  it('counts the dinar portion in dinar and converts only the rest', () => {
    // 1 unit at 1,237,123 IQD (stored as $824.75) plus $100 of dollar-priced sales.
    expect(revenueToIQD(924.75, 1237123, 824.75, RATE)).toBe(1237123 + 150000);
  });

  it('is exact where the old arithmetic drifted', () => {
    const typed = 1237123;
    const storedUSD = 824.75;                       // price_usd, only to the cent
    const oldWay = storedUSD * RATE;                // what analytics reported before
    const newWay = revenueToIQD(storedUSD, typed, storedUSD, RATE);
    expect(newWay).toBe(typed);
    expect(oldWay).not.toBe(typed);
    expect(Math.round(oldWay - typed)).toBe(2);     // the few dinar it was out by
  });

  it('scales that drift with quantity, which the fix removes', () => {
    const qty = 500;
    const oldWay = 824.75 * qty * RATE;
    const newWay = revenueToIQD(824.75 * qty, 1237123 * qty, 824.75 * qty, RATE);
    expect(newWay).toBe(1237123 * qty);
    expect(Math.round(oldWay - newWay)).toBe(1000);  // a full 1,000 IQD over 500 units
  });

  it('handles a missing or zero rate without producing NaN', () => {
    expect(revenueToIQD(100, 0, 0, 0)).toBe(0);
    expect(revenueToIQD(100, 0, 0, NaN)).toBe(0);
  });
});
