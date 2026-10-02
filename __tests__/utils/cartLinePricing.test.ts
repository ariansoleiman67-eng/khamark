import { buildLineProduct, linePriceSignature, isSellable } from '../../src/utils/cartLinePricing';

/**
 * Real figures from the live catalogue: Samsung A37 5G, priced in dinar, with
 * three storage options of which two cost MORE than the base product.
 */
const RATE = 1570;
const A37 = {
  id: 'a37',
  name: 'Samsung A37 5G',
  priceUSD: 549000 / RATE,
  priceIQD: 549000,
  variations: [
    { variationId: 'v128', sizeValue: '8GB/128GB', priceIQD: 549000, stockQuantity: 3 },
    { variationId: 'v256', sizeValue: '8GB/256GB', priceIQD: 647000, stockQuantity: 3 },
    { variationId: 'v12', sizeValue: '12GB/256GB', priceIQD: 740000, stockQuantity: 3 },
  ],
  colorVariations: [],
};

describe('buildLineProduct', () => {
  it('prices a dinar-only option at the OPTION price, not the base product', () => {
    const line = buildLineProduct(A37, { variationId: 'v12' });
    expect(line.priceIQD).toBe(740000);
  });

  it('leaves a product without options at its own price', () => {
    const plain = { id: 'p', priceUSD: 25.48, priceIQD: 40000 };
    const line = buildLineProduct(plain, {});
    expect(line.priceIQD).toBe(40000);
    expect(line.priceUSD).toBe(25.48);
  });

  it('honours a price the caller already resolved for the selection', () => {
    const line = buildLineProduct(A37, { variationId: 'v12', priceIQD: 740000, priceUSD: 740000 / RATE });
    expect(line.priceIQD).toBe(740000);
    expect(line.priceUSD).toBeCloseTo(471.34, 1);
  });

  it('drops the product dinar price when an option overrides in dollars', () => {
    const p = { id: 'x', priceUSD: 100, priceIQD: 157000, variations: [{ variationId: 'big', priceUSD: 150 }] };
    const line = buildLineProduct(p, { variationId: 'big' });
    expect(line.priceUSD).toBe(150);
    // The product's 157,000 would otherwise outrank the option's $150.
    expect(line.priceIQD).toBeUndefined();
  });

  it('lets the size price win over a riding colour, and keeps the colour VIP price', () => {
    const p = {
      id: 'y',
      priceUSD: 10,
      variations: [{ variationId: 's', priceIQD: 20000 }],
      colorVariations: [{ variationId: 'c', priceIQD: 18000, vipPriceIQD: 17000 }],
    };
    const line = buildLineProduct(p, { variationId: 's', colorVariationId: 'c' });
    expect(line.priceIQD).toBe(20000);
    expect(line.vipPriceIQD).toBe(17000);
  });

  it('does not let a self-priced option inherit the product VIP price', () => {
    const p = { id: 'z', priceIQD: 100000, vipPriceIQD: 90000, variations: [{ variationId: 'o', priceIQD: 250000 }] };
    const line = buildLineProduct(p, { variationId: 'o' });
    // A 250,000 option sold to a VIP at the base product's 90,000 VIP price is
    // the exact failure this rule exists to stop.
    expect(line.vipPriceIQD).toBe(0);
  });
});

describe('linePriceSignature', () => {
  it('is stable between add time and checkout for the same option (the A37 bug)', () => {
    // At add time the product page may pass a dollar figure it derived itself.
    const atAdd = buildLineProduct(A37, { variationId: 'v12', priceIQD: 740000, priceUSD: 740000 / RATE });
    // At checkout there is no selection: only the product and the option id.
    const atCheckout = buildLineProduct(A37, { variationId: 'v12' });
    expect(linePriceSignature(atCheckout)).toBe(linePriceSignature(atAdd));
  });

  it('detects a REAL change to the option price', () => {
    const before = buildLineProduct(A37, { variationId: 'v12' });
    const edited = { ...A37, variations: A37.variations.map(v => (v.variationId === 'v12' ? { ...v, priceIQD: 760000 } : v)) };
    const after = buildLineProduct(edited, { variationId: 'v12' });
    expect(linePriceSignature(after)).not.toBe(linePriceSignature(before));
  });

  it('ignores dollar drift on a dinar-priced line — the shopper pays the dinar figure', () => {
    const a = { priceIQD: 40000, priceUSD: 25.48 };
    const b = { priceIQD: 40000, priceUSD: 25.47 };
    expect(linePriceSignature(a)).toBe(linePriceSignature(b));
  });

  it('compares a dollar line to the cent, not to float noise', () => {
    expect(linePriceSignature({ priceUSD: 0.1 + 0.2 })).toBe(linePriceSignature({ priceUSD: 0.3 }));
    expect(linePriceSignature({ priceUSD: 10 })).not.toBe(linePriceSignature({ priceUSD: 10.01 }));
  });

  it('treats a change of VIP price as a price change', () => {
    expect(linePriceSignature({ priceIQD: 100, vipPriceIQD: 90 })).not.toBe(
      linePriceSignature({ priceIQD: 100, vipPriceIQD: 80 }),
    );
  });
});

describe('isSellable', () => {
  it('accepts a dinar-only line with no dollar price', () => {
    expect(isSellable({ priceIQD: 740000 })).toBe(true);
  });
  it('rejects a line with no positive price at all', () => {
    expect(isSellable({ priceIQD: 0, priceUSD: 0 })).toBe(false);
  });
});
