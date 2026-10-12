import { buildLineProduct } from './cartLinePricing';
import { variantPriceUSD } from './currency';

/**
 * The cart line a choice in the order sheet will become.
 *
 * Built by the SAME function the cart uses (buildLineProduct) from the SAME
 * inputs the sheet's confirm path sends: the size carries the line with the
 * chosen colour riding on it, a colour-only product sends the colour, and the
 * unit price is variantPriceUSD of the option that prices the line. Formatting
 * this with formatUnitPrice / formatLineTotal therefore prints exactly what the
 * cart will print.
 *
 * The sheet used to format a bare dollar figure instead. For a dinar-priced
 * product that put the exchange rate back on a stale stored price_usd — the
 * Redmi Note 17 Pro Max, 665,000 IQD, showed as 707,250 after the rate moved
 * from 1,570 to 1,670.
 *
 * Returns the product itself when it has no options, and null while a product
 * with options still has a group unanswered (there is no line yet).
 */
export function orderSheetLine(
  product: any,
  opts: { size: any | null; color: any | null; pricedVariant?: any | null; exchangeRate: number },
): any | null {
  if (!product) return null;
  const hasSizes = (product.variations?.length ?? 0) > 0;
  const hasColors = (product.colorVariations?.length ?? 0) > 0;
  if (!hasSizes && !hasColors) return product;
  if ((hasSizes && !opts.size) || (hasColors && !opts.color)) return null;

  const carrier = opts.size ?? opts.color;
  const pricedVariant = opts.pricedVariant ?? opts.size ?? opts.color;
  return buildLineProduct(product, {
    variationId: carrier.variationId,
    colorVariationId: opts.size ? opts.color?.variationId ?? null : null,
    priceUSD: variantPriceUSD(pricedVariant, product, opts.exchangeRate),
  });
}
