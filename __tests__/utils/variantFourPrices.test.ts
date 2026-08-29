import {
  costUSD,
  compareAtUSD,
  variantVipUSD,
  variantCompareAtUSD,
  variantCostUSD,
  variantPriceUSD,
} from '../../src/utils/currency';

// A dinar figure is always numerically far larger than a dollar one, so every
// test here also guards the mistake that keeps recurring in this codebase:
// comparing a dinar amount against a dollar amount with a bare < or >.
const RATE = 1500;

describe('costUSD', () => {
  it('reads a dollar cost', () => {
    expect(costUSD({ purchasePrice: 80 }, RATE)).toBe(80);
  });

  it('prefers a dinar cost and converts it at the given rate', () => {
    expect(costUSD({ purchasePrice: 80, purchasePriceIQD: 150000 }, RATE)).toBe(100);
  });

  it('is 0 when the shop never recorded a cost', () => {
    expect(costUSD({}, RATE)).toBe(0);
    expect(costUSD(null, RATE)).toBe(0);
    expect(costUSD({ purchasePrice: 0, purchasePriceIQD: 0 }, RATE)).toBe(0);
  });
});

describe('compareAtUSD', () => {
  it('prefers the dinar "was" price', () => {
    expect(compareAtUSD({ compareAtPriceUSD: 120, compareAtPriceIQD: 300000 }, RATE)).toBe(200);
  });

  it('is 0 when there is no "was" price at all', () => {
    expect(compareAtUSD({ compareAtPriceUSD: undefined }, RATE)).toBe(0);
  });
});

describe('variantPriceUSD with isVip', () => {
  const product = { priceUSD: 100 };

  it('charges the option its own VIP price when it is cheaper', () => {
    const variant = { priceUSD: 120, vipPriceUSD: 110 };
    expect(variantPriceUSD(variant as any, product as any, RATE)).toBe(120);
    expect(variantPriceUSD(variant as any, product as any, RATE, true)).toBe(110);
  });

  it('ignores a VIP price that is not actually cheaper', () => {
    const variant = { priceUSD: 120, vipPriceUSD: 130 };
    expect(variantPriceUSD(variant as any, product as any, RATE, true)).toBe(120);
  });

  it('compares a dinar VIP price against a dinar option price correctly', () => {
    // 195,000 IQD is cheaper than 210,000 IQD. Compared as raw numbers against
    // the option's DOLLAR figure (140) it would look far more expensive.
    const variant = { priceIQD: 210000, vipPriceIQD: 195000 };
    expect(variantPriceUSD(variant as any, product as any, RATE)).toBe(140);
    expect(variantPriceUSD(variant as any, product as any, RATE, true)).toBe(130);
  });

  it('leaves the price alone for a shopper who is not VIP', () => {
    const variant = { priceIQD: 210000, vipPriceIQD: 195000 };
    expect(variantPriceUSD(variant as any, product as any, RATE, false)).toBe(140);
  });
});

describe('inheritance from the product', () => {
  const product = {
    priceUSD: 100,
    vipPriceUSD: 90,
    compareAtPriceUSD: 130,
    purchasePrice: 70,
  };

  it('an option that sets NO price of its own inherits all four', () => {
    const bare = { variationId: 'v1', stockQuantity: 1 };
    expect(variantVipUSD(bare, product, RATE)).toBe(90);
    expect(variantCompareAtUSD(bare, product, RATE)).toBe(130);
    expect(variantCostUSD(bare, product, RATE)).toBe(70);
  });

  it('an option that prices ITSELF does not borrow the product’s other prices', () => {
    // The product's VIP price was set against the product's price. Carrying it
    // onto an option priced at something else would discount from a number that
    // no longer applies.
    const priced = { variationId: 'v2', stockQuantity: 1, priceUSD: 250 };
    expect(variantVipUSD(priced, product, RATE)).toBe(0);
    expect(variantCompareAtUSD(priced, product, RATE)).toBe(0);
    expect(variantCostUSD(priced, product, RATE)).toBe(0);
  });

  it('an option that prices itself DOES use its own four', () => {
    const priced = {
      variationId: 'v3',
      stockQuantity: 1,
      priceUSD: 250,
      vipPriceUSD: 220,
      compareAtPriceIQD: 450000,
      purchasePriceIQD: 270000,
    };
    expect(variantVipUSD(priced, product, RATE)).toBe(220);
    expect(variantCompareAtUSD(priced, product, RATE)).toBe(300);
    expect(variantCostUSD(priced, product, RATE)).toBe(180);
  });
});
