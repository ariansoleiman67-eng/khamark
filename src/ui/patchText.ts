/**
 * GLOBAL TEXT PATCH - Android Bold Text Accessibility Fix
 * 
 * Prevents text clipping on Android devices when:
 * - System Bold Text is enabled in Accessibility settings
 * - System font size or display size is increased
 * - Samsung, OPPO, Xiaomi, Huawei, and other Android devices
 * 
 * This patch must be imported ONCE at app entry point (App.tsx)
 * BEFORE any components render.
 */

import { Platform, Text, TextProps, StyleSheet, TextStyle } from 'react-native';

// Store original render method (using stable reference)
// @ts-expect-error - Text.render exists at runtime but not in types
const originalTextRender = Text.render;

// Helper to detect if font weight is bold
function isBoldWeight(weight?: TextStyle['fontWeight']): boolean {
  if (!weight) return false;
  if (weight === 'bold') return true;
  const n = parseInt(String(weight), 10);
  return !Number.isNaN(n) && n >= 600;
}

// Override Text.render globally
(Text as any).render = function(props: TextProps, ref: any) {
  // Build patched props
  const patchedProps: TextProps = {
    ...props,
    // Always allow font scaling (accessibility)
    allowFontScaling: true,
  };

  // Android-specific fixes for text clipping with Bold Text accessibility
  if (Platform.OS === 'android') {
    const flatStyle = StyleSheet.flatten(props.style) as TextStyle | undefined;
    const isBold = isBoldWeight(flatStyle?.fontWeight);
    const fontSize = flatStyle?.fontSize ?? 14;
    
    // Calculate generous line height for bold text when system Bold Text is enabled
    // Bold text needs more vertical space to prevent cutoff
    const lineHeightMultiplier = isBold ? 1.75 : 1.55;
    const safeLineHeight = flatStyle?.lineHeight ?? Math.ceil(fontSize * lineHeightMultiplier);

    // Build android-specific style fixes
    // Using 'any' because textBreakStrategy is Android-only and not in TextStyle
    const androidFixes: any = {
      // CRITICAL: Use 'simple' textBreakStrategy to prevent cutoff in row layouts
      // This is the main fix for Bold Text accessibility setting
      textBreakStrategy: 'simple',
      // Keep includeFontPadding TRUE for bold text - false causes cutoff
      includeFontPadding: true,
      // Vertically center text to prevent cut-off
      textAlignVertical: 'center',
      // Apply generous line height to prevent vertical clipping
      lineHeight: safeLineHeight,
    };

    patchedProps.style = [props.style, androidFixes];
  }

  // Call original render with patched props
  return originalTextRender.call(this, patchedProps, ref);
};

export {};

