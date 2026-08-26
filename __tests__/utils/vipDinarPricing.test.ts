import { getEffectiveUnitPrice, formatUnitPrice, formatLineTotal } from '../../src/utils/pricingUtils';

const RATE = 1500;

describe('getEffectiveUnitPrice — VIP price authored in dinar', () => {
  it('charges a VIP the dinar price, converted for arithmetic', () => {
    // 120,000 IQD at 1500 = $80, against a $100 product.
    const p = { priceUSD: 100, vipPriceIQD: 120000 } as any;
    expect(getEffectiveUnitPrice(p, 1, true, RATE)).toBe(80);
  });

  it('leaves a non-VIP on the normal price', () => {
    const p = { priceUSD: 100, vipPriceIQD: 120000 } as any;
    expect(getEffectiveUnitPrice(p, 1, false, RATE)).toBe(100);
  });

  it('lets the dinar VIP price outrank a dollar one', () => {
    const p = { priceUSD: 100, vipPriceUSD: 95, vipPriceIQD: 120000 } as any;
    expect(getEffectiveUnitPrice(p, 1, true, RATE)).toBe(80);
  });

  it('follows the current rate, so a rate edit moves the dollar figure', () => {
    const p = { priceUSD: 100, vipPriceIQD: 120000 } as any;
    expect(getEffectiveUnitPrice(p, 1, true, 1000)).toBe(100);
  });

  it('refuses a VIP price that is not actually cheaper', () => {
    // 300,000 IQD = $200 on a $100 product. Not a discount; ignore it.
    const p = { priceUSD: 100, vipPriceIQD: 300000 } as any;
    expect(getEffectiveUnitPrice(p, 1, true, RATE)).toBe(100);
  });

  it('compares dinar against dinar exactly when BOTH are dinar', () => {
    // The whole trap: 120,000 is numerically larger than a priceUSD of 100, so a
    // naive `vip < priceUSD` reads backwards and throws the discount away.
    const p = { priceUSD: 100, priceIQD: 150000, vipPriceIQD: 120000 } as any;
    expect(getEffectiveUnitPrice(p, 1, true, RATE)).toBe(80);
  });

  it('is immune to the rate when both figures are dinar', () => {
    const p = { priceUSD: 100, priceIQD: 150000, vipPriceIQD: 120000 } as any;
    // Still a discount at any rate — 120,000 < 150,000 is a fact about dinar.
    expect(getEffectiveUnitPrice(p, 1, true, 900)).toBeGreaterThan(0);
    expect(getEffectiveUnitPrice(p, 1, true, 900)).toBeCloseTo(120000 / 900, 2);
  });

  it('still honours a plain dollar VIP price', () => {
    const p = { priceUSD: 100, vipPriceUSD: 80 } as any;
    expect(getEffectiveUnitPrice(p, 1, true, RATE)).toBe(80);
  });

  it('ignores zero and negative dinar VIP prices rather than making it free', () => {
    expect(getEffectiveUnitPrice({ priceUSD: 100, vipPriceIQD: 0 } as any, 1, true, RATE)).toBe(100);
    expect(getEffectiveUnitPrice({ priceUSD: 100, vipPriceIQD: -1 } as any, 1, true, RATE)).toBe(100);
  });
});

describe('formatting a dinar VIP price', () => {
  it('shows a VIP the exact dinar figure, never re-rounded', () => {
    const p = { priceUSD: 100, vipPriceIQD: 137250 } as any;
    // 137,250 is not a multiple of 250-snapped conversion noise; it must survive whole.
    expect(formatUnitPrice(p, true, 'IQD', RATE)).toContain('137,250');
  });

  it('converts that dinar VIP price for a shopper browsing in dollars', () => {
    const p = { priceUSD: 100, vipPriceIQD: 120000 } as any;
    expect(formatUnitPrice(p, true, 'USD', RATE)).toContain('80');
  });

  it('multiplies a dinar VIP line total in dinar, so it adds up on screen', () => {
    const p = { priceUSD: 100, vipPriceIQD: 137250 } as any;
    expect(formatLineTotal(p, true, 'IQD', RATE, {}, 3)).toContain('411,750'); // 137,250 x 3
  });

  it('shows a non-VIP the normal price, not the VIP dinar one', () => {
    const p = { priceUSD: 100, vipPriceIQD: 120000 } as any;
    expect(formatUnitPrice(p, false, 'USD', RATE)).toContain('100');
  });
});

describe('regression: the existing dollar-VIP guard on a dinar-priced product', () => {
  it('does not treat a dinar-priced product as free of VIP pricing', () => {
    // priceUSD here is the derived convenience column. A $80 VIP price on a
    // 150,000 IQD product is a real discount and must be applied.
    const p = { priceUSD: 100, priceIQD: 150000, vipPriceUSD: 80 } as any;
    expect(getEffectiveUnitPrice(p, 1, true, RATE)).toBe(80);
  });
});

import { isVipPriceActive } from '../../src/utils/pricingUtils';

describe('isVipPriceActive — the badge must mirror the till', () => {
  it('is true when a dollar VIP price is actually being charged', () => {
    expect(isVipPriceActive({ priceUSD: 100, vipPriceUSD: 80 } as any, true, 1, RATE)).toBe(true);
  });

  it('is true for a VIP price authored in dinar', () => {
    // The old test missed this entirely: no badge on the very products the shop
    // discounts for VIPs in dinar.
    expect(isVipPriceActive({ priceUSD: 100, vipPriceIQD: 120000 } as any, true, 1, RATE)).toBe(true);
  });

  it('is FALSE when the VIP price is not cheaper, because it is not charged', () => {
    // The badge used to light up here while getEffectiveUnitPrice refused the price.
    expect(isVipPriceActive({ priceUSD: 100, vipPriceUSD: 120 } as any, true, 1, RATE)).toBe(false);
    expect(isVipPriceActive({ priceUSD: 100, vipPriceIQD: 300000 } as any, true, 1, RATE)).toBe(false);
  });

  it('is false for a non-VIP shopper', () => {
    expect(isVipPriceActive({ priceUSD: 100, vipPriceUSD: 80 } as any, false, 1, RATE)).toBe(false);
  });

  it('is false when there is no VIP price at all', () => {
    expect(isVipPriceActive({ priceUSD: 100 } as any, true, 1, RATE)).toBe(false);
  });

  it('agrees with the price actually returned', () => {
    const p = { priceUSD: 100, vipPriceIQD: 120000 } as any;
    const charged = getEffectiveUnitPrice(p, 1, true, RATE);
    expect(isVipPriceActive(p, true, 1, RATE)).toBe(charged !== p.priceUSD);
  });
});
