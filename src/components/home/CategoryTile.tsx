import React, { useState, useEffect } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../AppText';
import { useTheme } from '../ThemeProvider';

interface CategoryTileProps {
  label: string;
  /** Admin-uploaded category image (optional). */
  imageUrl?: string;
  /** Fallback glyph shown when there is no uploaded image. */
  icon?: keyof typeof Ionicons.glyphMap;
  width?: number;
  selected?: boolean;
  onPress?: () => void;
}

/**
 * Compact category tile: a round icon/image badge with the name underneath.
 * Categories used to reuse BrandTile (a 128px-tall wordmark card built for brand
 * logos), which left long names like "Accessories" breaking mid-word inside a
 * third-of-a-screen tile. Here the artwork carries the tile and the label is a
 * small two-line caption, so every name fits at a consistent size.
 */
const CategoryTile: React.FC<CategoryTileProps> = ({
  label,
  imageUrl,
  icon = 'cube-outline',
  width,
  selected,
  onPress,
}) => {
  const { theme, isDark } = useTheme();
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => { setImgFailed(false); }, [imageUrl]);
  const showImage = !!imageUrl && !imgFailed;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          width,
          backgroundColor: selected
            ? (isDark ? 'rgba(211, 47, 47, 0.16)' : '#FBEFF0')
            : isDark ? theme.colors.surface : '#FFFFFF',
          borderColor: selected ? theme.colors.primary : (isDark ? '#2C2C30' : '#E7E7EA'),
          borderWidth: 1,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.badge,
          { backgroundColor: selected ? theme.colors.primary : (isDark ? 'rgba(255,255,255,0.06)' : '#F7F7F8') },
        ]}
      >
        {showImage ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.img}
            contentFit="cover"
            transition={0}
            cachePolicy="memory-disk"
            recyclingKey={imageUrl}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <Ionicons
            name={icon}
            size={34}
            color={selected ? '#FFFFFF' : theme.colors.primary}
          />
        )}
      </View>

      <AppText
        fontSize={13}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={[
          styles.label,
          { color: selected ? theme.colors.primary : theme.colors.text },
        ]}
      >
        {label}
      </AppText>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  tile: {
    borderRadius: 14,
    minHeight: 132,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },
  badge: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 8,
  },
  img: { width: '100%', height: '100%' },
  label: {
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 17,
  },
});

export default React.memo(CategoryTile);
