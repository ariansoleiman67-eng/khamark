import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  canUndo: boolean;
  onUndo: () => void;
  onCancel: () => void;
  onDone: () => void;
}

export function EditorHeader({ canUndo, onUndo, onCancel, onDone }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) }]}>
      <TouchableOpacity style={styles.button} onPress={onCancel}>
        <Ionicons name="close" size={28} color="#fff" />
      </TouchableOpacity>
      
      <View style={styles.centerGroup}>
        <TouchableOpacity 
          style={[styles.button, !canUndo && { opacity: 0.3 }]} 
          onPress={onUndo} 
          disabled={!canUndo}
        >
          <Ionicons name="arrow-undo" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.doneButton} onPress={onDone}>
        <Text allowFontScaling={false} style={styles.doneText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.8)',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  centerGroup: {
    flexDirection: 'row',
    gap: 20,
  },
  button: {
    padding: 8,
  },
  doneButton: {
    backgroundColor: '#25D366', // WhatsApp Green
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  doneText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
