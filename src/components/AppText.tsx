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

export default function AppText({ style, fontSize, allowFontScaling = true, maxFontSizeMultiplier = 1.35, ...props }: Props) {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const bold = isBold(flat?.fontWeight);
  const fs = fontSize ?? flat?.fontSize ?? 14;
  const lh = flat?.lineHeight ?? defaultLineHeight(fs, bold);

  // Auto-enable adjustsFontSizeToFit for single line text if not explicitly disabled
  const isSingleLine = props.numberOfLines === 1;
  const shouldAdjust = props.adjustsFontSizeToFit ?? isSingleLine;
  // 0.7 let labels shrink to an illegible size next to full-size neighbours.
  // Keep shrink available, but only as a last resort.
  const minScale = props.minimumFontScale ?? (shouldAdjust ? 0.85 : undefined);

  // Android caches the auto-shrink measurement per Text instance: when the string
  // changes (switching language, a stock count updating) it reuses the OLD fitted
  // size and clips the new, longer text — e.g. "In Stock (40)" rendering as
  // "In Stock". Keying by content remounts the node so it re-measures.
  const contentKey =
    Platform.OS === 'android' && shouldAdjust && (typeof props.children === 'string' || typeof props.children === 'number')
      ? String(props.children)
      : undefined;

  // CRITICAL (iOS): When adjustsFontSizeToFit is enabled on iOS, specifying lineHeight
  // causes RCTText to measure the text as exceeding the vertical boundary, collapsing
  // font size down to the 4pt minimum. Never apply fixed lineHeight when adjustsFontSizeToFit is active on iOS.
  const isIosAdjusting = Platform.OS === 'ios' && Boolean(shouldAdjust);
  const safeLineHeight = isIosAdjusting ? undefined : lh;

  return (
    <Text
      {...props}
      key={contentKey}
      allowFontScaling={allowFontScaling}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      adjustsFontSizeToFit={shouldAdjust}
      minimumFontScale={minScale}
      style={[
        Platform.OS === 'android' ? { includeFontPadding: true } : null,
        // Add safe padding for bold text to prevent clipping on Android
        Platform.OS === 'android' && bold ? { paddingHorizontal: 4, paddingVertical: 2 } : null,
        safeLineHeight !== undefined ? { lineHeight: safeLineHeight } : null,
        style,
        isIosAdjusting ? { lineHeight: undefined } : null,
      ]}
    />
  );
}
