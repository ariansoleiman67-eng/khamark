import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import AppText from '../AppText';
import { useTheme } from '../ThemeProvider';

interface BrandTileProps {
  label: string;
  imageUrl?: string;
  width?: number;
  onPress?: () => void;
}

// aynAlfahad "Our Brands" tile: flat light-gray rounded card, logo/initial centered, label beneath.
const BrandTile: React.FC<BrandTileProps> = ({ label, imageUrl, width, onPress }) => {
  const { theme, isDark } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          width,
          backgroundColor: isDark ? theme.colors.surface : '#F0F0F2',
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={styles.imgWrap}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.img}
            contentFit="contain"
            transition={0}
          />
        ) : (
          <View style={[styles.letter, { backgroundColor: theme.colors.primary }]}>
            <AppText fontSize={22} style={styles.letterText}>
              {(label || '?').charAt(0).toUpperCase()}
            </AppText>
          </View>
        )}
      </View>
      <AppText
        fontSize={13}
        numberOfLines={1}
        style={[styles.label, { color: theme.colors.textSecondary }]}
      >
        {label}
      </AppText>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  tile: {
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imgWrap: {
    height: 56,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  img: { width: '72%', height: 52 },
  letter: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterText: { color: '#FFFFFF', fontWeight: '800' },
  label: { fontWeight: '600' },
});

export default BrandTile;
