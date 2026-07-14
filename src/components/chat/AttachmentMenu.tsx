import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface AttachmentMenuProps {
  visible: boolean;
  onClose: () => void;
  onPhotoLibrary: () => void;
  onCamera: () => void;
  onDocument: () => void;
  theme: any;
}

const AttachmentMenu: React.FC<AttachmentMenuProps> = ({
  visible,
  onClose,
  onPhotoLibrary,
  onCamera,
  onDocument,
  theme,
}) => {
  const insets = useSafeAreaInsets();

  // iOS needs a short delay after the modal dismiss animation finishes
  // before launching a system picker, otherwise touch events get swallowed.
  const dismissThenRun = (action: () => void) => {
    onClose();
    if (Platform.OS === 'ios') {
      setTimeout(action, 500);
    } else {
      action();
    }
  };

  const options = [
    {
      icon: 'images-outline' as const,
      label: 'Photo Library',
      color: '#4CAF50',
      bgColor: '#4CAF5018',
      onPress: () => dismissThenRun(onPhotoLibrary),
    },
    {
      icon: 'camera-outline' as const,
      label: 'Camera',
      color: '#2196F3',
      bgColor: '#2196F318',
      onPress: () => dismissThenRun(onCamera),
    },
    {
      icon: 'document-outline' as const,
      label: 'Document',
      color: '#FF9800',
      bgColor: '#FF980018',
      onPress: () => dismissThenRun(onDocument),
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.spacer} />
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              paddingBottom: insets.bottom + 16,
            },
          ]}
          onPress={() => {}} // Prevent closing when tapping sheet
        >
          {/* Handle bar */}
          <View style={styles.handleBar}>
            <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
          </View>

          {/* Title */}
          <Text allowFontScaling={false} style={[styles.title, { color: theme.colors.text }]}>
            Share Content
          </Text>

          {/* Options Grid */}
          <View style={styles.optionsRow}>
            {options.map((opt, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.optionItem}
                activeOpacity={0.7}
                onPress={opt.onPress}
              >
                <View style={[styles.optionIcon, { backgroundColor: opt.bgColor }]}>
                  <Ionicons name={opt.icon} size={28} color={opt.color} />
                </View>
                <Text allowFontScaling={false} style={[styles.optionLabel, { color: theme.colors.text }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Cancel */}
          <TouchableOpacity
            style={[styles.cancelBtn, { backgroundColor: theme.colors.background }]}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text allowFontScaling={false} style={[styles.cancelText, { color: theme.colors.error }]}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  cancelBtn: {
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: 14,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
  handle: {
    borderRadius: 3,
    height: 5,
    width: 40,
  },
  handleBar: {
    alignItems: 'center',
    marginBottom: 16,
  },
  optionIcon: {
    alignItems: 'center',
    borderRadius: 16,
    height: 60,
    justifyContent: 'center',
    marginBottom: 8,
    width: 60,
  },
  optionItem: {
    alignItems: 'center',
    width: 80,
  },
  optionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
  },
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  spacer: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
  },
});

export default AttachmentMenu;
