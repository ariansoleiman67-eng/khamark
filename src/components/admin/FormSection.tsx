import React from 'react';
import { View, StyleSheet, TouchableOpacity, I18nManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AppText from '../AppText';

/**
 * One card of the product form, with a header that collapses it.
 *
 * The editor is ten cards and well over two thousand points tall. The jump bar
 * gets you to a section; this gets the other nine out of the way once you are
 * there. Everything starts OPEN, so a shop that never taps a header sees exactly
 * the form it saw before — collapsing is something the admin chooses, never
 * something that hides a field from them by default.
 *
 * The header is the whole row, not just the chevron: a 16pt icon is a poor tap
 * target on a phone, which is the device this back office is actually used on.
 */
interface FormSectionProps {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  /** Rendered next to the title when collapsed — e.g. "3 sizes", "IQD 240,250". */
  summary?: string;
  isDark: boolean;
  theme: any;
  onLayout?: (e: any) => void;
  children: React.ReactNode;
}

const FormSection: React.FC<FormSectionProps> = ({
  title,
  collapsed,
  onToggle,
  summary,
  isDark,
  theme,
  onLayout,
  children,
}) => {
  const { i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.card,
        {
          backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
          shadowOpacity: isDark ? 0 : 0.06,
        },
      ]}
    >
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
      >
        <AppText
          fontSize={13}
          numberOfLines={1}
          style={[styles.title, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}
        >
          {title}
        </AppText>
        {collapsed && !!summary && (
          <AppText
            fontSize={12}
            numberOfLines={1}
            style={[styles.summary, { color: theme.colors.textSecondary }]}
          >
            {summary}
          </AppText>
        )}
        <Ionicons
          name={collapsed ? 'chevron-down' : 'chevron-up'}
          size={18}
          color={theme.colors.textSecondary}
        />
      </TouchableOpacity>

      {!collapsed && <View>{children}</View>}
    </View>
  );
};

const styles = StyleSheet.create({
  // Matches styles.formSectionCard in AdminProductsScreen exactly, so swapping a
  // card over to this component does not move anything on screen.
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 8,
    elevation: 2,
  },
  header: {
    alignItems: 'center',
    // minHeight, not height: Arabic and Kurdish glyphs are taller than Latin and
    // clip inside a fixed box on Samsung devices.
    minHeight: 32,
    gap: 8,
  },
  // Mirrors styles.sectionTitle: uppercase, tracked, semibold.
  title: { flex: 1, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  summary: { flexShrink: 1 },
});

export default FormSection;
