import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Platform } from 'react-native';
import uuid from 'react-native-uuid';

const DEVICE_ID_KEY = 'secure_device_id';

/**
 * Get a stable device ID for this installation.
 * Priority:
 * 1. SecureStore (UUID) - Most stable, persists across re-installs on iOS (Keychain)
 * 2. AsyncStorage (UUID) - Fallback if SecureStore fails
 * 3. Generate New UUID -> Save to SecureStore & AsyncStorage
 * 
 * Note: We avoid expo-application.androidId/iosId because they can change or be unreliable.
 */
export async function getDeviceId(): Promise<string> {
  try {
    // 1. Check SecureStore
    try {
      const secureId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
      if (secureId) return secureId;
    } catch (e) {
      console.warn('SecureStore access failed:', e);
    }

    // 2. Check AsyncStorage (Backup)
    try {
      const asyncId = await AsyncStorage.getItem(DEVICE_ID_KEY);
      if (asyncId) {
        // Recover to SecureStore if possible
        try {
          await SecureStore.setItemAsync(DEVICE_ID_KEY, asyncId);
        } catch {}
        return asyncId;
      }
    } catch (e) {
      console.warn('AsyncStorage access failed:', e);
    }

    // 3. Generate New UUID
    const newId = uuid.v4().toString();

    // Persist
    try {
      await SecureStore.setItemAsync(DEVICE_ID_KEY, newId);
    } catch (e) {
      console.warn('Failed to save to SecureStore:', e);
    }

    try {
      await AsyncStorage.setItem(DEVICE_ID_KEY, newId);
    } catch (e) {
      console.warn('Failed to save to AsyncStorage:', e);
    }

    return newId;
  } catch (error) {
    // 4. Last Resort Fallback (should rarely happen)
    console.error('Critical error generating device ID:', error);
    const androidId = (Application.getAndroidId?.() as string | null) ?? null;
    const iosId = (await Application.getIosIdForVendorAsync?.().catch(() => null)) ?? null;
    return androidId || iosId || ('unknown-device-' + Date.now());
  }
}
