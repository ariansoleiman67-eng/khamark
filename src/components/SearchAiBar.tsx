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
            backgroundColor: isDark ? theme.colors.surface : '#F0F0F2',
            flexDirection: isRTL ? 'row-reverse' : 'row',
          },
        ]}
      >
        <Ionicons name="search" size={20} color={theme.colors.textSecondary} />
        <AppText
          numberOfLines={1}
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
        <Ionicons name="sparkles" size={20} color={theme.colors.textOnPrimary} />
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
    borderRadius: 16,
    paddingHorizontal: 16,
    // minHeight rather than a fixed height: Arabic and Kurdish glyphs are taller
    // than Latin ones and clip inside a fixed box on Samsung devices.
    minHeight: 50,
    paddingVertical: 12,
  },
  pillText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    marginHorizontal: 10,
  },
  aiButton: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default React.memo(SearchAiBar);
