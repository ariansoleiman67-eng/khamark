import React, { useMemo, useState } from 'react';
import { View, ScrollView, TouchableOpacity, TextInput, I18nManager, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import AppText from '../AppText';
import { SPACING } from '../../constants/theme';

/**
 * Pick ANY colour, by name.
 *
 * The product form used to offer ten fixed colours — Black, White, Red, Blue and
 * so on. That is wrong for this shop twice over: phones ship as Midnight,
 * Graphite or Sierra Blue, and the shop also sells cases, cables and covers in
 * whatever colour the supplier made them. No list can cover that, so the escape
 * hatch is the feature: a hex field accepts literally any colour, and the grid
 * is only there to make the common ones fast.
 *
 * No colour-picker dependency. This project has twice been bitten by stale
 * packages, and a grid plus a hex field needs nothing but React Native.
 *
 * Rendered as an ABSOLUTE OVERLAY, never a <Modal>. The product form is itself a
 * Modal, and RN sets _isPresented = YES before calling presentViewController:
 * with no failure path (RCTModalHostViewComponentView.mm:156-157). iOS ignores a
 * presentation while one is already in flight, so a dropped present is latched as
 * successful and can never be retried — the app looks frozen. This shop has
 * already lost a day to that exact bug (commit 0739476). An overlay inside the
 * existing Modal presents nothing and cannot latch.
 */

/** 12 hues x 5 shades, plus a neutral row. Enough that typing hex is rare. */
const HUES = [
  { name: 'red', base: [244, 67, 54] },
  { name: 'pink', base: [233, 30, 99] },
  { name: 'purple', base: [156, 39, 176] },
  { name: 'indigo', base: [63, 81, 181] },
  { name: 'blue', base: [33, 150, 243] },
  { name: 'cyan', base: [0, 188, 212] },
  { name: 'teal', base: [0, 150, 136] },
  { name: 'green', base: [76, 175, 80] },
  { name: 'lime', base: [205, 220, 57] },
  { name: 'yellow', base: [255, 235, 59] },
  { name: 'orange', base: [255, 152, 0] },
  { name: 'brown', base: [121, 85, 72] },
] as const;

/** Lighten (t>0) or darken (t<0) towards white/black. */
function shade(rgb: readonly number[], t: number): string {
  const mix = (c: number) =>
    Math.round(t >= 0 ? c + (255 - c) * t : c * (1 + t));
  return (
    '#' +
    rgb
      .map(c => Math.max(0, Math.min(255, mix(c))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

const SHADE_STEPS = [0.6, 0.3, 0, -0.3, -0.6];

/** Greys and the off-whites/near-blacks products actually ship in. */
const NEUTRALS = [
  '#FFFFFF', '#F5F5F0', '#E0E0E0', '#9E9E9E', '#616161', '#303030', '#000000',
  '#C0B8A8', '#8D7B68', '#4A4A4A',
];

export const isValidHex = (value: string): boolean =>
  /^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(value.trim());

export const normalizeHex = (value: string): string => {
  let v = value.trim().replace(/^#/, '');
  if (v.length === 3) v = v.split('').map(c => c + c).join('');
  return '#' + v.toUpperCase();
};

interface Props {
  visible: boolean;
  isDark: boolean;
  theme: any;
  onCancel: () => void;
  onConfirm: (name: string, hex: string) => void;
}

const ColorPickerSheet: React.FC<Props> = ({ visible, isDark, theme, onCancel, onConfirm }) => {
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';

  const [name, setName] = useState('');
  const [hex, setHex] = useState('#000000');
  const [hexText, setHexText] = useState('#000000');

  const grid = useMemo(
    () => HUES.map(h => SHADE_STEPS.map(s => shade(h.base, s))),
    [],
  );

  const reset = () => {
    setName('');
    setHex('#000000');
    setHexText('#000000');
  };

  const pick = (value: string) => {
    setHex(value);
    setHexText(value);
  };

  const commitHexText = (value: string) => {
    setHexText(value);
    if (isValidHex(value)) setHex(normalizeHex(value));
  };

  const canSave = name.trim().length > 0 && isValidHex(hexText);

  const swatch = (value: string, size: number) => (
    <TouchableOpacity
      key={value + size}
      onPress={() => pick(value)}
      accessibilityRole="button"
      accessibilityLabel={value}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: value,
        borderWidth: hex === value ? 3 : 1,
        borderColor: hex === value ? theme.colors.primary : theme.colors.border,
        margin: 4,
      }}
    />
  );

  if (!visible) return null;

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100,
        justifyContent: 'flex-end',
      }}
    >
      {/* Tapping the scrim closes, the way a sheet does. */}
      <Pressable
        onPress={onCancel}
        accessibilityRole="button"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' }}
      />
      <View style={{ justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: SPACING.md,
            maxHeight: '85%',
          }}
        >
          <View
            style={{
              flexDirection: isRTL ? 'row-reverse' : 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: SPACING.md,
            }}
          >
            <AppText fontSize={16} style={{ fontWeight: '700', color: theme.colors.text }}>
              {t('admin.products.form.customColor', { defaultValue: 'Custom colour' })}
            </AppText>
            <TouchableOpacity onPress={onCancel} accessibilityRole="button">
              <AppText fontSize={14} style={{ color: theme.colors.textSecondary }}>
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </AppText>
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Name — shown to the customer exactly as typed, in whatever
                language the shop writes it. Most finishes carry the
                manufacturer's own name ("Sierra Blue") and are not translated. */}
            <AppText fontSize={13} style={{ color: theme.colors.textSecondary, marginBottom: 6, textAlign: isRTL ? 'right' : 'left' }}>
              {t('admin.products.form.colorName', { defaultValue: 'Colour name' })}
            </AppText>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t('admin.products.form.colorNamePlaceholder', { defaultValue: 'e.g. Sierra Blue' })}
              placeholderTextColor={theme.colors.textSecondary}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: 10,
                paddingHorizontal: SPACING.md,
                paddingVertical: 10,
                color: theme.colors.text,
                textAlign: isRTL ? 'right' : 'left',
                marginBottom: SPACING.md,
              }}
            />

            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', marginBottom: SPACING.sm }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: isValidHex(hexText) ? normalizeHex(hexText) : theme.colors.background,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  ...(isRTL ? { marginLeft: SPACING.md } : { marginRight: SPACING.md }),
                }}
              />
              <TextInput
                value={hexText}
                onChangeText={commitHexText}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="#RRGGBB"
                placeholderTextColor={theme.colors.textSecondary}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: isValidHex(hexText) ? theme.colors.border : theme.colors.error,
                  borderRadius: 10,
                  paddingHorizontal: SPACING.md,
                  paddingVertical: 10,
                  color: theme.colors.text,
                  // Hex is a code, not prose, so it stays left-aligned even in
                  // Arabic and Kurdish. textAlign only — writingDirection is
                  // banned in this codebase because it breaks Android.
                  textAlign: 'left',
                }}
              />
            </View>

            <AppText fontSize={12} style={{ color: theme.colors.textSecondary, marginBottom: SPACING.sm, textAlign: isRTL ? 'right' : 'left' }}>
              {t('admin.products.form.colorHexHint', { defaultValue: 'Type any hex code, or pick below.' })}
            </AppText>

            {grid.map((row, i) => (
              <View key={`hue-${i}`} style={{ flexDirection: 'row', justifyContent: 'center' }}>
                {row.map(value => swatch(value, 34))}
              </View>
            ))}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: SPACING.sm }}>
              {NEUTRALS.map(value => swatch(value, 34))}
            </View>

            <TouchableOpacity
              disabled={!canSave}
              onPress={() => {
                onConfirm(name.trim(), normalizeHex(hexText));
                reset();
              }}
              accessibilityRole="button"
              style={{
                marginTop: SPACING.lg,
                marginBottom: SPACING.md,
                backgroundColor: canSave ? theme.colors.primary : theme.colors.border,
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: 'center',
              }}
            >
              <AppText fontSize={15} style={{ color: '#FFFFFF', fontWeight: '700' }}>
                {t('admin.products.form.addColor', { defaultValue: 'Add colour' })}
              </AppText>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </View>
  );
};

export default ColorPickerSheet;
