import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';

const introVideo = require('../../assets/video/intro.mp4');
const posterImage = require('../../assets/video/intro-poster.jpg');

const FADE_OUT_MS = 600;
const FAILSAFE_MS = 6000;   // Hard ceiling — splash gone after 6s no matter what
const MIN_VISIBLE_MS = 1200;

type FinishReason =
  | 'video-ended'
  | 'skip'
  | 'failsafe-timeout'
  | 'video-error'
  | 'play-stalled';

interface VideoSplashProps {
  onFinish?: () => void;
  onStart?: () => void;
  onError?: (error: unknown) => void;
  onSkip?: () => void;
  onFinishReason?: (reason: FinishReason) => void;

  muted?: boolean;
  allowSkip?: boolean;
  skipLabel?: string;

  backgroundColor?: string;
  testID?: string;
}

/**
 * VideoSplash — plays an intro video and then fades out.
 *
 * Design goals for reliability on real devices:
 * 1. NEVER call player.pause() from effect cleanup — Strict Mode would kill playback.
 * 2. Store all callbacks in refs so the failsafe timer never needs to be
 *    torn down and re-created (avoids resetting the countdown).
 * 3. A single failsafe setTimeout with ZERO dependencies — it fires once and
 *    cannot be accidentally cleared by effect re-runs.
 */
const VideoSplash: React.FC<VideoSplashProps> = ({
  onFinish,
  onStart,
  onError,
  onSkip,
  onFinishReason,
  muted = true,
  allowSkip = false,
  skipLabel = 'Skip',
  backgroundColor = '#000000', // matches the intro's near-black open (#09090A) — no edge flash on cover-crop
  testID = 'video-splash',
}) => {
  const { width, height } = useWindowDimensions();
  const [isVisible, setIsVisible] = useState(true);
  const opacity = useSharedValue(1);
  // Gentle "lift & fade": the splash scales up a touch as it dissolves, so the app
  // underneath is revealed with a premium push instead of a flat cross-fade.
  const scale = useSharedValue(1);

  // ---- stable refs for callbacks (never cause effect re-runs) ----
  const onFinishRef = useRef(onFinish);
  const onFinishReasonRef = useRef(onFinishReason);
  const onErrorRef = useRef(onError);
  const onStartRef = useRef(onStart);
  onFinishRef.current = onFinish;
  onFinishReasonRef.current = onFinishReason;
  onErrorRef.current = onError;
  onStartRef.current = onStart;

  const hasFinishedRef = useRef(false);
  const hasCalledStartRef = useRef(false);
  const mountTimeRef = useRef(Date.now());

  // ---- player ----
  const player = useVideoPlayer(introVideo, (p) => {
    p.loop = false;
    p.muted = muted;
    p.play();
  });

  // ---- finish logic (no dependencies on props — uses refs) ----
  const finish = useCallback((reason: FinishReason) => {
    if (hasFinishedRef.current) return;

    // Enforce minimum visible time
    const elapsed = Date.now() - mountTimeRef.current;
    const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);

    const doFinish = () => {
      if (hasFinishedRef.current) return;
      hasFinishedRef.current = true;

      const finalize = () => {
        setIsVisible(false);
        onFinishReasonRef.current?.(reason);
        onFinishRef.current?.();
      };

      // Fade out + subtle scale-up, revealing the (already mounted) app beneath.
      scale.value = withTiming(1.06, { duration: FADE_OUT_MS, easing: Easing.out(Easing.cubic) });
      opacity.value = withTiming(
        0,
        { duration: FADE_OUT_MS, easing: Easing.out(Easing.cubic) },
        (done) => { if (done) runOnJS(finalize)(); }
      );
    };

    if (wait <= 0) {
      doFinish();
    } else {
      setTimeout(doFinish, wait);
    }
  }, [opacity, scale]);

  // onStart is now fired from statusChange when video is readyToPlay
  // (keeps native splash visible until video has frames to show)

  // ---- single failsafe timer — empty deps, fires exactly once ----
  useEffect(() => {
    const id = setTimeout(() => {
      finish('failsafe-timeout');
    }, FAILSAFE_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line
  }, []);

  // ---- player event: video reached end ----
  useEffect(() => {
    const sub = player.addListener('playToEnd', () => {
      finish('video-ended');
    });
    return () => sub.remove();
  }, [player, finish]);

  // ---- player event: status changes ----
  useEffect(() => {
    const sub = player.addListener('statusChange', (event: any) => {
      const status = event?.status;

      if (event?.error) {
        onErrorRef.current?.(event.error);
        finish('video-error');
        return;
      }
      // When video is ready to display, hide native splash and ensure playback
      if (status === 'readyToPlay') {
        if (!hasCalledStartRef.current) {
          hasCalledStartRef.current = true;
          onStartRef.current?.();
        }
        try { player.play(); } catch { /* ok */ }
      }
    });
    return () => sub.remove();
  }, [player, finish]);

  // ---- player event: playing state (recovery) ----
  useEffect(() => {
    const sub = player.addListener('playingChange', (event: any) => {
      const playing = event?.isPlaying ?? event;

      // If playback stopped unexpectedly and we haven't finished, retry
      if (!playing && !hasFinishedRef.current) {
        try { player.play(); } catch { /* ok */ }
      }
    });
    return () => sub.remove();
  }, [player]);

  // ---- skip handler ----
  const handleSkip = useCallback(() => {
    if (!allowSkip) return;
    onSkip?.();
    finish('skip');
  }, [allowSkip, onSkip, finish]);

  // ---- styles ----
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  const videoStyle = useMemo(() => ({ width, height }), [width, height]);
  const containerStyle = useMemo(
    () => [styles.container, { backgroundColor }, animatedStyle],
    [backgroundColor, animatedStyle]
  );

  if (!isVisible) return null;

  return (
    <Animated.View
      testID={testID}
      style={containerStyle}
      pointerEvents="box-none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Image source={posterImage} style={styles.poster} contentFit="cover" />

      <VideoView
        player={player}
        style={[styles.video, videoStyle]}
        nativeControls={false}
        contentFit="cover"
        surfaceType="textureView"
        fullscreenOptions={{ enable: false }}
        allowsPictureInPicture={false}
      />

      {allowSkip ? (
        <View pointerEvents="box-none" style={styles.overlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={skipLabel}
            hitSlop={12}
            onPress={handleSkip}
            style={styles.skipButton}
            testID={`${testID}-skip-button`}
          >
            <Text allowFontScaling={false} style={styles.skipText}>{skipLabel}</Text>
          </Pressable>
        </View>
      ) : null}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    elevation: 9999,
    zIndex: 9999,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    paddingRight: 20,
    paddingTop: 56,
  },
  poster: {
    ...StyleSheet.absoluteFillObject,
  },
  skipButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 72,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  skipText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default memo(VideoSplash);