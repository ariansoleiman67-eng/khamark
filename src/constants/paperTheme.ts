/**
 * Paper Theme Bridge
 * Converts our custom theme into React Native Paper's MD3 theme format.
 * This keeps a single source of truth for colors — change a preset,
 * and Paper components auto-update.
 */
import {
  MD3LightTheme,
  MD3DarkTheme,
  MD3Theme,
} from 'react-native-paper';
import { Theme } from '../types';

/**
 * Build a React Native Paper MD3 theme from our app Theme.
 */
export function buildPaperTheme(appTheme: Theme): MD3Theme {
  const base = appTheme.dark ? MD3DarkTheme : MD3LightTheme;

  return {
    ...base,
    dark: appTheme.dark,
    roundness: appTheme.borderRadius.md,

    colors: {
      ...base.colors,

      // Primary
      primary: appTheme.colors.primary,
      onPrimary: '#ffffff',
      primaryContainer: appTheme.colors.primaryVariant ?? appTheme.colors.primary,
      onPrimaryContainer: appTheme.dark ? '#ffffff' : appTheme.colors.text,

      // Secondary
      secondary: appTheme.colors.secondary,
      onSecondary: '#ffffff',
      secondaryContainer: appTheme.colors.secondary + '22',
      onSecondaryContainer: appTheme.dark ? '#ffffff' : appTheme.colors.text,

      // Tertiary (map to accent)
      tertiary: appTheme.colors.accent ?? appTheme.colors.primary,
      onTertiary: '#ffffff',
      tertiaryContainer: (appTheme.colors.accent ?? appTheme.colors.primary) + '22',
      onTertiaryContainer: appTheme.dark ? '#ffffff' : appTheme.colors.text,

      // Error
      error: appTheme.colors.error,
      onError: '#ffffff',
      errorContainer: appTheme.colors.error + '22',
      onErrorContainer: appTheme.colors.error,

      // Background & Surface
      background: appTheme.colors.background,
      onBackground: appTheme.colors.text,
      surface: appTheme.colors.surface,
      onSurface: appTheme.colors.text,
      surfaceVariant: appTheme.colors.surface,
      onSurfaceVariant: appTheme.colors.textSecondary,
      surfaceDisabled: appTheme.colors.disabled,
      onSurfaceDisabled: appTheme.colors.placeholder,

      // Outline & borders
      outline: appTheme.colors.border,
      outlineVariant: appTheme.colors.border,

      // Elevation overlays
      elevation: {
        level0: 'transparent',
        level1: appTheme.colors.surface,
        level2: appTheme.colors.surface,
        level3: appTheme.colors.surface,
        level4: appTheme.colors.surface,
        level5: appTheme.colors.surface,
      },

      // Inverse
      inverseSurface: appTheme.dark ? '#ffffff' : '#1a1a1a',
      inverseOnSurface: appTheme.dark ? '#1a1a1a' : '#ffffff',
      inversePrimary: appTheme.colors.primary,

      // Misc
      shadow: appTheme.colors.shadow,
      scrim: 'rgba(0,0,0,0.5)',
      backdrop: 'rgba(0,0,0,0.4)',
    },
  };
}
