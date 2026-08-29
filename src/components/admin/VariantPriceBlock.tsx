import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProductVariation, ColorVariation } from '../../types';
import { formatCurrencyIQD, formatCurrencyUSD } from '../../utils/currency';
import PriceField from './PriceField';

/**
 * The four prices of ONE variation — size or colour — each with the same $/IQD
 * switch the product itself uses.
 *
 * The shop asked for all four per option, because a 256GB in a different colour
 * is a different buy, a different VIP deal and a different "was" price. Only the
 * selling price is open by default: four boxes on every colour of every product
 * would bury the thing being edited. The disclosure says how many of the other
 * three are set, so a filled field is never hidden without a trace.
 *
 * Everything is optional. An option that sets nothing inherits the product's
 * prices, which is what every variation created before this did.
 */
const VariantPriceBlock: React.FC<{
  variant: ProductVariation | ColorVariation;
  basePriceUSD: number;
  basePriceIQD?: number;
  exchangeRateIQD: number;
  onPatch: (patch: Record<string, number | undefined>) => void;
  theme: any;
  isRTL: boolean;
  t: (key: string, opts?: any) => string;
}> = ({ variant, basePriceUSD, basePriceIQD, exchangeRateIQD, onPatch, theme, isRTL, t }) => {
  const v = variant as any;
  const [expanded, setExpanded] = useState(false);

  const str = (n: any): string => (n == null || !Number.isFinite(Number(n)) ? '' : String(n));
  const num = (text: string): number | undefined => {
    const parsed = parseFloat(text);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };

  const pair = (usdKey: string, iqdKey: string) => ({
    usd: str(v[usdKey]),
    iqd: str(v[iqdKey]),
    onChange: ({ usd, iqd }: { usd: string; iqd: string }) =>
      onPatch({ [usdKey]: num(usd), [iqdKey]: num(iqd) }),
  });

  const extrasSet = [
    v.compareAtPriceUSD, v.compareAtPriceIQD,
    v.vipPriceUSD, v.vipPriceIQD,
    v.purchasePrice, v.purchasePriceIQD,
  ].filter((n) => Number(n) > 0).length;

  const inheritsHint = (() => {
    if (Number(v.priceIQD) > 0 || Number(v.priceUSD) > 0) return undefined;
    const base = Number(basePriceIQD) > 0
      ? formatCurrencyIQD(Number(basePriceIQD))
      : formatCurrencyUSD(basePriceUSD || 0);
    return t('admin.products.form.variantPriceInherits', {
      base,
      defaultValue: 'Leave blank and this option costs the product price, {{base}}.',
    });
  })();

  return (
    <View style={{ marginTop: 8 }}>
      <PriceField
        label={t('admin.products.form.variantPrice', { defaultValue: 'Price for this option' })}
        {...pair('priceUSD', 'priceIQD')}
        exchangeRateIQD={exchangeRateIQD}
        theme={theme}
        hint={inheritsHint}
      />

      <TouchableOpacity
        onPress={() => setExpanded((prev) => !prev)}
        activeOpacity={0.7}
        accessibilityRole="button"
        style={{
          flexDirection: isRTL ? 'row-reverse' : 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 8,
        }}
      >
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={theme.colors.primary}
        />
        <Text allowFontScaling={false} style={{ fontSize: 12, fontWeight: '700', color: theme.colors.primary }}>
          {extrasSet > 0
            // `n`, not `count`: i18next treats a `count` option as a plural
            // selector and goes looking for _one/_other variants of the key.
            ? t('admin.products.form.variantMorePricesSet', {
                n: extrasSet,
                defaultValue: 'Was / VIP / cost for this option ({{n}} set)',
              })
            : t('admin.products.form.variantMorePrices', {
                defaultValue: 'Was / VIP / cost for this option',
              })}
        </Text>
      </TouchableOpacity>

      {expanded && (
        <View>
          <PriceField
            label={t('admin.products.form.compareAtPriceAny', { defaultValue: 'Was Price' })}
            {...pair('compareAtPriceUSD', 'compareAtPriceIQD')}
            exchangeRateIQD={exchangeRateIQD}
            theme={theme}
          />
          <PriceField
            label={t('admin.products.form.vipPriceAny', { defaultValue: 'VIP Price' })}
            {...pair('vipPriceUSD', 'vipPriceIQD')}
            exchangeRateIQD={exchangeRateIQD}
            theme={theme}
            accentColor="#7C3AED"
          />
          <PriceField
            label={t('admin.products.form.purchasePriceAny', { defaultValue: 'Purchase Price (cost)' })}
            {...pair('purchasePrice', 'purchasePriceIQD')}
            exchangeRateIQD={exchangeRateIQD}
            theme={theme}
          />
        </View>
      )}
    </View>
  );
};

export default VariantPriceBlock;
