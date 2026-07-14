export interface CustomTheme {
  id: string;
  name: string;
  isCustom: boolean;
  isDark: boolean;
  colors: {
    // Core Colors
    primary: string;
    primaryDark: string;
    primaryLight: string;
    secondary: string;
    accent: string;
    
    // Background Colors
    background: string;
    surface: string;
    card: string;
    overlay: string;
    
    // Text Colors
    text: string;
    textSecondary: string;
    textDisabled: string;
    textOnPrimary: string;
    textOnSecondary: string;
    
    // Status Colors
    success: string;
    warning: string;
    error: string;
    info: string;
    
    // UI Element Colors
    border: string;
    borderLight: string;
    placeholder: string;
    disabled: string;
    shadow: string;
    
    // Interactive Colors
    ripple: string;
    highlight: string;
    focus: string;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  borderRadius: {
    sm: number;
    md: number;
    lg: number;
    full: number;
  };
  typography: {
    h1: { fontSize: number; fontWeight: string; lineHeight: number; };
    h2: { fontSize: number; fontWeight: string; lineHeight: number; };
    h3: { fontSize: number; fontWeight: string; lineHeight: number; };
    body: { fontSize: number; fontWeight: string; lineHeight: number; };
    caption: { fontSize: number; fontWeight: string; lineHeight: number; };
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  preview: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
  };
  theme: CustomTheme;
}

export interface ColorPickerConfig {
  title: string;
  description?: string;
  defaultColor: string;
  presets?: string[];
  showAlpha?: boolean;
}

export type ThemeMode = 'light' | 'dark' | 'system' | 'custom';

export interface ThemeCustomization {
  mode: ThemeMode;
  customTheme?: CustomTheme;
  selectedPresetId?: string;
}