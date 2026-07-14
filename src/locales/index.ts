import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CACHE_KEYS } from '../constants/config';

// Import translations
import en from './en.json';
import ar from './ar.json';
import ku from './ku.json';

const resources = {
  en: { translation: en },
  ar: { translation: ar },
  ku: { translation: ku },
};

// Get initial language synchronously
const getInitialLanguage = (): string => {
  try {
    // Fallback to device language
    const deviceLocale = Localization.getLocales()[0]?.languageTag || 'en-US';
    const deviceLanguage = deviceLocale.split('-')[0];
    const supportedLanguages = ['en', 'ar', 'ku'];
    
    if (supportedLanguages.includes(deviceLanguage)) {
      return deviceLanguage;
    } else {
      return 'en'; // Default to English
    }
  } catch (error) {
    console.error('Language detection error:', error);
    return 'en';
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getInitialLanguage(),
    fallbackLng: 'en',
    debug: __DEV__,
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

// Load saved language asynchronously after initialization
const loadSavedLanguage = async () => {
  try {
    const savedLanguage = await AsyncStorage.getItem(CACHE_KEYS.LANGUAGE);
    if (savedLanguage && i18n.language !== savedLanguage) {
      await i18n.changeLanguage(savedLanguage);
    }
  } catch (error) {
    console.error('Error loading saved language:', error);
  }
};

// Load saved language after a brief delay to allow app to initialize
setTimeout(loadSavedLanguage, 100);

export default i18n;

// Helper functions
export const getDirection = (language: string): 'ltr' | 'rtl' => {
  return ['ar', 'ku'].includes(language) ? 'rtl' : 'ltr';
};

export const isRTL = (language: string): boolean => {
  return getDirection(language) === 'rtl';
};

export const getSupportedLanguages = () => [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'ku', name: 'Kurdish', nativeName: 'کوردی' },
];

export const getCurrentLanguage = () => i18n.language;

export const changeLanguage = async (languageCode: string) => {
  try {
    await i18n.changeLanguage(languageCode);
    await AsyncStorage.setItem(CACHE_KEYS.LANGUAGE, languageCode);
  } catch (error) {
    console.error('Error changing language:', error);
  }
};

// Helper function to cache language preference
export const cacheUserLanguage = async (lng: string) => {
  try {
    await AsyncStorage.setItem(CACHE_KEYS.LANGUAGE, lng);
  } catch (error) {
    console.error('Error caching language:', error);
  }
};

// Force cache bust to reload updated JSON files: 1
