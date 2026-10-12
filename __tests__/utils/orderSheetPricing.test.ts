import { orderSheetLine } from '../../src/utils/orderSheetPricing';
import { formatLineTotal, formatUnitPrice } from '../../src/utils/pricingUtils';

/**
 * Live figures, 2026-10-12. The Redmi Note 17 Pro Max is priced in dinar at
 * 665,000; its stored price_usd (423.57) was written when the rate was 1,570.
 * The rate is now 1,670, so the order sheet — which converted the stored dollar
 * figure back — showed 707,250 a unit and 1,414,750 for two, while the product
 * page and the cart said 665,000.
 */
const RATE = 1670;
const redmi = { id: 'r', priceUSD: 423.57, priceIQD: 665000, vipPriceIQD: 660000, priceTiers: [] };

describe('order sheet prices the line exactly as the cart will', () => {
  it('a dinar-priced product shows the dinar figure, not a stale conversion', () => {
    const line = orderSheetLine(redmi, { size: null, color: null, exchangeRate: RATE });
    expect(formatUnitPrice(line!, false, 'IQD', RATE, {}, 1)).toBe('IQD 665,000');
    expect(formatLineTotal(line!, false, 'IQD', RATE, {}, 2)).toBe('IQD 1,330,000');
  });

  it("a VIP sees the shop's dinar VIP price", () => {
    const line = orderSheetLine(redmi, { size: null, color: null, exchangeRate: RATE });
    expect(formatUnitPrice(line!, true, 'IQD', RATE, {}, 1)).toBe('IQD 660,000');
  });

  it("a chosen option is priced at the option's own dinar price", () => {
    const a37 = {
      id: 'a', priceUSD: 549000 / 1570, priceIQD: 549000, priceTiers: [],
      variations: [{ variationId: 'v12', sizeValue: '12GB/256GB', priceIQD: 740000, stockQuantity: 10 }],
      colorVariations: [{ variationId: 'black', colorValue: 'Black', stockQuantity: 5 }],
    };
    const line = orderSheetLine(a37, {
      size: a37.variations[0],
      color: a37.colorVariations[0],
      exchangeRate: RATE,
    });
    expect(formatLineTotal(line!, false, 'IQD', RATE, {}, 2)).toBe('IQD 1,480,000');
  });

  it('is null until every option group is answered', () => {
    const p = { id: 'p', priceIQD: 1000, variations: [{ variationId: 's', stockQuantity: 1 }], colorVariations: [] };
    expect(orderSheetLine(p, { size: null, color: null, exchangeRate: RATE })).toBeNull();
  });
});
