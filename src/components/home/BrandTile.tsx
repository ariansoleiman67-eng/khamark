import React, { useState, useEffect } from 'react';
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

// aynAlfahad "Our Brands" tile: flat light-gray rounded card. When the admin has
// uploaded a real logo, it's shown centered with the name beneath. Otherwise the
// brand name is rendered as a clean bold wordmark (a text logo) filling the card.
const BrandTile: React.FC<BrandTileProps> = ({ label, imageUrl, width, onPress }) => {
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
          backgroundColor: isDark ? theme.colors.surface : '#F0F0F2',
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      {showImage ? (
        <>
          <View style={styles.imgWrap}>
            <Image
              source={{ uri: imageUrl }}
              style={styles.img}
              contentFit="contain"
              transition={0}
              onError={() => setImgFailed(true)}
            />
          </View>
          <AppText
            fontSize={13}
            numberOfLines={1}
            style={[styles.label, { color: theme.colors.textSecondary }]}
          >
            {label}
          </AppText>
        </>
      ) : (
        <View style={styles.wordmarkWrap}>
          <AppText
            fontSize={20}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            style={[styles.wordmark, { color: theme.colors.text }]}
          >
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  tile: {
    borderRadius: 18,
    minHeight: 128,
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imgWrap: {
    height: 78,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  img: { width: '82%', height: 70 },
  label: { fontWeight: '600' },
  wordmarkWrap: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  wordmark: {
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
});

export default BrandTile;
