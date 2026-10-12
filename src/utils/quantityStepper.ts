/**
 * Rules for the order sheet's quantity stepper, kept pure so they can be tested
 * without a device. StartOrderBottomSheet owns the layout; these own the numbers.
 */

/** A whole quantity between 1 and the ceiling. Garbage becomes 1, never 0. */
export function clampQty(n: number, max: number): number {
  const ceiling = Math.max(1, Math.floor(Number.isFinite(max) ? max : 1));
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(1, Math.floor(n)), ceiling);
}

/**
 * What the field shows while the shopper types. Digits only and never above the
 * ceiling, but an empty field or a lone 0 is allowed mid-edit (qty null: keep the
 * current quantity) so typing "0" then "5" is not rewritten under their thumb.
 */
export function parseQtyInput(text: string, max: number): { text: string; qty: number | null } {
  const digits = text.replace(/[^0-9]/g, '');
  if (!digits) return { text: '', qty: null };
  const n = parseInt(digits, 10);
  const ceiling = clampQty(max, max);
  if (n > ceiling) return { text: String(ceiling), qty: ceiling };
  if (n >= 1) return { text: String(n), qty: n };
  return { text: digits, qty: null };
}

/** The quantity a field settles on when it loses focus. */
export function commitQtyInput(text: string, max: number): number {
  const n = parseInt(text.replace(/[^0-9]/g, ''), 10);
  return clampQty(Number.isFinite(n) ? n : 1, max);
}

/** Whether each button can act, so a dead button looks dead. */
export function qtyBounds(qty: number, max: number): { canDecrease: boolean; canIncrease: boolean } {
  const ceiling = clampQty(max, max);
  return { canDecrease: qty > 1, canIncrease: qty < ceiling };
}

/** As many digits as the ceiling has, so the field can never hold a wider number. */
export function qtyMaxLength(max: number): number {
  return String(clampQty(max, max)).length;
}
