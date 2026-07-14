import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { TextOverlay as TextOverlayType } from '../state/editorTypes';

interface Props {
  overlay: TextOverlayType;
}

export function TextOverlay({ overlay }: Props) {
  return (
    <Text allowFontScaling={false} style={[styles.text, { color: overlay.color }]}>
      {overlay.text}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 32, // Base scale size
    fontWeight: 'bold',
    fontFamily: 'System',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
