import { Platform, Dimensions } from 'react-native';
import { PixelRatio } from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Get platform-specific font scaling factor
export const getFontScaleFactor = (): number => {
  if (Platform.OS === 'android') {
    // Android tends to have different font scaling behavior
    const pixelRatio = PixelRatio.get();
    const fontScale = PixelRatio.getFontScale();
    
    // Adjust font scaling for Android devices
    if (fontScale > 1.2) {
      return 0.9; // Reduce font scale for large text settings
    } else if (pixelRatio > 3) {
      return 0.95; // Slightly reduce for high-density screens
    } else {
      return 1; // Normal scaling
    }
  }
  
  return 1; // iOS uses default scaling
};

// Platform-specific font size adjustment
export const adjustFontSize = (fontSize: number): number => {
  const scaleFactor = getFontScaleFactor();
  return Math.round(fontSize * scaleFactor);
};

// Check if device is a tablet
export const isTablet = (): boolean => {
  const pixelDensity = PixelRatio.get();
  const adjustedWidth = screenWidth * pixelDensity;
  const adjustedHeight = screenHeight * pixelDensity;
  
  if (pixelDensity < 2 && (adjustedWidth >= 1000 || adjustedHeight >= 1000)) {
    return true;
  } else if (pixelDensity === 2 && (adjustedWidth >= 1920 || adjustedHeight >= 1920)) {
    return true;
  } else {
    return false;
  }
};

// Get platform-specific spacing
export const getPlatformSpacing = (baseSpacing: number): number => {
  if (Platform.OS === 'android') {
    return Math.max(baseSpacing * 0.9, 4); // Slightly reduce spacing on Android
  }
  return baseSpacing;
};

// Get platform-specific text props
export const getPlatformTextProps = () => {
  if (Platform.OS === 'android') {
    return {
      allowFontScaling: false, // Disable font scaling to prevent text cutoff
      adjustsFontSizeToFit: false,
      minimumFontScale: 0.8,
      includeFontPadding: false, // Better text alignment on Android
    };
  }
  return {};
};

// Android-specific props for Kurdish/RTL text
export const getKurdishTextProps = () => {
  if (Platform.OS === 'android') {
    return {
      ...getPlatformTextProps(),
      textBreakStrategy: 'balanced' as const,
      android_hyphenationFrequency: 'none' as const,
    };
  }
  return getPlatformTextProps();
};

// Get optimized layout dimensions for product cards
export const getOptimizedCardDimensions = () => {
  const cardMargin = Platform.OS === 'android' ? 6 : 8;
  const cardsPerRow = screenWidth < 400 ? 2 : 2; // Keep 2 cards per row for consistency
  const availableWidth = screenWidth - (cardMargin * (cardsPerRow + 1));
  const cardWidth = availableWidth / cardsPerRow;
  
  return {
    cardWidth: Math.floor(cardWidth),
    cardHeight: Math.floor(cardWidth * (Platform.OS === 'android' ? 1.3 : 1.4)),
    cardMargin,
    imageHeight: Math.floor(cardWidth * 0.6), // Adjust image height ratio
  };
};

// Platform-specific language handling for Kurdish
export const shouldShowKurdish = (): boolean => {
  // Always show Kurdish option regardless of platform
  return true;
};

// Android-specific text measurement utility
export const getTextWidth = (text: string, fontSize: number): number => {
  // Rough estimation for text width (more accurate measurement would require native module)
  return text.length * (fontSize * 0.6);
};

export const Platform_Utils = {
  getFontScaleFactor,
  adjustFontSize,
  isTablet,
  getPlatformSpacing,
  getPlatformTextProps,
  getOptimizedCardDimensions,
  shouldShowKurdish,
  getTextWidth,
};