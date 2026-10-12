import { clampQty, parseQtyInput, commitQtyInput, qtyBounds, qtyMaxLength } from '../../src/utils/quantityStepper';

/**
 * The order sheet's +/- stepper. Its layout broke on long option lists and long
 * dinar totals; these are the rules it must keep while the layout changes.
 */

describe('clampQty', () => {
  it('keeps a quantity between 1 and the ceiling', () => {
    expect(clampQty(0, 5)).toBe(1);
    expect(clampQty(3, 5)).toBe(3);
    expect(clampQty(9, 5)).toBe(5);
  });

  it('never returns below 1, even for a ceiling of 0 or garbage', () => {
    expect(clampQty(4, 0)).toBe(1);
    expect(clampQty(Number.NaN, 5)).toBe(1);
    expect(clampQty(2.7, 5)).toBe(2);
  });
});

describe('parseQtyInput (while typing)', () => {
  it('keeps digits only and caps at the ceiling', () => {
    expect(parseQtyInput('1a2', 50)).toEqual({ text: '12', qty: 12 });
    expect(parseQtyInput('99', 7)).toEqual({ text: '7', qty: 7 });
  });

  it('lets the field be empty mid-edit without changing the quantity', () => {
    expect(parseQtyInput('', 5)).toEqual({ text: '', qty: null });
    expect(parseQtyInput('0', 5)).toEqual({ text: '0', qty: null });
  });
});

describe('commitQtyInput (on blur)', () => {
  it('turns an empty or zero field back into 1, and caps the rest', () => {
    expect(commitQtyInput('', 5)).toBe(1);
    expect(commitQtyInput('0', 5)).toBe(1);
    expect(commitQtyInput('12', 5)).toBe(5);
    expect(commitQtyInput('3', 5)).toBe(3);
  });
});

describe('qtyBounds', () => {
  it('disables minus at 1 and plus at the ceiling', () => {
    expect(qtyBounds(1, 5)).toEqual({ canDecrease: false, canIncrease: true });
    expect(qtyBounds(3, 5)).toEqual({ canDecrease: true, canIncrease: true });
    expect(qtyBounds(5, 5)).toEqual({ canDecrease: true, canIncrease: false });
  });

  it('disables both when only one unit can be bought', () => {
    expect(qtyBounds(1, 1)).toEqual({ canDecrease: false, canIncrease: false });
  });
});

describe('qtyMaxLength', () => {
  it('allows exactly as many digits as the ceiling has', () => {
    expect(qtyMaxLength(7)).toBe(1);
    expect(qtyMaxLength(200)).toBe(3);
    expect(qtyMaxLength(0)).toBe(1);
  });
});
