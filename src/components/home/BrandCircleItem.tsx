import React, { useState, useEffect } from 'react';
import { Pressable, View, StyleSheet, StyleProp, ViewStyle, Platform } from 'react-native';
import { Image } from 'expo-image';
import AppText from '../AppText';
import { useTheme } from '../ThemeProvider';
import { useTranslation } from 'react-i18next';

export interface BrandCircleItemProps {
  label: string;
  logoUrl?: string | number;
  diameter?: number;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

const DEFAULT_DIAMETER = 80;

/**
 * Floating brand circle for Khamark's home screen.
 *
 * - Circular white surface with delicate border and soft shadow.
 * - When logo is available: centers the logo with contain sizing, and shows the brand name below.
 * - When logo is missing or fails: shows the brand name inside the circle and avoids repeating
 *   the text below, preserving an identical item footprint.
 * - Smooth touch feedback and accessible button semantics.
 */
const BrandCircleItem: React.FC<BrandCircleItemProps> = ({
  label,
  logoUrl,
  diameter = DEFAULT_DIAMETER,
  style,
  onPress,
}) => {
  const { theme, isDark } = useTheme();
  const { t } = useTranslation();
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [logoUrl]);

  const isNumericAsset = typeof logoUrl === 'number';
  const showImage = Boolean(
    (isNumericAsset || (typeof logoUrl === 'string' && logoUrl.trim().length > 5)) && !imgFailed
  );
  const imageSource = isNumericAsset ? logoUrl : { uri: logoUrl as string };
  const circleRadius = diameter / 2;
  const hasMultipleWords = label.trim().includes(' ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('home.shopBrandA11y', { brand: label, defaultValue: `Shop ${label} products` })}
      style={({ pressed }) => [
        styles.container,
        { width: diameter },
        pressed && styles.pressed,
        style,
      ]}
    >
      <View
        style={[
          styles.circle,
          {
            width: diameter,
            height: diameter,
            borderRadius: circleRadius,
            backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#EAEAEB',
          },
        ]}
      >
        {showImage ? (
          <Image
            source={imageSource}
            style={styles.logoImage}
            contentFit="contain"
            transition={150}
            cachePolicy="memory-disk"
            recyclingKey={typeof logoUrl === 'string' ? logoUrl : undefined}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <AppText
            fontSize={12}
            numberOfLines={hasMultipleWords ? 2 : 1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={[styles.fallbackText, { color: theme.colors.text }]}
          >
            {label}
          </AppText>
        )}
      </View>

      {/* Label underneath: displayed when logo is present; omitted when fallback text is inside the circle */}
      {showImage ? (
        <AppText
          fontSize={11.5}
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[styles.label, { color: theme.colors.text }]}
        >
          {label}
        </AppText>
      ) : (
        <View style={styles.labelPlaceholder} />
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 2,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
  },
  circle: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  logoImage: {
    width: '74%',
    height: '74%',
  },
  fallbackText: {
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 4,
    lineHeight: 15,
    letterSpacing: 0.1,
  },
  label: {
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 6,
    width: '100%',
    lineHeight: 15,
  },
  labelPlaceholder: {
    height: 15,
    marginTop: 6,
    width: '100%',
  },
});

export default React.memo(BrandCircleItem);
