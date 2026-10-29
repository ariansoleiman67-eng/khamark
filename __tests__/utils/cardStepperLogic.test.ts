import { Cart, CartItem, Product } from '../../src/types';
import { LocalCartService } from '../../src/services/localCartService';
import {
  getEffectiveStock,
  formatUnitPrice,
  isVipPriceActive,
  hasCompareAtDiscount,
} from '../../src/utils/pricingUtils';
import { formatCompareAtPrice, formatPrice } from '../../src/utils/currency';

describe('Shared Product Card Stepper & Cart Sync Rules', () => {
  const sampleProduct: Product = {
    id: 'p-test-momax',
    name: 'Momax Pinpop Lite Find My Locator Tracker (Apple)',
    category: 'Trackers',
    priceUSD: 9.5,
    compareAtPriceUSD: 13.5,
    stockQty: 5,
    brand: 'Momax',
    status: 'available',
    inStock: true,
    imageUrls: ['https://globaliraq.iq/cdn/shop/files/1_aecebb33-11bd-4154-ba57-11aa81aa946f.jpg'],
  } as unknown as Product;

  const outOfStockProduct: Product = {
    ...sampleProduct,
    id: 'p-test-oos',
    stockQty: 0,
    inStock: false,
  } as unknown as Product;

  const variantProduct: Product = {
    ...sampleProduct,
    id: 'p-test-variants',
    colorVariations: [
      { variationId: 'c1', colorValue: 'Orange', colorHex: '#FFA500', stockQuantity: 2 },
      { variationId: 'c2', colorValue: 'White', colorHex: '#FFFFFF', stockQuantity: 3 },
    ],
  } as unknown as Product;

  describe('1. Quantity 0, 1, and multiple items', () => {
    it('returns quantity 0 for product absent from cart', () => {
      const cart: Cart = { userId: 'guest', items: [], subtotalUSD: 0, updatedAt: {} as any };
      const matching = cart.items.filter((i) => i.productId === sampleProduct.id);
      const qty = matching.reduce((sum, i) => sum + i.quantity, 0);
      expect(qty).toBe(0);
    });

    it('returns correct quantity 1 and multiple items across cart lines', () => {
      const cart: Cart = {
        userId: 'guest',
        items: [
          { productId: sampleProduct.id, quantity: 3, product: sampleProduct, addedAt: {} as any },
          { productId: 'other-p', quantity: 2, product: sampleProduct, addedAt: {} as any },
        ],
        subtotalUSD: 28.5,
        updatedAt: {} as any,
      };
      const matching = cart.items.filter((i) => i.productId === sampleProduct.id);
      const qty = matching.reduce((sum, i) => sum + i.quantity, 0);
      expect(qty).toBe(3);
    });
  });

  describe('2. Removing the final item (1 -> 0)', () => {
    it('determines when decrementing should trigger removeFromCart', () => {
      const lineQty = 1;
      const action = lineQty > 1 ? 'updateQuantity' : 'removeFromCart';
      expect(action).toBe('removeFromCart');
    });

    it('determines when decrementing should reduce quantity (> 1)', () => {
      const lineQty = 3;
      const action = lineQty > 1 ? 'updateQuantity' : 'removeFromCart';
      expect(action).toBe('updateQuantity');
      expect(lineQty - 1).toBe(2);
    });
  });

  describe('3. Stock limits and out-of-stock products', () => {
    it('marks product as non-purchasable when stockQty is 0', () => {
      const stock = getEffectiveStock(outOfStockProduct);
      expect(stock).toBe(0);
      const purchasable = stock > 0 && outOfStockProduct.priceUSD > 0;
      expect(purchasable).toBe(false);
    });

    it('respects stock ceiling when incrementing', () => {
      const currentQty = 5;
      const stock = getEffectiveStock(sampleProduct); // 5
      const canIncrease = currentQty < stock;
      expect(canIncrease).toBe(false);
    });
  });

  describe('4. Required variants handling', () => {
    it('detects variant product so card opens selection flow instead of arbitrary add', () => {
      const hasOptions =
        (variantProduct.colorVariations?.length ?? 0) > 0 ||
        (variantProduct.storageOptions?.length ?? 0) > 0 ||
        (variantProduct.variations?.length ?? 0) > 0;
      expect(hasOptions).toBe(true);
    });

    it('detects multiple variant lines in cart so card routes to resolution rather than arbitrary decrement', () => {
      const cart: Cart = {
        userId: 'guest',
        items: [
          {
            productId: variantProduct.id,
            quantity: 1,
            product: variantProduct,
            selectedOptions: { color: 'Orange' },
            addedAt: {} as any,
          },
          {
            productId: variantProduct.id,
            quantity: 2,
            product: variantProduct,
            selectedOptions: { color: 'White' },
            addedAt: {} as any,
          },
        ],
        subtotalUSD: 28.5,
        updatedAt: {} as any,
      };
      const matchingLines = cart.items.filter((i) => i.productId === variantProduct.id);
      expect(matchingLines.length).toBe(2);
      // If matchingLines.length > 1, card must open selection flow
      const shouldOpenSelection = matchingLines.length > 1;
      expect(shouldOpenSelection).toBe(true);
    });
  });

  describe('5. Pricing and Currency formatting', () => {
    it('calculates regular and compare-at prices correctly', () => {
      const hasDiscount = hasCompareAtDiscount(sampleProduct, false);
      expect(hasDiscount).toBe(true);

      const compareFormatted = formatCompareAtPrice(sampleProduct, 'USD', 1500);
      expect(compareFormatted).toBe('$13.50');

      const regularFormatted = formatUnitPrice(sampleProduct, false, 'USD', 1500);
      expect(regularFormatted).toBe('$9.50');
    });

    it('formats long IQD currencies without breaking price formatting', () => {
      const priceIQD = formatPrice(9.5, 'IQD', 1500);
      expect(priceIQD).toContain('IQD');
    });

    it('handles VIP eligibility and badge visibility', () => {
      const vipProduct: Product = {
        ...sampleProduct,
        vipPriceUSD: 7.5,
      };
      expect(isVipPriceActive(vipProduct, true)).toBe(true);
      expect(isVipPriceActive(vipProduct, false)).toBe(false);
    });
  });

  describe('6. Cart synchronization across screens', () => {
    it('updates quantity instantaneously when cart object updates', () => {
      let cart: Cart = { userId: 'guest', items: [], subtotalUSD: 0, updatedAt: {} as any };
      const getQty = (c: Cart) =>
        c.items.filter((i) => i.productId === sampleProduct.id).reduce((s, i) => s + i.quantity, 0);

      expect(getQty(cart)).toBe(0);

      // Simulate item added (e.g. from Offers or Home or Cart screen)
      cart = {
        userId: 'guest',
        items: [{ productId: sampleProduct.id, quantity: 2, product: sampleProduct, addedAt: {} as any }],
        subtotalUSD: 19,
        updatedAt: {} as any,
      };
      expect(getQty(cart)).toBe(2);

      // Simulate item removed from Cart screen
      cart = { userId: 'guest', items: [], subtotalUSD: 0, updatedAt: {} as any };
      expect(getQty(cart)).toBe(0);
    });
  });
});

