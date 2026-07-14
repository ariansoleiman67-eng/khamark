import React, { useState, useEffect } from 'react';
import { View, TextInput, Modal, StyleSheet, TouchableOpacity, Text, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  visible: boolean;
  initialText?: string;
  initialColor?: string;
  onSave: (text: string, color: string) => void;
  onCancel: () => void;
}

const COLORS = ['#FFFFFF', '#000000', '#FF3B30', '#FF9500', '#FFCC00', '#4CD964', '#5AC8FA', '#007AFF', '#5856D6'];

export function TextInputModal({ visible, initialText = '', initialColor = '#FFFFFF', onSave, onCancel }: Props) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(initialText);
  const [color, setColor] = useState(initialColor);

  useEffect(() => {
    if (visible) {
      setText(initialText);
      setColor(initialColor);
    }
  }, [visible, initialText, initialColor]);

  const handleSave = () => {
    Keyboard.dismiss();
    setTimeout(() => {
      if (text.trim().length > 0) {
        onSave(text.trim(), color);
      } else {
        onCancel();
      }
    }, Platform.OS === 'android' ? 100 : 0);
  };

  const handleCancelSafely = () => {
    Keyboard.dismiss();
    setTimeout(onCancel, Platform.OS === 'android' ? 100 : 0);
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.container}>
        <KeyboardAvoidingView 
          style={styles.keyboardView}  
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header */}
          <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
            <TouchableOpacity onPress={handleCancelSafely} style={styles.headerButton}>
              <Text allowFontScaling={false} style={styles.headerButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={styles.headerButton}>
              <Text allowFontScaling={false} style={styles.headerButtonText}>Done</Text>
            </TouchableOpacity>
          </View>

          {/* Input Area */}
          <View style={styles.inputContainer}>
            <TextInput allowFontScaling={false}
              autoFocus
              value={text}
              onChangeText={setText}
              style={[styles.input, { color }]}
              multiline
              textAlign="center"
              placeholder="Type something..."
              placeholderTextColor="rgba(255,255,255,0.5)"
            />
          </View>

          {/* Color Picker Picker */}
          <View style={styles.colorPickerContainer}>
            {COLORS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.colorSwatch, { backgroundColor: c }, color === c && styles.colorSwatchSelected]}
                onPress={() => setColor(c)}
              />
            ))}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  headerButton: {
    padding: 8,
  },
  headerButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  inputContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  input: {
    fontSize: 32,
    fontWeight: 'bold',
    maxHeight: 200,
    width: '100%',
  },
  colorPickerContainer: {
    flexDirection: 'row',
    padding: 16,
    justifyContent: 'center',
    gap: 12,
  },
  colorSwatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchSelected: {
    borderColor: '#fff',
    transform: [{ scale: 1.2 }],
  },
});
