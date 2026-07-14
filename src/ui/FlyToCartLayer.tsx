/**
 * Fly-to-Cart Animation Layer
 * 
 * Alibaba/Shopee style animation where product thumbnail flies from product to cart.
 * 
 * Usage:
 * 1. Mount <FlyToCartLayer /> once in App.tsx (above everything)
 * 2. Call flyToCart(imageUri, startX, startY, targetX, targetY) from any add-to-cart button
 */

import React, { useRef, useState } from 'react';
import { Animated, StyleSheet, Dimensions, Easing } from 'react-native';
import { Image } from 'expo-image';

// Global trigger function
let triggerFly: ((img: string, sx: number, sy: number, tx: number, ty: number) => void) | null = null;

// Fixed cart target using screen coordinates
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const CART_TARGET_X = screenWidth * 0.5;
const CART_TARGET_Y = screenHeight - 90;

export function FlyToCartLayer() {
  const x = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const [image, setImage] = useState<string | null>(null);

  triggerFly = (img: string, sx: number, sy: number, tx: number, ty: number) => {
    setImage(img);
    x.setValue(sx);
    y.setValue(sy);
    scale.setValue(1);
    opacity.setValue(1);

    // Phase 1: Small lift (pop effect)
    Animated.spring(scale, {
      toValue: 1.15,
      speed: 20,
      bounciness: 4,
      useNativeDriver: true,
    }).start(() => {
      // Phase 2: Fly to cart with shrink and fade
      Animated.parallel([
        Animated.timing(x, {
          toValue: tx,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(y, {
          toValue: ty,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.5,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => setImage(null));
    });
  };

  if (!image) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.fly,
        {
          opacity,
          transform: [
            { translateX: x },
            { translateY: y },
            { scale },
          ],
        },
      ]}
    >
      <Image 
        source={{ uri: image }} 
        style={styles.image}
        contentFit="cover"
      />
    </Animated.View>
  );
}

/**
 * Trigger fly-to-cart animation with product image
 * @param imageUri - Product image URL
 * @param startX - X position of the add button
 * @param startY - Y position of the add button
 * @param targetX - X position of cart (optional, uses default)
 * @param targetY - Y position of cart (optional, uses default)
 */
export function flyToCart(
  imageUri: string,
  startX: number,
  startY: number,
  targetX?: number,
  targetY?: number,
) {
  const tx = targetX ?? CART_TARGET_X;
  const ty = targetY ?? CART_TARGET_Y;
  triggerFly?.(imageUri, startX, startY, tx, ty);
}

const styles = StyleSheet.create({
  fly: {
    elevation: 100,
    height: 40,
    position: 'absolute',
    width: 40,
    zIndex: 9999,
  },
  image: {
    borderRadius: 8,
    height: '100%',
    width: '100%',
  },
});

export default FlyToCartLayer;
