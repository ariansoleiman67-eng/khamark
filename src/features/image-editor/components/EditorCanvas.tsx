import React, { useMemo, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, GestureResponderEvent } from 'react-native';
import { Canvas, Image as SkiaImage, useImage, Path as SkiaPath, Skia } from '@shopify/react-native-skia';
import { EditorState, Stroke, Point } from '../state/editorTypes';
import { useCanvasLayout } from '../hooks/useCanvasLayout';
import { screenToImagePoint, imageToScreenPoint } from '../services/coordinateMath';
import { generateId } from '../utils/generateId';

interface Props {
  state: EditorState;
  setDisplayedImageRect: (rect: any) => void;
  // actions
  addStroke: (stroke: Stroke) => void;
  pushHistory: () => void;
}

/**
 * Build a smooth cubic-Bézier SVG path from an array of screen-space points.
 * This produces the silky "pen" feel seen in WhatsApp / iOS Markup editors
 * instead of the jagged straight-line segments of simple lineTo().
 */
function buildSmoothPath(points: Point[], displayedImageRect: any, workingImageSize: any) {
  const path = Skia.Path.Make();
  if (points.length === 0) return path;

  // Convert first point
  const p0 = imageToScreenPoint(points[0], displayedImageRect, workingImageSize);
  path.moveTo(p0.x, p0.y);

  if (points.length === 1) {
    // Single point — draw a tiny circle so it's visible as a dot
    path.addCircle(p0.x, p0.y, 1);
    return path;
  }

  if (points.length === 2) {
    const p1 = imageToScreenPoint(points[1], displayedImageRect, workingImageSize);
    path.lineTo(p1.x, p1.y);
    return path;
  }

  // For 3+ points, use quadratic Bézier curves through midpoints
  // This is the algorithm used by Apple Pencil / WhatsApp drawing:
  //   For each pair of consecutive points, use the actual point as a control
  //   point and the midpoint between consecutive points as the curve endpoint.
  for (let i = 1; i < points.length - 1; i++) {
    const prev = imageToScreenPoint(points[i], displayedImageRect, workingImageSize);
    const next = imageToScreenPoint(points[i + 1], displayedImageRect, workingImageSize);

    // Midpoint between current and next = the curve passes through here
    const midX = (prev.x + next.x) / 2;
    const midY = (prev.y + next.y) / 2;

    // Quadratic Bézier: control point is the actual touch point, endpoint is midpoint
    path.quadTo(prev.x, prev.y, midX, midY);
  }

  // Connect to the very last point
  const last = imageToScreenPoint(points[points.length - 1], displayedImageRect, workingImageSize);
  path.lineTo(last.x, last.y);

  return path;
}

export function EditorCanvas({ state, setDisplayedImageRect, addStroke, pushHistory }: Props) {
  const skImage = useImage(state.workingImageUri);
  const { onLayout, containerSize } = useCanvasLayout(state.workingImageSize, setDisplayedImageRect);

  const activeStrokeRef = useRef<Stroke | null>(null);
  // Force re-renders during active drawing for live feedback
  const [drawTick, setDrawTick] = useState(0);

  const handleTouchStart = useCallback((e: GestureResponderEvent) => {
    if (state.mode !== 'draw' || !state.displayedImageRect) return;

    const pt = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };

    if (
      pt.x < state.displayedImageRect.x ||
      pt.x > state.displayedImageRect.x + state.displayedImageRect.width ||
      pt.y < state.displayedImageRect.y ||
      pt.y > state.displayedImageRect.y + state.displayedImageRect.height
    ) {
      return;
    }

    const mappedPoint = screenToImagePoint(pt, state.displayedImageRect, state.workingImageSize);

    activeStrokeRef.current = {
      id: generateId(),
      color: state.activeColor,
      width: 6,  // Thinner, more pen-like stroke
      points: [mappedPoint],
    };
    setDrawTick(t => t + 1);
  }, [state.mode, state.displayedImageRect, state.workingImageSize, state.activeColor]);

  const handleTouchMove = useCallback((e: GestureResponderEvent) => {
    if (!activeStrokeRef.current || state.mode !== 'draw' || !state.displayedImageRect) return;
    const pt = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
    const mappedPoint = screenToImagePoint(pt, state.displayedImageRect, state.workingImageSize);
    activeStrokeRef.current.points.push(mappedPoint);
    // Trigger re-render for live stroke feedback
    setDrawTick(t => t + 1);
  }, [state.mode, state.displayedImageRect, state.workingImageSize]);

  const handleTouchEnd = useCallback(() => {
    if (activeStrokeRef.current && activeStrokeRef.current.points.length > 0) {
      addStroke(activeStrokeRef.current);
      pushHistory();
    }
    activeStrokeRef.current = null;
    setDrawTick(t => t + 1);
  }, [addStroke, pushHistory]);

  // Committed strokes → rendered as smooth Bézier paths
  const renderedPaths = useMemo(() => {
    if (!state.displayedImageRect) return [];

    return state.strokes.map((stroke) => ({
      path: buildSmoothPath(stroke.points, state.displayedImageRect, state.workingImageSize),
      color: stroke.color,
      width: stroke.width,
    }));
  }, [state.strokes, state.displayedImageRect, state.workingImageSize]);

  // Active (live) stroke — also rendered as smooth Bézier
  const activePath = useMemo(() => {
    if (!state.displayedImageRect || !activeStrokeRef.current || activeStrokeRef.current.points.length === 0) return null;

    return {
      path: buildSmoothPath(activeStrokeRef.current.points, state.displayedImageRect, state.workingImageSize),
      color: activeStrokeRef.current.color,
      width: activeStrokeRef.current.width,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawTick, state.displayedImageRect, state.workingImageSize]);

  return (
    <View 
      style={styles.container} 
      onLayout={onLayout}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {containerSize && skImage && state.displayedImageRect && (
        <Canvas style={styles.canvas} pointerEvents="none">
          <SkiaImage
            image={skImage}
            x={state.displayedImageRect.x}
            y={state.displayedImageRect.y}
            width={state.displayedImageRect.width}
            height={state.displayedImageRect.height}
            fit="fill"
          />
          
          {/* Committed strokes — smooth Bézier curves */}
          {renderedPaths.map((rp, index) => (
            <SkiaPath
              key={index}
              path={rp.path}
              style="stroke"
              strokeWidth={rp.width}
              color={rp.color}
              strokeCap="round"
              strokeJoin="round"
              antiAlias={true}
            />
          ))}

          {/* Live active stroke — renders in real-time as you drag */}
          {activePath && (
            <SkiaPath
              path={activePath.path}
              style="stroke"
              strokeWidth={activePath.width}
              color={activePath.color}
              strokeCap="round"
              strokeJoin="round"
              antiAlias={true}
            />
          )}
        </Canvas>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  canvas: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
});
