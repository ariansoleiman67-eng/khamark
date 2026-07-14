import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { CartIcon } from './icons/CartIcon';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import AppNumber from './AppNumber';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from 'react-native-reanimated';
import { useTheme } from './ThemeProvider';
import { subscribeToUserConversations, getUserUnreadCount } from '../services/chatService';


interface TabBarIconProps {
  routeName: string;
  focused: boolean;
  color: string;
  size: number;
}

// ALIBABA: Cart icon with animated badge wrapper
interface CartIconWithBadgeProps {
  size: number;
  color: string;
  itemCount: number;
}

const CartIconWithBadge = ({ size, color, itemCount }: CartIconWithBadgeProps) => {
  return (
    <View style={styles.cartIconWrapper}>
      <CartIcon size={size} color={color} />
      {itemCount > 0 && (
        <View style={styles.cartBadge}>
          <AppNumber
            value={itemCount > 99 ? 99 : itemCount}
            style={styles.cartBadgeText}
          />
        </View>
      )}
    </View>
  );
};

// Messages icon with badge
interface MessagesIconWithBadgeProps {
  size: number;
  color: string;
  unreadCount: number;
  focused: boolean;
}

const MessagesIconWithBadge = ({ size, color, unreadCount, focused }: MessagesIconWithBadgeProps) => {
  return (
    <View style={styles.cartIconWrapper}>
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
  badgeCount: number;
  focused: boolean;
}

const OrdersIconWithBadge = ({ size, color, badgeCount, focused }: OrdersIconWithBadgeProps) => {
  return (
    <View style={styles.cartIconWrapper}>
      <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={size} color={color} />
      {badgeCount > 0 && (
        <View style={styles.ordersBadge}>
          <Text allowFontScaling={false} style={styles.ordersBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
            {badgeCount > 99 ? '99+' : badgeCount}
          </Text>
        </View>
      )}
    </View>
  );
};

interface TabBarIconPropsWithCart extends TabBarIconProps {
  cartItemCount?: number;
  messageBadgeCount?: number;
  ordersBadgeCount?: number;
}



const getTabBarIcon = ({ routeName, focused, color, size, cartItemCount, messageBadgeCount, ordersBadgeCount }: TabBarIconPropsWithCart) => {


  let iconName: keyof typeof Ionicons.glyphMap;

  switch (routeName) {
    case 'Home':
      iconName = focused ? 'home' : 'home-outline';
      break;
    case 'Categories':
      iconName = focused ? 'grid' : 'grid-outline';
      break;
    case 'Search':
      iconName = focused ? 'search' : 'search-outline';
      break;
    case 'Cart':
      // ALIBABA: Cart icon with badge showing item count
      return <CartIconWithBadge size={size} color={color} itemCount={cartItemCount || 0} />;
    case 'MessagesTab':
      // Messages icon with unread badge
      return <MessagesIconWithBadge size={size} color={color} unreadCount={messageBadgeCount || 0} focused={focused} />;
    case 'Orders':
      return <OrdersIconWithBadge size={size} color={color} badgeCount={ordersBadgeCount || 0} focused={focused} />;

    case 'Profile':
      iconName = focused ? 'person' : 'person-outline';
      break;
    default:
      iconName = 'help-circle-outline';
  }

  return <Ionicons name={iconName} size={size} color={color} />;
};

interface AnimatedTabButtonProps {
  route: any;
  focused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  label: string;
  cartItemCount?: number; // ALIBABA: Pass cart count for badge
  messageBadgeCount?: number; // Unread messages badge count
  ordersBadgeCount?: number; // Unread orders badge count
}

const AnimatedTabButton: React.FC<AnimatedTabButtonProps> = ({
  route,
  focused,
  onPress,
  onLongPress,
  label,
  cartItemCount,
  messageBadgeCount,
  ordersBadgeCount,
}) => {
  const { theme, currentCustomTheme } = useTheme();
  // aynAlfahad: raised active pill is a pure-white card floating over the bar.
  // `card` lives on the raw custom theme; fall back to surface when unavailable.
  const cardColor = currentCustomTheme?.colors.card ?? theme.colors.surface;

  // Animated press/scale value (kept from the original Reanimated behavior)
  const scale = useSharedValue(1);

  // Gentle bump when a tab becomes focused
  React.useEffect(() => {
    scale.value = withSpring(focused ? 1.06 : 1, {
      damping: 14,
      stiffness: 180,
    });
  }, [focused]);

  // Raised active badge: lift it above the bar (translateY) then apply the scale.
  const activeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -18 }, { scale: scale.value }],
  }));

  // Inactive icon: just the press/scale feedback.
  const inactiveAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    // Subtle press feedback, then settle to the focused/unfocused resting scale.
    scale.value = withSpring(0.92, { damping: 15, stiffness: 300 }, () => {
      scale.value = withSpring(focused ? 1.06 : 1, {
        damping: 15,
        stiffness: 200,
      });
    });

    onPress();
  };

  const iconColor = focused ? theme.colors.primary : theme.colors.textSecondary;

  return (
    <TouchableOpacity
      style={styles.tabButton}
      onPress={handlePress}
      onLongPress={onLongPress}
      activeOpacity={0.8}
    >
      <View style={styles.iconSlot}>
        {focused ? (
          <Animated.View
            style={[
              styles.activeBadge,
              {
                backgroundColor: cardColor,
                borderColor: theme.colors.border,
                shadowColor: '#000',
              },
              activeAnimatedStyle,
            ]}
          >
            {getTabBarIcon({
              routeName: route.name,
              focused,
              color: iconColor,
              size: 24,
              cartItemCount,
              messageBadgeCount,
              ordersBadgeCount,
            })}
          </Animated.View>
        ) : (
          <Animated.View style={inactiveAnimatedStyle}>
            {getTabBarIcon({
              routeName: route.name,
              focused,
              color: iconColor,
              size: 24,
              cartItemCount,
              messageBadgeCount,
              ordersBadgeCount,
            })}
          </Animated.View>
        )}
      </View>

      <Text
        allowFontScaling={false}
        style={[
          styles.tabLabel,
          {
            color: iconColor,
            fontWeight: focused ? '700' : '500',
          },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const AnimatedTabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const { theme, isDark } = useTheme();
  const { getCartItemCount } = useCart(); // ALIBABA: Get live cart count
  const { user, isGuest } = useAuth();
  const { ordersBadgeCount } = useNotification();
  const [messageBadgeCount, setMessageBadgeCount] = useState(0);

  // Subscribe to user conversations for unread message count
  useEffect(() => {
    // Don't subscribe for guests or if no user ID
    if (isGuest || !user?.uid) {
      setMessageBadgeCount(0);
      return;
    }

    const unsubscribe = subscribeToUserConversations(
      user.uid,
      (conversations) => {
        const count = getUserUnreadCount(conversations);
        setMessageBadgeCount(count);
      }
    );

    return () => unsubscribe();
  }, [user?.uid, isGuest]);

  // Get cart item count for badge
  const cartItemCount = getCartItemCount();

  return (
    // box-none lets taps in the floating margins fall through to the content below.
    <View style={styles.root} pointerEvents="box-none">
      <View
        style={[
          styles.bar,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
            shadowColor: '#000',
            shadowOpacity: isDark ? 0 : 0.1,
            elevation: isDark ? 0 : 8,
          },
        ]}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = options.tabBarLabel?.toString() || route.name;
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
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
            <AnimatedTabButton
              key={route.key}
              route={route}
              focused={isFocused}
              onPress={onPress}
              onLongPress={onLongPress}
              label={label}
              cartItemCount={cartItemCount}
              messageBadgeCount={messageBadgeCount}
              ordersBadgeCount={ordersBadgeCount}
            />
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // Absolute anchor at the screen bottom; provides the floating margins + safe-area gap.
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 24, // sits above the bottom inset / home indicator
    paddingTop: 24, // headroom so the raised active badge never clips
  },
  // The floating pill bar.
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 8,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
  },
  tabButton: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-start',
  },
  // Fixed-height slot keeps every label on the same baseline regardless of the raised badge.
  iconSlot: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Raised circular badge for the active tab.
  activeBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
  },
  tabLabel: {
    fontSize: 10,
    letterSpacing: 0.3,
    marginTop: 3,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  // ALIBABA: Cart badge styles
  cartIconWrapper: {
    position: 'relative',
  },
  cartBadge: {
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
  cartBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  // Message badge styles (same as cart badge)
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
  // Orders badge styles
  ordersBadge: {
    alignItems: 'center' as const,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    height: 18,
    justifyContent: 'center' as const,
    minWidth: 18,
    paddingHorizontal: 4,
    position: 'absolute' as const,
    right: -10,
    top: -6,
  },
  ordersBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold' as const,
    includeFontPadding: false,
    textAlignVertical: 'center' as const,
  },
});

export default AnimatedTabBar;
