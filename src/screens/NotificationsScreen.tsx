import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../components/ThemeProvider';
import { Notification as AppNotification } from '../types';
import { NotificationService } from '../services/NotificationService';
import { useNotification } from '../contexts/NotificationContext';
import Button from '../components/Button';
import { formatDate } from '../utils/currency';
import { getDirection } from '../locales';
import { SPACING } from '../constants/theme';

const NOTIFICATION_FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'order', label: 'Orders' },
  { key: 'promo', label: 'Promotions' },
  { key: 'system', label: 'System' },
];

// The admin composer writes type 'promotion' / 'general' while older rows hold
// 'promo' / 'system', so a chip that matched its own key alone was permanently empty.
const NOTIFICATION_FILTER_TYPES: Record<string, string[]> = {
  promo: ['promo', 'promotion'],
  system: ['system', 'general'],
};

export const NotificationsScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  // ALIBABA-STYLE: Clear badge when user opens notifications
  const { clearBadge } = useNotification();
  
  // State
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [filteredNotifications, setFilteredNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [showOnlyUnread, setShowOnlyUnread] = useState(false);

  // Keep the latest filter values in a ref so the realtime subscription can read
  // them without re-subscribing (which would tear down/rebuild the Supabase
  // channel and force a network refetch) on every filter change.
  const filterRef = useRef({ selectedFilter, showOnlyUnread });
  useEffect(() => {
    filterRef.current = { selectedFilter, showOnlyUnread };
  }, [selectedFilter, showOnlyUnread]);

  // Mirror of `notifications` so the write handlers below can compute the next list
  // after an await without capturing a stale array in their closure.
  const notificationsRef = useRef<AppNotification[]>([]);
  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  // ALIBABA-STYLE: Clear badge on mount (user opened notifications)
  useEffect(() => {
    clearBadge();
  }, [clearBadge]);

  // Monotonic id for loads. useFocusEffect re-runs whenever the load callback's
  // identity changes while the screen is focused, and that identity depends on the
  // filter — so tapping Orders then Promotions mid-flight left two loads racing, and
  // whichever resolved last re-applied ITS OWN captured filter. The list then showed
  // order notifications with the Promotions chip highlighted.
  const loadReqIdRef = useRef(0);

  // Apply a locally-computed list immediately. The write handlers below mutate only
  // NotificationService's static cache, so without this the sole repaint path was the
  // Supabase realtime echo — which this codebase itself documents as unreliable, and
  // which for DELETE cannot match the `user_id=eq.` channel filter at all, because
  // Postgres ships only the primary key in a DELETE's old record unless the table is
  // REPLICA IDENTITY FULL (no such statement exists in this repo's SQL).
  const applyLocal = useCallback((next: AppNotification[]) => {
    setNotifications(next);
    filterNotifications(next, filterRef.current.selectedFilter, filterRef.current.showOnlyUnread);
  }, []);

  const loadNotifications = useCallback(async (refresh = false) => {
    const reqId = ++loadReqIdRef.current;
    const isLatest = () => reqId === loadReqIdRef.current;
    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const userNotifications = await NotificationService.getUserNotifications(refresh);
      if (!isLatest()) return;
      setNotifications(userNotifications);
      filterNotifications(userNotifications, selectedFilter, showOnlyUnread);
    } catch (error) {
      if (!isLatest()) return;
      console.error('Error loading notifications:', error);
      Alert.alert(t('common.error'), t('notifications.loadError'));
    } finally {
      // A superseded call must not clear a newer call's loading/refreshing flags.
      if (isLatest()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [selectedFilter, showOnlyUnread, t]);

  // Filter notifications
  const filterNotifications = useCallback((
    allNotifications: AppNotification[],
    filter: string,
    unreadOnly: boolean
  ) => {
    let filtered = allNotifications;

    // Filter by type
    if (filter !== 'all') {
      const acceptedTypes = NOTIFICATION_FILTER_TYPES[filter] || [filter];
      filtered = filtered.filter(notification => acceptedTypes.includes(notification.type));
    }

    // Filter by read status
    if (unreadOnly) {
      filtered = filtered.filter(notification => !notification.read);
    }

    setFilteredNotifications(filtered);
  }, []);

  // Setup real-time notifications. Subscribe once for the screen's lifetime and
  // read the current filter values from a ref so filter changes don't recreate
  // the channel (avoids forced refetches and stale-closure list overwrites).
  useEffect(() => {
    const unsubscribe = NotificationService.subscribeToNotifications(
      (updatedNotifications) => {
        setNotifications(updatedNotifications);
        filterNotifications(
          updatedNotifications,
          filterRef.current.selectedFilter,
          filterRef.current.showOnlyUnread
        );
      },
      (error) => {
        console.error('Notifications subscription error:', error);
      }
    );

    return unsubscribe;
  }, [filterNotifications]);

  // Focus effect to load notifications when screen is focused
  useFocusEffect(
    useCallback(() => {
      loadNotifications();
    }, [loadNotifications])
  );

  // Handle filter change
  const handleFilterChange = (filter: string) => {
    setSelectedFilter(filter);
    filterNotifications(notifications, filter, showOnlyUnread);
  };

  // Handle unread filter toggle
  const handleUnreadToggle = () => {
    const newShowUnread = !showOnlyUnread;
    setShowOnlyUnread(newShowUnread);
    filterNotifications(notifications, selectedFilter, newShowUnread);
  };

  // Get notification title based on language
  const getNotificationTitle = (notification: AppNotification): string => {
    const language = i18n.language;
    if (language === 'ar' && notification.titleAr) {
      return notification.titleAr;
    } else if (language === 'ku' && notification.titleKu) {
      return notification.titleKu;
    }
    return notification.title;
  };

  // Get notification body based on language
  const getNotificationBody = (notification: AppNotification): string => {
    const language = i18n.language;
    if (language === 'ar' && notification.bodyAr) {
      return notification.bodyAr;
    } else if (language === 'ku' && notification.bodyKu) {
      return notification.bodyKu;
    }
    return notification.body;
  };

  // Handle notification tap
  const handleNotificationTap = async (notification: AppNotification) => {
    try {
      // Mark as read if not already read
      if (!notification.read) {
        await NotificationService.markAsRead(notification.id);
        applyLocal(notificationsRef.current.map((n) => (n.id === notification.id ? { ...n, read: true } : n)));
      }

      // Navigate based on notification type
      if (notification.type === 'order' && notification.data?.orderId) {
        navigation.navigate('OrderDetail', {
          orderId: notification.data.orderId
        });
      } else if (notification.type === 'shipping' && notification.data?.orderId) {
        // Shipping notifications also navigate to order details
        navigation.navigate('OrderDetail', {
          orderId: notification.data.orderId
        });
      } else if (notification.type === 'promo') {
        navigation.navigate('Main', { screen: 'Home' });
      } else if (notification.type === 'system' && notification.data?.productId) {
        navigation.navigate('ProductDetails', {
          productId: notification.data.productId
        });
      } else if (notification.type === 'chat' && notification.data?.conversationId) {
        // Message notification → open that conversation
        navigation.navigate('ChatScreen', {
          conversationId: notification.data.conversationId,
          targetName: getNotificationTitle(notification),
        } as any);
      } else {
        // Fallback for general notifications (like warnings/apologies that have no specific nav targets)
        Alert.alert(
          getNotificationTitle(notification),
          getNotificationBody(notification),
          [{ text: t('common.ok'), style: 'default' }]
        );
      }
    } catch (error) {
      console.error('Error handling notification tap:', error);
    }
  };

  // Handle notification delete
  const handleNotificationDelete = async (notificationId: string) => {
    try {
      await NotificationService.deleteNotification(notificationId);
      // Apply locally — the realtime DELETE echo cannot match the user_id channel
      // filter, so nothing else repaints and the row appeared to survive deletion.
      applyLocal(notificationsRef.current.filter((n) => n.id !== notificationId));
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message);
    }
  };

  // Handle mark all as read
  const handleMarkAllAsRead = async () => {
    try {
      await NotificationService.markAllAsRead();
      // The service swaps its cache for new read:true objects, but state still held
      // the old read:false ones, so rows kept their bold titles and unread dots.
      applyLocal(notificationsRef.current.map((n) => ({ ...n, read: true })));
      Alert.alert(t('notifications.success'), t('notifications.allMarkedRead'));
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message);
    }
  };

  // Handle clear all notifications
  const handleClearAll = () => {
    Alert.alert(
      t('notifications.clearAll'),
      t('notifications.clearAllConfirmation'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('notifications.clearAll'),
          style: 'destructive',
          onPress: async () => {
            try {
              await NotificationService.clearAllNotifications();
              // Without this the "all cleared" alert fired over a still-full list.
              applyLocal([]);
              Alert.alert(t('notifications.success'), t('notifications.allCleared'));
            } catch (error: any) {
              Alert.alert(t('common.error'), error.message);
            }
          },
        },
      ]
    );
  };



  const isRTL = i18n?.language ? getDirection(i18n.language) === 'rtl' : false;

  // Render notification item - ALIBABA: No animation
  const renderNotificationItem = ({ item: notification, index }: { 
    item: AppNotification; 
    index: number 
  }) => (
    <View
      style={{
        // ALIBABA: Dynamic coloring based on notification type
        backgroundColor: (() => {
          if (isDark) return theme.colors.surface; // Keep dark mode consistent
          switch (notification.type) {
            case 'order': return '#FFF3E0'; // Orange tint for Orders
            case 'shipping': return '#E0F2F1'; // Teal tint for Shipping
            case 'promo': return '#F3E5F5'; // Purple tint for Promos
            case 'system': return '#E1F5FE'; // Blue tint for System
            default: return theme.colors.surface;
          }
        })(),
        marginHorizontal: SPACING.md,
        marginVertical: SPACING.xs,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: (() => {
          if (isDark) return theme.colors.border;
          switch (notification.type) {
            case 'order': return '#FF9800'; // Dark Orange border
            case 'shipping': return '#009688'; // Teal border
            case 'promo': return '#9C27B0'; // Purple border
            case 'system': return '#03A9F4'; // Blue border
            default: return notification.read ? theme.colors.border : theme.colors.primary + '30';
          }
        })(),
      }}
      >
        {/* Main notification content */}
        <TouchableOpacity
          onPress={() => handleNotificationTap(notification)}
          onLongPress={() => {
            Alert.alert(
              t('common.delete'),
              t('notifications.deleteConfirmation'),
              [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('common.delete'),
                  style: 'destructive',
                  onPress: () => handleNotificationDelete(notification.id),
                },
              ]
            );
          }}
          style={{
            backgroundColor: 'transparent', // ALIBABA: Transparent to show card color
            padding: SPACING.md,
            flexDirection: isRTL ? 'row-reverse' : 'row',
            alignItems: 'flex-start',
          }}
        >
          {/* Notification Icon */}
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: NotificationService.getNotificationColor(notification.type, theme) + '20',
              justifyContent: 'center',
              alignItems: 'center',
              marginRight: isRTL ? 0 : SPACING.md,
              marginLeft: isRTL ? SPACING.md : 0,
            }}
          >
            <Ionicons
              name={NotificationService.getNotificationIcon(notification.type) as any}
              size={20}
              color={NotificationService.getNotificationColor(notification.type, theme)}
            />
          </View>

          {/* Notification Content */}
          <View style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: isRTL ? 'row-reverse' : 'row',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: SPACING.xs,
              }}
            >
              <Text allowFontScaling={false}
                style={{
                  fontSize: 16,
                  fontWeight: notification.read ? 'normal' : '600',
                  color: theme.colors.text,
                  flex: 1,
                  textAlign: isRTL ? 'right' : 'left',
                }}
                numberOfLines={2}
              >
                {getNotificationTitle(notification)}
              </Text>
              
              {/* Unread indicator */}
              {!notification.read && (
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: theme.colors.primary,
                    marginLeft: isRTL ? 0 : SPACING.sm,
                    marginRight: isRTL ? SPACING.sm : 0,
                    marginTop: 4,
                  }}
                />
              )}
            </View>

            <Text allowFontScaling={false}
              style={{
                fontSize: 14,
                color: theme.colors.textSecondary,
                lineHeight: 20,
                marginBottom: SPACING.sm,
                textAlign: isRTL ? 'right' : 'left',
              }}
              numberOfLines={3}
            >
              {getNotificationBody(notification)}
            </Text>

            <Text allowFontScaling={false}
              style={{
                fontSize: 12,
                color: theme.colors.textSecondary,
                textAlign: isRTL ? 'right' : 'left',
              }}
            >
              {NotificationService.formatNotificationTime(notification.createdAt instanceof Date ? notification.createdAt : (typeof (notification.createdAt as any)?.toDate === 'function' ? (notification.createdAt as any).toDate() : new Date(notification.createdAt as any)), i18n.language)}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
  );

  // Render empty state
  const renderEmptyState = () => (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: SPACING.xl,
        paddingTop: 100,
      }}
    >
      <Ionicons 
        name="notifications-outline" 
        size={64} 
        color={theme.colors.textSecondary} 
      />
      <Text allowFontScaling={false}
        style={{
          fontSize: 20,
          fontWeight: '600',
          color: theme.colors.text,
          marginTop: SPACING.lg,
          textAlign: 'center',
        }}
      >
        {showOnlyUnread 
          ? t('notifications.noUnreadNotifications')
          : selectedFilter === 'all'
            ? t('notifications.noNotifications')
            : t('notifications.noNotificationsOfType', { 
                type: t(`notifications.types.${selectedFilter}`) 
              })
        }
      </Text>
      <Text allowFontScaling={false}
        style={{
          fontSize: 16,
          color: theme.colors.textSecondary,
          marginTop: SPACING.sm,
          textAlign: 'center',
          lineHeight: 24,
        }}
      >
        {t('notifications.emptyStateDescription')}
      </Text>
      {/* A load that failed inside NotificationService returns [] and lands here,
          so the empty state must always offer a way to try again. */}
      <TouchableOpacity
        onPress={() => loadNotifications(true)}
        style={{
          marginTop: SPACING.lg,
          paddingHorizontal: SPACING.lg,
          paddingVertical: SPACING.sm,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
        activeOpacity={0.7}
      >
        <Text allowFontScaling={false} style={{ fontSize: 14, fontWeight: '600', color: theme.colors.primary }}>
          {t('common.refresh')}
        </Text>
      </TouchableOpacity>
    </View>
  );

  // =================================================================
  // ALIBABA: Skeleton Loading - Static, matches final layout
  // =================================================================
  if (loading) {
    const skeletonOpacity = isDark ? 0.2 : 0.12;
    const skeletonColor = theme.colors.text;
    
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top', 'left', 'right']}>
        {/* Header skeleton */}
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
          <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: skeletonColor, opacity: skeletonOpacity }} />
          <View style={{ flex: 1, marginLeft: SPACING.md }}>
            <View style={{ width: 120, height: 20, borderRadius: 4, backgroundColor: skeletonColor, opacity: skeletonOpacity }} />
          </View>
        </View>
        {/* Filter row skeleton */}
        <View style={{ flexDirection: 'row', padding: SPACING.md }}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={{ width: 70, height: 32, borderRadius: 20, backgroundColor: skeletonColor, opacity: skeletonOpacity, marginRight: SPACING.sm }} />
          ))}
        </View>
        {/* Notification items skeleton */}
        {[1, 2, 3].map((i) => (
          <View key={i} style={{ flexDirection: 'row', padding: SPACING.md, marginHorizontal: SPACING.md, marginBottom: SPACING.sm, backgroundColor: theme.colors.surface, borderRadius: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: skeletonColor, opacity: skeletonOpacity }} />
            <View style={{ flex: 1, marginLeft: SPACING.md }}>
              <View style={{ width: '80%', height: 16, borderRadius: 4, backgroundColor: skeletonColor, opacity: skeletonOpacity, marginBottom: 8 }} />
              <View style={{ width: '60%', height: 14, borderRadius: 4, backgroundColor: skeletonColor, opacity: skeletonOpacity }} />
            </View>
          </View>
        ))}
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header - ALIBABA: No animation */}
        <View
          style={{
            flexDirection: isRTL ? 'row-reverse' : 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: SPACING.md,
            paddingVertical: SPACING.sm,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          {/* Back Button */}
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{
              padding: SPACING.sm,
              marginRight: isRTL ? 0 : SPACING.sm,
              marginLeft: isRTL ? SPACING.sm : 0,
            }}
          >
            <Ionicons
              name={isRTL ? 'chevron-forward' : 'chevron-back'}
              size={24}
              color={theme.colors.text}
            />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text allowFontScaling={false}
              style={{
                fontSize: 24,
                fontWeight: 'bold',
                color: theme.colors.text,
                textAlign: isRTL ? 'right' : 'left',
              }}
            >
              {t('notifications.title')}
            </Text>
            
            {notifications.length > 0 && (
              <Text allowFontScaling={false}
                style={{
                  fontSize: 14,
                  color: theme.colors.textSecondary,
                  marginTop: 2,
                  textAlign: isRTL ? 'right' : 'left',
                }}
              >
                {t('notifications.totalCount', { 
                  total: notifications.length,
                  unread: NotificationService.getUnreadCount()
                })}
              </Text>
            )}
          </View>
          
          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: SPACING.sm }}>
            {notifications.length > 0 && (
              <>
                <TouchableOpacity
                  onPress={handleMarkAllAsRead}
                  style={{
                    padding: SPACING.sm,
                    borderRadius: 8,
                    backgroundColor: theme.colors.primary + '20',
                  }}
                >
                  <Ionicons name="checkmark-done-outline" size={24} color={theme.colors.primary} />
                </TouchableOpacity>
                
                <TouchableOpacity
                  onPress={handleClearAll}
                  style={{
                    padding: SPACING.sm,
                    borderRadius: 8,
                    backgroundColor: theme.colors.error + '20',
                  }}
                >
                  <Ionicons name="trash-outline" size={24} color={theme.colors.error} />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Filter Tabs */}
        <View
          style={{
            flexDirection: isRTL ? 'row-reverse' : 'row',
            paddingHorizontal: SPACING.md,
            paddingVertical: SPACING.sm,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={NOTIFICATION_FILTER_OPTIONS}
            keyExtractor={(item) => item.key}
            renderItem={({ item }) => {
              // ALIBABA: Dynamic active color for filters
              const getActiveColor = (key: string) => {
                switch (key) {
                  case 'order': return '#FF9800';
                  case 'promo': return '#9C27B0';
                  case 'system': return '#03A9F4';
                  default: return theme.colors.primary; // brand amber for 'All'
                }
              };

              const activeColor = getActiveColor(item.key);
              const isSelected = selectedFilter === item.key;

              return (
                <TouchableOpacity
                  onPress={() => handleFilterChange(item.key)}
                  style={{
                    paddingHorizontal: SPACING.md,
                    paddingVertical: SPACING.sm,
                    borderRadius: 20,
                    backgroundColor: isSelected
                      ? activeColor
                      : theme.colors.surface,
                    marginRight: isRTL ? 0 : SPACING.sm,
                    marginLeft: isRTL ? SPACING.sm : 0,
                    borderWidth: 1,
                    borderColor: isSelected
                      ? activeColor
                      : theme.colors.border,
                  }}
                >
                  <Text allowFontScaling={false}
                    style={{
                      color: isSelected
                        ? 'white'
                        : theme.colors.text,
                      fontSize: 14,
                      fontWeight: '500',
                    }}
                  >
                    {t(`notifications.filter.${item.key}`)}
                  </Text>
                </TouchableOpacity>
              );
            }}
            contentContainerStyle={{
              paddingRight: isRTL ? 0 : SPACING.md,
              paddingLeft: isRTL ? SPACING.md : 0,
            }}
          />
          
          {/* Unread filter toggle */}
          <TouchableOpacity
            onPress={handleUnreadToggle}
            style={{
              paddingHorizontal: SPACING.md,
              paddingVertical: SPACING.sm,
              borderRadius: 20,
              backgroundColor: showOnlyUnread
                ? theme.colors.warning
                : theme.colors.surface,
              marginLeft: isRTL ? 0 : SPACING.sm,
              marginRight: isRTL ? SPACING.sm : 0,
              borderWidth: 1,
              borderColor: showOnlyUnread
                ? theme.colors.warning
                : theme.colors.border,
            }}
          >
            <Text allowFontScaling={false}
              style={{
                color: showOnlyUnread
                  ? 'white'
                  : theme.colors.text,
                fontSize: 14,
                fontWeight: '500',
              }}
            >
              {t('notifications.unreadOnly')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Notifications List */}
        <FlatList
          data={filteredNotifications}
          renderItem={renderNotificationItem}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadNotifications(true)}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
          ListEmptyComponent={renderEmptyState}
          contentContainerStyle={[
            { paddingVertical: SPACING.sm },
            filteredNotifications.length === 0 && { flexGrow: 1 },
          ]}
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
    </View>
  );
};

export default NotificationsScreen;
