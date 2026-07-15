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
 * - Auto-advance every 3s using Animated.timing
 * - Manual swipe resets progress via onViewableItemsChanged
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  Animated,
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
const AUTO_ADVANCE_DURATION = 3000; // 3 seconds per image

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
  const progress = useRef(new Animated.Value(0)).current;
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
    
    // Start progress for next image
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: AUTO_ADVANCE_DURATION,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && !isUserInteracting.current) {
        goToNext();
      }
    });
  }, [images.length, onIndexChange, progress]);

  // Start progress animation
  const startProgress = useCallback(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: AUTO_ADVANCE_DURATION,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && !isUserInteracting.current) {
        goToNext();
      }
    });
  }, [progress, goToNext]);

  // Handle viewable items changed
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        const newIndex = viewableItems[0].index;
        if (newIndex !== activeIndexRef.current) {
          activeIndexRef.current = newIndex;
          setActiveIndex(newIndex);
          onIndexChange?.(newIndex);
          progress.stopAnimation();
          startProgress();
        }
      }
    },
    [onIndexChange, progress, startProgress]
  );

  const viewableItemsChangedRef = useRef(onViewableItemsChanged);
  viewableItemsChangedRef.current = onViewableItemsChanged;

  // Start auto-advance on mount (only for images mode)
  useEffect(() => {
    if (images.length <= 1 || mediaTab !== 'images') return;
    
    startProgress();
    
    return () => {
      progress.stopAnimation();
    };
  }, [images.length, mediaTab]);

  // Handle tab change - play/pause video
  useEffect(() => {
    if (!videoPlayer) return;
    if (mediaTab === 'video' && hasVideo) {
      videoPlayer.play();
      progress.stopAnimation();
    } else {
      videoPlayer.pause();
      if (images.length > 1) {
        startProgress();
      }
    }
  }, [mediaTab, hasVideo]);

  // Handle scroll begin
  const onScrollBeginDrag = useCallback(() => {
    isUserInteracting.current = true;
    progress.stopAnimation();
  }, [progress]);

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

  // Progress bar width
  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

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
        {/* Progress Bar Row - Only for images */}
        {mediaTab === 'images' && images.length > 1 && (
          <View style={styles.progressBarRow} pointerEvents="none">
            {images.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.progressSegment,
                  { backgroundColor: 'rgba(0,0,0,0.15)' },
                ]}
              >
                {index < activeIndex && (
                  <View
                    style={[
                      styles.progressFill,
                      { backgroundColor: 'rgba(0,0,0,0.5)', width: '100%' },
                    ]}
                  />
                )}
                {index === activeIndex && (
                  <Animated.View
                    style={[
                      styles.progressFill,
                      { backgroundColor: 'rgba(0,0,0,0.5)', width: progressWidth },
                    ]}
                  />
                )}
              </View>
            ))}
          </View>
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
  progressBarRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  progressFill: {
    borderRadius: 1.5,
    height: '100%',
  },
  progressSegment: {
    borderRadius: 2,
    flex: 1,
    height: 4,
    overflow: 'hidden',
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
