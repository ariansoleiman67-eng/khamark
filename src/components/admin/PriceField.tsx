import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity, I18nManager } from 'react-native';
import { useTranslation } from 'react-i18next';
import AppText from '../AppText';
import {
  convertIQDToUSD,
  convertUSDToIQD,
  formatCurrencyIQD,
  formatCurrencyUSD,
} from '../../utils/currency';

export type PriceCurrency = 'USD' | 'IQD';

/**
 * One money box with a $ / IQD switch, for the admin product form.
 *
 * WHY A SWITCH AND NOT TWO BOXES. Every price in this shop is stored twice —
 * price_usd and price_iqd, vip_price_usd and vip_price_iqd, and so on — and the
 * dinar column silently OUTRANKS the dollar one. Shown as two boxes side by
 * side that is a trap: filling both looks like giving two prices, when in fact
 * the dollar figure is dead. A switch says what is actually true — this price is
 * authored in ONE currency — and makes the other column impossible to leave
 * behind by accident.
 *
 * Switching currency CONVERTS what is already typed at today's rate rather than
 * clearing it, so 100,000 IQD becomes $64.94 rather than an empty box, and then
 * clears the side you switched away from. The conversion is a convenience at the
 * moment of typing only: once saved, a dinar price is charged verbatim forever
 * and never re-converted.
 */
interface PriceFieldProps {
  label: string;
  /** The USD amount as typed. '' when this price is authored in dinar. */
  usd: string;
  /** The IQD amount as typed. '' when this price is authored in dollars. */
  iqd: string;
  onChange: (next: { usd: string; iqd: string }) => void;
  exchangeRateIQD: number;
  /** Shown under the box. Callers explain what THIS price means. */
  hint?: string;
  placeholder?: string;
  /** Tints the box when set, for prices that override something else (VIP). */
  accentColor?: string;
  theme: any;
  disabled?: boolean;
}

const sanitiseUSD = (text: string): string => text.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
const sanitiseIQD = (text: string): string => text.replace(/[^0-9]/g, '');

const PriceField: React.FC<PriceFieldProps> = ({
  label,
  usd,
  iqd,
  onChange,
  exchangeRateIQD,
  hint,
  placeholder,
  accentColor,
  theme,
  disabled,
}) => {
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';

  /**
   * Which currency this box is in.
   *
   * NOT simply derived from "does the IQD string have a value". That was the
   * first version and it broke twice over: on an EMPTY box tapping IQD did
   * nothing at all (the switch wrote two empty strings, the derivation read them
   * back as USD, and the shop could never start typing a dinar price on a new
   * product), and clearing a dinar price to retype it silently flipped the field
   * back to dollars mid-edit — so the number retyped was saved as USD.
   *
   * So the admin's choice is sticky, and the PROPS win only when they carry a
   * value in the currency the admin did NOT choose. That is what a different
   * product being loaded into the form looks like, and it is the only case where
   * overriding their choice is right.
   */
  const [chosen, setChosen] = useState<PriceCurrency | null>(null);
  const propHasIQD = iqd.trim() !== '';
  const propHasUSD = usd.trim() !== '';
  const currency: PriceCurrency =
    chosen === 'IQD' && !propHasUSD ? 'IQD'
      : chosen === 'USD' && !propHasIQD ? 'USD'
        : (propHasIQD ? 'IQD' : 'USD');
  const value = currency === 'IQD' ? iqd : usd;
  const hasValue = value.trim() !== '';

  const switchTo = useCallback(
    (next: PriceCurrency) => {
      if (next === currency) return;
      setChosen(next);
      if (next === 'IQD') {
        const amount = parseFloat(usd);
        // Math.round, NOT convertUSDToIQD: that helper snaps to the nearest 250,
        // which is right for a shopper-facing price and wrong here. It would move
        // a COST the shop typed ($90 at 1540 = 138,600 -> 138,500) and every
        // profit figure is worked out from that number.
        const converted = Number.isFinite(amount) && amount > 0
          ? String(Math.round(amount * exchangeRateIQD))
          : '';
        onChange({ usd: '', iqd: converted });
      } else {
        const amount = parseInt(iqd, 10);
        const converted = Number.isFinite(amount) && amount > 0
          ? String(convertIQDToUSD(amount, exchangeRateIQD))
          : '';
        onChange({ usd: converted, iqd: '' });
      }
    },
    [currency, usd, iqd, exchangeRateIQD, onChange],
  );

  const handleText = useCallback(
    (text: string) => {
      if (currency === 'IQD') onChange({ usd: '', iqd: sanitiseIQD(text) });
      else onChange({ usd: sanitiseUSD(text), iqd: '' });
    },
    [currency, onChange],
  );

  // What this figure is worth in the other currency, so the admin can sanity-check
  // a dinar price against the dollar one they know — and vice versa.
  const conversion = useMemo(() => {
    if (!hasValue || !(exchangeRateIQD > 0)) return null;
    if (currency === 'IQD') {
      const amount = parseInt(iqd, 10);
      if (!Number.isFinite(amount) || amount <= 0) return null;
      return t('admin.products.form.priceApproxUSD', {
        usd: formatCurrencyUSD(convertIQDToUSD(amount, exchangeRateIQD)),
        defaultValue: '≈ {{usd}} for shoppers browsing in dollars',
      });
    }
    const amount = parseFloat(usd);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return t('admin.products.form.priceApproxIQD', {
      iqd: formatCurrencyIQD(convertUSDToIQD(amount, exchangeRateIQD)),
      defaultValue: '≈ {{iqd}} at today’s rate',
    });
  }, [hasValue, currency, usd, iqd, exchangeRateIQD, t]);

  const active = !!accentColor && hasValue;

  return (
    <View style={styles.wrap}>
      <AppText
        fontSize={13}
        style={[styles.label, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}
      >
        {label}
      </AppText>

      <View style={[styles.row, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TextInput
          allowFontScaling={false}
          editable={!disabled}
          style={[
            styles.input,
            {
              backgroundColor: theme.colors.surface,
              color: theme.colors.text,
              borderColor: active ? accentColor : theme.colors.border,
              textAlign: isRTL ? 'right' : 'left',
              opacity: disabled ? 0.5 : 1,
            },
          ]}
          value={value}
          onChangeText={handleText}
          keyboardType={currency === 'IQD' ? 'number-pad' : 'decimal-pad'}
          placeholder={placeholder ?? (currency === 'IQD' ? '0' : '0.00')}
          placeholderTextColor={theme.colors.textSecondary}
          multiline={false}
          scrollEnabled={false}
          disableFullscreenUI
        />

        <View style={[styles.toggle, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
          {(['USD', 'IQD'] as PriceCurrency[]).map((code) => {
            const on = currency === code;
            return (
              <TouchableOpacity
                key={code}
                onPress={() => switchTo(code)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[
                  styles.toggleBtn,
                  on && { backgroundColor: accentColor || theme.colors.primary },
                ]}
              >
                <AppText
                  fontSize={13}
                  style={{
                    fontWeight: '800',
                    color: on ? theme.colors.textOnPrimary : theme.colors.textSecondary,
                  }}
                >
                  {code === 'USD' ? '$' : 'IQD'}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {!!conversion && (
        <AppText
          fontSize={11}
          numberOfLines={2}
          style={[styles.hint, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}
        >
          {conversion}
        </AppText>
      )}
      {!!hint && (
        <AppText
          fontSize={11}
          numberOfLines={3}
          style={[styles.hint, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}
        >
          {hint}
        </AppText>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: { fontWeight: '700', marginBottom: 6 },
  row: { alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },
  toggle: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  toggleBtn: {
    minWidth: 46,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  hint: { marginTop: 5 },
});

export default React.memo(PriceField);
