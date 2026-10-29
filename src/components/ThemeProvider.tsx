import React, { createContext, useContext, useEffect, useState, useMemo, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PaperProvider } from 'react-native-paper';
import { Theme } from '../types';
import { lightTheme, darkTheme, THEME_KEYS } from '../constants/theme';
import { CustomTheme, ThemeMode, ThemeCustomization } from '../types/theme';
import { DEFAULT_THEME, getPresetById } from '../constants/themePresets';
import { CACHE_KEYS } from '../constants/config';
import { buildPaperTheme } from '../constants/paperTheme';

interface ThemeContextType {
  theme: Theme;
  themeMode: ThemeMode;
  isDark: boolean;
  currentCustomTheme: CustomTheme | null;
  setThemeMode: (mode: ThemeMode) => void;
  setCustomTheme: (customTheme: CustomTheme) => void;
  toggleTheme: () => void;
  resetTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('custom');
  const [currentCustomTheme, setCurrentCustomThemeState] = useState<CustomTheme | null>(DEFAULT_THEME.theme);

  // Determine if dark mode should be active based on current active theme
  const isDark = currentCustomTheme ? currentCustomTheme.isDark : (
    themeMode === 'dark' || 
    (themeMode === 'system' && systemColorScheme === 'dark')
  );

  // Convert CustomTheme to Theme format for backward compatibility
  const theme: Theme = useMemo<Theme>(() => ((currentCustomTheme &&
    currentCustomTheme.colors &&
    currentCustomTheme.spacing &&
    currentCustomTheme.borderRadius &&
    currentCustomTheme.typography) ? {
    dark: currentCustomTheme.isDark,
    colors: {
      primary: currentCustomTheme.colors.primary,
      primaryDark: currentCustomTheme.colors.primaryDark,
      primaryVariant: currentCustomTheme.colors.primaryLight,
      secondary: currentCustomTheme.colors.secondary,
      accent: currentCustomTheme.colors.accent,
      background: currentCustomTheme.colors.background,
      surface: currentCustomTheme.colors.surface,
      card: currentCustomTheme.colors.card,
      error: currentCustomTheme.colors.error,
      warning: currentCustomTheme.colors.warning,
      success: currentCustomTheme.colors.success,
      text: currentCustomTheme.colors.text,
      textSecondary: currentCustomTheme.colors.textSecondary,
      textOnPrimary: currentCustomTheme.colors.textOnPrimary,
      border: currentCustomTheme.colors.border,
      placeholder: currentCustomTheme.colors.placeholder,
      disabled: currentCustomTheme.colors.disabled,
      shadow: currentCustomTheme.colors.shadow,
    },
    spacing: currentCustomTheme.spacing,
    borderRadius: currentCustomTheme.borderRadius,
    typography: currentCustomTheme.typography,
  } : (isDark ? darkTheme : lightTheme)), [currentCustomTheme, isDark]);

  // Load saved theme preference on app start
  useEffect(() => {
    loadThemePreference();
  }, []);

  // Update theme when system color scheme changes and mode is system
  useEffect(() => {
    if (themeMode === 'system') {
      const preset = systemColorScheme === 'dark' ? 
        getPresetById('khamark-luxury-dark') : getPresetById('khamark-luxury');
      if (preset) {
        setCurrentCustomThemeState(preset.theme);
      }
    }
  }, [systemColorScheme, themeMode]);

  const loadThemePreference = async () => {
    try {
      const savedCustomization = await AsyncStorage.getItem('THEME_CUSTOMIZATION');
      if (savedCustomization) {
        const customization: ThemeCustomization = JSON.parse(savedCustomization);
        setThemeModeState(customization.mode);
        
        const ct = customization.customTheme;
        if (ct && ct.colors && ct.spacing && ct.borderRadius && ct.typography) {
          setCurrentCustomThemeState(ct);
        } else if (customization.selectedPresetId) {
          const preset = getPresetById(customization.selectedPresetId);
          if (preset) {
            setCurrentCustomThemeState(preset.theme);
          }
        }
      } else {
        // Fallback to legacy theme key or default to Khamark Luxury light
        const savedTheme = await AsyncStorage.getItem(CACHE_KEYS.THEME);
        if (savedTheme && Object.values(THEME_KEYS).includes(savedTheme as any)) {
          setThemeMode(savedTheme as ThemeMode);
        } else {
          setThemeMode('light');
        }
      }
    } catch (error) {
      console.error('Error loading theme preference:', error);
    }
  };

  const saveThemePreference = async (customization: ThemeCustomization) => {
    try {
      await AsyncStorage.setItem('THEME_CUSTOMIZATION', JSON.stringify(customization));
    } catch (error) {
      console.error('Error saving theme preference:', error);
    }
  };

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    
    let selectedPresetId: string | undefined;
    if (mode === 'light') {
      const lightPreset = getPresetById('khamark-luxury');
      if (lightPreset) {
        setCurrentCustomThemeState(lightPreset.theme);
        selectedPresetId = 'khamark-luxury';
      }
    } else if (mode === 'dark') {
      const darkPreset = getPresetById('khamark-luxury-dark');
      if (darkPreset) {
        setCurrentCustomThemeState(darkPreset.theme);
        selectedPresetId = 'khamark-luxury-dark';
      }
    } else if (mode === 'system') {
      const preset = systemColorScheme === 'dark' ? 
        getPresetById('khamark-luxury-dark') : getPresetById('khamark-luxury');
      if (preset) {
        setCurrentCustomThemeState(preset.theme);
        selectedPresetId = preset.theme.isDark ? 'khamark-luxury-dark' : 'khamark-luxury';
      }
    }
    
    // Persist the theme preference
    saveThemePreference({
      mode,
      selectedPresetId,
    });
  };

  const setCustomTheme = (customTheme: CustomTheme) => {
    setCurrentCustomThemeState(customTheme);
    setThemeModeState('custom');
    
    const customization: ThemeCustomization = {
      mode: 'custom',
      customTheme,
      selectedPresetId: customTheme.isCustom ? undefined : customTheme.id,
    };
    
    saveThemePreference(customization);
  };

  const toggleTheme = () => {
    if (themeMode === 'system') {
      setThemeMode('light');
    } else if (themeMode === 'light') {
      setThemeMode('dark');
    } else {
      setThemeMode('system');
    }
  };

  const resetTheme = () => {
    const defaultPreset = DEFAULT_THEME;
    setCurrentCustomThemeState(defaultPreset.theme);
    setThemeModeState('custom');
    
    const customization: ThemeCustomization = {
      mode: 'custom',
      selectedPresetId: defaultPreset.id,
    };
    
    saveThemePreference(customization);
  };

  // Build Paper theme from our app theme (memoized)
  const paperTheme = useMemo(() => buildPaperTheme(theme), [theme]);

  const contextValue: ThemeContextType = {
    theme,
    themeMode,
    isDark,
    currentCustomTheme,
    setThemeMode,
    setCustomTheme,
    toggleTheme,
    resetTheme,
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      <PaperProvider theme={paperTheme}>
        {children}
      </PaperProvider>
    </ThemeContext.Provider>
  );
};

// Custom hook to use theme
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// HOC for components that need theme
export const withTheme = <P extends object>(
  Component: React.ComponentType<P & { theme: Theme }>
) => {
  const WrappedComponent = (props: P) => {
    const { theme } = useTheme();
    return <Component {...props} theme={theme} />;
  };
  
  WrappedComponent.displayName = `withTheme(${Component.displayName || Component.name})`;
  return WrappedComponent;
};

export default ThemeProvider;
