import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';

interface Props {
  activeColor: string;
  onSelectColor: (color: string) => void;
}

const COLORS = ['#FFFFFF', '#000000', '#FF3B30', '#FF9500', '#FFCC00', '#4CD964', '#5AC8FA', '#007AFF', '#5856D6'];

export function ColorPicker({ activeColor, onSelectColor }: Props) {
  return (
    <View style={styles.container}>
      {COLORS.map((color) => (
        <TouchableOpacity
          key={color}
          style={[
            styles.swatch,
            { backgroundColor: color },
            activeColor === color && styles.selected,
          ]}
          onPress={() => onSelectColor(color)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  swatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selected: {
    borderColor: '#fff',
    transform: [{ scale: 1.2 }],
  },
});
