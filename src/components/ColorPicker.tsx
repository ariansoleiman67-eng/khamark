import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  StyleSheet,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from './ThemeProvider';
import { ColorPickerConfig } from '../types/theme';

// Window size is read per-render via useWindowDimensions, NOT frozen at module
// scope: a module-level Dimensions.get() is evaluated once at import, so after a
// rotation or a foldable/split-screen resize the view keeps its old size and is
// clipped or leaves dead space.

// Beautiful color presets
const COLOR_PRESETS = [
  // Primary colors
  '#3B82F6', '#1E40AF', '#60A5FA', '#DBEAFE',
  '#EF4444', '#DC2626', '#F87171', '#FEE2E2',
  '#10B981', '#059669', '#34D399', '#D1FAE5',
  '#8B5CF6', '#7C3AED', '#A78BFA', '#EDE9FE',
  '#F97316', '#EA580C', '#FB923C', '#FED7AA',
  '#EAB308', '#CA8A04', '#FACC15', '#FEF3C7',
  '#EC4899', '#BE185D', '#F472B6', '#FCE7F3',
  '#6B7280', '#374151', '#9CA3AF', '#F3F4F6',
  // Additional beautiful colors
  '#0077BE', '#00A8CC', '#FF6B35', '#7C3AED',
  '#06D6A0', '#F59E0B', '#059669', '#FF6B6B',
  '#FFD93D', '#6BCF7F', '#8B5CF6', '#FBBF24',
];

interface ColorPickerProps {
  config: ColorPickerConfig;
  visible: boolean;
  onClose: () => void;
  onColorSelect: (color: string) => void;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  config,
  visible,
  onClose,
  onColorSelect,
}) => {
  const { height: windowHeight } = useWindowDimensions();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [currentColor, setCurrentColor] = useState(config.defaultColor);
  const [hexInput, setHexInput] = useState(config.defaultColor);

  const handlePresetSelect = (color: string) => {
    setCurrentColor(color);
    setHexInput(color);
  };

  const handleHexInput = (text: string) => {
    setHexInput(text);
    if (/^#[0-9A-Fa-f]{6}$/.test(text)) {
      setCurrentColor(text);
    }
  };

  const handleConfirm = () => {
    onColorSelect(currentColor);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalContainer}>
        <View style={[styles.modalContent, { backgroundColor: theme.colors.background, height: windowHeight * 0.75 }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
            <Text allowFontScaling={false} style={[styles.title, { color: theme.colors.text }]}>
              {config.title}
            </Text>
            <TouchableOpacity onPress={handleConfirm} style={styles.confirmButton}>
              <Text allowFontScaling={false} style={[styles.confirmText, { color: theme.colors.primary }]}>
                {t('common.done', { defaultValue: 'Done' })}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Current Color Preview */}
            <View style={styles.colorPreview}>
              <View style={[styles.colorSwatch, { backgroundColor: currentColor, borderColor: theme.colors.border }]} />
              <View style={styles.colorInfo}>
                <Text allowFontScaling={false} style={[styles.colorName, { color: theme.colors.text }]}>
                  {t('colorPicker.selectedColor', { defaultValue: 'Selected Color' })}
                </Text>
                <TextInput allowFontScaling={false}
                  style={[
                    styles.hexInput,
                    {
                      color: theme.colors.text,
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                    },
                  ]}
                  value={hexInput}
                  onChangeText={handleHexInput}
                  placeholder="#000000"
                  placeholderTextColor={theme.colors.placeholder}
                  autoCapitalize="characters"
                />
              </View>
            </View>

            {/* Color Presets */}
            <View style={styles.presetsContainer}>
              <Text allowFontScaling={false} style={[styles.presetsTitle, { color: theme.colors.text }]}>
                {t('colorPicker.chooseColor', { defaultValue: 'Choose a Color' })}
              </Text>
              <View style={styles.presetGrid}>
                {COLOR_PRESETS.map((color, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.presetSwatch,
                      { 
                        backgroundColor: color,
                        borderColor: currentColor === color ? theme.colors.primary : theme.colors.border,
                        borderWidth: currentColor === color ? 3 : 1,
                        transform: currentColor === color ? [{ scale: 1.1 }] : [{ scale: 1 }],
                      },
                    ]}
                    onPress={() => handlePresetSelect(color)}
                  >
                    {currentColor === color && (
                      <View style={styles.selectedCheck}>
                        <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Custom Presets */}
            {config.presets && config.presets.length > 0 && (
              <View style={styles.presetsContainer}>
                <Text allowFontScaling={false} style={[styles.presetsTitle, { color: theme.colors.text }]}>
                  {t('colorPicker.suggestedColors', { defaultValue: 'Suggested Colors' })}
                </Text>
                <View style={styles.presetGrid}>
                  {config.presets.map((color, index) => (
                    <TouchableOpacity
                      key={`custom-${index}`}
                      style={[
                        styles.presetSwatch,
                        { 
                          backgroundColor: color,
                          borderColor: currentColor === color ? theme.colors.primary : theme.colors.border,
                          borderWidth: currentColor === color ? 3 : 1,
                          transform: currentColor === color ? [{ scale: 1.1 }] : [{ scale: 1 }],
                        },
                      ]}
                      onPress={() => handlePresetSelect(color)}
                    >
                      {currentColor === color && (
                        <View style={styles.selectedCheck}>
                          <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {config.description && (
              <Text allowFontScaling={false} style={[styles.description, { color: theme.colors.textSecondary }]}>
                {config.description}
              </Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  closeButton: {
    padding: 8,
  },
  colorInfo: {
    flex: 1,
  },
  colorName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  colorPreview: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingVertical: 20,
  },
  colorSwatch: {
    borderRadius: 12,
    borderWidth: 2,
    height: 60,
    marginRight: 16,
    width: 60,
  },
  confirmButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 40,
    marginVertical: 16,
  },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  hexInput: {
    borderRadius: 8,
    borderWidth: 1,
    fontFamily: 'monospace',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modalContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  presetSwatch: {
    alignItems: 'center',
    borderRadius: 12,
    elevation: 2,
    height: 50,
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    width: 50,
  },
  presetsContainer: {
    marginVertical: 16,
  },
  presetsTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  selectedCheck: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
});

export default ColorPicker;