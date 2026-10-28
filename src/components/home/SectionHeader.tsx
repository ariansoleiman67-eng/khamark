import React from 'react';
import { View, Pressable, StyleSheet, I18nManager, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../AppText';
import { useTheme } from '../ThemeProvider';
import { useTranslation } from 'react-i18next';

interface SectionHeaderProps {
  title: string;
  onSeeAll?: () => void;
  seeAllLabel?: string;
  style?: StyleProp<ViewStyle>;
}

// Khamark Section Header: bold clean title (left) + refined "See all" with directional chevron (right).
const SectionHeader: React.FC<SectionHeaderProps> = ({ title, onSeeAll, seeAllLabel, style }) => {
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';

  return (
    <View style={[styles.row, { flexDirection: isRTL ? 'row-reverse' : 'row' }, style]}>
      <AppText
        fontSize={18}
        style={[styles.title, { color: theme.colors.text }]}
        numberOfLines={1}
      >
        {title}
      </AppText>
      {onSeeAll && (
        <Pressable onPress={onSeeAll} hitSlop={8} style={[styles.seeAllRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <AppText fontSize={13} style={[styles.seeAll, { color: theme.colors.primary }]}>
            {seeAllLabel ?? t('common.seeAll')}
          </AppText>
          <Ionicons
            name={isRTL ? 'chevron-back' : 'chevron-forward'}
            size={14}
            color={theme.colors.primary}
            style={{ marginStart: 2 }}
          />
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
  title: {
    fontWeight: '700',
    flexShrink: 1,
    letterSpacing: -0.2,
  },
  seeAllRow: {
    alignItems: 'center',
  },
  seeAll: {
    fontWeight: '600',
    letterSpacing: 0.1,
  },
});

export default SectionHeader;
