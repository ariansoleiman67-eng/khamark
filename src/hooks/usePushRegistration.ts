import * as Notifications from 'expo-notifications';
import { useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { getDeviceId } from '../utils/deviceUtils';
import { supabase } from '../services/supabase';
import { NotificationService } from '../services/NotificationService';

let isNativeAvailable = false;
let getMessagingFn: (() => any) | null = null;
let getTokenFn: ((msg: any, opts?: any) => Promise<string>) | null = null;
let onTokenRefreshFn: ((msg: any, listener: (token: string) => any) => () => void) | null = null;
let requestPermissionFn: ((msg: any, iosPermissions?: any) => Promise<any>) | null = null;
let isDeviceRegisteredForRemoteMessagesFn: ((msg: any) => boolean) | null = null;
let registerDeviceForRemoteMessagesFn: ((msg: any) => Promise<void>) | null = null;

try {
  const firebaseMessaging = require('@react-native-firebase/messaging');
  getMessagingFn = firebaseMessaging.getMessaging;
  getTokenFn = firebaseMessaging.getToken;
  onTokenRefreshFn = firebaseMessaging.onTokenRefresh;
  requestPermissionFn = firebaseMessaging.requestPermission;
  isDeviceRegisteredForRemoteMessagesFn = firebaseMessaging.isDeviceRegisteredForRemoteMessages;
  registerDeviceForRemoteMessagesFn = firebaseMessaging.registerDeviceForRemoteMessages;
  isNativeAvailable = true;
} catch {
  isNativeAvailable = false;
}

export function isNativePushAvailable(): boolean {
  return isNativeAvailable;
}

export async function registerNativePushToken(userId: string, tenantId?: string): Promise<string | null> {
  if (!isNativeAvailable || !getMessagingFn) {
    console.log('Native FCM not available (Expo Go mode)');
    return null;
  }

  try {
    const msg = getMessagingFn();
    const authStatus = await requestPermissionFn!(msg);
    const enabled = authStatus === 1 || authStatus === 2;

    if (!enabled) {
      console.log('Push notification permission denied');
      return null;
    }

    if (Platform.OS === 'ios') {
      try {
        const isRegistered = isDeviceRegisteredForRemoteMessagesFn 
            ? isDeviceRegisteredForRemoteMessagesFn(msg) 
            : msg.isDeviceRegisteredForRemoteMessages;
            
        if (!isRegistered) {
          if (registerDeviceForRemoteMessagesFn) {
            await registerDeviceForRemoteMessagesFn(msg);
          } else {
            await msg.registerDeviceForRemoteMessages();
          }
        }
      } catch (regError) {
        console.warn('Failed to register device for remote messages:', regError);
      }
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'General Notifications',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1a365d',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });

      await Notifications.setNotificationChannelAsync('chat_messages', {
        name: 'Chat Messages',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });

      await Notifications.setNotificationChannelAsync('orders', {
        name: 'Order Updates',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1a365d',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
    }

    const token = await getTokenFn!(msg);

    if (!token) {
      console.warn('Failed to get FCM token');
      return null;
    }

    const deviceId = await getDeviceId();
    const now = new Date().toISOString();
    
    await supabase.from('devices').upsert({
      id: deviceId,
      uid: userId,
      tenant_id: tenantId || 'default',
      fcm_token: token,
      platform: Platform.OS,
      app_version: Application.nativeApplicationVersion || '1.0.0',
      is_active: true,
      // The admin's own setting, not a hardcoded true. This upsert runs on every
      // launch, so writing `true` here silently re-enabled push each time the app
      // started — the Admin > Settings toggle saved correctly and then reverted,
      // and order alerts could never actually be switched off.
      notifications_enabled: await NotificationService.getDevicePushEnabled(),
      channel_version: 1,
      last_seen_at: now,
      updated_at: now,
    }, { onConflict: 'id' });

    await supabase.from('users').update({ 
      fcm_token: token,
      fcm_token_updated_at: now 
    }).eq('id', userId);

    await supabase.from('push_tokens').upsert({
      id: deviceId,
      token,
      user_id: userId,
      platform: Platform.OS,
      active: true,
      updated_at: now
    }, { onConflict: 'id' });

    console.log(`FCM token registered for device ${deviceId}:`, token.substring(0, 10) + '...');
    return token;
  } catch (error) {
    console.error('Error registering push token:', error);
    return null;
  }
}

export async function deactivatePushToken(userId: string): Promise<void> {
  if (!isNativeAvailable) return;

  try {
    const deviceId = await getDeviceId();
    const now = new Date().toISOString();

    await supabase.from('devices').update({ is_active: false, updated_at: now }).eq('id', deviceId);
    await supabase.from('users').update({ fcm_token: null }).eq('id', userId);
    await supabase.from('push_tokens').update({ active: false, updated_at: now }).eq('id', deviceId);

    console.log(`Push token deactivated for device ${deviceId}`);
  } catch (error) {
    console.error('Error deactivating push token:', error);
  }
}

export function usePushRegistration(tenantId?: string) {
  const registerToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) return;
    await registerNativePushToken(data.session.user.id, tenantId);
  }, [tenantId]);

  useEffect(() => {
    if (!isNativeAvailable || !getMessagingFn) return;

    registerToken();

    const msg = getMessagingFn();
    const unsubscribe = onTokenRefreshFn!(msg, async (newToken: string) => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) return;
      
      try {
        const deviceId = await getDeviceId();
        const now = new Date().toISOString();
        
        await supabase.from('devices').update({ fcm_token: newToken, updated_at: now }).eq('id', deviceId);
        await supabase.from('push_tokens').update({ token: newToken, active: true, updated_at: now }).eq('id', deviceId);

        console.log('FCM token refreshed and updated');
      } catch (e) {
        console.error('Error updating refreshed token:', e);
      }
    });

    return unsubscribe;
  }, [registerToken]);
}

export default usePushRegistration;
