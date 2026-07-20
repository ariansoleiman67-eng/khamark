/**
 * GOLDEN CAROUSEL - Alibaba-Style Auto-Advancing Image Carousel
 * 
 * Golden Rules (LOCKED):
 * - NO nested vertical scroll
 * - NO reanimated
 * - NO layout animations
 * - aspectRatio enforced by parent
 * - FlatList horizontal only
 * - Progress bar is visual only (pointerEvents="none")
 * 
 * ALIBABA INSTANT IMAGE LOADING (LOCKED):
 * - expo-image with transition: 0
 * - cachePolicy: memory-disk
 * - priority: high (hero images)
 * 
 * ALIBABA MEDIA TABS:
 * - "Video" | "Images" tabs at BOTTOM of carousel (overlay style)
 * - Selecting "Images" shows only image carousel
 * - Selecting "Video" shows only the video
 * 
 * Architecture:
 * - Horizontal FlatList with pagingEnabled (single scroll owner)
 * - Media tabs at bottom of carousel (absolute positioned)
 * - NO auto-advance. This is a product gallery, not a promo banner: the customer is
 *   studying the back of a phone, and sliding it away after 3s is hostile. Navigation
 *   is entirely user-driven via swipe or the thumbnail strip.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  FlatList,
  I18nManager,
  TouchableOpacity,
  Dimensions,
  StyleSheet,
  ViewToken,
  Text,
} from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../components/ThemeProvider';
import { useTranslation } from 'react-i18next';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface GoldenCarouselProps {
  images: string[];
  videoUrl?: string | null; // Optional video URL
  onImagePress?: () => void;
  onIndexChange?: (index: number) => void;
}

const GoldenCarousel: React.FC<GoldenCarouselProps> = ({
  images,
  videoUrl,
  onImagePress,
  onIndexChange,
}) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(0);
  const [mediaTab, setMediaTab] = useState<'images' | 'video'>('images');
  const activeIndexRef = useRef(0);
  const flatListRef = useRef<FlatList>(null);
  const videoPlayerSource = videoUrl || '';
  const videoPlayer = useVideoPlayer(videoPlayerSource, (p) => {
    p.loop = true;
    if (hasVideo && mediaTab === 'video') p.play();
  });
  const isUserInteracting = useRef(false);

  const hasVideo = !!videoUrl;

  // Viewability config for detecting visible item
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  // Go to next image (loop at end)
  const goToNext = useCallback(() => {
    if (images.length <= 1) return;
    
    const currentIdx = activeIndexRef.current;
    const nextIndex = currentIdx >= images.length - 1 ? 0 : currentIdx + 1;
    
    activeIndexRef.current = nextIndex;
    setActiveIndex(nextIndex);
    onIndexChange?.(nextIndex);
    
    flatListRef.current?.scrollToIndex({
      index: nextIndex,
      animated: true,
    });
    
  }, [images.length, onIndexChange]);

  // Jump straight to an image from the thumbnail strip.
  const goToIndex = useCallback((index: number) => {
    activeIndexRef.current = index;
    setActiveIndex(index);
    onIndexChange?.(index);
    flatListRef.current?.scrollToIndex({ index, animated: true });
  }, [onIndexChange]);

  // Handle viewable items changed
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        const newIndex = viewableItems[0].index;
        if (newIndex !== activeIndexRef.current) {
          activeIndexRef.current = newIndex;
          setActiveIndex(newIndex);
          onIndexChange?.(newIndex);
        }
      }
    },
    [onIndexChange]
  );

  const viewableItemsChangedRef = useRef(onViewableItemsChanged);
  viewableItemsChangedRef.current = onViewableItemsChanged;

  // Handle tab change - play/pause video
  useEffect(() => {
    if (!videoPlayer) return;
    if (mediaTab === 'video' && hasVideo) {
      videoPlayer.play();
    } else {
      videoPlayer.pause();
    }
  }, [mediaTab, hasVideo]);

  // Handle scroll begin
  const onScrollBeginDrag = useCallback(() => {
    isUserInteracting.current = true;
  }, []);

  // Handle scroll end
  const onScrollEndDrag = useCallback(() => {
    isUserInteracting.current = false;
  }, []);

  // Render image item
  const renderImageItem = useCallback(
    ({ item, index }: { item: string; index: number }) => (
      <TouchableOpacity
        key={index}
        onPress={onImagePress}
        activeOpacity={0.9}
        style={styles.imageWrapper}
      >
        <Image
          source={{ uri: item }}
          style={styles.image}
          contentFit="contain"
          transition={0}
          cachePolicy="memory-disk"
          priority="high"
        />
      </TouchableOpacity>
    ),
    [onImagePress]
  );

  // Render placeholder
  const renderEmptyPlaceholder = () => (
    <View style={[styles.placeholder, { backgroundColor: theme.colors.border }]}>
      <Ionicons name="image-outline" size={64} color={theme.colors.textSecondary} />
    </View>
  );

  // Edge case: 0 images and no video
  if (images.length === 0 && !hasVideo) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
        {renderEmptyPlaceholder()}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
      {/* Video View */}
      {mediaTab === 'video' && hasVideo && (
        <View style={styles.imageWrapper}>
          <VideoView
            player={videoPlayer}
            style={styles.image}
            nativeControls={true}
            contentFit="contain"
          />
        </View>
      )}

      {/* Images Carousel */}
      {mediaTab === 'images' && (
        <>
          {images.length > 0 ? (
            <FlatList
              ref={flatListRef}
              data={images}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(_, index) => index.toString()}
              renderItem={renderImageItem}
              onScrollBeginDrag={onScrollBeginDrag}
              onScrollEndDrag={onScrollEndDrag}
              onViewableItemsChanged={({ viewableItems }) => {
                viewableItemsChangedRef.current({ viewableItems });
              }}
              viewabilityConfig={viewabilityConfig}
              getItemLayout={(_, index) => ({
                length: SCREEN_WIDTH,
                offset: SCREEN_WIDTH * index,
                index,
              })}
              initialNumToRender={1}
              maxToRenderPerBatch={2}
              windowSize={3}
            />
          ) : (
            renderEmptyPlaceholder()
          )}
        </>
      )}

      {/* Bottom Overlay - Progress bars + Media Tabs (Alibaba style) */}
      <View style={styles.bottomOverlay} pointerEvents="box-none">
        {/* Thumbnail strip.
            Replaces the auto-advance progress bar, which represented nothing once the
            gallery stopped moving on its own. A counter tells you there are three
            images somewhere; this shows you what they are, which one you are on, and
            lets you jump straight to the shot you want — and it makes the colour ->
            image link legible, since picking a colour reorders this strip. */}
        {mediaTab === 'images' && images.length > 1 && (
          <FlatList
            data={images}
            horizontal
            keyExtractor={(uri, index) => `${uri}-${index}`}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbStrip}
            // The strip mirrors in RTL along with the pager it controls.
            inverted={I18nManager.isRTL}
            renderItem={({ item, index }) => {
              const active = index === activeIndex;
              return (
                <TouchableOpacity
                  onPress={() => goToIndex(index)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={t('product.imageNOfM', {
                    current: index + 1,
                    total: images.length,
                    defaultValue: `Image ${index + 1} of ${images.length}`,
                  })}
                  style={[
                    styles.thumb,
                    {
                      borderColor: active ? theme.colors.primary : 'rgba(255,255,255,0.55)',
                      borderWidth: active ? 2 : 1,
                      // Inactive thumbs recede rather than disappear — still legible
                      // enough to preview, clearly secondary to the active one.
                      opacity: active ? 1 : 0.6,
                    },
                  ]}
                >
                  <Image
                    source={{ uri: item }}
                    style={styles.thumbImage}
                    contentFit="cover"
                    transition={0}
                    cachePolicy="memory-disk"
                  />
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* Media Type Tabs - Alibaba style at bottom */}
        {hasVideo && (
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[
                styles.tab,
                mediaTab === 'video' && styles.tabActive,
              ]}
              onPress={() => setMediaTab('video')}
            >
              <Text allowFontScaling={false} style={[
                styles.tabText,
                { color: mediaTab === 'video' ? '#fff' : 'rgba(255,255,255,0.7)' }
              ]}>
                {t('common.video', 'Video')}
              </Text>
            </TouchableOpacity>
            
            <View style={styles.tabDivider} />
            
            <TouchableOpacity
              style={[
                styles.tab,
                mediaTab === 'images' && styles.tabActive,
              ]}
              onPress={() => setMediaTab('images')}
            >
              <Text allowFontScaling={false} style={[
                styles.tabText,
                { color: mediaTab === 'images' ? '#fff' : 'rgba(255,255,255,0.7)' }
              ]}>
                {t('common.images', 'Images')} {images.length}/{images.length}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Image counter when no video */}
        {!hasVideo && images.length > 1 && (
          <View style={styles.imageCounter}>
            <Text allowFontScaling={false} style={styles.imageCounterText}>
              {activeIndex + 1}/{images.length}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bottomOverlay: {
    // Sit above the info sheet, which overlaps the carousel bottom (~28px),
    // so the pagination progress bar is never clipped by the rising sheet.
    bottom: 42,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  container: {
    aspectRatio: 1,
    width: '100%',
  },
  image: {
    height: '100%',
    width: '100%',
  },
  imageCounter: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    marginBottom: 12,
    marginRight: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  imageCounterText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  imageWrapper: {
    alignItems: 'center',
    aspectRatio: 1,
    justifyContent: 'center',
    width: SCREEN_WIDTH,
  },
  placeholder: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  thumbStrip: {
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    overflow: 'hidden',
    // Backs the thumb so a light product shot still reads against a light photo.
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tabActive: {
    // Active state styling handled by text color
  },
  tabContainer: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    flexDirection: 'row',
    marginBottom: 12,
  },
  tabDivider: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    height: 16,
    width: 1,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },
});

export default GoldenCarousel;
