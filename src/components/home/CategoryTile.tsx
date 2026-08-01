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
            ? theme.colors.primary + '14'
            : isDark ? theme.colors.surface : '#F5F5F7',
          borderColor: selected ? theme.colors.primary : 'transparent',
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.badge,
          { backgroundColor: selected ? theme.colors.primary : (isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF') },
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
            size={22}
            color={selected ? '#FFFFFF' : theme.colors.primary}
          />
        )}
      </View>

      <AppText
        fontSize={12}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
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
    borderRadius: 16,
    borderWidth: 1.5,
    minHeight: 96,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 8,
  },
  img: { width: '100%', height: '100%' },
  label: {
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 15,
  },
});

export default React.memo(CategoryTile);
