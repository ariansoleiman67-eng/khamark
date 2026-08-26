import {
  variantPriceUSD,
  formatVariantPrice,
} from '../../src/utils/currency';

const RATE = 1500;
const product = { priceUSD: 100, priceIQD: undefined };

describe('variantPriceUSD', () => {
  it('falls back to the product price when the variant overrides nothing', () => {
    expect(variantPriceUSD({}, product, RATE)).toBe(100);
  });

  it('uses the variant USD override when it has one', () => {
    expect(variantPriceUSD({ priceUSD: 166 }, product, RATE)).toBe(166);
  });

  it('lets a dinar variant price win over its own USD override', () => {
    // 300000 IQD at 1500 = $200, NOT the $166 sitting in priceUSD.
    expect(variantPriceUSD({ priceUSD: 166, priceIQD: 300000 }, product, RATE)).toBe(200);
  });

  it('converts at the CURRENT rate, so a rate edit moves the dollar figure', () => {
    expect(variantPriceUSD({ priceIQD: 300000 }, product, 1000)).toBe(300);
  });

  it('inherits a dinar-priced product when the variant overrides nothing', () => {
    expect(variantPriceUSD({}, { priceUSD: 0, priceIQD: 150000 }, RATE)).toBe(100);
  });

  it('treats zero and negative dinar as "not set" rather than free', () => {
    expect(variantPriceUSD({ priceUSD: 166, priceIQD: 0 }, product, RATE)).toBe(166);
    expect(variantPriceUSD({ priceUSD: 166, priceIQD: -5 }, product, RATE)).toBe(166);
  });

  it('survives a null variant', () => {
    expect(variantPriceUSD(null, product, RATE)).toBe(100);
  });
});

describe('formatVariantPrice', () => {
  it('shows a dinar variant verbatim, with no rounding of the shop figure', () => {
    expect(formatVariantPrice({ priceIQD: 237250 }, product, 'IQD', RATE)).toContain('237,250');
  });

  it('converts a dinar variant for a shopper browsing in dollars', () => {
    expect(formatVariantPrice({ priceIQD: 300000 }, product, 'USD', RATE)).toContain('200');
  });

  it('formats a plain USD variant', () => {
    expect(formatVariantPrice({ priceUSD: 166 }, product, 'USD', RATE)).toContain('166');
  });
});

// ---------------------------------------------------------------------------
// Phase 1 audit: the rules the cart must obey once a variant can be priced in
// dinar. These encode the decisions, not the implementation.
// ---------------------------------------------------------------------------
describe('cart line dinar resolution', () => {
  // Mirrors the ladder in localCartService.addVariationsToCartImpl.
  const lineIQD = (
    selection: { priceUSD?: number; priceIQD?: number },
    variation: { priceUSD?: number; priceIQD?: number },
    product: { priceIQD?: number },
  ): number | null => {
    const selectionIQD = Number(selection.priceIQD ?? variation.priceIQD);
    const hasVariantIQD = Number.isFinite(selectionIQD) && selectionIQD > 0;
    const hasVariantUSD = selection.priceUSD != null || variation.priceUSD != null;
    return hasVariantIQD ? selectionIQD : hasVariantUSD ? null : (product.priceIQD ?? null);
  };

  it('carries the variant dinar price onto the line', () => {
    expect(lineIQD({ priceIQD: 300000 }, {}, {})).toBe(300000);
  });

  it('drops the product dinar price when the variant overrides in dollars', () => {
    // Without this the $166 override was ignored and the shopper was charged the
    // product's dinar figure instead.
    expect(lineIQD({ priceUSD: 166 }, {}, { priceIQD: 150000 })).toBeNull();
  });

  it('inherits the product dinar price when the variant prices nothing', () => {
    expect(lineIQD({}, {}, { priceIQD: 150000 })).toBe(150000);
  });

  it('leaves a plain dollar product alone', () => {
    expect(lineIQD({}, {}, {})).toBeNull();
  });
});
