import { Platform } from 'react-native';

/**
 * SPREAD THIS ONTO ANY SCROLLER THAT CONTAINS TAPPABLE CARDS.
 *
 *   <FlatList {...iosTapFix} ... />
 *
 * On iOS a UIScrollView holds every touch for ~150ms before handing it to the
 * child underneath, and cancels it outright if the finger drifts a pixel — it is
 * deciding whether you meant to scroll. That is `delaysContentTouches`, and it
 * defaults to TRUE. On a grid of product cards it reads as "the tap did nothing":
 * you press a phone, nothing opens, you press again. Android has no such
 * behaviour, which is why this only appears on a real iPhone.
 *
 * WHY NOT A GLOBAL defaultProps PATCH, like patchPressable.ts does for Android:
 * it does not work. React Native's default ScrollView export is `ScrollViewWrapper`
 * (ScrollView.js:1921), a FUNCTION component wrapping the real class — and React 19
 * ignores `defaultProps` on function components entirely. Setting it silently does
 * nothing, which cost one build to discover.
 *
 * `as any` because RN's own types do not list `delaysContentTouches` on
 * FlatList/FlashList props even though it reaches the underlying ScrollView at
 * runtime.
 */
export const iosTapFix = (
  Platform.OS === 'ios'
    ? {
        // Stops the ~150ms hold before the child sees the touch.
        delaysContentTouches: false,
      }
    : {}
) as any;
