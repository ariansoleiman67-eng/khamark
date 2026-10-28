import React, { useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Animated,
  I18nManager,
  LayoutChangeEvent,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../ThemeProvider';
import SectionHeader from './SectionHeader';
import BrandCircleItem from './BrandCircleItem';
import { iosTapFix } from '../../ui/iosTapFix';

export interface BrandItemData {
  key: string;
  label: string;
  logoUrl?: string | number;
}

interface ShopByBrandSectionProps {
  brands: BrandItemData[];
  onSelectBrand: (brand: string) => void;
}

const BRAND_CIRCLE_DIAMETER = 80;
const BRAND_CIRCLE_GAP = 16;
const HORIZONTAL_PADDING = 16;
const TRACK_WIDTH = 48;
const THUMB_WIDTH = 18;
const MAX_TRAVEL = TRACK_WIDTH - THUMB_WIDTH; // 30

/**
 * ShopByBrandSection - Single-row floating circle brand carousel.
 *
 * Positioned directly below the promotional banner and its pagination dots,
 * before Featured Products.
 *
 * Features:
 * - Localized "Shop by brand" heading aligned with the shared 16-unit grid.
 * - Single horizontally scrollable row of floating circles.
 * - Circular white surface with subtle border, soft shadow, and contained logo.
 * - Graceful clean text fallback inside the circle when no logo exists, omitting
 *   the repeated label below while keeping the item's total footprint identical.
 * - Reactive scroll-position indicator derived from actual scroll progress.
 * - Native LTR/RTL support.
 */
const ShopByBrandSection: React.FC<ShopByBrandSectionProps> = ({
  brands,
  onSelectBrand,
}) => {
  const { theme, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';

  const scrollX = useRef(new Animated.Value(0)).current;
  const [contentWidth, setContentWidth] = useState(0);
  const [layoutWidth, setLayoutWidth] = useState(0);

  const maxScroll = Math.max(contentWidth - layoutWidth, 0);
  const canScroll = maxScroll > 8;

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: false }
  );

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setLayoutWidth(e.nativeEvent.layout.width);
  }, []);

  const handleContentSizeChange = useCallback((w: number) => {
    setContentWidth(w);
  }, []);

  const thumbTranslateX = useMemo(() => {
    if (!canScroll) return 0;
    return scrollX.interpolate({
      inputRange: [0, maxScroll],
      outputRange: isRTL ? [MAX_TRAVEL, 0] : [0, MAX_TRAVEL],
      extrapolate: 'clamp',
    });
  }, [canScroll, maxScroll, isRTL, scrollX]);

  const renderItem = useCallback(
    ({ item }: { item: BrandItemData }) => (
      <BrandCircleItem
        label={item.label}
        logoUrl={item.logoUrl}
        diameter={BRAND_CIRCLE_DIAMETER}
        onPress={() => onSelectBrand(item.label)}
      />
    ),
    [onSelectBrand]
  );

  if (!brands || brands.length === 0) {
    return null;
  }

  return (
    <View style={styles.sectionContainer}>
      <SectionHeader
        title={t('home.shopByBrand', { defaultValue: 'Shop by brand' })}
        style={styles.header}
      />

      <FlatList
        {...iosTapFix}
        data={brands}
        renderItem={renderItem}
        keyExtractor={(item) => `brand-circle-${item.key}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.listContent,
          { flexDirection: isRTL ? 'row-reverse' : 'row' },
        ]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onLayout={handleLayout}
        onContentSizeChange={handleContentSizeChange}
      />

      {canScroll && (
        <View
          style={[
            styles.indicatorTrack,
            { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E5E5EA' },
          ]}
        >
          <Animated.View
            style={[
              styles.indicatorThumb,
              {
                backgroundColor: theme.colors.primary,
                transform: [{ translateX: thumbTranslateX }],
              },
            ]}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  sectionContainer: {
    marginTop: 0,
    marginBottom: 4,
  },
  header: {
    marginTop: 12,
    marginBottom: 10,
  },
  listContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: 6, // Vertical clearance so soft shadows are never clipped
    gap: BRAND_CIRCLE_GAP,
  },
  indicatorTrack: {
    alignSelf: 'center',
    width: TRACK_WIDTH,
    height: 3,
    borderRadius: 1.5,
    marginTop: 6,
    marginBottom: 2,
    overflow: 'hidden',
  },
  indicatorThumb: {
    width: THUMB_WIDTH,
    height: 3,
    borderRadius: 1.5,
  },
});

export default React.memo(ShopByBrandSection);
