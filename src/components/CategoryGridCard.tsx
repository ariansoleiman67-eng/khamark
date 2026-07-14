import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  width: number;
  title: string;
  iconName: any;
  active?: boolean;
  theme: any;
  onPress: () => void;
};

const CategoryGridCard = memo(({ width, title, iconName, active, theme, onPress }: Props) => {
  const borderColor = active ? theme.colors.primary + '55' : theme.colors.border + '35';
  const bg = active ? theme.colors.primary + '12' : theme.colors.surface;
  const iconColor = active ? theme.colors.primary : theme.colors.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          width,
          backgroundColor: bg,
          borderColor,
          opacity: pressed ? 0.88 : 1,
        },
      ]}
      android_ripple={{ color: theme.colors.border + '40', borderless: false }}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={[styles.iconWrap, { backgroundColor: active ? theme.colors.primary + '18' : theme.colors.background }]}>
        <Ionicons name={iconName} size={22} color={iconColor} />
      </View>

      <Text allowFontScaling={false}
        style={[styles.title, { color: theme.colors.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
      >
        {title}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: 14,
    height: 40,
    justifyContent: 'center',
    marginBottom: 8,
    width: 40,
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
    includeFontPadding: false,
    textAlign: 'center',
  },
});

export default CategoryGridCard;
