import { ImageUploadResult } from '../types';
import { IMAGE_UPLOAD_CONFIG } from '../constants/config';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert, Platform } from 'react-native';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

async function safeCompressImage(uri: string, maxWidth = 1200, quality = 0.8): Promise<string> {
  if (Platform.OS === 'ios') {
    return uri;
  }

  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxWidth } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch (error) {
    console.warn('ImageManipulator failed, using picker output directly:', error);
    return uri;
  }
}

export class ImageService {
  static async pickImage(options: {
    aspect?: [number, number],
    quality?: number
  } = {}): Promise<ImagePicker.ImagePickerResult> {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Sorry, we need camera roll permissions to make this work!');
      return { canceled: true, assets: [] } as any;
    }

    return await this.launchPicker(true, options);
  }

  private static async launchPicker(allowsEditing: boolean, options: any): Promise<ImagePicker.ImagePickerResult> {
    // Never force the native crop UI. On Android it zooms the image to fill the
    // requested `aspect` (e.g. the banner's 16:7), so the user could only ever
    // keep a thin horizontal slice — they saw "only half the image". Pick the
    // full image and let the display layer (contentFit: 'cover') frame it.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: options.quality || 0.7,
    });

    // NOTE: do NOT re-compress here. uploadImage() -> processImage() already
    // resizes to 1200px and re-encodes JPEG once. Compressing here too meant the
    // same photo was JPEG-re-encoded twice, compounding artifacts on the catalog
    // images (and wasting CPU on low-end devices).
    return result;
  }

  static async uploadImage(imageUri: string): Promise<ImageUploadResult> {
    try {
      const processedImage = await this.processImage(imageUri);
      
      const rawBase64 = await FileSystem.readAsStringAsync(processedImage.uri, {
        encoding: 'base64',
      });
      
      const arrayBuffer = decode(rawBase64);
      
      const fileName = `images/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
      
      const { data, error } = await supabase.storage
        .from('media')
        .upload(fileName, arrayBuffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (error) {
        throw error;
      }

      const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(fileName);

      return {
        success: true,
        url: publicUrlData.publicUrl,
      };
    } catch (error: any) {
      console.error('Upload to Supabase failed:', error);
      return {
        success: false,
        error: error.message || 'Image upload failed',
      };
    }
  }

  static async uploadMultipleImages(imageUris: string[]): Promise<ImageUploadResult[]> {
    const results = await Promise.allSettled(
      imageUris.map(uri => this.uploadImage(uri))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          success: false,
          error: `Failed to upload image ${index + 1}: ${result.reason}`,
        };
      }
    });
  }

  private static async processImage(imageUri: string): Promise<ImageManipulator.ImageResult> {
    if (Platform.OS === 'ios') {
      return { uri: imageUri, width: 0, height: 0, base64: undefined } as any;
    }

    try {
      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: IMAGE_UPLOAD_CONFIG.MAX_WIDTH } }],
        { compress: IMAGE_UPLOAD_CONFIG.QUALITY, format: ImageManipulator.SaveFormat.JPEG }
      );
      return result;
    } catch (error) {
      console.error('Image processing error:', error);
      return { uri: imageUri, width: 0, height: 0, base64: undefined } as any;
    }
  }

  private static async validateImage(imageUri: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const response = await fetch(imageUri);
      if (!response.ok) return { valid: false, error: 'Invalid image file' };
      const blob = await response.blob();
      
      if (blob.size > IMAGE_UPLOAD_CONFIG.MAX_SIZE) {
        const maxSizeMB = IMAGE_UPLOAD_CONFIG.MAX_SIZE / (1024 * 1024);
        return { valid: false, error: `Image size must be less than ${maxSizeMB}MB` };
      }
      if (!IMAGE_UPLOAD_CONFIG.ALLOWED_TYPES.includes(blob.type as any)) {
        return { valid: false, error: 'Invalid image format. Please use JPEG, PNG, or WebP' };
      }
      return { valid: true };
    } catch (error) {
      return { valid: false, error: 'Failed to validate image' };
    }
  }

  static async pickImageFromGallery(): Promise<string | null> {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Permission to access camera roll is required!');
        return null;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.7,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        return await safeCompressImage(result.assets[0].uri, 1200, 0.8);
      }
      return null;
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('Error', 'Failed to pick image');
      return null;
    }
  }

  static async takePhoto(): Promise<string | null> {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Permission to access camera is required!');
        return null;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: Platform.OS === 'ios' ? 0.2 : 0.7,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        return await safeCompressImage(result.assets[0].uri, 1200, 0.8);
      }
      return null;
    } catch (error) {
      console.error('Camera error:', error);
      Alert.alert('Error', 'Failed to take photo');
      return null;
    }
  }

  static async pickImageForChat(): Promise<string | null> {
    return this.pickImageFromGallery();
  }

  static async takePhotoForChat(): Promise<string | null> {
    return this.takePhoto();
  }

  static async showImagePicker(): Promise<string | null> {
    return new Promise((resolve) => {
      Alert.alert(
        'Select Image',
        'Choose how you want to select an image',
        [
          { text: 'Camera', onPress: async () => resolve(await this.takePhoto()) },
          { text: 'Gallery', onPress: async () => resolve(await this.pickImageFromGallery()) },
          { text: 'Cancel', onPress: () => resolve(null), style: 'cancel' },
        ]
      );
    });
  }

  static async uploadFile(fileUri: string, fileName: string, mimeType: string): Promise<ImageUploadResult> {
    try {
      const rawBase64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
      const arrayBuffer = decode(rawBase64);
      
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `files/${Date.now()}_${safeName}`;
      
      const { data, error } = await supabase.storage
        .from('media')
        .upload(storagePath, arrayBuffer, {
          contentType: mimeType || 'application/octet-stream',
          upsert: true,
        });

      if (error) throw error;
      const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(storagePath);

      return { success: true, url: publicUrlData.publicUrl };
    } catch (error: any) {
      console.error('File upload error:', error);
      return { success: false, error: error.message || 'File upload failed' };
    }
  }

  static async deleteImage(imageUrl: string): Promise<boolean> {
    try {
      if (!imageUrl || !imageUrl.includes('supabase.co/storage/v1/object/public/media/')) return false;
      
      const pathPart = imageUrl.split('/media/')[1];
      if (!pathPart) return false;
      
      const { error } = await supabase.storage.from('media').remove([pathPart]);
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Image deletion error:', error);
      return false;
    }
  }

  static getOptimizedImageUrl(originalUrl: string, width?: number, height?: number): string {
    return originalUrl;
  }
}

export default ImageService;
