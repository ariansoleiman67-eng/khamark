import React from 'react';
import { View, StyleSheet, TouchableOpacity, ViewStyle, TextStyle, I18nManager } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import AppText from './AppText';
import { useTheme } from './ThemeProvider';

interface HeaderProps {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  style?: ViewStyle;
  titleStyle?: TextStyle;
  transparent?: boolean;
}

const Header: React.FC<HeaderProps> = ({ 
  title, 
  showBack = false, 
  onBack, 
  rightAction,
  style,
  titleStyle,
  transparent = false
}) => {
  const { theme } = useTheme();
  const navigation = useNavigation();
  const { t, i18n } = useTranslation();
  // Global auto-RTL is disabled in App.tsx, so I18nManager.isRTL alone is always
  // false — the language check is what actually flips the arrow.
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigation.goBack();
    }
  };

  return (
    <View style={[
      styles.container, 
      { 
        backgroundColor: transparent ? 'transparent' : theme.colors.background,
        borderBottomColor: transparent ? 'transparent' : theme.colors.border 
      },
      !transparent && styles.border,
      style
    ]}>
      <View style={styles.leftContainer}>
        {showBack && (
          <TouchableOpacity
            onPress={handleBack}
            style={styles.backButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={t('common.back', { defaultValue: 'Back' })}
          >
            <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color={theme.colors.text} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.centerContainer}>
        {title && (
          <AppText style={[styles.title, { color: theme.colors.text }, titleStyle]} numberOfLines={1}>
            {title}
          </AppText>
        )}
      </View>

      <View style={styles.rightContainer}>
        {rightAction}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  backButton: {
    padding: 4,
  },
  border: {
    borderBottomWidth: 1,
  },
  centerContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 56,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  leftContainer: {
    alignItems: 'flex-start',
    width: 60,
  },
  rightContainer: {
    alignItems: 'flex-end',
    width: 60,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  }
});

export default Header;
