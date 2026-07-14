/**
 * GLOBAL TEXTINPUT PATCH - Android Text Bounce Fix
 * 
 * Prevents text from bouncing/scrolling inside TextInput on Android.
 * Uses the same static .render patching approach as patchView.ts.
 * 
 * Root cause: Android adds extra font padding (includeFontPadding)
 * and doesn't vertically center text by default, creating space
 * for the text to scroll/shift within the input.
 * 
 * This patch must be imported ONCE at app entry point (App.tsx)
 * BEFORE any components render.
 */

import { Platform, TextInput, StyleSheet } from 'react-native';

if (Platform.OS === 'android') {
  // The fix styles that prevent text bounce
  const androidInputFixStyle = {
    includeFontPadding: false,
    textAlignVertical: 'center' as const,
    paddingVertical: 0,
  };

  // Try static .render first (same pattern as patchView.ts)
  if (typeof (TextInput as any).render === 'function') {
    const originalRender = (TextInput as any).render;

    (TextInput as any).render = function (props: any, ref: any) {
      // Merge our fix styles BEFORE the component's own styles
      // so component styles can still override if needed
      const patchedStyle = StyleSheet.flatten([androidInputFixStyle, props.style]);
      
      const patchedProps = {
        ...props,
        style: patchedStyle,
        scrollEnabled: props.scrollEnabled ?? false,
        // TextInput.defaultProps is ignored under the New Architecture (Fabric),
        // so the global allowFontScaling=false never applied on some Androids and
        // the placeholder scaled up with the device font-size setting. Enforce it
        // here in the render patch, which Fabric does honor. Components can opt in.
        allowFontScaling: props.allowFontScaling ?? false,
      };

      return originalRender.call(this, patchedProps, ref);
    };
  } else {
    // Fallback: try prototype.render
    const protoRender = (TextInput.prototype as any).render;
    if (typeof protoRender === 'function') {
      (TextInput.prototype as any).render = function (...args: any[]) {
        // Inject fix into this.props before rendering
        if (this.props) {
          const originalStyle = this.props.style;
          this.props = {
            ...this.props,
            style: StyleSheet.flatten([androidInputFixStyle, originalStyle]),
            scrollEnabled: this.props.scrollEnabled ?? false,
            allowFontScaling: this.props.allowFontScaling ?? false,
          };
        }
        return protoRender.apply(this, args);
      };
    } else {
      // Silently skip patch on newer React Native versions where render is not exposed
    }
  }
}

export {};
