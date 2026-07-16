import { PriceTier, Product } from '../types';

/**
 * Validates an array of price tiers.
 * Returns true if the tiers are valid (ascending minQty, no overlapping concepts, positive prices).
 * Returns false if the tiers are invalid/corrupt.
 */
export const validatePriceTiers = (tiers: PriceTier[]): boolean => {
  if (!tiers || tiers.length === 0) return true;

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    if (tier.minQty <= 0 || tier.priceUSD <= 0) return false;
    
    // Ensure ascending sort
    if (i > 0 && tier.minQty <= tiers[i - 1].minQty) return false;
  }

  return true;
};

/**
 * Calculates the unit price based on quantity, VIP status, and available wholesale tiers.
 * 
 * Rules:
 * - If tiers are corrupt, fall back to basePrice.
 * - Sort valid tiers ascending by minQty.
 * - Normal Users: If qty < first tier minQty, use basePrice. Else, use the tier with the highest qualifying minQty.
 * - VIP Users: If qty < first tier minQty, use first tier's price. Else, use the tier with the highest qualifying minQty.
 * 
 * @param quantity The amount of units being purchased
 * @param basePrice The regular unit price for the product
 * @param tiers The array of wholesale price tiers
 * @param isVip Whether the user has the VIP role
 * @returns The calculated unit price
 */
export const calculateTieredPrice = (
  quantity: number,
  basePrice: number,
  tiers?: PriceTier[],
  isVip: boolean = false
): number => {
  if (!tiers || tiers.length === 0) {
    return basePrice;
  }

  // Defensively copy and sort tiers ascending by minQty just in case
  const sortedTiers = [...tiers].sort((a, b) => a.minQty - b.minQty);

  if (!validatePriceTiers(sortedTiers)) {
    console.warn('Corrupt price tiers detected, falling back to base price.');
    return basePrice;
  }

  const firstTier = sortedTiers[0];

  // Base checking logic: find the highest threshold tier that the quantity satisfies
  let appliedTier: PriceTier | null = null;
  // Since it's sorted ascending, we can iterate forward and simply keep overriding,
  // or iterate backwards and stop at the first match. Iterating backwards is more efficient:
  for (let i = sortedTiers.length - 1; i >= 0; i--) {
    if (quantity >= sortedTiers[i].minQty) {
      appliedTier = sortedTiers[i];
      break;
    }
  }

  if (appliedTier) {
    return appliedTier.priceUSD;
  }

  // If we reach here, quantity is below the first tier's minQty.
  if (isVip) {
    // VIP override: Always get at least the first tier wholesale price
    return firstTier.priceUSD;
  }

  // Normal user, beneath wholesale minimums
  return basePrice;
};

// A product's per-unit price to CHARGE for a given user + quantity.
// VIP precedence: a flat `vipPriceUSD` (if set) wins; otherwise the tiered
// (wholesale) VIP price applies. Non-VIP always gets the normal tiered price.
export const getEffectiveUnitPrice = (
  product: Pick<Product, 'priceUSD' | 'vipPriceUSD' | 'priceTiers'>,
  quantity: number = 1,
  isVip: boolean = false
): number => {
  if (
    isVip &&
    typeof product.vipPriceUSD === 'number' &&
    product.vipPriceUSD > 0 &&
    product.vipPriceUSD < product.priceUSD
  ) {
    return product.vipPriceUSD;
  }
  return calculateTieredPrice(quantity, product.priceUSD, product.priceTiers, isVip);
};

// The single "from" price to DISPLAY on cards / the hero for this user (qty 1).
export const getDisplayUnitPrice = (
  product: Pick<Product, 'priceUSD' | 'vipPriceUSD' | 'priceTiers'>,
  isVip: boolean = false
): number => getEffectiveUnitPrice(product, 1, isVip);

// Whether a product has a VIP-only price that differs from what a non-VIP pays.
export const hasVipPrice = (
  product: Pick<Product, 'priceUSD' | 'vipPriceUSD' | 'priceTiers'>
): boolean => {
  if (typeof product.vipPriceUSD === 'number' && product.vipPriceUSD > 0 && product.vipPriceUSD < product.priceUSD) {
    return true;
  }
  // Tiered wholesale also yields a VIP-only price below the first tier.
  return !!(product.priceTiers && product.priceTiers.length > 0);
};
