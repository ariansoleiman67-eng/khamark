import React from "react";
import { View, Text, TextStyle, StyleProp, ViewStyle, Platform } from "react-native";

const LTR_MARK = "\u200E";

interface AppNumberProps {
  value: string | number;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
}

/**
 * Samsung/Android Bold-text safe number renderer:
 * - includeFontPadding: true on Android to prevent glyph clipping
 * - ensures lineHeight isn't too tight relative to fontSize
 * - adds tiny vertical padding on Android (helps badges/tables)
 * - keeps numbers LTR even in RTL screens
 */
export default function AppNumber({
  value,
  style,
  containerStyle,
  numberOfLines,
  adjustsFontSizeToFit,
  minimumFontScale,
}: AppNumberProps) {
  // Read fontSize from style (best-effort)
  const flat = (Array.isArray(style) ? Object.assign({}, ...style) : (style || {})) as TextStyle;
  const fontSize = typeof flat.fontSize === "number" ? flat.fontSize : 14;

  // Guarantee roomy lineHeight (bold text increases glyph metrics).
  // CRITICAL (iOS): When adjustsFontSizeToFit is enabled on iOS, specifying lineHeight
  // causes RCTText to measure the text as exceeding the vertical boundary, collapsing
  // font size down to the 4pt minimum. Never apply fixed lineHeight when adjustsFontSizeToFit is active on iOS.
  const isIosAdjusting = Platform.OS === "ios" && Boolean(adjustsFontSizeToFit);
  const safeLineHeight = isIosAdjusting
    ? undefined
    : typeof flat.lineHeight === "number"
      ? Math.max(flat.lineHeight, Math.ceil(fontSize * 1.25))
      : Math.ceil(fontSize * 1.25);

  const effectiveMinScale = minimumFontScale ?? (adjustsFontSizeToFit ? 0.85 : undefined);

  return (
    // @ts-ignore - writingDirection is required by user strictly
    <View style={[{ writingDirection: "ltr", alignItems: "flex-start", minWidth: 0 }, containerStyle]}>
      <Text
        allowFontScaling={false}
        numberOfLines={numberOfLines}
        adjustsFontSizeToFit={adjustsFontSizeToFit}
        minimumFontScale={effectiveMinScale}
        style={[
          {
            writingDirection: "ltr",
            textAlign: "left",
            // CRITICAL: Samsung bold-text needs the font padding space
            includeFontPadding: Platform.OS === "android",
            // CRITICAL: avoid tight line height, but omit on iOS when adjusting font size
            ...(safeLineHeight !== undefined ? { lineHeight: safeLineHeight } : null),
            // Helps in tight containers (badges/rows)
            ...(Platform.OS === "android" ? { paddingVertical: 1 } : null),
            // Stable digit widths
            fontVariant: ["tabular-nums"],
            // Layout safety in rows/tables
            flexShrink: 1,
          },
          style,
        ]}
      >
        {LTR_MARK}
        {String(value)}
      </Text>
    </View>
  );
}
