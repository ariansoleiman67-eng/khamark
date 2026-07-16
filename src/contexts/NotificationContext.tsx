import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import * as Notifications from 'expo-notifications';
import { supabase, uniqueChannel } from '../services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface NotificationContextValue {
  badgeCount: number;
  ordersBadgeCount: number;
  clearBadge: () => Promise<void>;
  markOrdersAsViewed: () => Promise<void>;
  isLoading: boolean;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export function useNotification(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return context;
}

export function useBadgeCount(): number {
  const { badgeCount } = useNotification();
  return badgeCount;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [badgeCount, setBadgeCount] = useState(0);
  const [ordersBadgeCount, setOrdersBadgeCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  // Held in a ref (not state) so opening the Orders tab / marking orders viewed
  // updates the threshold read by the realtime closures WITHOUT retearing the
  // effect and resubscribing both realtime channels.
  const lastViewedRef = useRef<number>(0);

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setUserId(session?.user?.id || null);
      if (!session?.user) {
        setBadgeCount(0);
        setOrdersBadgeCount(0);
        setIsLoading(false);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId) return;

    let notifChannel: any;
    let ordersChannel: any;
    let cancelled = false;

    const setupListeners = async () => {
      setIsLoading(true);
      try {
        // Load the persisted "last viewed orders" time authoritatively here so
        // both the initial unread computation and the realtime closures use the
        // correct threshold. Reading it here (instead of depending on it as an
        // effect dependency) means opening the Orders tab does NOT tear down and
        // resubscribe the realtime channels.
        try {
          const storedViewed = await AsyncStorage.getItem('last_viewed_orders_time');
          if (storedViewed) {
            const parsed = parseInt(storedViewed, 10);
            if (!Number.isNaN(parsed)) lastViewedRef.current = parsed;
          }
        } catch {
          // ignore storage read failure; keep whatever lastViewedRef holds
        }
        if (cancelled) return;

        // Fetch initial notification count
        const { count: unreadNotifs } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('read', false);

        if (cancelled) return;
        const nBadge = unreadNotifs || 0;
        setBadgeCount(nBadge);
        try {
          await Notifications.setBadgeCountAsync(nBadge);
        } catch (e) {
          console.warn('Failed to set device badge count:', e);
        }

        // Fetch initial orders count
        const { data: recentOrders } = await supabase
          .from('orders')
          .select('updated_at')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(20);

        if (cancelled) return;
        let unreadOrders = 0;
        if (recentOrders) {
          recentOrders.forEach(order => {
            if (new Date(order.updated_at).getTime() > lastViewedRef.current) {
              unreadOrders++;
            }
          });
        }
        setOrdersBadgeCount(unreadOrders);

        // The effect may have been torn down (or re-run) while the awaits above
        // were pending. Bail before subscribing so we don't create channels that
        // the already-finished cleanup will never remove (a permanent leak on
        // this always-mounted provider).
        if (cancelled) return;

        // Setup real-time listeners
        notifChannel = uniqueChannel(`public:notifications:${userId}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, async () => {
            const { count } = await supabase
              .from('notifications')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', userId)
              .eq('read', false);

            if (cancelled) return;
            const newBadge = count || 0;
            setBadgeCount(newBadge);
            try {
              await Notifications.setBadgeCountAsync(newBadge);
            } catch (e) {
              console.warn('Failed to set device badge count:', e);
            }
          })
          .subscribe();

        ordersChannel = uniqueChannel(`public:orders:${userId}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${userId}` }, async () => {
            const { data: updatedOrders } = await supabase
              .from('orders')
              .select('updated_at')
              .eq('user_id', userId)
              .order('updated_at', { ascending: false })
              .limit(20);

            if (cancelled) return;
            let newUnreadOrders = 0;
            if (updatedOrders) {
              updatedOrders.forEach(order => {
                if (new Date(order.updated_at).getTime() > lastViewedRef.current) {
                  newUnreadOrders++;
                }
              });
            }
            setOrdersBadgeCount(newUnreadOrders);
          })
          .subscribe();
      } catch (error) {
        console.error('NotificationContext setupListeners failed:', error);
      } finally {
        // Reset loading on every exit path (including thrown awaits) so a
        // consumer gating on isLoading can never be stuck spinning forever.
        if (!cancelled) setIsLoading(false);
      }
    };

    setupListeners().catch(() => {});

    return () => {
      cancelled = true;
      if (notifChannel) supabase.removeChannel(notifChannel);
      if (ordersChannel) supabase.removeChannel(ordersChannel);
    };
  }, [userId]);

  const clearBadge = useCallback(async () => {
    if (!userId) return;

    try {
      await supabase
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('read', false);
        
      // Update local state immediately so the in-app badge clears even if the
      // realtime echo is delayed/dropped (common on flaky networks).
      setBadgeCount(0);
      await Notifications.setBadgeCountAsync(0);
    } catch (error) {
      console.error('Error clearing badge:', error);
    }
  }, [userId]);

  const markOrdersAsViewed = useCallback(async () => {
    const now = Date.now();
    lastViewedRef.current = now;
    setOrdersBadgeCount(0);
    await AsyncStorage.setItem('last_viewed_orders_time', now.toString());
  }, []);

  const value: NotificationContextValue = {
    badgeCount,
    ordersBadgeCount,
    clearBadge,
    markOrdersAsViewed,
    isLoading,
  };

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export default NotificationProvider;
