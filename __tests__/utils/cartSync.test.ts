/**
 * CartScreen runs CartService.syncCartWithLatestData on every signed-in cart
 * open. It used to replace each line's product with the BASE product, so an
 * option line — the A37 12GB/256GB at IQD 740,000 — was rewritten at the
 * 8GB/128GB base, IQD 549,000, and its quantity clamped by the product's stock
 * instead of the option's.
 */

const RATE = 1570;
const mockA37 = {
  id: 'a37',
  name: 'Samsung A37 5G',
  isActive: true,
  stockQty: 9,
  priceUSD: 549000 / RATE,
  priceIQD: 549000,
  updatedAt: '2026-10-02T10:00:00Z',
  variations: [
    { variationId: 'v128', sizeValue: '8GB/128GB', priceIQD: 549000, stockQuantity: 6 },
    { variationId: 'v12', sizeValue: '12GB/256GB', priceIQD: 740000, stockQuantity: 2 },
  ],
  colorVariations: [],
};

let mockStoredItems: any[] = [];
const mockSaved: any[] = [];

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('../../src/services/productService', () => ({
  __esModule: true,
  default: { getProduct: jest.fn(async () => mockA37) },
}));
jest.mock('../../src/services/localCartService', () => ({
  LocalCartService: { getTieredPrice: (p: any) => Number(p?.priceUSD) || 0 },
}));
jest.mock('../../src/services/supabase', () => {
  const q: any = {
    select: () => q,
    eq: () => q,
    single: async () => ({
      data: { id: 'u1', items: mockStoredItems, subtotal_usd: 0, updated_at: '2026-10-01T00:00:00Z' },
      error: null,
    }),
    upsert: async (row: any) => {
      mockSaved.push(row);
      return { error: null };
    },
  };
  return { supabase: { from: () => q }, uniqueChannel: jest.fn() };
});

import { CartService } from '../../src/services/cartService';

beforeEach(() => {
  mockSaved.length = 0;
});

it('keeps an option line at the OPTION price after a sync', async () => {
  mockStoredItems = [
    {
      productId: 'a37',
      variationId: 'v12',
      quantity: 1,
      selectedOptions: { size: '12GB/256GB' },
      product: { ...mockA37, priceIQD: 740000, priceUSD: 740000 / RATE, updatedAt: '2026-10-01T00:00:00Z' },
    },
  ];

  const cart = await CartService.syncCartWithLatestData('u1');
  expect(cart.items[0].product.priceIQD).toBe(740000);
  expect(mockSaved[0].items[0].product.priceIQD).toBe(740000);
});

it("clamps an option line to the OPTION's stock, not the product's", async () => {
  mockStoredItems = [
    {
      productId: 'a37',
      variationId: 'v12',
      quantity: 5,
      selectedOptions: { size: '12GB/256GB' },
      product: { ...mockA37, priceIQD: 740000 },
    },
  ];

  const cart = await CartService.syncCartWithLatestData('u1');
  expect(cart.items[0].quantity).toBe(2);
});
