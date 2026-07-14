import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CartIcon } from './icons/CartIcon';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import AppNumber from './AppNumber';
import Animated, {
  useAnimatedStyle,
  withSpring,
  withTiming,
  useSharedValue,
  runOnJS,
} from 'react-native-reanimated';
import { useTheme } from './ThemeProvider';
import { subscribeToUserConversations, getUserUnreadCount } from '../services/chatService';


const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);
const AnimatedText = Animated.createAnimatedComponent(Text);

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
  index: number;
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
  index,
  cartItemCount,
  messageBadgeCount,
  ordersBadgeCount,
}) => {
  const { theme } = useTheme();
  
  // Animated values
  const scale = useSharedValue(1);
  const dotOpacity = useSharedValue(focused ? 1 : 0);
  const dotWidth = useSharedValue(focused ? 1 : 0);
  
  // Update animations when focused state changes
  React.useEffect(() => {
    scale.value = withSpring(focused ? 1.08 : 1, {
      damping: 14,
      stiffness: 180,
    });
    
    dotOpacity.value = withTiming(focused ? 1 : 0, {
      duration: 250,
    });
    
    dotWidth.value = withSpring(focused ? 1 : 0, {
      damping: 14,
      stiffness: 160,
    });
  }, [focused]);

  // Animated styles
  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const dotAnimatedStyle = useAnimatedStyle(() => ({
    opacity: dotOpacity.value,
    transform: [{ scaleX: dotWidth.value }, { scaleY: dotWidth.value }],
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
        {getTabBarIcon({
          routeName: route.name,
          focused,
          color: focused ? '#FF5000' : theme.colors.textSecondary,
          size: 26,
          cartItemCount,
          messageBadgeCount,
          ordersBadgeCount,
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

const AnimatedTabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const { theme } = useTheme();
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
    <View style={[styles.tabBar, { 
      backgroundColor: theme.colors.surface,
    }]}>

        
        {/* Tab buttons container */}
        <View style={styles.tabsContainer}>
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
                index={index}
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
  tabBar: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  fadeOverlay: {
    height: 30,
    left: 0,
    position: 'absolute',
    right: 0,
    top: -30,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingBottom: 28,
    paddingHorizontal: 8,
    paddingTop: 14,
  },
  tabButton: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 6,
    position: 'relative',
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    marginTop: 6,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginTop: 3,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  activeIndicatorDot: {
    borderRadius: 2,
    height: 3,
    position: 'absolute',
    top: 0,
    width: 20,
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
