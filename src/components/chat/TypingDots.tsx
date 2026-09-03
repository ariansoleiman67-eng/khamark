import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';

/**
 * Three dots breathing in sequence.
 *
 * Replaces a string that grew '.' → '..' → '...' on a 400ms setState, which
 * re-rendered the message row and reflowed the list on every tick. This animates
 * opacity on the native driver instead, so the JS thread does nothing while it
 * runs — which matters, because it runs exactly while the JS thread is busy
 * appending streamed text.
 */
const TypingDots: React.FC<{ color: string }> = ({ color }) => {
  const a = useRef(new Animated.Value(0.35)).current;
  const b = useRef(new Animated.Value(0.35)).current;
  const c = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const dots = [a, b, c];
    const animations = dots.map((value, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(value, {
            toValue: 1,
            duration: 320,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0.35,
            duration: 320,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay((2 - i) * 160),
        ]),
      ),
    );

    animations.forEach(animation => animation.start());
    return () => animations.forEach(animation => animation.stop());
  }, [a, b, c]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 22 }}>
      {[a, b, c].map((value, i) => (
        <Animated.View
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: color,
            opacity: value,
            marginRight: i < 2 ? 4 : 0,
          }}
        />
      ))}
    </View>
  );
};

export default React.memo(TypingDots);
