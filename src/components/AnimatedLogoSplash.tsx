import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  withSpring,
  runOnJS,
  Easing,
} from 'react-native-reanimated';

const { width: SCREEN_W } = Dimensions.get('window');
const LOGO_SIZE = Math.min(SCREEN_W * 0.42, 190);

// Total time on screen before handing off to the app. Kept short on purpose —
// this replaces a ~5s intro video; the logo is drawn on the first frame and the
// motion is pure UI-thread Reanimated, so nothing here delays startup.
const HOLD_MS = 420;

interface Props {
  onFinish: () => void;
  /** Fired as soon as the logo is on screen, so the native splash can be hidden. */
  onStart?: () => void;
}

/**
 * Instant branded splash: the logo is visible immediately (no video decode, no
 * network), then plays a quick scale-in + shine and fades out. Replaces the old
 * video splash, which cost several seconds of startup.
 */
const AnimatedLogoSplash: React.FC<Props> = ({ onFinish, onStart }) => {
  const scale = useSharedValue(0.72);
  const logoOpacity = useSharedValue(0);
  const ringScale = useSharedValue(0.6);
  const ringOpacity = useSharedValue(0);
  const screenOpacity = useSharedValue(1);

  useEffect(() => {
    onStart?.();

    // Logo: fade + spring pop.
    logoOpacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
    scale.value = withSequence(
      withSpring(1.06, { damping: 9, stiffness: 170 }),
      withSpring(1, { damping: 14, stiffness: 160 }),
    );

    // Halo ring pulsing outward behind the logo.
    ringOpacity.value = withSequence(
      withTiming(0.5, { duration: 200 }),
      withDelay(120, withTiming(0, { duration: 380 })),
    );
    ringScale.value = withTiming(1.5, { duration: 700, easing: Easing.out(Easing.cubic) });

    // Fade the whole screen out, then hand off.
    screenOpacity.value = withDelay(
      HOLD_MS,
      withTiming(0, { duration: 260, easing: Easing.inOut(Easing.quad) }, (finished) => {
        if (finished) runOnJS(onFinish)();
      }),
    );
    // Mount-only: the animation drives itself to completion and calls onFinish.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const screenStyle = useAnimatedStyle(() => ({ opacity: screenOpacity.value }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: scale.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));

  return (
    <Animated.View style={[styles.container, screenStyle]} pointerEvents="none">
      <View style={styles.center}>
        <Animated.View style={[styles.ring, ringStyle]} />
        <Animated.View style={logoStyle}>
          <Image
            source={require('../../assets/images/khamark_logo.png')}
            style={styles.logo}
            contentFit="contain"
            // Decode from the bundle synchronously — no fade-in delay.
            transition={0}
            cachePolicy="memory-disk"
          />
        </Animated.View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: LOGO_SIZE * 1.35,
    height: LOGO_SIZE * 1.35,
    borderRadius: LOGO_SIZE,
    borderWidth: 2,
    borderColor: '#A61920',
  },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE },
});

export default AnimatedLogoSplash;
