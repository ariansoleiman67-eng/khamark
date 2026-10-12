/**
 * GOLDEN TEMPLATE: Push Initializer Component
 * 
 * Initializes FCM push registration after user authenticates.
 * Must be placed inside AuthProvider and NotificationProvider.
 * 
 * Rules (LOCKED):
 * - Only registers for authenticated users
 * - Uses native FCM tokens (not Expo)
 * - Handles token refresh
 */

import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { registerNativePushToken } from '../hooks/usePushRegistration';
import { initializePushHandlers, getNavigationTarget } from '../hooks/usePushMessageHandler';
import { useNavigation } from '@react-navigation/native';

export function PushInitializer() {
  const { user, isAuthenticated, isAdmin } = useAuth();
  const { tenantId } = useTenant();
  const navigation = useNavigation<any>();

  // Register push handlers per-mount, bound to THIS navigator. AppNavigator swaps
  // between separate NavigationContainers on auth changes (guest vs admin), each
  // with its own PushInitializer. A module-level "init once" flag used to leave
  // the new instance unregistered after a swap (push taps stopped navigating) and
  // bound to a stale, unmounted navigator. The effect's own cleanup tears the
  // old registration down, so per-mount registration is correct.
  useEffect(() => {
    try {
      const cleanup = initializePushHandlers((type, data) => {
        // Navigate based on push notification type
        const target = getNavigationTarget(type, data);
        if (target) {
          // The shop runs in AdminNavigator, which has no customer OrderDetail
          // route: tapping "New order" did nothing. Open the order in the admin
          // Orders tab instead, the way the admin reports already do.
          if (isAdmin && target.screen === 'OrderDetail') {
            navigation.navigate('Main', { screen: 'AdminOrders', params: target.params });
            return;
          }
          // Admins reply from the store-side chat screen, not the customer one.
          const screen =
            target.screen === 'ChatScreen' && isAdmin ? 'AdminChatScreen' : target.screen;
          navigation.navigate(screen, target.params);
        }
      // This is the only caller that can actually navigate, so it is the only one
      // allowed to consume the one-shot getInitialNotification() value.
      }, { consumeInitialNotification: true });
      return cleanup;
    } catch (error) {
      // FCM not available (Expo Go) - silent fail
      // eslint-disable-next-line no-console
      console.log('FCM not available, using Expo push fallback');
    }
  }, [navigation, isAdmin]);

  // Register FCM token after authentication
  useEffect(() => {
    if (!isAuthenticated || !user?.uid) return;

    const registerToken = async () => {
      try {
        await registerNativePushToken(user.uid, tenantId || undefined);
      } catch (error) {
        // FCM not available (Expo Go) - silent fail
        // eslint-disable-next-line no-console
        console.log('FCM token registration skipped (Expo Go mode)');
      }
    };

    registerToken();
  }, [isAuthenticated, user?.uid, tenantId]);

  // This component doesn't render anything
  return null;
}

export default PushInitializer;
