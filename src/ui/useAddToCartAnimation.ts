/**
 * Add to Cart Animation Hook
 * 
 * Provides reusable animations for:
 * - Button press feedback (scale down/up)
 * - Cart badge pop (spring animation)
 * 
 * Usage:
 * 1. Button: Wrap in Animated.View with transform: [{ scale: pressScale }]
 * 2. Badge: Wrap cart count in Animated.View with transform: [{ scale: badgeScale }]
 * 
 * This matches Alibaba/Amazon UX pattern without heavy fly-to-cart animations.
 */

import { useRef } from 'react';
import { Animated } from 'react-native';

export function useAddToCartAnimation() {
  // Button press feedback
  const pressScale = useRef(new Animated.Value(1)).current;

  const animatePress = () => {
    Animated.sequence([
      Animated.timing(pressScale, {
        toValue: 0.96,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(pressScale, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // Cart badge pop
  const badgeScale = useRef(new Animated.Value(1)).current;

  const animateBadge = () => {
    Animated.sequence([
      Animated.spring(badgeScale, {
        toValue: 1.25,
        useNativeDriver: true,
      }),
      Animated.spring(badgeScale, {
        toValue: 1,
        useNativeDriver: true,
      }),
    ]).start();
  };

  return {
    pressScale,
    badgeScale,
    animatePress,
    animateBadge,
  };
}

export default useAddToCartAnimation;
