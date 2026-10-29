import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  AccessibilityInfo,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';

const { width: SCREEN_W } = Dimensions.get('window');

/**
 * Native splash matches this exact proportion: 548 / 1024 (53.5156% of screen width).
 * Bounded between 190 and 230 layout units per creative brief guidelines.
 */
const SPLASH_RATIO = 548 / 1024;
const LOGO_ASPECT_RATIO = 2400 / 1072;
const LOGO_WIDTH = Math.min(Math.max(Math.round(SCREEN_W * SPLASH_RATIO), 190), 230);
const LOGO_HEIGHT = Math.round(LOGO_WIDTH / LOGO_ASPECT_RATIO);

const SCALE_DURATION_MS = 520;
const FADE_DURATION_MS = 300;
const SLOW_LOAD_INDICATOR_DELAY_MS = 2500;
const SAFETY_TIMEOUT_MS = 5000;

interface Props {
  /** Fired when app resources and navigation tree are ready */
  isReady?: boolean;
  /** Fired when launch animation is fully complete and overlay can unmount */
  onFinish: () => void;
  /** Fired on first rendered frame so native splash can be hidden seamlessly */
  onStart?: () => void;
}

/**
 * Premium, modern launch experience for Khamark.
 *
 * Provides a pixel-identical handoff from native launch screen (solid #A61920
 * with centered white Khamark Global logo) followed by a restrained, subtle
 * scale ease (1.0 -> 1.03) and seamless fade transition into the app shell.
 */
const AnimatedLogoSplash: React.FC<Props> = ({ isReady = true, onFinish, onStart }) => {
  const reducedMotionReanimated = useReducedMotion();
  const [reducedMotionSetting, setReducedMotionSetting] = useState(false);
  const [showSlowLoader, setShowSlowLoader] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);

  // Animation values: initial state matches native splash identically
  const scale = useSharedValue(1.0);
  const screenOpacity = useSharedValue(1.0);

  const scaleDoneRef = useRef(false);
  const isReadyRef = useRef(isReady);
  isReadyRef.current = isReady;

  const finishedRef = useRef(false);
  const safeFinish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinish();
  }, [onFinish]);

  // Check system accessibility reduced-motion
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => setReducedMotionSetting(enabled))
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReducedMotionSetting(enabled);
    });
    return () => sub?.remove?.();
  }, []);

  const prefersReducedMotion = reducedMotionReanimated || reducedMotionSetting;

  // Trigger fade out once both scale animation and app shell ready
  const triggerExitTransition = useCallback(() => {
    if (finishedRef.current) return;
    setIsFadingOut(true);

    screenOpacity.value = withTiming(
      0,
      {
        duration: FADE_DURATION_MS,
        easing: Easing.out(Easing.quad),
      },
      (finished) => {
        if (finished) {
          runOnJS(safeFinish)();
        }
      }
    );
  }, [screenOpacity, safeFinish]);

  const handleScaleComplete = useCallback(() => {
    scaleDoneRef.current = true;
    if (isReadyRef.current) {
      triggerExitTransition();
    }
  }, [triggerExitTransition]);

  // When isReady becomes true later, transition if scale is already done
  useEffect(() => {
    if (isReady && scaleDoneRef.current) {
      triggerExitTransition();
    }
  }, [isReady, triggerExitTransition]);

  // Startup animation orchestration
  useEffect(() => {
    // 1. Immediately dismiss native splash on the first ready frame
    onStart?.();

    // 2. Animate logo: subtle scale ease 1.0 -> 1.03 over 520ms
    if (prefersReducedMotion) {
      scale.value = 1.0;
      handleScaleComplete();
    } else {
      scale.value = withTiming(
        1.03,
        {
          duration: SCALE_DURATION_MS,
          easing: Easing.out(Easing.cubic),
        },
        (finished) => {
          if (finished) {
            runOnJS(handleScaleComplete)();
          }
        }
      );
    }

    // 3. Fallback: if startup takes longer than 2.5s, display understated loader
    const slowTimer = setTimeout(() => {
      if (!isReadyRef.current && !finishedRef.current) {
        setShowSlowLoader(true);
      }
    }, SLOW_LOAD_INDICATOR_DELAY_MS);

    // 4. Safety timeout: never trap user on splash screen
    const safetyTimer = setTimeout(() => {
      if (!finishedRef.current) {
        safeFinish();
      }
    }, SAFETY_TIMEOUT_MS);

    return () => {
      clearTimeout(slowTimer);
      clearTimeout(safetyTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefersReducedMotion]);

  const screenAnimatedStyle = useAnimatedStyle(() => ({
    opacity: screenOpacity.value,
  }));

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[styles.container, screenAnimatedStyle]}
      pointerEvents={isFadingOut ? 'none' : 'auto'}
      accessible={true}
      accessibilityRole="image"
      accessibilityLabel="Khamark"
      accessibilityViewIsModal={!isFadingOut}
      importantForAccessibility={isFadingOut ? 'no' : 'yes'}
    >
      <View style={styles.center}>
        <Animated.View style={logoAnimatedStyle}>
          <Image
            source={require('../../assets/images/khamark_logo_white.png')}
            style={styles.logo}
            contentFit="contain"
            transition={0}
            cachePolicy="memory-disk"
            priority="high"
          />
        </Animated.View>

        {showSlowLoader && (
          <View style={styles.loaderContainer}>
            <ActivityIndicator
              size="small"
              color="#FFFFFF"
              accessibilityLabel="Loading application"
            />
          </View>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#A61920', // Khamark Crimson
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: LOGO_WIDTH,
    height: LOGO_HEIGHT,
  },
  loaderContainer: {
    marginTop: 28,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default AnimatedLogoSplash;
