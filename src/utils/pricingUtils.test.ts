import { calculateTieredPrice, validatePriceTiers } from './pricingUtils';

describe('pricingUtils', () => {
  describe('validatePriceTiers', () => {
    it('returns true for valid tiers', () => {
      const validTiers = [
        { minQty: 5, maxQty: 9, priceUSD: 10 },
        { minQty: 10, priceUSD: 8 },
      ];
      expect(validatePriceTiers(validTiers)).toBe(true);
    });

    it('returns false for tiers with negative or zero price', () => {
      expect(validatePriceTiers([{ minQty: 5, priceUSD: 0 }])).toBe(false);
      expect(validatePriceTiers([{ minQty: 5, priceUSD: -5 }])).toBe(false);
    });

    it('returns false for tiers with invalid minQty', () => {
      expect(validatePriceTiers([{ minQty: 0, priceUSD: 5 }])).toBe(false);
      expect(validatePriceTiers([{ minQty: -2, priceUSD: 5 }])).toBe(false);
    });

    it('returns false if tiers are not in ascending minQty order', () => {
      const invalidTiers = [
        { minQty: 10, priceUSD: 10 },
        { minQty: 5, priceUSD: 8 },
      ];
      expect(validatePriceTiers(invalidTiers)).toBe(false);
    });

    it('returns true if tears array is empty or undefined', () => {
      expect(validatePriceTiers([])).toBe(true);
      expect(validatePriceTiers(undefined as any)).toBe(true);
    });
  });

  describe('calculateTieredPrice', () => {
    const validTiers = [
      { minQty: 5, maxQty: 9, priceUSD: 10 },
      { minQty: 10, priceUSD: 8 },
    ];

    it('returns regular base price for normal users below minQty', () => {
      expect(calculateTieredPrice(3, 15, validTiers, false)).toBe(15);
    });

    it('returns wholesale price for normal users above minQty', () => {
      expect(calculateTieredPrice(6, 15, validTiers, false)).toBe(10);
      expect(calculateTieredPrice(15, 15, validTiers, false)).toBe(8);
    });

    it('returns the lowest possible wholesale price for VIP users even at qty 1', () => {
      // For VIP, they get at least the first tier wholesale price.
      // If they buy more, they get the higher tier price.
      expect(calculateTieredPrice(1, 15, validTiers, true)).toBe(10);
      expect(calculateTieredPrice(12, 15, validTiers, true)).toBe(8);
    });

    it('falls back to regular price for VIP if no valid tiers exist', () => {
      expect(calculateTieredPrice(1, 15, [], true)).toBe(15);
      expect(calculateTieredPrice(1, 15, undefined, true)).toBe(15);
    });

    it('falls back to regular price if tiers are corrupt', () => {
      const badTiers = [{ minQty: 5, priceUSD: 0 }];
      expect(calculateTieredPrice(10, 15, badTiers, false)).toBe(15);
    });
  });
});
