import { Theme } from '../types';

// Volvo-inspired color palette
const COLORS = {
  // Primary Colors (Volvo Navy Blue)
  primary: '#1a365d',
  primaryDark: '#153e75',
  primaryLight: '#2b77ad',
  
  // Secondary Colors (Volvo Silver)
  secondary: '#718096',
  secondaryDark: '#4a5568',
  secondaryLight: '#a0aec0',
  
  // Accent Colors
  accent: '#3182ce',
  accentLight: '#63b3ed',
  
  // Status Colors
  success: '#38a169',
  warning: '#d69e2e',
  error: '#e53e3e',
  info: '#3182ce',
  
  // Neutral Colors
  white: '#ffffff',
  black: '#000000',
  gray: {
    50: '#f7fafc',
    100: '#edf2f7',
    200: '#e2e8f0',
    300: '#cbd5e0',
    400: '#a0aec0',
    500: '#718096',
    600: '#4a5568',
    700: '#2d3748',
    800: '#1a202c',
    900: '#171923',
  },
};

// Light Theme
export const lightTheme: Theme = {
  dark: false,
  colors: {
    primary: COLORS.primary,
    primaryDark: COLORS.primaryDark,
    primaryVariant: COLORS.primaryLight,
    secondary: COLORS.secondary,
    accent: COLORS.accent,
    background: COLORS.white,
    surface: COLORS.gray[50],
    error: COLORS.error,
    warning: COLORS.warning,
    success: COLORS.success,
    text: COLORS.gray[900],
    textSecondary: COLORS.gray[600],
    border: COLORS.gray[200],
    placeholder: COLORS.gray[400],
    disabled: COLORS.gray[300],
    shadow: 'rgba(0, 0, 0, 0.1)',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 16,
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

// Dark Theme
export const darkTheme: Theme = {
  dark: true,
  colors: {
    primary: COLORS.primaryLight,
    primaryDark: COLORS.primary,
    primaryVariant: COLORS.primary,
    secondary: COLORS.secondaryLight,
    accent: COLORS.accentLight,
    background: COLORS.gray[900],
    surface: COLORS.gray[800],
    error: COLORS.error,
    warning: COLORS.warning,
    success: COLORS.success,
    text: COLORS.white,
    textSecondary: COLORS.gray[300],
    border: COLORS.gray[700],
    placeholder: COLORS.gray[500],
    disabled: COLORS.gray[600],
    shadow: 'rgba(0, 0, 0, 0.3)',
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

export const SHADOW_STYLES = {
  small: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
};

export const BORDER_STYLES = {
  thin: 1,
  medium: 2,
  thick: 3,
};

// Responsive breakpoints
export const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
} as const;

// Spacing constants (for direct use)
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
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
  sm: 4,
  md: 8,
  lg: 16,
  full: 9999,
} as const;

// Layout constants
export const LAYOUT = {
  HEADER_HEIGHT: 56,
  TAB_BAR_HEIGHT: 60,
  CARD_PADDING: 16,
  SCREEN_PADDING: 20,
  PRODUCT_CARD_ASPECT_RATIO: 1.2,
} as const;
