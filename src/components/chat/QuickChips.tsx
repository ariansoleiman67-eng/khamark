import React from 'react';
import { ScrollView, Pressable, Text } from 'react-native';
import { SPACING } from '../../constants/theme';

interface Props {
  items: Array<{ key: string; label: string }>;
  isRTL: boolean;
  theme: any;
  onPress: (key: string) => void;
}

/**
 * Pinned above the input rather than living in ListHeaderComponent, where they
 * scrolled away after the first message and never came back — which is exactly
 * when a shopper who does not know what to ask needs a next step.
 */
const QuickChips: React.FC<Props> = ({ items, isRTL, theme, onPress }) => {
  if (!items.length) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      contentContainerStyle={{
        paddingHorizontal: SPACING.md,
        paddingBottom: SPACING.sm,
        gap: SPACING.sm,
        flexDirection: isRTL ? 'row-reverse' : 'row',
      }}
    >
      {items.map(item => (
        <Pressable
          key={item.key}
          onPress={() => onPress(item.key)}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          style={({ pressed }) => ({
            paddingHorizontal: SPACING.md,
            paddingVertical: 8,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: pressed ? theme.colors.primary : theme.colors.border,
            backgroundColor: pressed ? theme.colors.primary + '14' : theme.colors.background,
          })}
        >
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            style={{ fontSize: 13, color: theme.colors.text, includeFontPadding: false }}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
};

export default React.memo(QuickChips);
