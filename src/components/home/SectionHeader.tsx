import React from 'react';
import { View, Pressable, StyleSheet, I18nManager } from 'react-native';
import AppText from '../AppText';
import { useTheme } from '../ThemeProvider';
import { useTranslation } from 'react-i18next';

interface SectionHeaderProps {
  title: string;
  onSeeAll?: () => void;
  seeAllLabel?: string;
}

// aynAlfahad-style section header: bold dark title (left) + orange "See all" (right).
const SectionHeader: React.FC<SectionHeaderProps> = ({ title, onSeeAll, seeAllLabel }) => {
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';

  return (
    <View style={[styles.row, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      <AppText
        fontSize={20}
        style={[styles.title, { color: theme.colors.text }]}
        numberOfLines={1}
      >
        {title}
      </AppText>
      {onSeeAll && (
        <Pressable onPress={onSeeAll} hitSlop={8}>
          <AppText fontSize={14} style={[styles.seeAll, { color: theme.colors.primary }]}>
            {seeAllLabel ?? t('common.seeAll')}
          </AppText>
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 20,
    marginBottom: 12,
  },
  title: { fontWeight: '800', flexShrink: 1 },
  seeAll: { fontWeight: '700' },
});

export default SectionHeader;
