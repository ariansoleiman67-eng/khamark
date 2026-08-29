import React, { useState, useEffect } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import AppText from '../AppText';
import { useTheme } from '../ThemeProvider';

interface BrandCardProps {
  label: string;
  /**
   * Compact tiles are for the category screen's brand filter strip, where the row
   * sits above a product grid and must not eat the screen. Same look, smaller: the
   * caption is dropped because at this size the wordmark already IS the name, and
   * repeating it was the main thing making the tile tall.
   */
  compact?: boolean;
  imageUrl?: string;
  width?: number;
  onPress?: () => void;
}

// "Our Brands" grid card: a flat, borderless light-gray rounded tile. When the
// admin uploaded a logo it's shown centered on the card (no chip/frame). With no
// logo the brand name is drawn as a clean uppercase wordmark. The brand name
// always appears as a soft caption beneath — logo + caption, aynAlfahad style.
const BrandCard: React.FC<BrandCardProps> = ({ label, imageUrl, width, onPress, compact = false }) => {
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
        compact && styles.tileCompact,
        {
          width,
          backgroundColor: isDark ? theme.colors.surface : '#F1F2F4',
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.logoArea, compact && styles.logoAreaCompact]}>
        {showImage ? (
          <Image
            source={{ uri: imageUrl }}
            style={compact ? styles.logoCompact : styles.logo}
            contentFit="contain"
            transition={0}
            cachePolicy="memory-disk"
            recyclingKey={imageUrl}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <AppText
            fontSize={compact ? 15 : 19}
            numberOfLines={1}
            adjustsFontSizeToFit
            // 0.45 rather than 0.6: a long wordmark like PROOVE was rendering
            // clipped ("PROOV") in the narrow compact tile because it could not
            // shrink far enough to fit on one line.
            minimumFontScale={compact ? 0.45 : 0.6}
            style={[styles.wordmark, { color: theme.colors.text }]}
          >
            {label.toUpperCase()}
          </AppText>
        )}
      </View>

      {/* Only under a LOGO. The caption exists to name the mark above it — but
          when the brand has no logo, the thing above it IS the name, drawn as a
          wordmark, so the tile printed it twice: "BELKIN" over "Belkin". Most of
          this shop's brands have no logo uploaded, so most of the rail read like
          that. This is the same reasoning the `compact` variant already carries a
          few lines up; it was only ever applied to the small tile. */}
      {!compact && showImage && (
        <AppText
          fontSize={13}
          numberOfLines={1}
          style={[styles.caption, { color: theme.colors.textSecondary }]}
        >
          {label}
        </AppText>
      )}
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
  // Enlarged: the filter tile used to be 62pt tall with a 36pt logo area, and a
  // logo drawn at a fixed 48pt height overflowed and clipped inside it. The shop
  // said the brands read as too small to pick out, so the tile is now ~1.5x and
  // the logo has its own style that fits the area it sits in.
  tileCompact: {
    borderRadius: 14,
    minHeight: 96,
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  logoAreaCompact: {
    height: 56,
  },
  logoCompact: { width: '88%', height: 52 },
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
