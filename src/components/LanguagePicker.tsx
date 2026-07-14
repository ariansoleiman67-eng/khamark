import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Dimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useTheme } from './ThemeProvider';

import Animated, { 
  FadeIn, 
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';

const { width: screenWidth } = Dimensions.get('window');

interface Language {
  code: string;
  name: string;
  nativeName: string;
  rtl?: boolean;
}

interface LanguagePickerProps {
  visible: boolean;
  onClose: () => void;
  onSelectLanguage: (languageCode: string) => void;
  currentLanguage: string;
}

const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', rtl: true },
  { code: 'ku', name: 'Kurdish', nativeName: 'کوردی', rtl: true },
];

const LanguagePicker: React.FC<LanguagePickerProps> = ({
  visible,
  onClose,
  onSelectLanguage,
  currentLanguage,
}) => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const handleLanguageSelect = (languageCode: string) => {
    onSelectLanguage(languageCode);
    onClose();
  };

  const renderLanguageOption = (language: Language, index: number) => {
    const isSelected = currentLanguage === language.code;
    const isLast = index === LANGUAGES.length - 1;

    return (
      <Animated.View
        key={language.code}
        entering={SlideInDown.delay(index * 100).duration(400)}
      >
        <TouchableOpacity
          style={[
            styles.languageOption,
            {
              backgroundColor: isSelected 
                ? theme.colors.primary + '10' 
                : 'transparent',
              borderBottomWidth: isLast ? 0 : 1,
              borderBottomColor: theme.colors.border,
            }
          ]}
          onPress={() => handleLanguageSelect(language.code)}
          activeOpacity={0.7}
        >
          <View style={styles.languageInfo}>
            <Text
              style={[
                styles.nativeName,
                {
                  color: isSelected ? theme.colors.primary : theme.colors.text,
                  fontWeight: isSelected ? '600' : '400',
                  // GOLDEN LOCK: NO writingDirection - use textAlign only
                  textAlign: language.rtl ? 'right' : 'left',
                }
              ]}
              // Force UTF-8 encoding for Kurdish text on Android
              allowFontScaling={false}
            >
              {language.nativeName}
            </Text>
            <Text allowFontScaling={false}
              style={[
                styles.englishName,
                {
                  color: isSelected 
                    ? theme.colors.primary + 'CC' 
                    : theme.colors.textSecondary,
                }
              ]}
            >
              {language.name}
            </Text>
          </View>

          {isSelected && (
            <Ionicons
              name="checkmark-circle"
              size={24}
              color={theme.colors.primary}
            />
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View
        style={styles.overlay}
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
      >
        {Platform.OS === 'ios' ? (
          <BlurView intensity={20} style={StyleSheet.absoluteFillObject} />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, styles.androidOverlay]} />
        )}

        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          activeOpacity={1}
        />

        <Animated.View
          style={[
            styles.modal,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            }
          ]}
          entering={SlideInDown.springify()}
          exiting={SlideOutDown.springify()}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
            <Text allowFontScaling={false} style={[styles.title, { color: theme.colors.text }]}>
              {t('profile.language.select')}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
            >
              <Ionicons
                name="close"
                size={24}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {/* Language Options */}
          <View style={styles.content}>
            {LANGUAGES.map((language, index) => 
              renderLanguageOption(language, index)
            )}
          </View>

          {/* Footer */}
          <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
            <Text allowFontScaling={false} style={[styles.footerText, { color: theme.colors.textSecondary }]}>
              {t('profile.language.changeMessage')}
            </Text>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  androidOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    maxHeight: 300,
  },
  englishName: {
    fontSize: 14,
  },
  footer: {
    borderTopWidth: 1,
    padding: 16,
  },
  footerText: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  languageInfo: {
    flex: 1,
    marginRight: 12,
  },
  languageOption: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 60,
    padding: 16,
  },
  modal: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
    maxWidth: 400,
    overflow: 'hidden',
    width: screenWidth * 0.9,
  },
  nativeName: {
    fontSize: 16,
    marginBottom: 2,
    // Ensure proper rendering of Kurdish/Arabic text on Android
    includeFontPadding: Platform.OS === 'android' ? false : undefined,
  },
  overlay: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
});

export default LanguagePicker;