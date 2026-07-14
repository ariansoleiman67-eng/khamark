import { captureRef } from 'react-native-view-shot';
import { RefObject } from 'react';
import { View, Platform } from 'react-native';

export async function captureFinalImage(viewRef: RefObject<View>): Promise<string | null> {
  try {
    const uri = await captureRef(viewRef, {
      format: 'jpg',
      quality: Platform.OS === 'ios' ? 0.8 : 0.9, // Slightly lower on iOS to prevent OOM
    });
    return uri;
  } catch (err) {
    console.error('Failed to capture final image:', err);
    return null;
  }
}
