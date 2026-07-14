import React from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, runOnJS } from 'react-native-reanimated';
import { Overlay, ImageRect, Size } from '../state/editorTypes';
import { screenToImagePoint, imageToScreenPoint } from '../services/coordinateMath';

interface Props {
  overlay: Overlay;
  displayedImageRect: ImageRect | null;
  workingImageSize: Size;
  isActive: boolean;
  onUpdate: (id: string, updates: Partial<Overlay>) => void;
  onActivate: (id: string) => void;
  children: React.ReactNode;
}

export function OverlayWrapper({
  overlay,
  displayedImageRect,
  workingImageSize,
  isActive,
  onUpdate,
  onActivate,
  children,
}: Props) {
  // Convert image-space coordinates to live screen-space for smooth 60fps interaction
  const initialScreenPos = displayedImageRect 
    ? imageToScreenPoint({ x: overlay.x, y: overlay.y }, displayedImageRect, workingImageSize)
    : { x: 0, y: 0 };

  const translateX = useSharedValue(initialScreenPos.x);
  const translateY = useSharedValue(initialScreenPos.y);
  const scale = useSharedValue(overlay.scale);
  const rotation = useSharedValue(overlay.rotation);

  // Sync back from props when state is updated elsewhere (e.g. undo or crop)
  React.useEffect(() => {
    if (displayedImageRect) {
      const sp = imageToScreenPoint({ x: overlay.x, y: overlay.y }, displayedImageRect, workingImageSize);
      translateX.value = sp.x;
      translateY.value = sp.y;
      scale.value = overlay.scale;
      rotation.value = overlay.rotation;
    }
  }, [overlay, displayedImageRect, workingImageSize]);

  // Gestures
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedRotation = useSharedValue(0);

  // Commit function called when gesture ends
  const commitTransform = () => {
    if (!displayedImageRect) return;

    // Convert screen coordinates back into permanent image-space coordinates
    const mappedPoint = screenToImagePoint(
      { x: translateX.value, y: translateY.value },
      displayedImageRect,
      workingImageSize
    );

    onUpdate(overlay.id, {
      x: mappedPoint.x,
      y: mappedPoint.y,
      scale: scale.value,
      rotation: rotation.value,
    });
  };

  const panGesture = Gesture.Pan()
    .onStart(() => {
      runOnJS(onActivate)(overlay.id);
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      runOnJS(commitTransform)();
    });

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      runOnJS(onActivate)(overlay.id);
      savedScale.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      runOnJS(commitTransform)();
    });

  const rotationGesture = Gesture.Rotation()
    .onStart(() => {
      runOnJS(onActivate)(overlay.id);
      savedRotation.value = rotation.value;
    })
    .onUpdate((e) => {
      rotation.value = savedRotation.value + e.rotation;
    })
    .onEnd(() => {
      runOnJS(commitTransform)();
    });

  const composedGesture = Gesture.Simultaneous(panGesture, pinchGesture, rotationGesture);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      position: 'absolute',
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
        { rotate: `${rotation.value}rad` },
      ],
      // Center translation on origin rather than corner, so visually offset by -50% later
    };
  });

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={[animatedStyle, { zIndex: isActive ? 100 : 10 }]}>
        <View style={{
          borderWidth: isActive ? 1 : 0,
          borderColor: 'rgba(255,255,255,0.5)',
          padding: 8,
          transform: [{ translateX: '-50%' }, { translateY: '-50%' }] // visually center on gesture point
        }}>
          {children}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}
