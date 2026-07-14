import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EditorMode } from '../state/editorTypes';
import { ColorPicker } from './ColorPicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  mode: EditorMode;
  setMode: (mode: EditorMode) => void;
  activeColor: string;
  setActiveColor: (color: string) => void;
}

export function EditorToolbar({ mode, setMode, activeColor, setActiveColor }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      {/* Show Color Picker if in preview mode OR draw mode */}
      {(mode === 'preview' || mode === 'draw') && (
        <ColorPicker activeColor={activeColor} onSelectColor={setActiveColor} />
      )}

      {/* Toolbox */}
      <View style={styles.toolbox}>
        <TouchableOpacity
          style={styles.toolBtn}
          onPress={() => setMode(mode === 'crop' ? 'preview' : 'crop')}
        >
          <Ionicons name="crop" size={26} color={mode === 'crop' ? '#25D366' : '#fff'} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.toolBtn}
          onPress={() => setMode('text')} // Mode immediately switches back to preview after text is added via Modal
        >
          <Ionicons name="text" size={28} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.toolBtn}
          onPress={() => setMode(mode === 'draw' ? 'preview' : 'draw')}
        >
          <Ionicons name="pencil" size={26} color={mode === 'draw' ? '#25D366' : '#fff'} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    zIndex: 10,
  },
  toolbox: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingVertical: 12,
  },
  toolBtn: {
    padding: 10,
  },
});
