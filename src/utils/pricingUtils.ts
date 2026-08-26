import { PriceTier, Product } from '../types';
import { getCurrentExchangeRate } from './exchangeRate';
import { convertIQDToUSD, formatCurrencyIQD, formatCurrencyUSD, formatPrice, isIQDPriced } from './currency';

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

/** What a VIP product type looks like once a VIP price can be authored in dinar. */
type VipPriced = Pick<Product, 'priceUSD' | 'vipPriceUSD' | 'priceTiers'> & {
  priceIQD?: number;
  vipPriceIQD?: number;
};

/**
 * The VIP price for this product, in USD, or null if it has none.
 *
 * A dinar VIP price outranks a dollar one, matching how priceIQD outranks
 * priceUSD on the product itself.
 */
const vipCandidateUSD = (product: VipPriced, exchangeRate: number): number | null => {
  const iqd = Number(product.vipPriceIQD);
  if (Number.isFinite(iqd) && iqd > 0) return convertIQDToUSD(iqd, exchangeRate);
  const usd = Number(product.vipPriceUSD);
  return Number.isFinite(usd) && usd > 0 ? usd : null;
};

/**
 * Is the VIP price actually cheaper than what this shopper would otherwise pay?
 *
 * When BOTH figures are authored in dinar the comparison is made in dinar. That
 * is not a micro-optimisation: it is exact and rate-independent, whereas
 * converting both to dollars first can flip the answer on a rate edit. And the
 * naive form of this guard — `vipPriceIQD < product.priceUSD` — compares a
 * six-figure dinar number against a two-figure dollar one and concludes the VIP
 * price is never a discount, silently charging VIPs full price.
 */
const vipIsCheaper = (product: VipPriced, candidateUSD: number, exchangeRate: number): boolean => {
  const vipIQD = Number(product.vipPriceIQD);
  const baseIQD = Number(product.priceIQD);
  if (Number.isFinite(vipIQD) && vipIQD > 0 && Number.isFinite(baseIQD) && baseIQD > 0) {
    return vipIQD < baseIQD;
  }
  return candidateUSD < Number(product.priceUSD);
};

// A product's per-unit price to CHARGE for a given user + quantity.
// VIP precedence: a flat VIP price (if set, dinar before dollars) wins;
// otherwise the tiered (wholesale) VIP price applies. Non-VIP always gets the
// normal tiered price.
export const getEffectiveUnitPrice = (
  product: VipPriced,
  quantity: number = 1,
  isVip: boolean = false,
  exchangeRate: number = getCurrentExchangeRate()
): number => {
  if (isVip) {
    const candidate = vipCandidateUSD(product, exchangeRate);
    if (candidate != null && candidate > 0 && vipIsCheaper(product, candidate, exchangeRate)) {
      return candidate;
    }
  }
  return calculateTieredPrice(quantity, product.priceUSD, product.priceTiers, isVip);
};

/**
 * Is this shopper actually being charged a VIP price right now?
 *
 * The four surfaces that paint a price purple and stamp a VIP badge each tested
 * `typeof product.vipPriceUSD === 'number' && > 0` — which misses a VIP price
 * authored in dinar entirely (no badge on the very products the shop discounts
 * for VIPs), and lights up for a VIP price that is NOT cheaper than the normal
 * one, which getEffectiveUnitPrice refuses to charge. The badge said VIP while
 * the till said full price.
 *
 * Defined here, beside the decision it mirrors, so the two cannot drift again.
 */
export const isVipPriceActive = (
  product: VipPriced,
  isVip: boolean,
  quantity: number = 1,
  exchangeRate: number = getCurrentExchangeRate()
): boolean => {
  if (!isVip) return false;
  const candidate = vipCandidateUSD(product, exchangeRate);
  if (candidate == null || candidate <= 0) return false;
  if (!vipIsCheaper(product, candidate, exchangeRate)) return false;
  return getEffectiveUnitPrice(product, quantity, true, exchangeRate) === candidate;
};

/**
 * The dinar figure a VIP is being charged, or null when they are not being
 * charged a dinar-authored VIP price. Lets the formatter print the shop's exact
 * number instead of a converted round-trip of it.
 */
export const vipDinarUnit = (
  product: VipPriced,
  isVip: boolean,
  unitUSD: number,
  exchangeRate: number,
  unitDelta: number
): number | null => {
  if (!isVip || unitDelta) return null;
  const iqd = Number(product.vipPriceIQD);
  if (!Number.isFinite(iqd) || iqd <= 0) return null;
  // Only when this dinar price is the one actually winning — a VIP price that
  // lost the "is it cheaper" test must not be displayed as if it applied.
  return unitUSD === convertIQDToUSD(iqd, exchangeRate) ? iqd : null;
};

// The single "from" price to DISPLAY on cards / the hero for this user (qty 1).
export const getDisplayUnitPrice = (
  product: VipPriced,
  isVip: boolean = false,
  exchangeRate: number = getCurrentExchangeRate()
): number => getEffectiveUnitPrice(product, 1, isVip, exchangeRate);

// Stock is at or below this before the "only N left" urgency cue appears.
// ProductDetailsScreen declares its own copy (it is @ts-nocheck and owned elsewhere);
// it should import this one so the card and the page can never disagree.
export const LOW_STOCK_THRESHOLD = 5;

// Everything the shop can actually fulfil for a product: the main stock PLUS every
// per-size and per-colour bucket. A product stocked only through colour variations
// (main stockQty 0, Red 5 / Blue 3) is genuinely sellable and the detail screen sells
// it — cards computing stock from `stockQty` alone greyed out the buy button on it.
// This must stay identical to the `effectiveStock` in ProductDetailsScreen.
export const getEffectiveStock = (
  product: Pick<Product, 'stockQty' | 'variations' | 'colorVariations'>
): number => {
  const sizeStock = product.variations?.reduce((sum, v) => sum + (v.stockQuantity || 0), 0) || 0;
  const colorStock = product.colorVariations?.reduce((sum, v) => sum + (v.stockQuantity || 0), 0) || 0;
  return (product.stockQty || 0) + sizeStock + colorStock;
};

type DiscountableProduct = Pick<
  Product,
  'priceUSD' | 'vipPriceUSD' | 'priceTiers' | 'compareAtPriceUSD'
>;

// Whether the compare-at ("was") price beats what THIS shopper actually pays.
// Measured against the displayed price, not `priceUSD`, so a VIP or wholesale buyer
// still sees the badge — and sees it agree with the number next to it.
export const hasCompareAtDiscount = (
  product: DiscountableProduct,
  isVip: boolean = false
): boolean =>
  typeof product.compareAtPriceUSD === 'number' &&
  product.compareAtPriceUSD > getDisplayUnitPrice(product, isVip);

// The single Save% figure for the whole app. Computed off the price the shopper pays,
// so the grid card and the product page can no longer quote different percentages for
// the same product.
export const getDiscountPercent = (
  product: DiscountableProduct,
  isVip: boolean = false
): number => {
  if (!hasCompareAtDiscount(product, isVip)) return 0;
  const shownPrice = getDisplayUnitPrice(product, isVip);
  return Math.round((1 - shownPrice / (product.compareAtPriceUSD as number)) * 100);
};

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

/**
 * Is the shopper looking at the product's own base price, unmodified?
 *
 * Only the base price can be authored in dinar. A VIP price, a wholesale tier
 * or a storage-size surcharge are all still dollar figures, so as soon as one of
 * them applies the dinar figure is no longer what is being shown and the normal
 * conversion has to take over. Showing a dollar-authored VIP price as a verbatim
 * dinar amount would be plain wrong.
 */
const baseDinarPriceApplies = (
  product: VipPriced,
  unitUSD: number,
  unitDelta: number
): boolean => isIQDPriced(product) && unitUSD === product.priceUSD && !unitDelta;

/**
 * The price string to show, in the shopper's currency.
 *
 * Use this rather than formatPrice(getEffectiveUnitPrice(...)) anywhere a whole
 * Product is in hand. formatPrice takes a bare USD number, so it cannot tell that
 * a product was priced in dinar and would put the exchange rate and the 250-IQD
 * snap back on a figure the shop typed exactly.
 *
 * `multiplier` is what makes a line total agree with the unit price above it. A
 * dinar total is quantity x the typed figure, computed in dinar; converting the
 * dollar total instead would round differently and print two prices that do not
 * add up on the same screen.
 */
const formatPricePart = (
  product: VipPriced,
  isVip: boolean,
  currency: 'USD' | 'IQD',
  exchangeRateIQD: number,
  options: any,
  quantity: number,
  unitDelta: number,
  multiplier: number
): string => {
  const unitUSD = getEffectiveUnitPrice(product, quantity, isVip, exchangeRateIQD);

  // A VIP price authored in dinar is shown to a VIP exactly as typed, before the
  // base-price rule below gets a look in — the VIP figure is the one being paid.
  const vipIQD = vipDinarUnit(product, isVip, unitUSD, exchangeRateIQD, unitDelta);
  if (vipIQD != null) {
    const total = vipIQD * multiplier;
    return currency === 'IQD'
      ? formatCurrencyIQD(total, options)
      : formatCurrencyUSD(convertIQDToUSD(total, exchangeRateIQD), options);
  }

  if (baseDinarPriceApplies(product, unitUSD, unitDelta)) {
    const iqd = Number(product.priceIQD) * multiplier;
    return currency === 'IQD'
      ? formatCurrencyIQD(iqd, options)
      : formatCurrencyUSD(convertIQDToUSD(iqd, exchangeRateIQD), options);
  }
  return formatPrice((unitUSD + unitDelta) * multiplier, currency, exchangeRateIQD, options);
};

/** Price of a single unit. `quantity` only selects the wholesale tier. */
export const formatUnitPrice = (
  product: VipPriced,
  isVip: boolean = false,
  currency: 'USD' | 'IQD' = 'USD',
  exchangeRateIQD: number = getCurrentExchangeRate(),
  options: any = {},
  quantity: number = 1,
  unitDelta: number = 0
): string => formatPricePart(product, isVip, currency, exchangeRateIQD, options, quantity, unitDelta, 1);

/** Unit price x quantity, kept in dinar end to end for a dinar-priced product. */
export const formatLineTotal = (
  product: VipPriced,
  isVip: boolean = false,
  currency: 'USD' | 'IQD' = 'USD',
  exchangeRateIQD: number = getCurrentExchangeRate(),
  options: any = {},
  quantity: number = 1,
  unitDelta: number = 0
): string => formatPricePart(product, isVip, currency, exchangeRateIQD, options, quantity, unitDelta, quantity);
