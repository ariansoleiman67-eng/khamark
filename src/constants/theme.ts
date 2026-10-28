import { Theme } from '../types';

// Khamark Brand Palette — Luxury Red & White Visual Identity
export const COLORS = {
  // Primary Luxury Red
  primary: '#A61920',
  primaryDark: '#831319',
  primaryLight: '#C92A32',
  softRed: '#FBEFF0',

  // Secondary Neutrals
  secondary: '#666870',
  secondaryDark: '#45474E',
  secondaryLight: '#8C8E96',

  // Accent Colors
  accent: '#A61920',
  accentLight: '#FBEFF0',

  // Status Colors (meaningful, distinct from brand red)
  success: '#2E7D32',
  warning: '#ED6C02',
  error: '#D32F2F',
  info: '#0288D1',

  // Neutral Surfaces
  white: '#FFFFFF',
  black: '#191919',
  surface: '#F7F7F8',
  border: '#E7E7EA',
  borderLight: '#F0F0F3',
  gray: {
    50: '#F7F7F8',
    100: '#EFEFF1',
    200: '#E7E7EA',
    300: '#D5D5DC',
    400: '#A1A1A8',
    500: '#666870',
    600: '#45474E',
    700: '#2E2E33',
    800: '#1F1F23',
    900: '#191919',
  },
};

// Light Theme — Khamark Luxury White & Red
export const lightTheme: Theme = {
  dark: false,
  colors: {
    primary: COLORS.primary,
    primaryDark: COLORS.primaryDark,
    primaryVariant: COLORS.primaryLight,
    secondary: COLORS.secondary,
    accent: COLORS.accent,
    background: COLORS.white,
    surface: COLORS.surface,
    card: COLORS.white,
    error: COLORS.error,
    warning: COLORS.warning,
    success: COLORS.success,
    text: COLORS.black,
    textSecondary: COLORS.secondary,
    textOnPrimary: COLORS.white,
    border: COLORS.border,
    placeholder: COLORS.gray[400],
    disabled: COLORS.gray[200],
    shadow: 'rgba(0, 0, 0, 0.04)',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  borderRadius: {
    sm: 6,
    md: 10,
    lg: 14,
    full: 9999,
  },
  typography: {
    h1: {
      fontSize: 32,
      fontWeight: '700' as any,
      lineHeight: 40,
    },
    h2: {
      fontSize: 24,
      fontWeight: '700' as any,
      lineHeight: 32,
    },
    h3: {
      fontSize: 20,
      fontWeight: '600' as any,
      lineHeight: 28,
    },
    body: {
      fontSize: 16,
      fontWeight: '400' as any,
      lineHeight: 24,
    },
    caption: {
      fontSize: 14,
      fontWeight: '400' as any,
      lineHeight: 20,
    },
  },
};

// Dark Theme — Khamark Luxury Deep Dark & Crimson
export const darkTheme: Theme = {
  dark: true,
  colors: {
    primary: '#D32F2F',
    primaryDark: COLORS.primaryDark,
    primaryVariant: '#E53935',
    secondary: '#A1A1A6',
    accent: '#D32F2F',
    background: '#121214',
    surface: '#1E1E22',
    card: '#242428',
    error: COLORS.error,
    warning: COLORS.warning,
    success: '#4CAF50',
    text: '#F5F5F7',
    textSecondary: '#A1A1A6',
    textOnPrimary: COLORS.white,
    border: '#2C2C30',
    placeholder: '#666870',
    disabled: '#333338',
    shadow: 'rgba(0, 0, 0, 0.4)',
  },
  spacing: lightTheme.spacing,
  borderRadius: lightTheme.borderRadius,
  typography: lightTheme.typography,
};

// Theme-related constants
export const THEME_KEYS = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
} as const;

export const ANIMATION_DURATION = {
  FAST: 200,
  NORMAL: 300,
  SLOW: 500,
} as const;

// Restrained luxury shadows: soft, natural diffusion rather than harsh black borders
export const SHADOW_STYLES = {
  subtle: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  small: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 5,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
};

export const BORDER_STYLES = {
  hairline: 0.5,
  thin: 1,
  medium: 1.5,
  thick: 2,
};

// Responsive breakpoints
export const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
} as const;

// Spacing scale: 4, 8, 12, 16, 20, 24, 32
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const FONT_SIZE = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const BORDER_RADIUS = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

// Layout constants
export const LAYOUT = {
  HEADER_HEIGHT: 56,
  TAB_BAR_HEIGHT: 60,
  CARD_PADDING: 16,
  SCREEN_PADDING: 16,
  PRODUCT_CARD_ASPECT_RATIO: 1.2,
} as const;
