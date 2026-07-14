import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  AccessibilityInfo,
  TextInput,
  FlatList,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';

import { useTheme } from '../components/ThemeProvider';
import { useAuthGate } from '../hooks/useAuthGate';
import { useCart } from '../contexts/CartContext';
import { Order, OrderStatus } from '../types';
import { OrderService } from '../services/OrderService';
import { useNotification } from '../contexts/NotificationContext';



import Button from '../components/Button';
import { OrderStatusBadge } from '../components/OrderStatusBadge';
import { formatCurrency, formatPrice } from '../utils/currency';
import { getThumbnailUrl } from '../utils/imageUtils';
import { useCurrency } from '../contexts/CurrencyContext';
import { formatFirestoreDate } from '../utils/dateUtils';
import { getDirection } from '../locales';
import { SPACING } from '../constants/theme';
type DateFilter = 'all' | 'week' | 'month' | 'year';

// GOLDEN TEMPLATE: Bottom tab bar height for padding
const TAB_BAR_HEIGHT = 80;

// Enhanced status color mapping (for progress bar and icons)
const STATUS_CONFIG = {
  pending: { color: '#f59e0b', bgColor: '#fef3c7', icon: 'time-outline' },
  confirmed: { color: '#3b82f6', bgColor: '#dbeafe', icon: 'checkmark-circle-outline' },
  processing: { color: '#8b5cf6', bgColor: '#e9d5ff', icon: 'cog-outline' },
  shipped: { color: '#06b6d4', bgColor: '#cffafe', icon: 'airplane-outline' },
  delivered: { color: '#10b981', bgColor: '#d1fae5', icon: 'checkmark-done-circle-outline' },
  cancelled: { color: '#ef4444', bgColor: '#fecaca', icon: 'close-circle-outline' },
  cancelled_by_store: { color: '#ef4444', bgColor: '#fecaca', icon: 'close-circle-outline' },
  cancelled_by_user: { color: '#f59e0b', bgColor: '#fef3c7', icon: 'close-circle-outline' },
} as const;

/**
 * ORDERS SCREEN - GOLDEN TEMPLATE
 * 
 * Architecture:
 * SafeAreaView (edges: ['top','left','right'])
 *  └── FlatList (SINGLE vertical scroll owner)
 *       ├── ListHeaderComponent
 *       │    ├── Header
 *       │    ├── Search (state-controlled)
 *       │    └── Filters (state-controlled)
 *       │
 *       ├── Order Cards (no shadows)
 *       └── paddingBottom for tab bar
 * 
 * Rules enforced:
 * - ONE vertical scroll owner
 * - NO layout-affecting animations
 * - NO shadows on scrollable content
 * - NO fixed heights on content
 * - aspectRatio for images
 */
export const OrdersScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const { refreshCart } = useCart();
  const { currency: currentCurrency, exchangeRateIQD } = useCurrency();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);

  // Use notification context to clear badge
  const { markOrdersAsViewed } = useNotification();

  

  // GOLDEN TEMPLATE: Auth gate - guests MUST NOT access Orders
  const { isAuthenticated, needsAuth } = useAuthGate();
  
  // If guest, redirect to LoginGate immediately
  if (needsAuth()) {
    // Navigate to LoginGate with reason
    navigation.navigate('LoginGate', { reason: 'orders' });
    
    // Return a loading state while navigating
    return (
      <SafeAreaView 
        style={{ flex: 1, backgroundColor: theme.colors.background }} 
        edges={['top', 'left', 'right']}
      >
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          {/* ALIBABA: Static skeleton instead of spinner */}
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: theme.colors.text, opacity: isDark ? 0.2 : 0.12 }} />
        </View>
      </SafeAreaView>
    );
  }
  
  const ORDER_STATUSES: Array<{ key: OrderStatus | 'all' | 'cancelled' }> = [
    { key: 'all' },
    { key: 'pending' },
    { key: 'confirmed' },
    { key: 'processing' },
    { key: 'shipped' },
    { key: 'delivered' },
    { key: 'cancelled' }, // Filter shows both cancelled types
  ];

  // Helper to check if status is any cancelled type
  const isCancelledStatus = (status: string) => 
    status === 'cancelled' || status === 'cancelled_by_store' || status === 'cancelled_by_user';

  const DATE_FILTERS: Array<{ key: DateFilter }> = [
    { key: 'all' },
    { key: 'week' },
    { key: 'month' },
    { key: 'year' },
  ];
  
  // State
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | 'all'>('all');
  const [selectedDateFilter, setSelectedDateFilter] = useState<DateFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  
  // ALIBABA: Motion safety state
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  
  // ALIBABA: Last viewed order highlight (temporary)
  const [lastViewedOrderId, setLastViewedOrderId] = useState<string | null>(null);
  const LAST_VIEWED_STORAGE_KEY = 'orders_last_viewed_order_id';
  
  // =================================================================
  // ALIBABA: Check Reduce Motion + Load last viewed order on mount
  // =================================================================
  useEffect(() => {
    const init = async () => {
      try {
        const isEnabled = await AccessibilityInfo.isReduceMotionEnabled();
        setReduceMotionEnabled(isEnabled);
        
        // Load last viewed order
        const storedLastViewed = await AsyncStorage.getItem(LAST_VIEWED_STORAGE_KEY);
        if (storedLastViewed) {
          setLastViewedOrderId(storedLastViewed);
        }
      } catch {
        // Default to false
      }
    };
    init();
  }, []);

  const isRTL = i18n?.language ? getDirection(i18n.language) === 'rtl' : false;

  // Load orders
  const loadOrders = useCallback(async (refresh = false) => {
    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      // Auth is already gated at screen entry
      if (!isAuthenticated) {
        return;
      }

      const userOrders = await OrderService.getUserOrders(refresh);
      setOrders(userOrders);
      filterOrders(userOrders, selectedStatus, selectedDateFilter, searchQuery);
    } catch (error) {
      console.error('Error loading orders:', error);
      Alert.alert(t('common.error'), t('orders.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedStatus, selectedDateFilter, searchQuery, t]);

  // Filter function
  const filterOrders = useCallback((
    allOrders: Order[],
    status: OrderStatus | 'all',
    dateFilter: DateFilter,
    search: string
  ) => {
    let filtered = allOrders;

    if (status === 'cancelled') {
      // The "Cancelled" chip covers all cancelled variants (legacy + by store/user).
      filtered = filtered.filter(order => isCancelledStatus(order.status));
    } else if (status !== 'all') {
      filtered = filtered.filter(order => order.status === status);
    }

    if (dateFilter !== 'all') {
      const now = new Date();
      let startDate: Date;
      
      switch (dateFilter) {
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          startDate = new Date(0);
      }
      
      filtered = filtered.filter(order => {
        const orderDate = order.createdAt instanceof Date
          ? order.createdAt
          : (typeof (order.createdAt as any)?.toDate === 'function' ? (order.createdAt as any).toDate() : new Date(order.createdAt as any));
        return orderDate >= startDate;
      });
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(order =>
        order.orderNumber.toLowerCase().includes(searchLower) ||
        order.items.some(item =>
          item.productName.toLowerCase().includes(searchLower) ||
          item.partNumber?.toLowerCase().includes(searchLower)
        )
      );
    }

    setFilteredOrders(filtered);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
      markOrdersAsViewed(); // Clear badge when screen is focused
    }, [loadOrders, markOrdersAsViewed])



  );

  const handleStatusFilter = (status: OrderStatus | 'all') => {
    setSelectedStatus(status);
    setExpandedOrders(new Set());
    filterOrders(orders, status, selectedDateFilter, searchQuery);
  };

  const handleDateFilter = (dateFilter: DateFilter) => {
    setSelectedDateFilter(dateFilter);
    setExpandedOrders(new Set());
    filterOrders(orders, selectedStatus, dateFilter, searchQuery);
  };

  const toggleOrderExpansion = (orderId: string) => {
    setExpandedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim() !== searchQuery.trim()) {
      setExpandedOrders(new Set());
    }
    filterOrders(orders, selectedStatus, selectedDateFilter, query);
  };

  const toggleSearch = () => {
    setShowSearch(!showSearch);
    if (showSearch) {
      setSearchQuery('');
      handleSearch('');
    }
  };

  const toggleFilters = () => {
    setShowFilters(!showFilters);
  };

  const handleOrderAction = (order: Order, action: string) => {
    switch (action) {
      case 'reorder':
        handleReorder(order);
        break;
      case 'cancel':
        handleCancelOrder(order);
        break;
      case 'track':
        // ALIBABA: Store last viewed order for highlight on return
        AsyncStorage.setItem(LAST_VIEWED_STORAGE_KEY, order.id);
        navigation.navigate('OrderDetail', { orderId: order.id });
        break;
      default:
        // ALIBABA: Store last viewed order for highlight on return
        AsyncStorage.setItem(LAST_VIEWED_STORAGE_KEY, order.id);
        navigation.navigate('OrderDetail', { orderId: order.id });
    }
  };

  const handleReorder = async (order: Order) => {
    Alert.alert(
      t('orders.reorder.title'),
      t('orders.reorder.confirmation'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('orders.reorder.confirm'),
          onPress: async () => {
            try {
              const result = await OrderService.reorder(order.id);
              await refreshCart();
              
              Alert.alert(
                t('orders.reorder.success'),
                t('orders.reorder.successMessage', {
                  added: result.addedItems,
                  skipped: result.skippedItems,
                }),
                [
                  { text: t('common.continueShopping'), style: 'cancel' },
                  {
                    text: t('cart.viewCart'),
                    onPress: () => navigation.navigate('Cart' as never),
                  },
                ]
              );
            } catch (error: any) {
              Alert.alert(t('common.error'), error.message);
            }
          },
        },
      ]
    );
  };

  const handleCancelOrder = async (order: Order) => {
    Alert.alert(
      t('orders.cancel.title'),
      t('orders.cancel.confirmation'),
      [
        { text: t('common.no'), style: 'cancel' },
        {
          text: t('orders.cancel.confirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              await OrderService.cancelOrder(order.id);
              Alert.alert(
                t('orders.cancel.success'),
                t('orders.cancel.successMessage')
              );
              loadOrders(true);
            } catch (error: any) {
              Alert.alert(t('common.error'), error.message);
            }
          },
        },
      ]
    );
  };

  const getStatusConfig = (status: OrderStatus) => STATUS_CONFIG[status] || STATUS_CONFIG.pending;

  const getDeliveryProgress = (status: OrderStatus) => {
    const statusOrder = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];
    const currentIndex = statusOrder.indexOf(status);
    return Math.max(0, (currentIndex + 1) / statusOrder.length);
  };

  const getDeliveryText = (order: Order) => {
    if (isCancelledStatus(order.status)) {
      return t('orders.cancelledOn', { date: formatFirestoreDate(order.updatedAt || order.createdAt, i18n.language) });
    }
    if (order.status === 'delivered') {
      return t('orders.deliveredOn', { date: formatFirestoreDate(order.updatedAt || order.createdAt, i18n.language) });
    }
    return OrderService.getDeliveryEstimate?.(order) || t('common.processing');
  };

  const ordersCount = useMemo(() => ({
    total: orders.length,
    filtered: filteredOrders.length,
    pending: orders.filter(o => o.status === 'pending').length,
  }), [orders, filteredOrders]);

  // Render order item - GOLDEN TEMPLATE: NO shadows, NO fixed heights
  // ALIBABA: Last-viewed highlight + activeOpacity
  const renderOrderItem = ({ item: order }: { item: Order }) => {
    const statusConfig = getStatusConfig(order.status);
    const isExpanded = expandedOrders.has(order.id);
    const deliveryProgress = getDeliveryProgress(order.status);
    const isLastViewed = lastViewedOrderId === order.id;

    const displayCurrency = (order.currency || currentCurrency) as 'USD' | 'IQD';
    const displayExchangeRate = order.exchangeRate || exchangeRateIQD;
    
    return (
      <View
        style={{
          backgroundColor: isDark ? theme.colors.surface : '#FF781610',
          marginHorizontal: SPACING.md,
          marginVertical: SPACING.sm,
          borderRadius: 18,
          // ALIBABA: Subtle highlight for last-viewed order
          ...(isLastViewed && {
            borderWidth: 1.5,
            borderColor: theme.colors.primary + '40',
          }),
          // NO shadows for stability
        }}
      >
        {/* Status accent bar */}
        <View style={{
          height: 3,
          backgroundColor: statusConfig.color,
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
        }} />

        <TouchableOpacity
          onPress={() => {
            toggleOrderExpansion(order.id);
            // ALIBABA: Clear highlight on tap
            if (isLastViewed) {
              setLastViewedOrderId(null);
            }
          }}
          activeOpacity={0.8}
          style={{ padding: SPACING.md }}
        >
          {/* Order Header */}
          <View
            style={{
              flexDirection: isRTL ? 'row-reverse' : 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: SPACING.md,
            }}
          >
            <View style={{ flex: 1, marginRight: isRTL ? 0 : SPACING.md, marginLeft: isRTL ? SPACING.md : 0 }}>
              <Text allowFontScaling={false}
                style={{
                  fontSize: 17,
                  fontWeight: '700',
                  color: theme.colors.text,
                  textAlign: isRTL ? 'right' : 'left',
                  marginBottom: SPACING.xs,
                  letterSpacing: -0.2,
                }}
              >
                {t('order.order', { defaultValue: 'Order' })} {order.orderNumber.replace(/ORD/g, '').replace(/#/g, '').replace(/-/g, '')}
              </Text>
              <Text allowFontScaling={false}
                style={{
                  fontSize: 14,
                  color: theme.colors.textSecondary,
                  textAlign: isRTL ? 'right' : 'left',
                  marginBottom: SPACING.xs,
                }}
              >
                {formatFirestoreDate(order.createdAt, i18n.language)}
              </Text>
              <Text allowFontScaling={false}
                style={{
                  fontSize: 19,
                  fontWeight: '700',
                  color: theme.colors.primary,
                  textAlign: isRTL ? 'right' : 'left',
                  letterSpacing: -0.2,
                }}
              >
                {formatPrice(order.totalUSD || 0, displayCurrency, displayExchangeRate)}
              </Text>
            </View>
            

            
            {/* Status Badge & Tracking Button Group */}
            <View style={{ alignItems: isRTL ? 'flex-start' : 'flex-end' }}>
              
              {/* Tracking Button (New Top Right Position - Enlarged) - Only show when shipped */}
              {order.trackingUrl && order.status === 'shipped' ? (
                <TouchableOpacity
                  onPress={() => {
                     const url = order.trackingUrl;
                     if (url) {
                        const finalUrl = url.startsWith('http') ? url : 'https://' + url;
                        Linking.openURL(finalUrl).catch(err => Alert.alert(t('common.error'), t('orders.errors.cannotOpenLink')));
                     }
                  }}
                  activeOpacity={0.8}
                  style={{
                    flexDirection: isRTL ? 'row-reverse' : 'row',
                    alignItems: 'center',
                    backgroundColor: theme.colors.surface,
                    borderWidth: 1.5,
                    borderColor: theme.colors.primary,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 20,
                    marginBottom: 6,
                  }}
                >
                   <Image 
                      source={require('../../assets/tracking_icon_new.jpg')}
                      style={{ width: 20, height: 20, borderRadius: 10, marginRight: isRTL ? 0 : 6, marginLeft: isRTL ? 6 : 0 }}
                      contentFit="cover"
                   />
                   <Text allowFontScaling={false} style={{ 
                      fontSize: 14, 
                      fontWeight: '700', 
                      color: theme.colors.primary 
                   }}>
                      {t('orders.trackOrder')}
                   </Text>
                </TouchableOpacity>
              ) : (
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={24}
                  color={theme.colors.textSecondary}
                />
              )}
            </View>
          </View>

          {/* Order Items - GOLDEN TEMPLATE: aspectRatio for images */}
          <View style={{ marginBottom: SPACING.lg }}>
            <Text allowFontScaling={false}
              style={{
                fontSize: 16,
                fontWeight: '600',
                color: theme.colors.text,
                textAlign: isRTL ? 'right' : 'left',
                marginBottom: SPACING.md,
              }}
            >
              {t('orders.itemsCount', { count: order.items.length })}
            </Text>
            
            {order.items.slice(0, isExpanded ? order.items.length : 2).map((item, itemIndex) => (
              <View
                key={itemIndex}
                style={{
                  flexDirection: isRTL ? 'row-reverse' : 'row',
                  alignItems: 'center',
                  backgroundColor: theme.colors.background,
                  padding: SPACING.sm,
                  borderRadius: 14,
                  marginBottom: SPACING.sm,
                }}
              >
                {/* Product Thumbnail - GOLDEN TEMPLATE: aspectRatio */}
                <View
                  style={{
                    width: 50,
                    aspectRatio: 1,
                    borderRadius: 8,
                    backgroundColor: theme.colors.surface,
                    marginRight: isRTL ? 0 : SPACING.sm,
                    marginLeft: isRTL ? SPACING.sm : 0,
                    justifyContent: 'center',
                    alignItems: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {item.imageUrl ? (
                    <Image
                      source={{ uri: getThumbnailUrl(item.imageUrl, 120) }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                    />
                  ) : (
                    <MaterialCommunityIcons
                      name="car-brake-abs"
                      size={24}
                      color={theme.colors.textSecondary}
                    />
                  )}
                </View>
                
                {/* Product Details */}
                <View style={{ flex: 1 }}>
                  <Text allowFontScaling={false}
                    style={{
                      fontSize: 15,
                      fontWeight: '600',
                      color: theme.colors.text,
                      textAlign: isRTL ? 'right' : 'left',
                      marginBottom: 2,
                    }}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                  >
                    {i18n.language === 'ar' && ((item as any).productNameAr || (item as any).productSnapshot?.nameAr) ? ((item as any).productNameAr || (item as any).productSnapshot?.nameAr) : i18n.language === 'ku' && ((item as any).productNameKu || (item as any).productSnapshot?.nameKu) ? ((item as any).productNameKu || (item as any).productSnapshot?.nameKu) : item.productName}
                  </Text>
                  <Text allowFontScaling={false}
                    numberOfLines={1}
                    style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: theme.colors.primary,
                      textAlign: isRTL ? 'left' : 'right',
                    }}
                  >
                    {`${item.quantity} × ${formatPrice(item.priceUSD, displayCurrency, displayExchangeRate)} = `}{formatPrice(item.priceUSD * item.quantity, displayCurrency, displayExchangeRate)}
                  </Text>
                </View>
              </View>
            ))}
            
            {!isExpanded && order.items.length > 2 && (
              <TouchableOpacity
                onPress={() => toggleOrderExpansion(order.id)}
                style={{
                  padding: SPACING.sm,
                  alignItems: 'center',
                }}
              >
                <Text allowFontScaling={false}
                  style={{
                    fontSize: 14,
                    color: theme.colors.primary,
                    fontWeight: '500',
                  }}
                >
                  {t('orders.moreItems', { count: order.items.length - 2 })}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Delivery Progress */}
          {!isCancelledStatus(order.status) && (
            <View style={{ marginBottom: SPACING.lg }}>
              <View
                style={{
                  flexDirection: isRTL ? 'row-reverse' : 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: SPACING.sm,
                }}
              >
                <Text allowFontScaling={false}
                  style={{
                    fontSize: 16,
                    fontWeight: '600',
                    color: theme.colors.text,
                  }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {t('orders.deliveryEstimate')}
                </Text>
                <Text allowFontScaling={false}
                  style={{
                    fontSize: 12,
                    color: theme.colors.textSecondary,
                  }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {Math.round(deliveryProgress * 100)}%
                </Text>
              </View>
              
              {/* Progress Bar */}
              <View
                style={{
                  height: 7,
                  backgroundColor: theme.colors.border,
                  borderRadius: 4,
                  overflow: 'hidden',
                  marginBottom: SPACING.sm,
                }}
              >
                <View
                  style={{
                    width: `${deliveryProgress * 100}%`,
                    height: '100%',
                    backgroundColor: statusConfig.color,
                  }}
                />
              </View>
              
              {/* Delivery Timeline */}
              <View
                style={{
                  flexDirection: isRTL ? 'row-reverse' : 'row',
                  justifyContent: 'space-between',
                }}
              >
                {['pending', 'confirmed', 'processing', 'shipped', 'delivered'].map((status, statusIndex) => {
                  const isActive = statusIndex <= ['pending', 'confirmed', 'processing', 'shipped', 'delivered'].indexOf(order.status);
                  const statusCfg = getStatusConfig(status as OrderStatus);
                  
                  return (
                    <View
                      key={status}
                      style={{
                        alignItems: 'center',
                        flex: 1,
                      }}
                    >
                      <View
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 10,
                          backgroundColor: isActive ? statusCfg.color : theme.colors.border,
                          marginBottom: 4,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        {isActive && (
                          <Ionicons
                            name="checkmark"
                            size={12}
                            color="white"
                          />
                        )}
                      </View>
                      <Text allowFontScaling={false}
                        style={{
                          fontSize: 10,
                          color: isActive ? statusCfg.color : theme.colors.textSecondary,
                          textAlign: 'center',
                          fontWeight: isActive ? '600' : 'normal',
                        }}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.6}
                      >
                        {t(`orders.timeline.${status}`)}
                      </Text>
                    </View>
                  );
                })}
              </View>
              
              <Text allowFontScaling={false}
                style={{
                  fontSize: 14,
                  color: theme.colors.textSecondary,
                  textAlign: 'center',
                  marginTop: SPACING.sm,
                }}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {getDeliveryText(order)}
              </Text>
            </View>
          )}
          
          {/* Cancelled order message */}
          {isCancelledStatus(order.status) && (
            <View
              style={{
                backgroundColor: isDark ? theme.colors.error + '22' : STATUS_CONFIG.cancelled.bgColor,
                padding: SPACING.md,
                borderRadius: 12,
                marginBottom: SPACING.lg,
                alignItems: 'center',
              }}
            >
              <Ionicons
                name="close-circle-outline"
                size={24}
                color={STATUS_CONFIG.cancelled.color}
              />
              <Text allowFontScaling={false}
                style={{
                  fontSize: 14,
                  color: STATUS_CONFIG.cancelled.color,
                  textAlign: 'center',
                  marginTop: SPACING.xs,
                  fontWeight: '500',
                }}
              >
                {getDeliveryText(order)}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Action Buttons */}
        <View
          style={{
            flexDirection: isRTL ? 'row-reverse' : 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: SPACING.md,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border, 
            marginTop: SPACING.md,
            gap: SPACING.sm,
          }}
        >

          {/* Reorder Button */}
          {order.status === 'delivered' && (
            <TouchableOpacity
              onPress={() => handleOrderAction(order, 'reorder')}
              style={{
                flex: 1,
                flexDirection: isRTL ? 'row-reverse' : 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.success + '20',
                paddingVertical: SPACING.sm,
                paddingHorizontal: SPACING.md,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.colors.success,
              }}
            >
              <Ionicons
                name="refresh"
                size={16}
                color={theme.colors.success}
                style={{
                  marginRight: isRTL ? 0 : SPACING.xs,
                  marginLeft: isRTL ? SPACING.xs : 0,
                }}
              />
              <Text allowFontScaling={false}
                style={{
                  fontSize: 14,
                  color: theme.colors.success,
                  fontWeight: '600',
                }}
              >
                {t('orders.reorder.button')}
              </Text>
            </TouchableOpacity>
          )}
          
          {/* Cancel Button */}
          {(order.status === 'pending' || order.status === 'confirmed') && (
            <TouchableOpacity
              onPress={() => handleOrderAction(order, 'cancel')}
              style={{
                flex: 1,
                flexDirection: isRTL ? 'row-reverse' : 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.error + '20',
                paddingVertical: SPACING.sm,
                paddingHorizontal: SPACING.md,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.colors.error,
              }}
            >
              <Ionicons
                name="close-circle-outline"
                size={16}
                color={theme.colors.error}
                style={{
                  marginRight: isRTL ? 0 : SPACING.xs,
                  marginLeft: isRTL ? SPACING.xs : 0,
                }}
              />
              <Text allowFontScaling={false}
                style={{
                  fontSize: 14,
                  color: theme.colors.error,
                  fontWeight: '600',
                }}
              >
                {t('orders.cancel.button')}
              </Text>
            </TouchableOpacity>
          )}
          
          {/* View Details Button */}
          <TouchableOpacity
            onPress={() => handleOrderAction(order, 'track')}
            style={{
              flex: 1,
              flexDirection: isRTL ? 'row-reverse' : 'row',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.primary,
              paddingVertical: SPACING.sm,
              paddingHorizontal: SPACING.md,
              borderRadius: 12,
            }}
          >
            <Ionicons
              name="eye-outline"
              size={16}
              color="white"
              style={{
                marginRight: isRTL ? 0 : SPACING.xs,
                marginLeft: isRTL ? SPACING.xs : 0,
              }}
            />
            <Text allowFontScaling={false}
              style={{
                fontSize: 14,
                color: 'white',
                fontWeight: '600',
              }}
            >
              {t('orders.viewDetails')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Render empty state
  const renderEmptyState = useCallback(() => (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: SPACING.xl,
        paddingVertical: SPACING.xl,
      }}
    >
      <Ionicons name="receipt-outline" size={64} color={theme.colors.textSecondary} />
      <Text allowFontScaling={false}
        style={{
          fontSize: 20,
          fontWeight: '600',
          color: theme.colors.text,
          marginTop: SPACING.lg,
          textAlign: 'center',
        }}
      >
        {selectedStatus === 'all' 
          ? t('orders.noOrders')
          : t('orders.noOrdersStatus', { status: t(`orders.status.${selectedStatus}`) })
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
        {selectedStatus === 'all'
          ? t('orders.noOrdersDescription')
          : t('orders.noOrdersStatusDescription')
        }
      </Text>
      
      {selectedStatus === 'all' && (
        <Button
          title={t('orders.startShopping')}
          onPress={() => navigation.navigate('Home' as never)}
          style={{ marginTop: SPACING.xl, backgroundColor: theme.colors.primary }}
          icon="storefront-outline"
        />
      )}
    </View>
  ), [theme, selectedStatus, t, navigation, SPACING]);

  // Render header component for FlatList
  const renderListHeader = useCallback(() => (
    <View>
      {/* Compact sub-header (title is in native blur header) */}
      <View
        style={{
          flexDirection: isRTL ? 'row-reverse' : 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: SPACING.md,
          paddingTop: SPACING.sm,
          paddingBottom: SPACING.sm,
        }}
      >
        {ordersCount.total > 0 ? (
          <Text allowFontScaling={false}
            style={{
              fontSize: 13,
              color: theme.colors.textSecondary,
              textAlign: isRTL ? 'right' : 'left',
              letterSpacing: 0.2,
              flex: 1,
            }}
          >
            {t('orders.countSummary', { defaultValue: '{{filtered}} of {{total}} orders', filtered: ordersCount.filtered, total: ordersCount.total })}
            {ordersCount.pending > 0 && t('orders.pendingSummary', { defaultValue: ' • {{count}} pending', count: ordersCount.pending })}
          </Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: SPACING.sm }}>
          <TouchableOpacity
            onPress={toggleSearch}
            style={{
              padding: SPACING.sm,
              borderRadius: 14,
              backgroundColor: showSearch ? theme.colors.primary : theme.colors.background,
              borderWidth: 1,
              borderColor: showSearch ? theme.colors.primary : theme.colors.border + '60',
            }}
          >
            <Ionicons
              name="search-outline"
              size={20}
              color={showSearch ? 'white' : theme.colors.text}
            />
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={toggleFilters}
            style={{
              padding: SPACING.sm,
              borderRadius: 14,
              backgroundColor: showFilters ? theme.colors.primary : theme.colors.background,
              borderWidth: 1,
              borderColor: showFilters ? theme.colors.primary : theme.colors.border + '60',
            }}
          >
            <Ionicons
              name="filter-outline"
              size={20}
              color={showFilters ? 'white' : theme.colors.text}
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  ), [
    isRTL, ordersCount, showSearch, showFilters, theme, t,
    toggleSearch, toggleFilters, SPACING
  ]);


  // =================================================================
  // ALIBABA: Skeleton Loading (static, no shimmer)
  // Matches real orders layout to prevent layout shift
  // =================================================================
  if (loading) {
    const skeletonOpacity = isDark ? 0.2 : 0.12;
    const skeletonColor = theme.colors.text;
    
    return (
      <SafeAreaView 
        style={{ flex: 1, backgroundColor: theme.colors.background }} 
        edges={['top', 'left', 'right']}
      >
        {/* Skeleton Header */}
        <View style={{ 
          flexDirection: 'row', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          paddingHorizontal: SPACING.md, 
          paddingVertical: SPACING.md,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        }}>
          <View>
            <View style={{ width: 150, height: 28, backgroundColor: skeletonColor, opacity: skeletonOpacity, borderRadius: 4 }} />
            <View style={{ width: 100, height: 14, backgroundColor: skeletonColor, opacity: skeletonOpacity, borderRadius: 4, marginTop: 6 }} />
          </View>
          <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
            <View style={{ width: 40, height: 40, backgroundColor: skeletonColor, opacity: skeletonOpacity, borderRadius: 12 }} />
            <View style={{ width: 40, height: 40, backgroundColor: skeletonColor, opacity: skeletonOpacity, borderRadius: 12 }} />
          </View>
        </View>
        
        {/* Skeleton Order Cards */}
        <View style={{ flex: 1, padding: SPACING.md }}>
          {[1, 2, 3].map((i) => (
            <View 
              key={i} 
              style={{ 
                backgroundColor: theme.colors.surface, 
                borderRadius: 16, 
                marginBottom: SPACING.md,
                overflow: 'hidden',
              }}
            >
              {/* Status bar */}
              <View style={{ height: 4, backgroundColor: skeletonColor, opacity: skeletonOpacity }} />
              
              <View style={{ padding: SPACING.md }}>
                {/* Header row */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.md }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ width: '60%', height: 18, backgroundColor: skeletonColor, opacity: skeletonOpacity, borderRadius: 4 }} />
                    <View style={{ width: '40%', height: 14, backgroundColor: skeletonColor, opacity: skeletonOpacity, borderRadius: 4, marginTop: 6 }} />
                    <View style={{ width: '35%', height: 20, backgroundColor: skeletonColor, opacity: skeletonOpacity, borderRadius: 4, marginTop: 8 }} />
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <View style={{ width: 80, height: 28, backgroundColor: skeletonColor, opacity: skeletonOpacity, borderRadius: 20 }} />
                    <View style={{ width: 20, height: 20, backgroundColor: skeletonColor, opacity: skeletonOpacity, borderRadius: 10, marginTop: 8 }} />
                  </View>
                </View>
                
                {/* Items section */}
                <View style={{ marginBottom: SPACING.md }}>
                  <View style={{ width: 80, height: 16, backgroundColor: skeletonColor, opacity: skeletonOpacity, borderRadius: 4, marginBottom: SPACING.sm }} />
                  {/* Item thumbnails */}
                  <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                    {[1, 2, 3].map((j) => (
                      <View key={j} style={{ width: 50, height: 50, backgroundColor: skeletonColor, opacity: skeletonOpacity, borderRadius: 8 }} />
                    ))}
                  </View>
                </View>
              </View>
            </View>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    // GOLDEN TEMPLATE: SafeAreaView — 'top' handled by native blur header
    <SafeAreaView 
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      edges={['left', 'right']}
    >
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      
      {/* Sticky Static Header & Controls */}
      <View style={{ paddingTop: insets.top + 44, paddingBottom: SPACING.sm }}>
        {renderListHeader()}
        
        {/* Search Input - Outside FlatList so keyboard stays open */}
        {showSearch && (
          <View style={{ paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm }}>
            <TextInput allowFontScaling={false}
              value={searchQuery}
              onChangeText={handleSearch}
              placeholder={t('orders.searchPlaceholder')}
              placeholderTextColor={theme.colors.textSecondary}
              style={{
                includeFontPadding: false,
                height: 40,
                paddingVertical: 0,
                textAlignVertical: 'center',
                backgroundColor: theme.colors.surface,
                borderRadius: 14,
                paddingHorizontal: SPACING.md,
                color: theme.colors.text,
                fontSize: 15,
                textAlign: isRTL ? 'right' : 'left',
                borderWidth: 1,
                borderColor: theme.colors.border + '40',
              }}
            />
          </View>
        )}

        {/* Filters Section - Outside FlatList */}
        {showFilters && (
          <View style={{ backgroundColor: theme.colors.background, paddingVertical: SPACING.sm }}>
            {/* Status Chips */}
            <View style={{ marginBottom: SPACING.sm }}>
              <Text allowFontScaling={false}
                style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: theme.colors.text,
                  paddingHorizontal: SPACING.md,
                  marginBottom: SPACING.sm,
                }}
              >
                {t('orders.status.label')}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: SPACING.md }}
              >
                {ORDER_STATUSES.map((status) => {
                  const statusCfg = status.key !== 'all' ? getStatusConfig(status.key as OrderStatus) : null;
                  const isSelected = selectedStatus === status.key;
                  
                  return (
                    <TouchableOpacity
                      key={status.key}
                      onPress={() => handleStatusFilter(status.key)}
                      style={{
                        flexDirection: isRTL ? 'row-reverse' : 'row',
                        alignItems: 'center',
                        backgroundColor: isSelected
                          ? (statusCfg?.color || theme.colors.primary)
                          : theme.colors.surface,
                        paddingHorizontal: SPACING.md,
                        paddingVertical: SPACING.sm,
                        borderRadius: 25,
                        marginRight: isRTL ? 0 : SPACING.sm,
                        marginLeft: isRTL ? SPACING.sm : 0,
                        borderWidth: 2,
                        borderColor: isSelected
                          ? (statusCfg?.color || theme.colors.primary)
                          : theme.colors.border,
                      }}
                    >
                      {statusCfg && (
                        <Ionicons
                          name={statusCfg.icon as any}
                          size={16}
                          color={isSelected ? 'white' : statusCfg.color}
                          style={{
                            marginRight: isRTL ? 0 : SPACING.xs,
                            marginLeft: isRTL ? SPACING.xs : 0,
                          }}
                        />
                      )}
                      <Text allowFontScaling={false}
                        adjustsFontSizeToFit={true}
                        numberOfLines={1}
                        minimumFontScale={0.75}
                        style={{
                          flexShrink: 1,
                          color: isSelected ? 'white' : theme.colors.text,
                          fontSize: 14,
                          fontWeight: '600',
                        }}
                      >
                        {t(`orders.filter.${status.key}`)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
            
            {/* Date Filter Chips */}
            <View style={{ marginBottom: SPACING.sm }}>
              <Text allowFontScaling={false}
                style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: theme.colors.text,
                  paddingHorizontal: SPACING.md,
                  marginBottom: SPACING.sm,
                }}
              >
                {t('orders.dateRange')}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: SPACING.md }}
              >
                {DATE_FILTERS.map((dateFilter) => {
                  const isSelected = selectedDateFilter === dateFilter.key;
                  
                  return (
                    <TouchableOpacity
                      key={dateFilter.key}
                      onPress={() => handleDateFilter(dateFilter.key)}
                      style={{
                        flexDirection: isRTL ? 'row-reverse' : 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isSelected
                          ? theme.colors.primary + '30'
                          : theme.colors.surface,
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderRadius: 20,
                        marginRight: isRTL ? 0 : 8,
                        marginLeft: isRTL ? 8 : 0,
                        borderWidth: 1,
                        borderColor: isSelected
                          ? theme.colors.primary
                          : theme.colors.border,
                        minWidth: 90,
                      }}
                    >
                      <Ionicons
                        name="calendar-outline"
                        size={16}
                        color={isSelected ? theme.colors.primary : theme.colors.textSecondary}
                        style={{
                          marginRight: isRTL ? 0 : SPACING.xs,
                          marginLeft: isRTL ? SPACING.xs : 0,
                        }}
                      />
                      <Text allowFontScaling={false}
                        adjustsFontSizeToFit={true}
                        numberOfLines={1}
                        minimumFontScale={0.75}
                        style={{
                          flexShrink: 1,
                          color: isSelected ? theme.colors.primary : theme.colors.text,
                          fontSize: 13,
                          fontWeight: isSelected ? '600' : '500',
                          textAlign: 'center',
                        }}
                      >
                        {t(`orders.dateFilter.${dateFilter.key}`)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        )}
      </View>

      {/* GOLDEN TEMPLATE: FlatList as SINGLE vertical scroll owner */}
      {/* ALIBABA: Performance guardrails + scroll-aware highlight clear */}
      <FlatList
        ref={flatListRef}
        data={filteredOrders}
        renderItem={renderOrderItem}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        // ALIBABA: Performance guardrails
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        // ALIBABA: Clear last-viewed highlight on scroll
        onScrollBeginDrag={() => {
          if (lastViewedOrderId) {
            setLastViewedOrderId(null);
          }
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadOrders(true)}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: SPACING.sm, // Removed insets since they are on the sticky header now
          // GOLDEN TEMPLATE: Padding for bottom tab bar
          paddingBottom: TAB_BAR_HEIGHT + insets.bottom + SPACING.xl,
        }}
      />
    </SafeAreaView>
  );
};

export default OrdersScreen;
