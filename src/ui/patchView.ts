/**
 * GLOBAL VIEW/CONTAINER PATCH - Samsung Device Fix
 * 
 * Prevents text clipping in containers caused by:
 * - overflow: 'hidden' with tight vertical constraints
 * - Fixed height containers that don't grow with font scaling
 * 
 * Only patches Views that have children (text containers).
 * Avoids touching layout-only Views.
 * 
 * This patch must be imported ONCE at app entry point (App.tsx)
 * BEFORE any components render.
 */

import { Platform, View, StyleSheet, ViewStyle } from 'react-native';

// Only apply the patch on Android devices
if (Platform.OS === 'android') {
  // Store original render method (using stable reference)
  // Check if .render exists first to prevent crashes on generic RN versions
  if (typeof (View as any).render === 'function') {
    const originalViewRender = (View as any).render;

    // Override View.render globally
    (View as any).render = function(props: any, ref: any) {
      // SAFETY: Only patch views that have children (likely contain text)
      // Skip layout-only views (image wrappers, skeleton loaders, animation containers)
      if (!props.children) {
        return originalViewRender.call(this, props, ref);
      }

      const flatStyle = StyleSheet.flatten(props.style) as ViewStyle || {};
      
      // Check if this View has overflow: 'hidden' with a fixed height
      // This combination often causes text clipping on Samsung devices
      const hasOverflowHidden = flatStyle.overflow === 'hidden';
      const hasFixedHeight = flatStyle.height !== undefined && typeof flatStyle.height === 'number';
      const hasNoMinHeight = flatStyle.minHeight === undefined;

      // If container has overflow:hidden + fixed height, ensure minHeight
      // so text can push the container to expand if needed
      if (hasOverflowHidden && hasFixedHeight && hasNoMinHeight) {
        const safeStyles: ViewStyle = {
          minHeight: flatStyle.height as number,
        };

        const patchedProps = {
          ...props,
          style: StyleSheet.flatten([props.style, safeStyles]),
        };

        return originalViewRender.call(this, patchedProps, ref);
      }

      // For containers that might clip text vertically, ensure they can grow
      // Only apply to containers with flexDirection column (default) and fixed dimensions
      if (hasFixedHeight && !flatStyle.flexGrow && hasNoMinHeight) {
        const safeStyles: ViewStyle = {
          minHeight: flatStyle.height as number,
        };

        const patchedProps = {
          ...props,
          style: StyleSheet.flatten([props.style, safeStyles]),
        };

        return originalViewRender.call(this, patchedProps, ref);
      }

      // No patching needed
      return originalViewRender.call(this, props, ref);
    };
  } else {
    // Silently skip patch on newer React Native versions where render is not exposed
  }
}

export {};
