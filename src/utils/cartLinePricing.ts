/**
 * How a cart line is priced — in ONE place.
 *
 * This logic used to live twice, and the two copies disagreed:
 *
 *   localCartService.addVariationsToCart priced an option correctly: the
 *   option's own dinar price, a colour riding on a size, the option's VIP and
 *   "was" prices, and the rule that a self-priced option must not inherit the
 *   base product's VIP price.
 *
 *   CartService.validateCart, at checkout, knew only `variation.priceUSD`. Most
 *   options in this catalogue are priced in DINAR ONLY (66 of them, live), so for
 *   those it fell back to the BASE product, decided the price had "changed", and
 *   rewrote the line from the base product — dropping the option's own price.
 *
 * Concretely: a Samsung A37 12GB/256GB added at IQD 740,000 was re-priced at
 * checkout to the 8GB/128GB base, IQD 549,000, and charged that. It did not even
 * need a price edit — validateCart also rewrote any line whose product's
 * updatedAt had moved, which any admin save does.
 *
 * Both paths now call buildLineProduct, so they cannot disagree again.
 */

/** A line's product object: the product with this option's prices applied. */
export function buildLineProduct(
  product: any,
  opts: {
    variationId?: string | null;
    colorVariationId?: string | null;
    /** A price the caller already resolved for this selection, if any. */
    priceUSD?: number;
    priceIQD?: number;
  },
): any {
  const variationId = opts.variationId || null;

  // Sizes first, then colours — the same order the add path has always used.
  let variation: any = variationId
    ? product?.variations?.find((v: any) => v?.variationId === variationId)
    : undefined;
  if (!variation && variationId) {
    variation = product?.colorVariations?.find((v: any) => v?.variationId === variationId);
  }

  const variationPrice = opts.priceUSD ?? variation?.priceUSD ?? product?.priceUSD;

  // A line inherits product.priceIQD from the spread below, so an option that
  // overrides the price in DOLLARS on a dinar-priced product would be displayed
  // and charged at the product's dinar figure — the override silently discarded.
  // Decide the line's dinar price explicitly:
  //   the option's own dinar price if it has one;
  //   otherwise null when the option overrides in dollars;
  //   otherwise the product's, because the option sets no price at all.
  const selectionIQD = Number(opts.priceIQD ?? variation?.priceIQD);
  const hasVariantIQD = Number.isFinite(selectionIQD) && selectionIQD > 0;
  const hasVariantUSD = opts.priceUSD != null || variation?.priceUSD != null;
  const linePriceIQD = hasVariantIQD
    ? selectionIQD
    : hasVariantUSD
      ? null
      : (product?.priceIQD ?? null);

  // BOTH chosen options, not only the one that carries the line. A size+colour
  // pick arrives as ONE selection — the size holds variationId and the colour
  // rides along as colorVariationId — so reading extras off `variation` alone
  // drops every price the shop set on the colour. Colour applied first, then the
  // size overrides it, matching which of the two the line is priced by.
  const ridingColor =
    opts.colorVariationId && opts.colorVariationId !== variationId
      ? product?.colorVariations?.find((v: any) => v?.variationId === opts.colorVariationId)
      : undefined;

  const variantExtras: Record<string, number> = {};
  const carryOverFrom = (from: any, key: string) => {
    const value = Number(from?.[key]);
    if (Number.isFinite(value) && value > 0) variantExtras[key] = value;
  };
  const carryOver = (key: string) => {
    carryOverFrom(ridingColor, key);
    carryOverFrom(variation, key);
  };

  // Customer-facing prices only. NO COST: an option's cost is not on the
  // variation object at all (parts.variations is public). The server stamps the
  // real cost onto the order in orders_stamp_cost.
  ['vipPriceUSD', 'vipPriceIQD', 'compareAtPriceUSD', 'compareAtPriceIQD'].forEach(carryOver);

  // These come in pairs and the dinar side outranks the dollar one. If the
  // option gives only one half, the product's OTHER half must not survive to
  // outrank it — in either direction.
  const clearSibling = (a: string, b: string) => {
    if (variantExtras[a] && !variantExtras[b]) variantExtras[b] = 0;
    if (variantExtras[b] && !variantExtras[a]) variantExtras[a] = 0;
  };
  clearSibling('vipPriceUSD', 'vipPriceIQD');
  clearSibling('compareAtPriceUSD', 'compareAtPriceIQD');

  // An option that prices ITSELF must not inherit the product's VIP or "was"
  // price — those were set against the PRODUCT's price. A 512GB at $250 would
  // otherwise sell to a VIP at the 128GB's $90 VIP price.
  const optionPricesItself =
    Number(variation?.priceUSD) > 0 ||
    Number(variation?.priceIQD) > 0 ||
    Number(ridingColor?.priceUSD) > 0 ||
    Number(ridingColor?.priceIQD) > 0;
  if (optionPricesItself) {
    if (!variantExtras.vipPriceUSD && !variantExtras.vipPriceIQD) {
      variantExtras.vipPriceUSD = 0;
      variantExtras.vipPriceIQD = 0;
    }
    if (!variantExtras.compareAtPriceUSD && !variantExtras.compareAtPriceIQD) {
      variantExtras.compareAtPriceUSD = 0;
      variantExtras.compareAtPriceIQD = 0;
    }
  }

  return {
    ...product,
    priceUSD: variationPrice,
    priceIQD: linePriceIQD ?? undefined,
    ...variantExtras,
  };
}

const cents = (n: unknown) => Math.round(Number(n) * 100);

/**
 * What the shopper would actually be charged, reduced to a comparable string.
 *
 * On a dinar-priced line the dinar figure IS the price: the dollar column is
 * derived from it and can drift with rounding or with what the product page
 * happened to pass at add time. Comparing dollars there is what produced false
 * "prices updated" alerts, so a dinar line is compared on dinar alone.
 *
 * Dollar lines compare to the cent, so 0.1 + 0.2 is not a "price change".
 * VIP prices are included because a VIP customer is charged them.
 */
export function linePriceSignature(p: any): string {
  const iqd = Number(p?.priceIQD);
  const sell = Number.isFinite(iqd) && iqd > 0 ? `iqd:${Math.round(iqd)}` : `usd:${cents(p?.priceUSD)}`;

  const vipIqd = Number(p?.vipPriceIQD);
  const vipUsd = Number(p?.vipPriceUSD);
  const vip =
    Number.isFinite(vipIqd) && vipIqd > 0
      ? `iqd:${Math.round(vipIqd)}`
      : Number.isFinite(vipUsd) && vipUsd > 0
        ? `usd:${cents(vipUsd)}`
        : 'none';

  return `${sell}|${vip}`;
}

/** A line can be bought only if it has a positive price in either currency. */
export function isSellable(p: any): boolean {
  return Number(p?.priceIQD) > 0 || Number(p?.priceUSD) > 0;
}
