import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

interface ImageViewerModalProps {
  visible: boolean;
  imageUrl: string;
  onClose: () => void;
}

const ImageViewerModal: React.FC<ImageViewerModalProps> = ({
  visible,
  imageUrl,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = React.useState(false);

  const handleShare = async () => {
    if (!imageUrl) return;
    try {
      setSaving(true);
      const filename = `chat_image_${Date.now()}.jpg`;
      const localUri = `${(FileSystem as any).cacheDirectory}${filename}`;
      await FileSystem.downloadAsync(imageUrl, localUri);

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(localUri, {
          mimeType: 'image/jpeg',
          dialogTitle: 'Share Image',
        });
      } else {
        Alert.alert('Sharing not available on this device');
      }
    } catch {
      Alert.alert('Error', 'Failed to share image');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!imageUrl) return;
    try {
      setSaving(true);
      const filename = `chat_image_${Date.now()}.jpg`;
      const localUri = `${(FileSystem as any).cacheDirectory}${filename}`;
      await FileSystem.downloadAsync(imageUrl, localUri);

      if (Platform.OS === 'android') {
        try {
          const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
          if (permissions.granted) {
            const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: 'base64' });
            const savedUri = await FileSystem.StorageAccessFramework.createFileAsync(permissions.directoryUri, filename, 'image/jpeg');
            await FileSystem.writeAsStringAsync(savedUri, base64, { encoding: 'base64' });
            Alert.alert('✅ Saved', 'Image saved successfully');
            return;
          } else {
            // User cancelled folder selection
            return;
          }
        } catch (err) {
          console.warn('StorageAccessFramework failed:', err);
          // Fall through to share fallback if SAF fails
        }
      }

      // Fallback: share with save intent (Works well on iOS, acts as Share on Android)
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(localUri, { mimeType: 'image/jpeg' });
      }
    } catch {
      Alert.alert('Error', 'Failed to save image');
    } finally {
      setSaving(false);
    }
  };

  if (!visible || !imageUrl) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar backgroundColor="rgba(0,0,0,0.95)" barStyle="light-content" />
      <View style={styles.container}>
        {/* Scrollable Zoomable Image */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          maximumZoomScale={5}
          minimumZoomScale={1}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          bouncesZoom
          centerContent
        >
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            contentFit="contain"
            transition={200}
          />
        </ScrollView>

        {/* Top Bar */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.iconBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>

          <View style={styles.topActions}>
            <TouchableOpacity
              onPress={handleShare}
              style={styles.iconBtn}
              activeOpacity={0.7}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="share-outline" size={24} color="#fff" />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSave}
              style={styles.iconBtn}
              activeOpacity={0.7}
              disabled={saving}
            >
              <Ionicons name="download-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0,0,0,0.95)',
    flex: 1,
  },
  iconBtn: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  image: {
    height: SCREEN_H * 0.8,
    width: SCREEN_W,
  },
  scrollContent: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  topActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  topBar: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    paddingBottom: 12,
    paddingHorizontal: 12,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});

export default ImageViewerModal;
