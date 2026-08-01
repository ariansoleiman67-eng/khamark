import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert } from 'react-native';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

// Video upload configuration.
// NOTE: MAX_SIZE must stay <= the Supabase 'media' bucket's per-file limit
// (currently 20 MB). A larger value here would let the picker accept a file that
// Storage then rejects, surfacing as a confusing failure late in the upload.
// Raise the bucket limit in the Supabase dashboard first, then raise this.
export const VIDEO_CONFIG = {
  MAX_SIZE_BYTES: 20 * 1024 * 1024, // 20MB — matches the media bucket limit
  MAX_SIZE_MB: 20,
  MAX_DURATION_SECONDS: 60, // 60 seconds
  ALLOWED_TYPES: ['video/mp4', 'video/quicktime', 'video/webm'],
};

export interface VideoPickResult {
  uri: string;
  type: string;
  width: number;
  height: number;
  duration: number | null;
  fileSize: number;
  fileName: string;
}

export interface VideoUploadResult {
  success: boolean;
  videoUrl?: string;
  error?: string;
}

export interface VideoValidation {
  valid: boolean;
  error?: string;
  sizeBytes?: number;
  sizeMB?: number;
}

/**
 * VideoService - Handles video picking and uploading for product videos
 * 
 * Videos go straight to Supabase Storage (the same public `media` bucket used for
 * product images), so there is no Firebase Cloud Function, no Bunny account and no
 * paid plan involved. Storage policies enforce access; no secrets live in the client.
 */
export class VideoService {
  /**
   * Pick a video from the device gallery
   */
  static async pickVideoFromGallery(): Promise<VideoPickResult | null> {
    try {
      // Request permission
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (permissionResult.granted === false) {
        Alert.alert('Permission Required', 'Permission to access media library is required to upload videos.');
        return null;
      }

      // Launch video picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsEditing: true,
        quality: 0.8, // Reasonable quality to reduce file size
        videoMaxDuration: VIDEO_CONFIG.MAX_DURATION_SECONDS,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return null;
      }

      const asset = result.assets[0];
      
      // Get file info for size
      let fileSize = 0;
      try {
        const fileInfo = await FileSystem.getInfoAsync(asset.uri);
        if (fileInfo.exists && 'size' in fileInfo) {
          fileSize = fileInfo.size;
        }
      } catch (e) {
        console.warn('Could not get file size:', e);
      }

      // Extract filename from URI
      const fileName = asset.uri.split('/').pop() || `video_${Date.now()}.mp4`;

      return {
        uri: asset.uri,
        type: asset.type === 'video' ? 'video/mp4' : (asset.mimeType || 'video/mp4'),
        width: asset.width,
        height: asset.height,
        duration: asset.duration ? asset.duration / 1000 : null, // Convert to seconds
        fileSize,
        fileName,
      };
    } catch (error) {
      console.error('Video picker error:', error);
      Alert.alert('Error', 'Failed to pick video');
      return null;
    }
  }

  /**
   * Validate video before upload
   */
  static async validateVideo(uri: string): Promise<VideoValidation> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      
      if (!fileInfo.exists) {
        return { valid: false, error: 'Video file not found' };
      }

      const sizeBytes = 'size' in fileInfo ? fileInfo.size : 0;
      const sizeMB = Math.round(sizeBytes / 1024 / 1024 * 10) / 10;

      // Check file size
      if (sizeBytes > VIDEO_CONFIG.MAX_SIZE_BYTES) {
        return {
          valid: false,
          error: `Video size (${sizeMB}MB) exceeds maximum allowed (${VIDEO_CONFIG.MAX_SIZE_MB}MB)`,
          sizeBytes,
          sizeMB,
        };
      }

      return { valid: true, sizeBytes, sizeMB };
    } catch (error) {
      console.error('Video validation error:', error);
      return { valid: false, error: 'Failed to validate video' };
    }
  }

  /**
   * Upload video to Cloud Function
   * 
   * @param videoUri - Local URI of the video file
   * @param productId - Firestore product ID
   * @param onProgress - Optional progress callback (0-100)
   */
  static async uploadProductVideo(
    videoUri: string,
    productId: string,
    onProgress?: (percent: number) => void
  ): Promise<VideoUploadResult> {
    try {
      // Must be signed in — Storage policies are what actually gate the write.
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.user) {
        return { success: false, error: 'User must be authenticated to upload videos' };
      }

      const validation = await this.validateVideo(videoUri);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      onProgress?.(10);

      // Read the file and hand Supabase an ArrayBuffer — same approach as
      // ImageService.uploadImage, which avoids the RN fetch/blob quirks.
      const rawBase64 = await FileSystem.readAsStringAsync(videoUri, { encoding: 'base64' });
      onProgress?.(40);

      const arrayBuffer = decode(rawBase64);
      const ext = (videoUri.split('.').pop() || 'mp4').split('?')[0].toLowerCase();
      const contentType =
        ext === 'mov' ? 'video/quicktime' : ext === 'webm' ? 'video/webm' : 'video/mp4';
      const fileName = `videos/${productId}_${Date.now()}.${ext === 'mov' || ext === 'webm' ? ext : 'mp4'}`;

      onProgress?.(55);

      const { error } = await supabase.storage
        .from('media')
        .upload(fileName, arrayBuffer, { contentType, upsert: true });

      if (error) throw error;

      onProgress?.(90);

      const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(fileName);
      onProgress?.(100);

      return { success: true, videoUrl: publicUrlData.publicUrl };
    } catch (error: any) {
      console.error('Video upload error:', error);
      return {
        success: false,
        error: error.message || 'Failed to upload video',
      };
    }
  }

  /**
   * Get a thumbnail-friendly timestamp for seeking
   */
  static getVideoThumbnailTime(): number {
    // Return 0.5 seconds for poster frame
    return 500;
  }
}

export default VideoService;
