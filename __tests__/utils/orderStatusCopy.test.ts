import { orderStatusCopy } from '../../supabase/functions/_shared/orderStatusCopy';

describe('orderStatusCopy', () => {
  it('tells the customer about each status the shop moves an order to', () => {
    for (const status of ['confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'cancelled_by_store']) {
      const copy = orderStatusCopy(status, 'A123');
      expect(copy).not.toBeNull();
      // All three languages, every time — a blank copy falls back to English.
      for (const v of Object.values(copy!)) expect(v.trim().length).toBeGreaterThan(0);
    }
  });

  it('names the order by its number in every language', () => {
    const copy = orderStatusCopy('shipped', 'A123')!;
    expect(copy.body).toContain('A123');
    expect(copy.bodyAr).toContain('A123');
    expect(copy.bodyKu).toContain('A123');
  });

  it('still reads naturally with no order number', () => {
    expect(orderStatusCopy('delivered', null)!.body).toBe(
      'Your order has been delivered. Thank you for shopping with us!',
    );
  });

  it('stays quiet for pending, for a customer cancelling their own order, and for unknown values', () => {
    expect(orderStatusCopy('pending', 'A1')).toBeNull();
    expect(orderStatusCopy('cancelled_by_user', 'A1')).toBeNull();
    expect(orderStatusCopy('weird', 'A1')).toBeNull();
    expect(orderStatusCopy(null, 'A1')).toBeNull();
  });
});
