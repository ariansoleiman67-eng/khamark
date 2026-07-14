import React from 'react';
import { Text, TextProps, TextStyle, Platform, StyleSheet } from 'react-native';

type Props = TextProps & {
  fontSize?: number;
};

function isBold(weight?: TextStyle['fontWeight']) {
  if (!weight) return false;
  if (weight === 'bold') return true;
  const n = parseInt(String(weight), 10);
  return !Number.isNaN(n) && n >= 600;
}

function defaultLineHeight(fontSize: number, bold: boolean) {
  // Samsung bold needs more vertical room
  // Arabic is more sensitive so we keep it generous
  const mult = Platform.OS === 'android'
    ? (bold ? 1.75 : 1.55)
    : (bold ? 1.45 : 1.30);

  return Math.ceil(fontSize * mult);
}

export default function AppText({ style, fontSize, allowFontScaling = false, ...props }: Props) {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const bold = isBold(flat?.fontWeight);
  const fs = fontSize ?? flat?.fontSize ?? 14;
  const lh = flat?.lineHeight ?? defaultLineHeight(fs, bold);

  // Auto-enable adjustsFontSizeToFit for single line text if not explicitly disabled
  const isSingleLine = props.numberOfLines === 1;
  const shouldAdjust = props.adjustsFontSizeToFit ?? isSingleLine;
  const minScale = props.minimumFontScale ?? (shouldAdjust ? 0.7 : undefined);

  return (
    <Text
      {...props}
      allowFontScaling={allowFontScaling}
      adjustsFontSizeToFit={shouldAdjust}
      minimumFontScale={minScale}
      style={[
        Platform.OS === 'android' ? { includeFontPadding: true } : null,
        // Add safe padding for bold text to prevent clipping on Android
        Platform.OS === 'android' && bold ? { paddingHorizontal: 4, paddingVertical: 2 } : null,
        { lineHeight: lh },
        style,
      ]}
    />
  );
}
