import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  useWindowDimensions,
  AccessibilityInfo,
  LayoutChangeEvent,
  I18nManager,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from './ThemeProvider';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToUserConversations, getUserUnreadCount } from '../services/chatService';
import AppNumber from './AppNumber';
import CurvedTabBarBackground from './CurvedTabBarBackground';

// Design Tokens & Dimensions
const FIGMA_ORANGE = '#A61920'; // Khamark crimson
const BAR_HEIGHT = 68;
const BUTTON_SIZE = 52;
const HORIZONTAL_MARGIN = 16;

interface TabItemConfig {
  name: string;
  activeIcon: keyof typeof Ionicons.glyphMap;
  inactiveIcon: keyof typeof Ionicons.glyphMap;
  size: number;
  labelFallback: string;
}

const TAB_CONFIG: TabItemConfig[] = [
  { name: 'Home', activeIcon: 'home', inactiveIcon: 'home-outline', size: 24, labelFallback: 'Home' },
  { name: 'Categories', activeIcon: 'grid', inactiveIcon: 'grid-outline', size: 23, labelFallback: 'Categories' },
  { name: 'Cart', activeIcon: 'bag-handle', inactiveIcon: 'bag-handle-outline', size: 24, labelFallback: 'Cart' },
  { name: 'MessagesTab', activeIcon: 'chatbubbles', inactiveIcon: 'chatbubbles-outline', size: 23, labelFallback: 'Messages' },
  { name: 'Profile', activeIcon: 'person', inactiveIcon: 'person-outline', size: 23, labelFallback: 'Profile' },
];

/**
 * Calculates symmetric tab centers across bar width W such that the cradle cutout
 * around Tab 0 and Tab 4 remains safely on the top flat edge with a clean >=4px landing
 * before the outer rounded corners (R = 20). Tab 2 (Cart) is mathematically placed at W / 2.
 */
const getTabCenters = (W: number) => {
  const minCx0 = 20 + 37.79 + 4.2; // 62.0 px
  const cx0 = Math.max(minCx0, W * 0.165);
  const step = (W - 2 * cx0) / 4;
  return [
    cx0,
    cx0 + step,
    W / 2,
    cx0 + 3 * step,
    W - cx0,
  ];
};

export const AnimatedTabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { getCartItemCount } = useCart();
  const { user, isGuest } = useAuth();
  const [messageBadgeCount, setMessageBadgeCount] = useState(0);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  // Check reduced motion setting
  useEffect(() => {
    let isMounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (isMounted) setReduceMotion(enabled);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // Unread messages count subscription
  useEffect(() => {
    if (isGuest || !user?.uid) {
      setMessageBadgeCount(0);
      return;
    }

    const unsubscribe = subscribeToUserConversations(user.uid, (conversations) => {
      const count = getUserUnreadCount(conversations);
      setMessageBadgeCount(count);
    });

    return () => unsubscribe();
  }, [user?.uid, isGuest]);

  const cartItemCount = getCartItemCount();

  // Dynamic bar width (measured or window-based fallback)
  const barWidth = measuredWidth > 0 ? measuredWidth : Math.max(280, windowWidth - HORIZONTAL_MARGIN * 2);

  const onBarLayout = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    if (width > 0 && Math.abs(width - measuredWidth) > 1) {
      setMeasuredWidth(width);
    }
  };

  // Derive active tab directly from React Navigation state (single source of truth)
  const currentRouteName = state.routes[state.index]?.name;
  const activeIndex = useMemo(() => {
    const idx = TAB_CONFIG.findIndex((t) => t.name === currentRouteName);
    return idx >= 0 ? idx : 0;
  }, [currentRouteName]);

  const tabCenters = useMemo(() => getTabCenters(barWidth), [barWidth]);
  const isRTL = I18nManager.isRTL;
  const visualActiveIndex = isRTL ? 4 - activeIndex : activeIndex;
  const targetCx = tabCenters[visualActiveIndex] ?? barWidth / 2;

  // Animated horizontal position for the cutout and the raised circle
  const animatedCx = useSharedValue(targetCx);

  useEffect(() => {
    if (reduceMotion) {
      animatedCx.value = targetCx;
    } else {
      animatedCx.value = withTiming(targetCx, {
        duration: 220,
        easing: Easing.bezier(0.25, 1, 0.5, 1),
      });
    }
  }, [targetCx, reduceMotion]);

  const animatedCircleStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: animatedCx.value - BUTTON_SIZE / 2 }],
    };
  });

  const handleTabPress = (route: any, isFocused: boolean) => {
    if (!reduceMotion) {
      Haptics.selectionAsync().catch(() => {});
    }
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });

    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name, route.params);
    }
  };

  const handleTabLongPress = (route: any) => {
    navigation.emit({
      type: 'tabLongPress',
      target: route.key,
    });
  };

  // Surface colors
  const barBg = isDark ? (theme.colors.surface || '#1E1E22') : '#FFFFFF';
  const shadowColor = isDark ? 'rgba(0, 0, 0, 0.55)' : 'rgba(0, 0, 0, 0.08)';
  const strokeColor = isDark ? 'rgba(255, 255, 255, 0.08)' : '#E7E7EA';
  const inactiveIconColor = isDark ? '#7E8088' : '#8E8E93';

  // Active tab details for the raised button
  const activeConfig = TAB_CONFIG[activeIndex];
  const activeRoute = state.routes.find((r) => r.name === activeConfig.name);
  const activeDescriptor = activeRoute ? descriptors[activeRoute.key] : null;
  const activeLabel = activeDescriptor?.options?.tabBarLabel?.toString() || activeConfig.labelFallback;

  const activeBadgeCount =
    activeConfig.name === 'Cart'
      ? cartItemCount
      : activeConfig.name === 'MessagesTab'
      ? messageBadgeCount
      : 0;

  // Compute horizontal padding on tabsRow so flex:1 items align perfectly with tabCenters
  const step = (barWidth - 2 * tabCenters[0]) / 4;
  const sidePad = Math.max(0, tabCenters[0] - step / 2);

  return (
    <View
      style={[
        styles.outerWrapper,
        {
          bottom: Math.max(insets.bottom, 12),
        },
      ]}
      pointerEvents="box-none"
    >
      <View
        style={[
          styles.barContainer,
          {
            width: barWidth,
            height: BAR_HEIGHT,
          },
        ]}
        onLayout={onBarLayout}
      >
        {/* Genuine smooth curved cutout background following animatedCx */}
        <CurvedTabBarBackground
          width={barWidth}
          height={BAR_HEIGHT}
          cx={animatedCx}
          color={barBg}
          shadowColor={shadowColor}
          strokeColor={strokeColor}
        />

        {/* 5-Column Tab Slots Row */}
        <View style={[styles.tabsRow, { paddingHorizontal: sidePad }]}>
          {TAB_CONFIG.map((config, index) => {
            const route = state.routes.find((r) => r.name === config.name);
            const isFocused = activeIndex === index;
            const descriptor = route ? descriptors[route.key] : null;
            const label = descriptor?.options?.tabBarLabel?.toString() || config.labelFallback;

            const badgeCount =
              config.name === 'Cart'
                ? cartItemCount
                : config.name === 'MessagesTab'
                ? messageBadgeCount
                : 0;

            return (
              <TouchableOpacity
                key={config.name}
                style={styles.tabSlotButton}
                onPress={() => route && handleTabPress(route, isFocused)}
                onLongPress={() => route && handleTabLongPress(route)}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityState={{ selected: isFocused }}
                accessibilityLabel={label}
              >
                <View
                  style={[
                    styles.iconContainer,
                    { opacity: isFocused ? 0 : 1 },
                  ]}
                >
                  <Ionicons
                    name={config.inactiveIcon}
                    size={config.size}
                    color={inactiveIconColor}
                  />
                  {badgeCount > 0 && (
                    <View style={[styles.sideBadge, { backgroundColor: FIGMA_ORANGE }]}>
                      {config.name === 'Cart' ? (
                        <AppNumber
                          value={badgeCount > 99 ? 99 : badgeCount}
                          style={styles.sideBadgeText}
                        />
                      ) : (
                        <Text
                          allowFontScaling={false}
                          style={styles.sideBadgeText}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.85}
                        >
                          {badgeCount > 99 ? '99+' : badgeCount}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Single raised red circle following the selected tab */}
        <Animated.View
          style={[
            styles.raisedCircleWrapper,
            animatedCircleStyle,
          ]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={styles.raisedCircleButton}
            onPress={() => activeRoute && handleTabPress(activeRoute, true)}
            onLongPress={() => activeRoute && handleTabLongPress(activeRoute)}
            activeOpacity={0.88}
            accessibilityRole="tab"
            accessibilityState={{ selected: true }}
            accessibilityLabel={activeLabel}
            hitSlop={{ top: 10, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name={activeConfig.activeIcon} size={activeConfig.size} color="#FFFFFF" />
            {activeBadgeCount > 0 && (
              <View style={styles.raisedBadge}>
                {activeConfig.name === 'Cart' ? (
                  <AppNumber
                    value={activeBadgeCount > 99 ? 99 : activeBadgeCount}
                    style={styles.raisedBadgeText}
                  />
                ) : (
                  <Text
                    allowFontScaling={false}
                    style={styles.raisedBadgeText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                  >
                    {activeBadgeCount > 99 ? '99+' : activeBadgeCount}
                  </Text>
                )}
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  barContainer: {
    position: 'relative',
    overflow: 'visible',
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: BAR_HEIGHT,
    zIndex: 10,
  },
  tabSlotButton: {
    flex: 1,
    height: BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 48,
    minHeight: 48,
  },
  iconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
  },
  raisedCircleWrapper: {
    position: 'absolute',
    top: -16,
    left: 0,
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    zIndex: 25,
  },
  raisedCircleButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: FIGMA_ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 6,
  },
  raisedBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#831319',
    borderRadius: 999,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  raisedBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  sideBadge: {
    position: 'absolute',
    top: -3,
    right: -8,
    borderRadius: 8,
    height: 16,
    minWidth: 16,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  sideBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});

export default AnimatedTabBar;
