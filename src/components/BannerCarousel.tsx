import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions, Text, FlatList, NativeSyntheticEvent, NativeScrollEvent, Platform } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useIsFocused } from '@react-navigation/native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BANNER_PADDING = 24; // 12px on each side
const BANNER_WIDTH = SCREEN_WIDTH - BANNER_PADDING;
const BANNER_AUTO_SCROLL_INTERVAL = 4000;

// Module-level cache of the measured banner aspect ratio, keyed by the first
// image. The ratio is measured once from the loaded image; caching it here means
// a remount (FlatList header re-mount, tab refocus) restores the correct height
// IMMEDIATELY instead of resetting to the fallback and waiting on onLoad — which
// onLoad doesn't reliably re-fire for an already-cached image. This is what made
// the banner "get big" on scroll-up until a manual refresh.
const bannerRatioCache = new Map<string, number>();
const bannerRatioKey = (imgs: any[]): string => {
  const f = imgs?.[0];
  if (f && typeof f === 'object') {
    if (typeof f.uri === 'string') return f.uri;
    if (typeof f.url === 'string') return f.url;
  }
  return 'banner';
};

interface BannerCarouselProps {
  images: any[];
  onItemPress?: (item: any, index: number) => void;
  overlayLabel?: string;
}

/** Extracted video subcomponent so useVideoPlayer hook can be used properly */
const BannerVideo: React.FC<{ url: string; isActive: boolean; isFocused: boolean }> = memo(({ url, isActive, isFocused }) => {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = !isFocused;
    if (isFocused && isActive) p.play();
  });

  useEffect(() => {
    if (!player) return;
    if (isFocused && isActive) {
      player.muted = false;
      player.play();
    } else {
      player.muted = true;
      player.pause();
    }
  }, [isFocused, isActive, player]);

  return (
    <VideoView
      player={player}
      style={styles.bannerImage}
      nativeControls={false}
      contentFit="cover"
    />
  );
});

/**
 * BannerCarousel - Supports auto-scroll AND manual swipe gestures.
 * Uses FlatList with pagingEnabled for native swipe support.
 * Also supports VIDEO slides with auto-play only when focused.
 */
const BannerCarousel: React.FC<BannerCarouselProps> = memo(({
  images,
  onItemPress,
  overlayLabel,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const isFocused = useIsFocused();
  const isUserScrolling = useRef(false);

  // Adapt the banner height to the uploaded image's real aspect ratio so the
  // whole image shows with zero cropping (no blur bars, no cut edges). The
  // first loaded image sets the frame; clamped so extreme shapes can't break
  // the layout.
  const ratioKey = bannerRatioKey(images);
  // Initialise from the module cache so a remount never flashes the fallback height.
  const [imageRatio, setImageRatio] = useState<number | null>(() => bannerRatioCache.get(ratioKey) ?? null);
  const handleImageLoad = useCallback((e: any) => {
    const w = e?.source?.width;
    const h = e?.source?.height;
    if (w > 0 && h > 0) {
      const r = Math.min(Math.max(h / w, 0.3), 0.8);
      bannerRatioCache.set(ratioKey, r);
      setImageRatio((prev) => prev ?? r);
    }
  }, [ratioKey]);
  const bannerHeight = BANNER_WIDTH * (imageRatio ?? bannerRatioCache.get(ratioKey) ?? 0.46);

  // Reset auto-scroll timer
  const resetTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (images.length <= 1) return;

    timerRef.current = setInterval(() => {
      if (!isUserScrolling.current) {
        setCurrentIndex((prev) => {
          const next = (prev + 1) % images.length;
          flatListRef.current?.scrollToIndex({ index: next, animated: true });
          return next;
        });
      }
    }, BANNER_AUTO_SCROLL_INTERVAL);
  }, [images.length]);

  // Start auto-scroll
  useEffect(() => {
    resetTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [resetTimer]);

  // Handle scroll end to detect which page the user swiped to
  const onMomentumScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / BANNER_WIDTH);
    if (index >= 0 && index < images.length) {
      setCurrentIndex(index);
    }
    isUserScrolling.current = false;
    resetTimer();
  }, [images.length, resetTimer]);

  const onScrollBeginDrag = useCallback(() => {
    isUserScrolling.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const handleDotPress = useCallback((index: number) => {
    setCurrentIndex(index);
    flatListRef.current?.scrollToIndex({ index, animated: true });
    resetTimer();
  }, [resetTimer]);

  const handleItemPress = useCallback((item: any, index: number) => {
    if (onItemPress) {
      onItemPress(item, index);
    }
  }, [onItemPress]);

  const renderItem = useCallback(({ item, index }: { item: any; index: number }) => {
    const isVideo = item && typeof item === 'object' && item.type === 'video';

    return (
      <TouchableOpacity
        activeOpacity={0.95}
        onPress={() => handleItemPress(item, index)}
        disabled={isVideo}
        style={{ width: BANNER_WIDTH }}
      >
        <View style={[styles.bannerWrapper, { height: bannerHeight }]}>
          {isVideo ? (
            <BannerVideo
              url={typeof item.url === 'string' ? item.url : item.url}
              isActive={isFocused && index === currentIndex}
              isFocused={isFocused}
            />
          ) : (
              <Image
                source={item}
                style={styles.bannerImage}
                contentFit="cover"
                transition={0}
                cachePolicy="memory-disk"
                recyclingKey={typeof item?.uri === 'string' ? item.uri : `banner-${index}`}
                onLoad={handleImageLoad}
              />
          )}
          {!isVideo && (
            <LinearGradient
              colors={['rgba(0, 0, 0, 0.1)', 'rgba(0, 0, 0, 0.3)']}
              style={StyleSheet.absoluteFill}
            />
          )}

          {/* Top Right Overlay Label */}
          {overlayLabel && (
            <View style={styles.overlayLabelContainer}>
              <Text allowFontScaling={false} style={styles.overlayLabelText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{overlayLabel}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [currentIndex, isFocused, overlayLabel, handleItemPress, bannerHeight, handleImageLoad]);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: BANNER_WIDTH,
    offset: BANNER_WIDTH * index,
    index,
  }), []);

  return (
    <View style={styles.bannerSection}>
      <FlatList
        ref={flatListRef}
        data={images}
        renderItem={renderItem}
        keyExtractor={(_, index) => `banner-${index}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onScrollBeginDrag={onScrollBeginDrag}
        getItemLayout={getItemLayout}
        snapToInterval={BANNER_WIDTH}
        snapToAlignment="start"
        decelerationRate="fast"
        bounces={false}
      />

      {/* Pagination Dots */}
      <View style={styles.paginationContainer}>
        {images.map((_, index) => (
          <TouchableOpacity
            key={index}
            onPress={() => handleDotPress(index)}
            style={[
              styles.paginationDot,
              currentIndex === index && styles.paginationDotActive,
            ]}
          />
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  bannerButton: {
    backgroundColor: '#1a365d',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  bannerButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  bannerContent: {
    alignItems: 'flex-start',
    bottom: 0,
    justifyContent: 'flex-end',
    left: 0,
    padding: 20,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  bannerImage: {
    height: '100%',
    width: '100%',
  },
  bannerSection: {
    marginTop: 12,
    paddingHorizontal: 12,
  },
  bannerTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bannerWrapper: {
    borderRadius: 20,
    height: SCREEN_WIDTH * 0.45,
    overflow: 'hidden',
    width: '100%',
    // Shadow: iOS only — Android elevation creates harsh box shadow
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 0,
      },
    }),
  },
  overlayLabelContainer: {
    backgroundColor: '#FF6A00',
    borderBottomLeftRadius: 14,
    borderTopRightRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 10,
  },
  overlayLabelText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  paginationContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 14,
  },
  paginationDot: {
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
    borderRadius: 5,
    height: 6,
    marginHorizontal: 3,
    width: 6,
  },
  paginationDotActive: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 3,
    width: 22,
  },
});

export default BannerCarousel;
