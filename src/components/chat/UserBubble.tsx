import React from 'react';
import { View, Text, Platform } from 'react-native';
import { SPACING } from '../../constants/theme';

interface Props {
  text: string;
  isRTL: boolean;
  theme: any;
  time?: string;
}

/**
 * The customer keeps a bubble. Dropping it too would leave two identical columns
 * of text and no way to tell who said what — the bubble is what separates the
 * voices once the assistant stops using one.
 */
const UserBubble: React.FC<Props> = ({ text, isRTL, theme, time }) => (
  <View
    style={{
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      alignItems: isRTL ? 'flex-start' : 'flex-end',
    }}
  >
    <View
      style={{
        maxWidth: '82%',
        backgroundColor: theme.colors.primary,
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm,
        borderRadius: 18,
        // The squared corner is the tail, so it points back at its own side.
        ...(isRTL ? { borderTopLeftRadius: 4 } : { borderTopRightRadius: 4 }),
      }}
    >
      <Text
        allowFontScaling={false}
        style={{
          fontSize: 15,
          // Android needs the extra leading for Arabic and Kurdish ascenders,
          // which clip at 22 on Samsung devices.
          lineHeight: Platform.OS === 'android' ? 24 : 22,
          color: '#FFFFFF',
          textAlign: isRTL ? 'right' : 'left',
          includeFontPadding: false,
        }}
      >
        {text}
      </Text>
    </View>

    {!!time && (
      <Text
        allowFontScaling={false}
        style={{ fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 }}
      >
        {time}
      </Text>
    )}
  </View>
);

export default React.memo(UserBubble);
