/**
 * GOLDEN TEMPLATE: Push Message Handler
 * 
 * Handles incoming FCM messages in foreground and background.
 * Updates notification store, badge, and relevant screens.
 * 
 * Rules (LOCKED):
 * - NO blocking modals
 * - NO forced refresh
 * - Update stores silently
 * - Navigate contextually on tap
 * - Gracefully handles Expo Go (no native modules)
 */

import { NotificationService } from '../services/NotificationService';

// Flag to check if native Firebase is available
let isNativeAvailable = false;
let getMessagingFn: (() => any) | null = null;
let onMessageFn: ((msg: any, listener: (message: any) => any) => () => void) | null = null;
let setBackgroundMessageHandlerFn: ((msg: any, handler: (message: any) => Promise<any>) => void) | null = null;
let getInitialNotificationFn: ((msg: any) => Promise<any>) | null = null;
let onNotificationOpenedAppFn: ((msg: any, listener: (message: any) => any) => () => void) | null = null;

// Dynamically import Firebase messaging to prevent crash in Expo Go
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const firebaseMessaging = require('@react-native-firebase/messaging');
  getMessagingFn = firebaseMessaging.getMessaging;
  onMessageFn = firebaseMessaging.onMessage;
  setBackgroundMessageHandlerFn = firebaseMessaging.setBackgroundMessageHandler;
  getInitialNotificationFn = firebaseMessaging.getInitialNotification;
  onNotificationOpenedAppFn = firebaseMessaging.onNotificationOpenedApp;
  isNativeAvailable = true;
} catch {
  // Native Firebase not available (Expo Go mode)
  isNativeAvailable = false;
}

export interface PushMessageData {
  type?: 'order' | 'shipping' | 'promo' | 'system' | 'chat';
  orderId?: string;
  productId?: string;
  conversationId?: string;
  title?: string;
  body?: string;
}

/**
 * Check if native FCM is available
 */
export function isNativePushHandlerAvailable(): boolean {
  return isNativeAvailable;
}

/**
 * Initialize push message handlers
 * Call this once at app startup (in App.tsx or index.ts)
 */
export function initializePushHandlers(
  onNavigate?: (type: string, data: PushMessageData) => void
): () => void {
  if (!isNativeAvailable || !getMessagingFn) {
    // eslint-disable-next-line no-console
    console.log('Native FCM handlers not available (Expo Go mode)');
    return () => {}; // No-op cleanup
  }

  const msg = getMessagingFn!();

  // Foreground message handler
  const unsubscribeForeground = onMessageFn!(msg,
    async (remoteMessage: any) => {
      // eslint-disable-next-line no-console
      console.log('Push received (foreground):', remoteMessage);

      // Update badge silently
      await NotificationService.updateBadgeCount();

      // The notification will be synced via Firestore real-time listener
      // NO forced refresh, NO blocking modal
    }
  );

  // Background/quit state message handler
  setBackgroundMessageHandlerFn!(msg,
    async (remoteMessage: any) => {
      // eslint-disable-next-line no-console
      console.log('Push received (background):', remoteMessage);

      // If the message is data-only (no notification payload), we must manually show it
      if (!remoteMessage.notification) {
          const { title, body } = remoteMessage.data || {};
          if (title || body) {
              await NotificationService.scheduleLocalNotification(
                  title || 'New Notification',
                  body || 'You have a new update',
                  remoteMessage.data
              );
          }
      }
      
      // Update badge count in background
      await NotificationService.updateBadgeCount();
    }
  );

  // Notification opened app from quit state
  getInitialNotificationFn!(msg)
    .then((remoteMessage: any) => {
      if (remoteMessage) {
        // eslint-disable-next-line no-console
        console.log('App opened from push (quit):', remoteMessage);

        const data = remoteMessage.data as PushMessageData;
        if (onNavigate && data?.type) {
          // Small delay to ensure navigation is ready
          setTimeout(() => {
            onNavigate(data.type!, data);
          }, 500);
        }
      }
    });

  // Notification opened app from background
  const unsubscribeOpened = onNotificationOpenedAppFn!(msg,
    (remoteMessage: any) => {
      // eslint-disable-next-line no-console
      console.log('App opened from push (background):', remoteMessage);

      const data = remoteMessage.data as PushMessageData;
      if (onNavigate && data?.type) {
        onNavigate(data.type, data);
      }
    }
  );

  // Return cleanup function
  return () => {
    unsubscribeForeground();
    unsubscribeOpened();
  };
}

/**
 * Get navigation target for push message type
 */
export function getNavigationTarget(
  type: string,
  data: PushMessageData
): { screen: string; params?: object } | null {
  switch (type) {
    case 'order':
    case 'shipping':
      if (data.orderId) {
        return {
          screen: 'OrderDetail',
          params: { orderId: data.orderId },
        };
      }
      break;
    case 'promo':
      return {
        screen: 'Home',
        params: undefined,
      };
    case 'system':
      if (data.productId) {
        return {
          screen: 'ProductDetails',
          params: { productId: data.productId },
        };
      }
      return {
        screen: 'Notifications',
        params: undefined,
      };
    case 'chat':
      if (data.conversationId) {
        // PushInitializer remaps ChatScreen→AdminChatScreen for admins.
        return {
          screen: 'ChatScreen',
          params: { conversationId: data.conversationId, targetName: data.title },
        };
      }
      return {
        screen: 'Notifications',
        params: undefined,
      };
  }
  return null;
}

export default initializePushHandlers;
