import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert, Platform } from 'react-native';
import { auth } from './firebase';
import { getIdToken } from '@react-native-firebase/auth';

// Video upload configuration
export const VIDEO_CONFIG = {
  MAX_SIZE_BYTES: 50 * 1024 * 1024, // 50MB
  MAX_SIZE_MB: 50,
  MAX_DURATION_SECONDS: 60, // 60 seconds
  ALLOWED_TYPES: ['video/mp4', 'video/quicktime', 'video/webm'],
};

// Get the Cloud Functions region/URL
// This must match your Firebase project ID from deployment
const FUNCTIONS_BASE_URL = 'https://us-central1-truckserviceapp-f9712-7b9d8.cloudfunctions.net';

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
 * Security:
 * - No secrets in client code
 * - All uploads go through Firebase Cloud Function
 * - Auth token verified server-side
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
      // 1. Verify user is authenticated
      const user = auth.currentUser;
      if (!user) {
        return { success: false, error: 'User must be authenticated to upload videos' };
      }

      // 2. Validate video
      const validation = await this.validateVideo(videoUri);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      onProgress?.(5);

      // 3. Get fresh ID token
      const idToken = await getIdToken(user, true);

      onProgress?.(10);

      // 4. Read video file as blob
      const response = await fetch(videoUri);
      const blob = await response.blob();

      onProgress?.(30);

      // 5. Determine content type
      const contentType = blob.type || 'video/mp4';

      // 6. Upload to Cloud Function
      const uploadUrl = `${FUNCTIONS_BASE_URL}/uploadProductVideo?productId=${encodeURIComponent(productId)}`;
      
      console.log(`Uploading video to: ${uploadUrl} (${validation.sizeMB}MB)`);

      // Use XMLHttpRequest for progress tracking
      const result = await new Promise<VideoUploadResult>((resolve) => {
        const xhr = new XMLHttpRequest();
        
        // Track upload progress
        // Track upload progress - SAFEGUARD FOR ANDROID RELEASE CRASH
        // The user reported "reactInstance is null" crashes from NetworkingModule events.
        // We disable detailed progress events on Android Release builds to prevent this.
        if (Platform.OS === 'ios' || __DEV__) {
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              // Progress from 30% to 90% during upload
              const uploadPercent = Math.round((event.loaded / event.total) * 60) + 30;
              onProgress?.(Math.min(uploadPercent, 90));
            }
          };
        }

        xhr.onload = () => {
          onProgress?.(95);
          try {
            const responseData = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300 && responseData.success) {
              onProgress?.(100);
              resolve({ success: true, videoUrl: responseData.videoUrl });
            } else {
              resolve({ 
                success: false, 
                error: responseData.message || responseData.error || 'Upload failed' 
              });
            }
          } catch (parseError) {
            resolve({ success: false, error: 'Invalid response from server' });
          }
        };

        xhr.onerror = () => {
          resolve({ success: false, error: 'Network error during upload' });
        };

        xhr.ontimeout = () => {
          resolve({ success: false, error: 'Upload timed out. Please try a smaller video.' });
        };

        xhr.open('POST', uploadUrl);
        xhr.timeout = 300000; // 5 minutes
        xhr.setRequestHeader('Authorization', `Bearer ${idToken}`);
        xhr.setRequestHeader('Content-Type', contentType);
        xhr.send(blob);
      });

      return result;

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
