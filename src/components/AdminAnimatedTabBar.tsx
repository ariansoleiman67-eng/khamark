import { supabase, uniqueChannel } from '../services/supabase';
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  withSpring,
  withTiming,
  useSharedValue,
  runOnJS,
} from 'react-native-reanimated';
import { useTheme } from './ThemeProvider';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToAdminConversations, getAdminUnreadCount } from '../services/chatService';
import { useTenant } from '../contexts/TenantContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

interface TabBarIconProps {
  routeName: string;
  focused: boolean;
  color: string;
  size: number;
}

// Messages icon with badge
interface MessagesIconWithBadgeProps {
  size: number;
  color: string;
  unreadCount: number;
  focused: boolean;
}

const MessagesIconWithBadge = ({ size, color, unreadCount, focused }: MessagesIconWithBadgeProps) => {
  return (
    <View style={styles.iconWithBadgeWrapper}>
      <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={size} color={color} />
      {unreadCount > 0 && (
        <View style={styles.messageBadge}>
          <Text allowFontScaling={false} style={styles.messageBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
    </View>
  );
};

// Orders icon with badge  
interface OrdersIconWithBadgeProps {
  size: number;
  color: string;
  pendingCount: number;
  focused: boolean;
}

const OrdersIconWithBadge = ({ size, color, pendingCount, focused }: OrdersIconWithBadgeProps) => {
  return (
    <View style={styles.iconWithBadgeWrapper}>
      <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={size} color={color} />
      {pendingCount > 0 && (
        <View style={styles.orderBadge}>
          <Text allowFontScaling={false} style={styles.orderBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
            {pendingCount > 99 ? '99+' : pendingCount}
          </Text>
        </View>
      )}
    </View>
  );
};

interface TabBarIconPropsWithBadges extends TabBarIconProps {
  unreadCount?: number;
  pendingOrdersCount?: number;
}

const getAdminTabBarIcon = ({ routeName, focused, color, size, unreadCount, pendingOrdersCount }: TabBarIconPropsWithBadges) => {
  let iconName: keyof typeof Ionicons.glyphMap;

  switch (routeName) {
    case 'AdminDashboard':
      iconName = focused ? 'grid' : 'grid-outline';
      break;
    case 'AdminOrders':
      return <OrdersIconWithBadge size={size} color={color} pendingCount={pendingOrdersCount || 0} focused={focused} />;
    case 'AdminProducts':
      iconName = focused ? 'cube' : 'cube-outline';
      break;
    case 'AdminSettings':
      iconName = focused ? 'settings' : 'settings-outline';
      break;
    case 'AdminConversations':
      return <MessagesIconWithBadge size={size} color={color} unreadCount={unreadCount || 0} focused={focused} />;
    default:
      iconName = 'help-circle-outline';
  }

  return <Ionicons name={iconName} size={size} color={color} />;
};

interface AnimatedAdminTabButtonProps {
  route: any;
  focused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  label: string;
  index: number;
  unreadCount?: number;
  pendingOrdersCount?: number;
}

const AnimatedAdminTabButton: React.FC<AnimatedAdminTabButtonProps> = ({
  route,
  focused,
  onPress,
  onLongPress,
  label,
  index,
  unreadCount,
  pendingOrdersCount,
}) => {
  const { theme } = useTheme();
  
  // Animated values - simplified for clean design (matching user tab bar)
  const scale = useSharedValue(1);
  const dotOpacity = useSharedValue(focused ? 1 : 0);
  const dotScale = useSharedValue(focused ? 1 : 0);
  
  // Update animations when focused state changes
  React.useEffect(() => {
    // Subtle icon scale
    scale.value = withSpring(focused ? 1.05 : 1, {
      damping: 15,
      stiffness: 200,
    });
    
    // Blue dot animation
    dotOpacity.value = withTiming(focused ? 1 : 0, {
      duration: 200,
    });
    
    dotScale.value = withSpring(focused ? 1 : 0, {
      damping: 12,
      stiffness: 150,
    });
  }, [focused]);

  // Animated styles
  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const dotAnimatedStyle = useAnimatedStyle(() => ({
    opacity: dotOpacity.value,
    transform: [{ scale: dotScale.value }],
  }));

  const handlePress = () => {
    // Subtle press feedback
    scale.value = withSpring(0.95, { duration: 100 }, () => {
      scale.value = withSpring(focused ? 1.05 : 1, {
        damping: 15,
        stiffness: 200,
      });
    });
    
    runOnJS(onPress)();
  };

  return (
    <AnimatedTouchableOpacity
      style={styles.tabButton}
      onPress={handlePress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      {/* Blue dot indicator above icon */}
      <Animated.View 
        style={[
          styles.activeIndicatorDot,
          { backgroundColor: '#FF5000' }, // Alibaba Orange
          dotAnimatedStyle,
        ]} 
      />
      
      <Animated.View style={[styles.iconContainer, iconAnimatedStyle]}>
        {getAdminTabBarIcon({
          routeName: route.name,
          focused,
          color: focused ? '#FF5000' : theme.colors.textSecondary, // Alibaba Orange
          size: 24,
          unreadCount,
          pendingOrdersCount,
        })}
      </Animated.View>
      
      <Text allowFontScaling={false}
        style={[
          styles.tabLabel,
          {
            color: focused ? '#FF5000' : theme.colors.textSecondary, // Alibaba Orange
            fontWeight: focused ? '600' : '400',
          },
        ]}
        numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}
      >
        {label}
      </Text>
    </AnimatedTouchableOpacity>
  );
};

const AdminAnimatedTabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { tenantId } = useTenant();
  const insets = useSafeAreaInsets();
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);

  // Subscribe to unread messages count
  useEffect(() => {
    if (!user?.uid) return;

    const unsubscribe = subscribeToAdminConversations(
      user.uid,
      (conversations) => {
        const count = getAdminUnreadCount(conversations);
        setUnreadCount(count);
      },
    );

    return () => unsubscribe();
  }, [user?.uid]);

  // Subscribe to PENDING ORDERS count (Supabase realtime: re-query on any order change)
  useEffect(() => {
    if (!tenantId) return;
    let active = true;

    const fetchCount = async () => {
      const { count } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'pending');
      if (active) setPendingOrdersCount(count || 0);
    };

    fetchCount();

    const channel = uniqueChannel(`pending_orders_${tenantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
        () => fetchCount(),
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  return (
    <View style={[styles.tabBar, { 
      borderColor: theme.colors.border + '30',
      backgroundColor: theme.colors.background,
    }]}>
      {/* Themed gradient background - same as user tab bar */}
      <LinearGradient
        colors={[
          theme.colors.surface + 'F0',
          theme.colors.background + 'F5',
          theme.colors.surface + 'F0',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.backgroundBlur}
      />
      
      {/* Tab buttons container */}
      <View style={[styles.tabsContainer, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = options.tabBarLabel?.toString() || route.name.replace('Admin', '');
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (event.defaultPrevented) return;

            // Orders tab with a "waiting" badge: tapping it takes you straight to the
            // pending orders. Runs even if the tab is already focused, so re-tapping
            // re-applies the Pending filter and scrolls to the top.
            if (route.name === 'AdminOrders' && pendingOrdersCount > 0) {
              navigation.navigate(route.name, { ...(route.params as any), focusPending: Date.now() } as any);
              return;
            }

            if (!isFocused) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <AnimatedAdminTabButton
              key={route.key}
              route={route}
              focused={isFocused}
              onPress={onPress}
              onLongPress={onLongPress}
              label={label}
              index={index}
              unreadCount={unreadCount}
              pendingOrdersCount={pendingOrdersCount}
            />
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // Main container - edge-to-edge with rounded top (same as user)
  tabBar: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    bottom: 0,
    elevation: 8,
    left: 0,
    position: 'absolute',
    right: 0,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  backgroundBlur: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingBottom: 24,
    paddingHorizontal: 16,
    paddingTop: 12, // Extra padding for home indicator + label visibility
  },
  tabButton: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 4,
    position: 'relative',
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    marginTop: 8, // Space for dot above
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
    textAlign: 'center',
  },
  activeIndicatorDot: {
    borderRadius: 3,
    height: 6,
    position: 'absolute',
    top: 0,
    width: 6,
  },
  // Badge wrapper for icons with badges
  iconWithBadgeWrapper: {
    position: 'relative',
  },
  // Message badge styles
  messageBadge: {
    alignItems: 'center',
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    height: 18,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -10,
    top: -6,
  },
  messageBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  // Order badge styles (orange for pending orders)
  orderBadge: {
    position: 'absolute',
    top: -6,
    right: -10,
    backgroundColor: '#FF9500', // Orange for orders
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  orderBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});

export default AdminAnimatedTabBar;
