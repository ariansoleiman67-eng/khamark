import React, { useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, I18nManager, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from './ThemeProvider';
import AppText from './AppText';

/**
 * The search pill + AI-assistant button that belongs at the top of every browse
 * screen.
 *
 * It exists because both were effectively missing from the app: Search was
 * reachable from exactly one screen (the Categories tab) and the AI assistant
 * was reachable from NOWHERE — its screen was registered in the navigator and
 * nothing ever navigated to it.
 *
 * There is deliberately no camera/visual-search button here. SearchScreen can
 * render visual-search results, but nothing in the app produces the analysis it
 * needs and askChatbot takes no images, so a camera button would open a feature
 * that cannot work.
 */
interface SearchAiBarProps {
  /** Extra spacing/positioning from the host screen's header. */
  style?: StyleProp<ViewStyle>;
  /** Pre-fills the Search screen (e.g. the category the user is already in). */
  preSelectedCategory?: string;
}

const SearchAiBar: React.FC<SearchAiBarProps> = ({ style, preSelectedCategory }) => {
  const { theme, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';

  const openSearch = useCallback(() => {
    navigation.navigate('Search', preSelectedCategory ? { preSelectedCategory } : undefined);
  }, [navigation, preSelectedCategory]);

  const openAssistant = useCallback(() => {
    navigation.navigate('Chatbot');
  }, [navigation]);

  return (
    <View style={[styles.row, { flexDirection: isRTL ? 'row-reverse' : 'row' }, style]}>
      <TouchableOpacity
        onPress={openSearch}
        activeOpacity={0.85}
        accessibilityRole="search"
        accessibilityLabel={t('search.placeholder')}
        style={[
          styles.pill,
          {
            backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
            borderColor: isDark ? '#2C2C30' : '#E7E7EA',
            borderWidth: 1,
            flexDirection: isRTL ? 'row-reverse' : 'row',
          },
        ]}
      >
        <Ionicons name="search" size={20} color={theme.colors.textSecondary} />
        <AppText
          numberOfLines={1}
          adjustsFontSizeToFit={false}
          style={[
            styles.pillText,
            { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' },
          ]}
        >
          {t('search.placeholder')}
        </AppText>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={openAssistant}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={t('chatbot.title', { defaultValue: 'AI Assistant' })}
        style={[styles.aiButton, { backgroundColor: theme.colors.primary }]}
      >
        <Ionicons name="sparkles" size={19} color={theme.colors.textOnPrimary} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    gap: 10,
  },
  pill: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 16,
    minHeight: 48,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  pillText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    marginHorizontal: 10,
  },
  aiButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#A61920',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
});

export default React.memo(SearchAiBar);
