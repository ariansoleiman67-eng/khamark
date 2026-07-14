import { validatePriceTiers, calculateTieredPrice } from '../../src/utils/pricingUtils';
import { PriceTier } from '../../src/types';

describe('pricingUtils', () => {

  describe('validatePriceTiers', () => {
    it('should return true for empty or undefined tiers', () => {
      expect(validatePriceTiers([])).toBe(true);
      expect(validatePriceTiers(undefined as any)).toBe(true);
    });

    it('should return true for valid strictly ascending tiers', () => {
      const tiers: PriceTier[] = [
        { minQty: 5, priceUSD: 10 },
        { minQty: 10, priceUSD: 8 },
        { minQty: 20, priceUSD: 5 },
      ];
      expect(validatePriceTiers(tiers)).toBe(true);
    });

    it('should return false if prices are zero or negative', () => {
      const tiers: PriceTier[] = [
        { minQty: 5, priceUSD: 0 },
      ];
      expect(validatePriceTiers(tiers)).toBe(false);
    });

    it('should return false if minQty is zero or negative', () => {
      const tiers: PriceTier[] = [
        { minQty: 0, priceUSD: 10 },
      ];
      expect(validatePriceTiers(tiers)).toBe(false);
    });

    it('should return false if tiers are not strictly ascending by minQty', () => {
      const overlappingTiers: PriceTier[] = [
        { minQty: 5, priceUSD: 10 },
        { minQty: 5, priceUSD: 8 }, 
      ];
      expect(validatePriceTiers(overlappingTiers)).toBe(false);

      const unorderedTiers: PriceTier[] = [
        { minQty: 10, priceUSD: 8 },
        { minQty: 5, priceUSD: 10 },
      ];
      expect(validatePriceTiers(unorderedTiers)).toBe(false);
    });
  });

  describe('calculateTieredPrice', () => {
    const basePrice = 12;
    const tiers: PriceTier[] = [
      { minQty: 5, priceUSD: 10 },
      { minQty: 10, priceUSD: 8 },
      { minQty: 20, priceUSD: 5 },
    ];

    it('should return basePrice if no tiers exist', () => {
      expect(calculateTieredPrice(1, basePrice)).toBe(basePrice);
      expect(calculateTieredPrice(100, basePrice, [])).toBe(basePrice);
    });

    it('should fall back to basePrice if tiers are corrupt', () => {
      const corruptTiers: PriceTier[] = [
        { minQty: 5, priceUSD: 0 },
      ];
      expect(calculateTieredPrice(10, basePrice, corruptTiers)).toBe(basePrice);
    });

    describe('Normal User (isVip = false)', () => {
      it('should return basePrice for quantities below the first tier threshold', () => {
        expect(calculateTieredPrice(1, basePrice, tiers, false)).toBe(basePrice);
        expect(calculateTieredPrice(4, basePrice, tiers, false)).toBe(basePrice);
      });

      it('should return the price for the correct tier segment', () => {
        expect(calculateTieredPrice(5, basePrice, tiers, false)).toBe(10);
        expect(calculateTieredPrice(9, basePrice, tiers, false)).toBe(10);
      });

      it('should pick the highest qualifying tier for larger quantities', () => {
        expect(calculateTieredPrice(10, basePrice, tiers, false)).toBe(8);
        expect(calculateTieredPrice(19, basePrice, tiers, false)).toBe(8);
      });

      it('should return the final tier price for quantities exceeding the last tier minQty', () => {
        expect(calculateTieredPrice(20, basePrice, tiers, false)).toBe(5);
        expect(calculateTieredPrice(100, basePrice, tiers, false)).toBe(5);
      });
    });

    describe('VIP User (isVip = true)', () => {
      it('should return the first tier price for quantities below the first tier minimum', () => {
        expect(calculateTieredPrice(1, basePrice, tiers, true)).toBe(10); // First tier overrides 12
        expect(calculateTieredPrice(4, basePrice, tiers, true)).toBe(10); 
      });

      it('should return exactly the same price as normal user behavior for matching tiers', () => {
        expect(calculateTieredPrice(5, basePrice, tiers, true)).toBe(10);
        expect(calculateTieredPrice(10, basePrice, tiers, true)).toBe(8);
        expect(calculateTieredPrice(20, basePrice, tiers, true)).toBe(5);
        expect(calculateTieredPrice(100, basePrice, tiers, true)).toBe(5);
      });
    });
  });

});
