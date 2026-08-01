import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, uniqueChannel } from './supabase';
import { getDeviceId } from '../utils/deviceUtils';
import { Notification as AppNotification } from '../types';

export const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND-NOTIFICATION-TASK';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export class NotificationService {
  private static readonly CACHE_KEY = 'cached_notifications';
  private static readonly DEVICE_PUSH_PREF_KEY = 'device_push_enabled';
  private static readonly CACHE_EXPIRY = 10 * 60 * 1000;
  private static cachedNotifications: AppNotification[] = [];
  private static lastCacheTime = 0;
  private static expoPushToken: string | null = null;
  private static fcmToken: string | null = null;
  private static currentUserId: string | null = null;

  static async isBackgroundHandlerReady(): Promise<boolean> {
    try {
      return await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);
    } catch {
      return false;
    }
  }

  static async initialize(): Promise<void> {
    try {
      await this.loadCacheFromStorage();
      await this.configureNotificationCategories();
      await this.registerForPushNotifications();
      this.setupNotificationListeners();
      await this.setupNativeListeners();
      
      supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
          this.currentUserId = session.user.id;
          if (this.expoPushToken || this.fcmToken) {
            await this.savePushTokenToSupabase(this.expoPushToken || '', this.fcmToken);
          }
        } else {
          this.currentUserId = null;
          this.clearAllCache();
        }
      });
    } catch (error) {
      console.error('Error initializing NotificationService:', error);
    }
  }

  private static async setupNativeListeners(): Promise<void> {
    try {
      let getMessagingFn;
      let onMessageFn;
      let onNotificationOpenedAppFn;
      try {
        const firebaseMessaging = require('@react-native-firebase/messaging');
        getMessagingFn = firebaseMessaging.getMessaging;
        onMessageFn = firebaseMessaging.onMessage;
        onNotificationOpenedAppFn = firebaseMessaging.onNotificationOpenedApp;
      } catch (e) {
        console.log('Native Firebase messaging not available (Expo Go)');
        return;
      }

      const msg = getMessagingFn();

      onMessageFn(msg, async (remoteMessage: any) => {
        this.updateBadgeCount();
        if (remoteMessage.notification) {
           await this.scheduleLocalNotification(
             remoteMessage.notification.title || 'New Notification',
             remoteMessage.notification.body || '',
             remoteMessage.data
           );
        }
      });

      onNotificationOpenedAppFn(msg, (remoteMessage: any) => {
        this.handleRemoteMessageTap(remoteMessage);
      });

      // Deliberately NOT reading getInitialNotification() here. It is a one-shot
      // native value and handleRemoteMessageTap only logs — reading it would steal
      // the quit-state push from PushInitializer, the one consumer that actually
      // navigates, and the app would silently open on Home instead of the target.
    } catch (error) {
      console.error('Error setting up native listeners:', error);
    }
  }

  private static handleRemoteMessageTap(remoteMessage: any): void {
     const data = remoteMessage.data;
     if (data?.type === 'order' && data?.orderId) {
        console.log('Should navigate to Order:', data.orderId);
     } else if (data?.type === 'promotion') {
        console.log('Should navigate to Promotions');
     }
  }

  static async registerForPushNotifications(): Promise<string | null> {
    try {
      try {
        const firebaseMessaging = require('@react-native-firebase/messaging');
        const requestPermissionFn = firebaseMessaging.requestPermission;
        const getMessagingFn = firebaseMessaging.getMessaging;
        const msg = getMessagingFn();
        await requestPermissionFn(msg);
      } catch (e) {
        // Native messaging not available
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default_v1', {
          name: 'Default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });

        await Notifications.setNotificationChannelAsync('orders_v1', {
          name: 'Order Updates',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          sound: 'default',
        });

        await Notifications.setNotificationChannelAsync('promotions_v1', {
          name: 'Promotions & Offers',
          importance: Notifications.AndroidImportance.DEFAULT,
          vibrationPattern: [0, 100],
          sound: 'default',
        });
      }

      if (!Device.isDevice) {
        return null;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  private static async savePushTokenToSupabase(token: string, fcmToken?: string | null): Promise<void> {
    try {
      if (!this.currentUserId) return;

      const updateData: Record<string, any> = {
        push_token: token,
        push_token_updated_at: new Date().toISOString(),
      };

      if (fcmToken) {
        updateData.fcm_token = fcmToken;
        updateData.fcm_token_updated_at = new Date().toISOString();
      }

      await supabase.from('users').update(updateData).eq('id', this.currentUserId);
    } catch (error) {
      console.error('Error saving push token:', error);
    }
  }

  private static async configureNotificationCategories(): Promise<void> {
    try {
      await Notifications.setNotificationCategoryAsync('order', [
        { identifier: 'view_order', buttonTitle: 'View Order', options: { opensAppToForeground: true } },
        { identifier: 'track_order', buttonTitle: 'Track Order', options: { opensAppToForeground: true } },
      ]);
      await Notifications.setNotificationCategoryAsync('promotion', [
        { identifier: 'view_offers', buttonTitle: 'View Offers', options: { opensAppToForeground: true } },
      ]);
    } catch (error) {
      console.error('Error configuring notification categories:', error);
    }
  }

  private static setupNotificationListeners(): void {
    Notifications.addNotificationReceivedListener((notification) => {
      this.handleNotificationReceived(notification);
    });

    Notifications.addNotificationResponseReceivedListener((response) => {
      this.handleNotificationTapped(response);
    });
  }

  private static handleNotificationReceived(notification: Notifications.Notification): void {
    try {
      this.updateBadgeCount();
    } catch (error) {
      console.error('Error handling received notification:', error);
    }
  }

  private static handleNotificationTapped(response: Notifications.NotificationResponse): void {
    try {
      const data = response.notification.request.content.data;
    } catch (error) {
      console.error('Error handling notification tap:', error);
    }
  }

  static async getUserNotifications(refresh = false): Promise<AppNotification[]> {
    try {
      if (!this.currentUserId) {
        return [];
      }

      if (!refresh && this.isCacheValid() && this.cachedNotifications.length > 0) {
        return this.cachedNotifications;
      }

      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', this.currentUserId)
          .order('created_at', { ascending: false })
          .limit(100);

        if (error) throw error;

        const notifications = (data || []).map(doc => ({
          id: doc.id,
          userId: doc.user_id,
          title: doc.title,
          body: doc.body,
          // Localized copies travel inside the data jsonb (see adminService.sendNotificationToUsers).
          // Without lifting them out here every customer read the English title/body.
          titleAr: doc.data?.titleAr ?? undefined,
          titleKu: doc.data?.titleKu ?? undefined,
          bodyAr: doc.data?.bodyAr ?? undefined,
          bodyKu: doc.data?.bodyKu ?? undefined,
          type: doc.type,
          read: doc.read,
          readAt: doc.read_at ? new Date(doc.read_at) : undefined,
          data: doc.data,
          createdAt: new Date(doc.created_at),
          updatedAt: new Date(doc.updated_at),
        })) as unknown as AppNotification[];

        this.cachedNotifications = notifications;
        this.lastCacheTime = Date.now();
        this.saveCacheToStorage();
        this.updateBadgeCount();

        return notifications;
      } catch (error) {
        this.cachedNotifications = [];
        this.lastCacheTime = Date.now();
        this.saveCacheToStorage();
        return [];
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
      if (this.cachedNotifications.length > 0) return this.cachedNotifications;
      return [];
    }
  }

  static subscribeToNotifications(
    callback: (notifications: AppNotification[]) => void,
    errorCallback?: (error: Error) => void
  ): () => void {
    if (!this.currentUserId) {
      setTimeout(() => callback([]), 100);
      return () => {};
    }

    try {
      const channel = uniqueChannel('public:notifications')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${this.currentUserId}` },
          async (payload) => {
            await this.getUserNotifications(true);
            callback(this.cachedNotifications);
          }
        )
        .subscribe();

      this.getUserNotifications(true).then(callback);

      return () => {
        supabase.removeChannel(channel);
      };
    } catch (error) {
      console.error('Error setting up notifications subscription:', error);
      setTimeout(() => {
        this.cachedNotifications = [];
        callback([]);
      }, 100);
      return () => {};
    }
  }

  static async markAsRead(notificationId: string): Promise<void> {
    try {
      if (!this.currentUserId) throw new Error('User must be authenticated');

      const { error } = await supabase
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (error) throw error;

      const cacheIndex = this.cachedNotifications.findIndex(n => n.id === notificationId);
      if (cacheIndex >= 0) {
        this.cachedNotifications[cacheIndex].read = true;
        this.saveCacheToStorage();
      }

      this.updateBadgeCount();
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw new Error('Failed to mark notification as read');
    }
  }

  static async markAllAsRead(): Promise<void> {
    try {
      if (!this.currentUserId) throw new Error('User must be authenticated');

      const { error } = await supabase
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('user_id', this.currentUserId)
        .eq('read', false);
        
      if (error) throw error;
      
      this.cachedNotifications = this.cachedNotifications.map(n => ({ ...n, read: true }));
      this.saveCacheToStorage();
      this.updateBadgeCount();
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw new Error('Failed to mark all notifications as read');
    }
  }

  static async deleteNotification(notificationId: string): Promise<void> {
    try {
      if (!this.currentUserId) throw new Error('User must be authenticated');

      const { error } = await supabase.from('notifications').delete().eq('id', notificationId);
      if (error) throw error;

      this.cachedNotifications = this.cachedNotifications.filter(n => n.id !== notificationId);
      this.saveCacheToStorage();
      this.updateBadgeCount();
    } catch (error) {
      console.error('Error deleting notification:', error);
      throw new Error('Failed to delete notification');
    }
  }

  static getUnreadCount(): number {
    return this.cachedNotifications.filter(n => !n.read).length;
  }

  static async updateBadgeCount(): Promise<void> {
    try {
      const unreadCount = this.getUnreadCount();
      await Notifications.setBadgeCountAsync(unreadCount);
    } catch (error) {
      console.error('Error updating badge count:', error);
    }
  }

  static async scheduleLocalNotification(
    title: string,
    body: string,
    data?: any,
    trigger?: Notifications.NotificationTriggerInput
  ): Promise<string> {
    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: { title, body, data: data || {}, sound: 'default' },
        trigger: trigger || null,
      });
      return notificationId;
    } catch (error) {
      console.error('Error scheduling local notification:', error);
      throw new Error('Failed to schedule notification');
    }
  }

  static async cancelScheduledNotification(notificationId: string): Promise<void> {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch (error) {}
  }

  static async cancelAllScheduledNotifications(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (error) {}
  }

  static async getNotificationSettings(): Promise<{ orderUpdates: boolean; promotions: boolean; }> {
    try {
      const settings = await AsyncStorage.getItem('notification_settings');
      if (settings) return JSON.parse(settings);
      return { orderUpdates: true, promotions: true };
    } catch (error) {
      return { orderUpdates: true, promotions: true };
    }
  }

  static async updateNotificationSettings(settings: { orderUpdates: boolean; promotions: boolean; }): Promise<void> {
    try {
      await AsyncStorage.setItem('notification_settings', JSON.stringify(settings));
      if (this.currentUserId) {
        await supabase.from('users').update({ notification_settings: settings }).eq('id', this.currentUserId);
      }
    } catch (error) {
      console.error('Error updating notification settings:', error);
      throw new Error('Failed to update notification settings');
    }
  }

  /**
   * The push preference the user deliberately set on THIS device.
   *
   * Deliberately local-first. Push registration re-upserts the `devices` row on
   * every launch, so that row is not a trustworthy source of truth — reading it
   * directly is what made a switch turned OFF come back ON after every restart.
   * Only a value the user actually toggled counts; the server row is consulted
   * once, purely to seed the cache on a device that has never toggled it.
   */
  static async getDevicePushEnabled(): Promise<boolean> {
    try {
      const stored = await AsyncStorage.getItem(this.DEVICE_PUSH_PREF_KEY);
      if (stored !== null) return stored === 'true';

      const deviceId = await getDeviceId();
      const { data } = await supabase
        .from('devices')
        .select('notifications_enabled')
        .eq('id', deviceId)
        .maybeSingle();

      if (!data) return true;

      const enabled = data.notifications_enabled !== false;
      await AsyncStorage.setItem(this.DEVICE_PUSH_PREF_KEY, String(enabled));
      return enabled;
    } catch (error) {
      return true;
    }
  }

  static async setDevicePushEnabled(enabled: boolean): Promise<void> {
    const deviceId = await getDeviceId();
    const { error } = await supabase
      .from('devices')
      .update({ notifications_enabled: enabled, updated_at: new Date().toISOString() })
      .eq('id', deviceId);
    if (error) throw error;

    // Cached only after the server accepted it, so a failed write leaves the
    // caller free to revert without the cache disagreeing with the DB.
    await AsyncStorage.setItem(this.DEVICE_PUSH_PREF_KEY, String(enabled));
  }

  static async getNotificationById(notificationId: string): Promise<AppNotification | null> {
    try {
      const cachedNotification = this.cachedNotifications.find(n => n.id === notificationId);
      if (cachedNotification) return cachedNotification;

      const { data, error } = await supabase.from('notifications').select('*').eq('id', notificationId).single();
      if (error || !data) return null;

      if (data.user_id !== this.currentUserId) throw new Error('Unauthorized access to notification');

      return {
        id: data.id,
        userId: data.user_id,
        title: data.title,
        body: data.body,
        // Same jsonb-carried translations as getUserNotifications above.
        titleAr: data.data?.titleAr ?? undefined,
        titleKu: data.data?.titleKu ?? undefined,
        bodyAr: data.data?.bodyAr ?? undefined,
        bodyKu: data.data?.bodyKu ?? undefined,
        type: data.type,
        read: data.read,
        readAt: data.read_at ? new Date(data.read_at) : undefined,
        data: data.data,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
      } as unknown as AppNotification;
    } catch (error) {
      console.error('Error fetching notification:', error);
      return null;
    }
  }

  static getNotificationsByType(type: string): AppNotification[] {
    return this.cachedNotifications.filter(n => n.type === type);
  }

  static getRecentNotifications(): AppNotification[] {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return this.cachedNotifications.filter(n => new Date(n.createdAt as any) >= sevenDaysAgo);
  }

  static async clearAllNotifications(): Promise<void> {
    try {
      if (!this.currentUserId) throw new Error('User must be authenticated');
      
      await supabase.from('notifications').delete().eq('user_id', this.currentUserId);
      this.clearCache();
    } catch (error) {
      console.error('Error clearing all notifications:', error);
      throw new Error('Failed to clear notifications');
    }
  }

  static async scheduleOrderReminder(orderId: string, orderNumber: string): Promise<void> {
    try {
      const settings = await this.getNotificationSettings();
      if (!settings.orderUpdates) return;
      const trigger = { type: 'timeInterval' as any, seconds: 24 * 60 * 60 };
      await this.scheduleLocalNotification(
        'Order Reminder',
        `Your order ${orderNumber} is still being processed. Check for updates!`,
        { type: 'order_reminder', orderId },
        trigger
      );
    } catch (error) {
      console.error('Error scheduling order reminder:', error);
    }
  }

  static async handleAppStateChange(nextAppState: string): Promise<void> {
    if (nextAppState === 'active') {
      try {
        await NotificationService.getUserNotifications(true);
      } catch (error) {}
    }
  }

  static getPushToken(): string | null {
    return this.expoPushToken;
  }

  static async sendTestNotification(): Promise<void> {
    try {
      await this.scheduleLocalNotification('Test Notification', 'This is a test notification from Asankary app!', { type: 'test' });
    } catch (error) {}
  }

  private static isCacheValid(): boolean {
    return Date.now() - this.lastCacheTime < this.CACHE_EXPIRY;
  }

  private static clearCache(): void {
    this.cachedNotifications = [];
    this.lastCacheTime = 0;
    AsyncStorage.removeItem(this.CACHE_KEY);
  }

  private static async saveCacheToStorage(): Promise<void> {
    try {
      const cacheData = { notifications: this.cachedNotifications, timestamp: this.lastCacheTime };
      await AsyncStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheData));
    } catch (error) {}
  }

  private static async loadCacheFromStorage(): Promise<void> {
    try {
      const cacheData = await AsyncStorage.getItem(this.CACHE_KEY);
      if (cacheData) {
        const parsed = JSON.parse(cacheData);
        if (Date.now() - parsed.timestamp < this.CACHE_EXPIRY) {
          this.cachedNotifications = parsed.notifications.map((notification: any) => ({
            ...notification,
            createdAt: new Date(notification.createdAt),
          }));
          this.lastCacheTime = parsed.timestamp;
        }
      }
    } catch (error) {}
  }

  static async clearAllCache(): Promise<void> {
    this.clearCache();
    await Notifications.setBadgeCountAsync(0);
  }

  static getNotificationIcon(type: string): string {
    const icons = { order: 'receipt-outline', shipping: 'cube-outline', promo: 'megaphone-outline', promotion: 'megaphone-outline', product: 'car-outline', system: 'information-circle-outline', reminder: 'alarm-outline' };
    return icons[type as keyof typeof icons] || 'notifications-outline';
  }

  static getNotificationColor(type: string, theme: any): string {
    const colors = { order: theme.colors.primary, shipping: '#009688', promo: '#9C27B0', promotion: '#9C27B0', product: theme.colors.success, system: theme.colors.info, reminder: theme.colors.warning };
    return colors[type as keyof typeof colors] || theme.colors.textSecondary;
  }

  static formatNotificationTime(createdAt: Date, language: string): string {
    const now = new Date();
    const diffMs = now.getTime() - createdAt.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return createdAt.toLocaleDateString(language);
  }
}

export default NotificationService;
