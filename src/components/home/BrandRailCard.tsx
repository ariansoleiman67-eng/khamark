import React, { useState, useEffect } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import AppText from '../AppText';
import { useTheme } from '../ThemeProvider';

interface BrandRailCardProps {
  label: string;
  imageUrl?: string;
  width?: number;
  onPress?: () => void;
}

// Cohesive premium gradient palette for brand monogram coins. First pair is the
// house amber so the brand rail always feels on-theme; the rest add variety.
const COIN_GRADIENTS: [string, string][] = [
  ['#F5A00A', '#FF7A00'], // amber (house)
  ['#6366F1', '#4F46E5'], // indigo
  ['#0EA5A5', '#0D9488'], // teal
  ['#F43F5E', '#E11D48'], // rose
  ['#10B981', '#059669'], // emerald
  ['#8B5CF6', '#7C3AED'], // violet
  ['#3B82F6', '#2563EB'], // blue
  ['#EC4899', '#DB2777'], // pink
  ['#F59E0B', '#D97706'], // amber-2
  ['#0EA5E9', '#0284C7'], // sky
];

// Stable hash so a given brand always maps to the same colour.
const gradientFor = (name: string): [string, string] => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COIN_GRADIENTS[h % COIN_GRADIENTS.length];
};

const initialOf = (name: string): string => {
  const m = name.match(/[A-Za-z0-9؀-ۿݐ-ݿ]/); // latin/arabic/kurdish
  return (m ? m[0] : name.charAt(0) || '?').toUpperCase();
};

// Home "Our Brands" rail card: an elevated rounded card holding either the
// admin-uploaded logo (white chip) or a gradient monogram coin, with the brand
// name beneath. Designed for a horizontal, side-scrolling rail.
const BrandRailCard: React.FC<BrandRailCardProps> = ({ label, imageUrl, width = 116, onPress }) => {
  const { theme, isDark } = useTheme();
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => { setImgFailed(false); }, [imageUrl]);
  const showImage = !!imageUrl && imageUrl.trim().length > 5 && !imgFailed;
  const [g1, g2] = gradientFor(label);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.card,
        {
          width,
          backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
          borderColor: isDark ? theme.colors.border + '55' : '#EEF0F3',
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
      ]}
    >
      {showImage ? (
        <View style={[styles.logoChip, { backgroundColor: '#FFFFFF', borderColor: isDark ? theme.colors.border + '55' : '#EEF0F3' }]}>
          <Image
            source={{ uri: imageUrl }}
            style={styles.logo}
            contentFit="contain"
            transition={0}
            onError={() => setImgFailed(true)}
          />
        </View>
      ) : (
        <LinearGradient
          colors={[g1, g2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.coin, { shadowColor: g1 }]}
        >
          <AppText fontSize={24} style={styles.coinText}>{initialOf(label)}</AppText>
        </LinearGradient>
      )}

      <AppText
        fontSize={13}
        numberOfLines={1}
        style={[styles.label, { color: theme.colors.text }]}
      >
        {label}
      </AppText>
    </Pressable>
  );
};

const COIN = 60;

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 10,
    // soft elevation
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  coin: {
    width: COIN,
    height: COIN,
    borderRadius: COIN / 2,
    alignItems: 'center',
    justifyContent: 'center',
    // colored glow (shadowColor overridden inline per-brand)
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  coinText: {
    color: '#FFFFFF',
    fontWeight: '800',
    includeFontPadding: false,
  },
  logoChip: {
    width: COIN,
    height: COIN,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  logo: { width: '100%', height: '100%' },
  label: {
    marginTop: 12,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
});

export default BrandRailCard;
