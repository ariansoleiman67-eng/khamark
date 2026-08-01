import React, { useState, useEffect } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import AppText from '../AppText';
import { useTheme } from '../ThemeProvider';

interface BrandCardProps {
  label: string;
  imageUrl?: string;
  width?: number;
  onPress?: () => void;
}

// "Our Brands" grid card: a flat, borderless light-gray rounded tile. When the
// admin uploaded a logo it's shown centered on the card (no chip/frame). With no
// logo the brand name is drawn as a clean uppercase wordmark. The brand name
// always appears as a soft caption beneath — logo + caption, aynAlfahad style.
const BrandCard: React.FC<BrandCardProps> = ({ label, imageUrl, width, onPress }) => {
  const { theme, isDark } = useTheme();
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => { setImgFailed(false); }, [imageUrl]);
  const showImage = !!imageUrl && imageUrl.trim().length > 5 && !imgFailed;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.tile,
        {
          width,
          backgroundColor: isDark ? theme.colors.surface : '#F1F2F4',
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.logoArea}>
        {showImage ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.logo}
            contentFit="contain"
            transition={0}
            cachePolicy="memory-disk"
            recyclingKey={imageUrl}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <AppText
            fontSize={19}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            style={[styles.wordmark, { color: theme.colors.text }]}
          >
            {label.toUpperCase()}
          </AppText>
        )}
      </View>

      <AppText
        fontSize={13}
        numberOfLines={1}
        style={[styles.caption, { color: theme.colors.textSecondary }]}
      >
        {label}
      </AppText>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  tile: {
    borderRadius: 18,
    minHeight: 150,
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoArea: {
    height: 52,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: '78%', height: 48 },
  wordmark: {
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.6,
  },
  caption: {
    marginTop: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
});

// Rendered once per brand in a horizontal rail — memo keeps the whole rail from
// re-rendering when an unrelated bit of Home state changes.
export default React.memo(BrandCard);
