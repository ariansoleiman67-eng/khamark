import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, runOnJS } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ImageRect, CropRect, Size } from '../state/editorTypes';
import { screenToImagePoint } from '../services/coordinateMath';
import { clamp } from '../utils/clamp';

interface Props {
  displayedImageRect: ImageRect;
  workingImageSize: Size;
  onApplyCrop: (crop: CropRect) => void;
  onRotate?: () => void;
  onCancel: () => void;
}

const MIN_CROP_SIZE = 60;
const CORNER_SIZE = 24;
const CORNER_THICKNESS = 4;

export function CropOverlay({ displayedImageRect, workingImageSize, onApplyCrop, onRotate, onCancel }: Props) {
  // Start with full image bounds
  const x = useSharedValue(displayedImageRect.x);
  const y = useSharedValue(displayedImageRect.y);
  const width = useSharedValue(displayedImageRect.width);
  const height = useSharedValue(displayedImageRect.height);

  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const savedWidth = useSharedValue(0);
  const savedHeight = useSharedValue(0);

  const saveValues = () => {
    'worklet';
    savedX.value = x.value;
    savedY.value = y.value;
    savedWidth.value = width.value;
    savedHeight.value = height.value;
  };

  // --- GESTURES ---

  const panCenter = Gesture.Pan()
    .onStart(saveValues)
    .onUpdate((e) => {
      // Move box but clamp to image bounds
      const nextX = clamp(savedX.value + e.translationX, displayedImageRect.x, displayedImageRect.x + displayedImageRect.width - savedWidth.value);
      const nextY = clamp(savedY.value + e.translationY, displayedImageRect.y, displayedImageRect.y + displayedImageRect.height - savedHeight.value);
      x.value = nextX;
      y.value = nextY;
    });

  const panTopLeft = Gesture.Pan()
    .onStart(saveValues)
    .onUpdate((e) => {
      const maxDx = savedWidth.value - MIN_CROP_SIZE;
      const maxDy = savedHeight.value - MIN_CROP_SIZE;
      const dx = clamp(e.translationX, displayedImageRect.x - savedX.value, maxDx);
      const dy = clamp(e.translationY, displayedImageRect.y - savedY.value, maxDy);

      x.value = savedX.value + dx;
      y.value = savedY.value + dy;
      width.value = savedWidth.value - dx;
      height.value = savedHeight.value - dy;
    });

  const panTopRight = Gesture.Pan()
    .onStart(saveValues)
    .onUpdate((e) => {
      const minDx = MIN_CROP_SIZE - savedWidth.value;
      const maxDy = savedHeight.value - MIN_CROP_SIZE;
      const dx = clamp(e.translationX, minDx, displayedImageRect.x + displayedImageRect.width - (savedX.value + savedWidth.value));
      const dy = clamp(e.translationY, displayedImageRect.y - savedY.value, maxDy);

      y.value = savedY.value + dy;
      width.value = savedWidth.value + dx;
      height.value = savedHeight.value - dy;
    });

  const panBottomLeft = Gesture.Pan()
    .onStart(saveValues)
    .onUpdate((e) => {
      const maxDx = savedWidth.value - MIN_CROP_SIZE;
      const minDy = MIN_CROP_SIZE - savedHeight.value;
      const dx = clamp(e.translationX, displayedImageRect.x - savedX.value, maxDx);
      const dy = clamp(e.translationY, minDy, displayedImageRect.y + displayedImageRect.height - (savedY.value + savedHeight.value));

      x.value = savedX.value + dx;
      width.value = savedWidth.value - dx;
      height.value = savedHeight.value + dy;
    });

  const panBottomRight = Gesture.Pan()
    .onStart(saveValues)
    .onUpdate((e) => {
      const minDx = MIN_CROP_SIZE - savedWidth.value;
      const minDy = MIN_CROP_SIZE - savedHeight.value;
      const dx = clamp(e.translationX, minDx, displayedImageRect.x + displayedImageRect.width - (savedX.value + savedWidth.value));
      const dy = clamp(e.translationY, minDy, displayedImageRect.y + displayedImageRect.height - (savedY.value + savedHeight.value));

      width.value = savedWidth.value + dx;
      height.value = savedHeight.value + dy;
    });

  // --- STYLES ---

  const boxStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: x.value,
    top: y.value,
    width: width.value,
    height: height.value,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
  }));

  const maskTop = useAnimatedStyle(() => ({
    position: 'absolute', top: 0, left: 0, right: 0, height: y.value,
    backgroundColor: 'rgba(0,0,0,0.85)'
  }));
  const maskBottom = useAnimatedStyle(() => ({
    position: 'absolute', top: y.value + height.value, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)'
  }));
  const maskLeft = useAnimatedStyle(() => ({
    position: 'absolute', top: y.value, left: 0, width: x.value, height: height.value,
    backgroundColor: 'rgba(0,0,0,0.85)'
  }));
  const maskRight = useAnimatedStyle(() => ({
    position: 'absolute', top: y.value, left: x.value + width.value, right: 0, height: height.value,
    backgroundColor: 'rgba(0,0,0,0.85)'
  }));

  const handleDone = () => {
    // Map screen crop box back to image-space pixels
    const topLeftImagePoint = screenToImagePoint({ x: x.value, y: y.value }, displayedImageRect, workingImageSize);
    const bottomRightScreenPt = { x: x.value + width.value, y: y.value + height.value };
    const bottomRightImagePoint = screenToImagePoint(bottomRightScreenPt, displayedImageRect, workingImageSize);

    const finalCropRect: CropRect = {
      x: clamp(topLeftImagePoint.x, 0, workingImageSize.width),
      y: clamp(topLeftImagePoint.y, 0, workingImageSize.height),
      width: clamp(bottomRightImagePoint.x - topLeftImagePoint.x, 1, workingImageSize.width),
      height: clamp(bottomRightImagePoint.y - topLeftImagePoint.y, 1, workingImageSize.height),
    };

    onApplyCrop(finalCropRect);
  };

  const insets = useSafeAreaInsets();

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* 4 Masks for the dark backdrop outside crop box */}
      <Animated.View style={maskTop} />
      <Animated.View style={maskBottom} />
      <Animated.View style={maskLeft} />
      <Animated.View style={maskRight} />

      {/* The visible crop box */}
      <GestureDetector gesture={panCenter}>
        <Animated.View style={boxStyle}>
          {/* Faint internal grid lines like WhatsApp */}
          <View style={styles.gridVertical} />
          <View style={styles.gridHorizontal} />

          {/* Corners */}
          <GestureDetector gesture={panTopLeft}>
            <View style={[styles.cornerHitbox, { top: -20, left: -20 }]}>
              <View style={[styles.cornerTL, styles.cornerVisual]} />
            </View>
          </GestureDetector>
          
          <GestureDetector gesture={panTopRight}>
            <View style={[styles.cornerHitbox, { top: -20, right: -20 }]}>
              <View style={[styles.cornerTR, styles.cornerVisual]} />
            </View>
          </GestureDetector>

          <GestureDetector gesture={panBottomLeft}>
            <View style={[styles.cornerHitbox, { bottom: -20, left: -20 }]}>
              <View style={[styles.cornerBL, styles.cornerVisual]} />
            </View>
          </GestureDetector>

          <GestureDetector gesture={panBottomRight}>
            <View style={[styles.cornerHitbox, { bottom: -20, right: -20 }]}>
              <View style={[styles.cornerBR, styles.cornerVisual]} />
            </View>
          </GestureDetector>
        </Animated.View>
      </GestureDetector>

      {/* Dotted curve rotation UI (Static Placeholder for aesthetic match to screenshot) */}
      <View style={styles.dialContainer} pointerEvents="none">
         <Text allowFontScaling={false} style={{color: 'rgba(255,255,255,0.7)', fontSize: 10, letterSpacing: 4}}>
           -30 -20 -10  0  10  20  30
         </Text>
         <View style={styles.dialTriangle} />
      </View>

      {/* Bottom Interface mimicking WhatsApp Exact layout */}
      <View style={[styles.footerWrap, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.toolsRow}>
          <TouchableOpacity style={styles.iconBtn} onPress={onRotate}>
            <Ionicons name="refresh" size={24} color="#fff" style={{ transform: [{ scaleX: -1 }]}} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => {
            const size = Math.min(displayedImageRect.width, displayedImageRect.height);
            x.value = displayedImageRect.x + (displayedImageRect.width - size) / 2;
            y.value = displayedImageRect.y + (displayedImageRect.height - size) / 2;
            width.value = size;
            height.value = size;
          }}>
            <Ionicons name="apps-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.textBtn} onPress={onCancel}>
            <Text allowFontScaling={false} style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.textBtn} onPress={handleDone}>
            <Text allowFontScaling={false} style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cornerHitbox: {
    position: 'absolute',
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10, // Ensure corners catch touch events above center pan
  },
  cornerVisual: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: '#fff',
  },
  cornerTL: {
    top: 20, left: 20,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
  },
  cornerTR: {
    top: 20, right: 20,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
  },
  cornerBL: {
    bottom: 20, left: 20,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
  },
  cornerBR: {
    bottom: 20, right: 20,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
  },
  gridVertical: {
    position: 'absolute', left: '33.33%', right: '33.33%', top: 0, bottom: 0,
    borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  gridHorizontal: {
    position: 'absolute', top: '33.33%', bottom: '33.33%', left: 0, right: 0,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  dialContainer: {
    position: 'absolute',
    bottom: 120, // Above tools row
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  dialTriangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#fff',
    marginTop: 4,
  },
  footerWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1E1E1E', // Very dark grey/black
  },
  toolsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  iconBtn: {
    padding: 10,
  },
  textBtn: {
    padding: 10,
  },
  cancelText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '400',
  },
  doneText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
