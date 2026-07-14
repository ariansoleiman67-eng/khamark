/* eslint-disable */
// @ts-nocheck
import { Platform, Text, TextInput } from 'react-native';

export function applyAndroidGlobalFix() {
  if (Platform.OS !== 'android') return;

  // -------- Text (fix Arabic clipping with Samsung bold) ----------
  // @ts-ignore
  Text.defaultProps = Text.defaultProps ?? {};
  // @ts-ignore
  Text.defaultProps.allowFontScaling = false;

  // @ts-ignore
  const prevTextStyle = Text.defaultProps.style;
  // @ts-ignore
  Text.defaultProps.style = [
    {
      // CRITICAL FIX: textBreakStrategy 'simple' prevents horizontal cutoff
      // when system Bold Text accessibility is enabled on Android
      textBreakStrategy: 'simple',
      // Extra top/bottom room so bold Arabic doesn't clip vertically
      includeFontPadding: true,
      // Vertically center text to prevent clipping
      textAlignVertical: 'center',
    },
    ...(Array.isArray(prevTextStyle) ? prevTextStyle : prevTextStyle ? [prevTextStyle] : []),
  ];

  // -------- TextInput (prevent input text bounce/scroll on Android) ----------
  // @ts-ignore
  TextInput.defaultProps = TextInput.defaultProps ?? {};
  // @ts-ignore
  TextInput.defaultProps.allowFontScaling = false;
  // @ts-ignore
  TextInput.defaultProps.scrollEnabled = false;

  // Monkey-patch render to ALWAYS inject fix styles (defaultProps.style gets
  // overridden when a component supplies its own style prop).
  const androidInputFixStyle = {
    includeFontPadding: false,
    textAlignVertical: 'center' as const,
    paddingVertical: 0,
  };

  // @ts-ignore – patching prototype render
  const originalRender = TextInput.prototype.render;
  if (originalRender) {
    // @ts-ignore
    TextInput.prototype.render = function (...args: any[]) {
      const result = originalRender.apply(this, args);
      if (result?.props?.style) {
        return {
          ...result,
          props: {
            ...result.props,
            style: [androidInputFixStyle, result.props.style],
          },
        };
      }
      return result;
    };
  } else {
    // Fallback: if render isn't available, use defaultProps style
    // @ts-ignore
    const prevInputStyle = TextInput.defaultProps.style;
    // @ts-ignore
    TextInput.defaultProps.style = [
      androidInputFixStyle,
      ...(Array.isArray(prevInputStyle) ? prevInputStyle : prevInputStyle ? [prevInputStyle] : []),
    ];
  }
}
