import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Canvas, Path, Shadow, Skia } from '@shopify/react-native-skia';
import { SharedValue, useDerivedValue } from 'react-native-reanimated';

interface CurvedTabBarBackgroundProps {
  width: number;
  height: number;
  cx: SharedValue<number> | number;
  color: string;
  shadowColor?: string;
  strokeColor?: string;
}

/**
 * Computes a mathematically smooth C1-continuous curved cutout path for the floating tab bar.
 * The cutout dips down in a concave cradle around the raised active button with an even gap,
 * blended with smooth convex fillet shoulders on each side.
 */
export const createCurvedBarPath = (W: number, H: number, cx: number): string => {
  'worklet';
  if (W <= 0 || H <= 0) return 'M 0 0 Z';
  const R = 20; // Outer corner radius of the bar
  const r_btn = 26; // Raised button radius (52 diameter)
  const gap = 6; // Even gap between circle and cutout cradle
  const R_c = r_btn + gap; // 32 cradle radius
  const cy_c = 10; // Raised button vertical center offset
  const r_s = 6; // Shoulder fillet radius

  // Tangent transition calculation:
  const dy = r_s - cy_c;
  const dist = R_c + r_s;
  const dx = Math.sqrt(Math.max(0, dist * dist - dy * dy));

  // Clamped horizontal endpoints for the cutout
  const x1 = Math.max(R, cx - dx);
  const x2 = Math.min(W - R, cx + dx);

  // Tangent point coordinates
  const p_tan_lx = cx - dx + r_s * (dx / dist);
  const p_tan_ly = r_s + r_s * ((cy_c - r_s) / dist);
  const p_tan_rx = cx + (cx - p_tan_lx);
  const p_tan_ry = p_tan_ly;

  return (
    `M ${R} 0 ` +
    `L ${x1.toFixed(2)} 0 ` +
    `A ${r_s} ${r_s} 0 0 1 ${p_tan_lx.toFixed(2)} ${p_tan_ly.toFixed(2)} ` +
    `A ${R_c} ${R_c} 0 0 0 ${p_tan_rx.toFixed(2)} ${p_tan_ry.toFixed(2)} ` +
    `A ${r_s} ${r_s} 0 0 1 ${x2.toFixed(2)} 0 ` +
    `L ${(W - R).toFixed(2)} 0 ` +
    `A ${R} ${R} 0 0 1 ${W} ${R} ` +
    `L ${W} ${(H - R).toFixed(2)} ` +
    `A ${R} ${R} 0 0 1 ${(W - R).toFixed(2)} ${H} ` +
    `L ${R} ${H} ` +
    `A ${R} ${R} 0 0 1 0 ${(H - R).toFixed(2)} ` +
    `L 0 ${R} ` +
    `A ${R} ${R} 0 0 1 ${R} 0 Z`
  );
};

export const CurvedTabBarBackground: React.FC<CurvedTabBarBackgroundProps> = ({
  width,
  height,
  cx,
  color,
  shadowColor = 'rgba(0, 0, 0, 0.08)',
  strokeColor,
}) => {
  const isShared = typeof cx === 'object' && cx !== null && 'value' in cx;

  const path = useDerivedValue(() => {
    if (width <= 0 || height <= 0) return Skia.Path.Make();
    const currentCx = isShared ? (cx as SharedValue<number>).value : (cx as number);
    const svgStr = createCurvedBarPath(width, height, currentCx);
    const p = Skia.Path.MakeFromSVGString(svgStr);
    return p ?? Skia.Path.Make();
  }, [width, height, cx]);

  if (width <= 0 || height <= 0) {
    return null;
  }

  return (
    <View style={styles.container} pointerEvents="none">
      <Canvas style={{ width, height: height + 24 }}>
        <Path path={path} color={color}>
          <Shadow dx={0} dy={6} blur={14} color={shadowColor} />
        </Path>
        {strokeColor ? (
          <Path path={path} color={strokeColor} style="stroke" strokeWidth={1} />
        ) : null}
      </Canvas>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'visible',
  },
});

export default CurvedTabBarBackground;
