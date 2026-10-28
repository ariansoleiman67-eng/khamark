import React, { useState, useEffect } from 'react';
import { Pressable, View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import AppText from '../AppText';
import { useTheme } from '../ThemeProvider';

interface BrandCardProps {
  label: string;
  imageUrl?: string;
  width?: number;
  height?: number;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

/**
 * Compact, polished brand tile for Khamark's home screen and category brand filters.
 *
 * - When an image/logo is present: centers the logo with contain sizing, no second text label.
 * - When no logo or image fails: shows the actual brand name as a clean, centered text fallback
 *   respecting its supplied capitalization and handling long names gracefully.
 */
const BrandCard: React.FC<BrandCardProps> = ({
  label,
  imageUrl,
  width,
  height,
  compact = false,
  style,
  onPress,
}) => {
  const { theme, isDark } = useTheme();
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [imageUrl]);

  const showImage = Boolean(imageUrl && imageUrl.trim().length > 5 && !imgFailed);
  const tileWidth = width ?? (compact ? 116 : 104);
  const tileHeight = height ?? (compact ? 58 : 76);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.tile,
        {
          width: tileWidth,
          height: tileHeight,
          backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
          borderColor: isDark ? '#2C2C30' : '#EAEAEB',
          opacity: pressed ? 0.75 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      <View style={styles.contentContainer}>
        {showImage ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.logoImage}
            contentFit="contain"
            transition={150}
            cachePolicy="memory-disk"
            recyclingKey={imageUrl}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <AppText
            fontSize={compact ? 12 : 13}
            numberOfLines={2}
            adjustsFontSizeToFit={false}
            ellipsizeMode="tail"
            style={[styles.brandText, { color: theme.colors.text }]}
          >
            {label}
          </AppText>
        )}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  tile: {
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  contentContainer: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: '100%',
    height: '100%',
    maxWidth: '84%',
    maxHeight: '74%',
  },
  brandText: {
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 17,
    letterSpacing: 0.2,
    paddingHorizontal: 4,
  },
});

export default React.memo(BrandCard);
