import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LiveOrderMap } from '../components/LiveOrderMap';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  ScrollView, 
  Alert,
  Linking,
  Share,
  I18nManager
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

import { useTheme } from '../components/ThemeProvider';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { RootStackParamList, Order, OrderStatus, Theme, isCancelledStatus } from '../types';
import { OrderService } from '../services/OrderService';
import { useCart } from '../contexts/CartContext';
import { getOrCreateConversation, sendMessage, findConversationByTenant } from '../services/chatService';
import { getOrderSupportContact, TenantContactInfo } from '../services/tenantInfoService';
import { discountDisplayName } from '../services/discountService';
import { formatItemPrice, formatOrderLineTotal, formatOrderTotal, formatPrice } from '../utils/currency';
import { getProductImageUrl } from '../utils/imageUtils';
import { useCurrency } from '../contexts/CurrencyContext';
import { formatFirestoreDate } from '../utils/dateUtils';
import { SPACING } from '../constants/theme';
import { brandWhatsAppDigits } from '../constants/brand';


type OrderDetailScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'OrderDetail'>;
type OrderDetailScreenRouteProp = RouteProp<RootStackParamList, 'OrderDetail'>;

// Helper function to get payment method type from different formats
const getPaymentMethodType = (paymentMethod: any): string => {
  if (typeof paymentMethod === 'object' && paymentMethod?.type) {
    return paymentMethod.type;
  }
  if (typeof paymentMethod === 'string') {
    return paymentMethod;
  }
  return 'cash_on_delivery';
};

// Helper function to get payment method status
const getPaymentMethodStatus = (order: Order): string => {
  // Primary: Check top-level paymentStatus (new standard)
  if (order.paymentStatus) {
    return order.paymentStatus;
  }
  // Fallback: Check inside paymentMethod object (legacy)
  const paymentMethod = order.paymentMethod;
  if (typeof paymentMethod === 'object' && paymentMethod?.status) {
    return paymentMethod.status;
  }
  return 'pending';
};

// Helper to safely get shipping value from order
const getShippingAmount = (order: Order): number => {
  // Primary: Use shippingUSD from the Order interface
  if (typeof order.shippingUSD === 'number' && !isNaN(order.shippingUSD)) {
    return order.shippingUSD;
  }
  // Fallback: Check for legacy 'shippingCost' field (for existing orders)
  if (typeof (order as any).shippingCost === 'number' && !isNaN((order as any).shippingCost)) {
    return (order as any).shippingCost;
  }
  // If order has no shipping field, return 0
  return 0;
};

// Color name to hex mapping for displaying color variant text in actual color
const COLOR_NAME_TO_HEX: Record<string, string> = {
  black: '#000000',
  white: '#FFFFFF',
  red: '#F44336',
  blue: '#2196F3',
  green: '#4CAF50',
  yellow: '#FFEB3B',
  orange: '#FF9800',
  purple: '#9C27B0',
  brown: '#795548',
  gray: '#9E9E9E',
  grey: '#9E9E9E',
  pink: '#E91E63',
  gold: '#FFD700',
  silver: '#C0C0C0',
  beige: '#F5F5DC',
  navy: '#000080',
  maroon: '#800000',
  teal: '#008080',
  cyan: '#00BCD4',
};

const getColorHex = (colorName: string, isDarkMode: boolean): string | null => {
  const hex = COLOR_NAME_TO_HEX[colorName.trim().toLowerCase()];
  if (!hex) return null;
  // For black text in dark mode, use a lighter shade for readability
  if (hex === '#000000' && isDarkMode) return '#CCCCCC';
  // For white text in light mode, use a darker shade for readability
  if (hex === '#FFFFFF' && !isDarkMode) return '#CCCCCC';
  return hex;
};

const OrderDetailScreen: React.FC = () => {
  const navigation = useNavigation<OrderDetailScreenNavigationProp>();
  const route = useRoute<OrderDetailScreenRouteProp>();
  const { theme, isDark } = useTheme();
  const { user } = useAuth();
  const { refreshCart } = useCart();
  const { currency, exchangeRateIQD } = useCurrency();
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  // const insets = useSafeAreaInsets();

  // route.params can be undefined (malformed deep link / notification without params);
  // never destructure it blindly, and fall back to an empty id we guard on below.
  const orderId = route.params?.orderId ?? '';
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tenantContact, setTenantContact] = useState<TenantContactInfo | null>(null);

  // Synchronous in-flight guards (state re-renders too late to block same-frame double taps)
  const messagingSellerRef = useRef(false);
  const reorderingRef = useRef(false);

  const styles = useMemo(() => createStyles(theme, isDark, isRTL), [theme, isDark, isRTL]);

  // Load order details
  // orderId can change on a MOUNTED instance: tapping an order push while this
  // screen is focused routes through navigation.navigate('OrderDetail', { orderId }),
  // which replaces params in place rather than remounting. Two loads then overlap,
  // and they can resolve out of order because getOrderById returns synchronously from
  // the in-memory cache for a cached order but goes to the network otherwise.
  //
  // If the older one lands last, `order` describes a different order than `orderId`,
  // and the two are used together: handleCancelOrder gates on order.status but calls
  // cancelOrder(orderId), so the user could cancel an order other than the one they
  // are looking at. Same split in handleReorder and in <LiveOrderMap orderId=… />.
  const loadReqIdRef = useRef(0);

  useEffect(() => {
    const reqId = ++loadReqIdRef.current;
    loadOrderDetails(reqId);
    return () => { loadReqIdRef.current++; };
  }, [orderId]);

  const loadOrderDetails = async (reqId: number) => {
    const isLatest = () => reqId === loadReqIdRef.current;
    if (!orderId) {
      setError(t('orders.orderNotFound'));
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const orderData = await OrderService.getOrderById(orderId);
      if (!isLatest()) return;
      setOrder(orderData);

      // Fetch tenant contact info for WhatsApp support
      if (orderData?.items) {
        const contact = await getOrderSupportContact(orderData.items);
        if (!isLatest()) return;
        setTenantContact(contact);
      }
    } catch (err: any) {
      if (!isLatest()) return;
      setError(err.message || t('orders.loadError'));
    } finally {
      if (isLatest()) setLoading(false);
    }
  };

  const getStatusColor = (status: OrderStatus): string => {
    switch (status) {
      case 'confirmed':
      case 'delivered':
        return theme.colors.success;
      case 'processing':
      case 'shipped':
        return theme.colors.primary;
      case 'cancelled':
      case 'cancelled_by_store':
      case 'cancelled_by_user':
        return theme.colors.error;
      default:
        return theme.colors.warning;
    }
  };

  const getStatusIcon = (status: OrderStatus): string => {
    switch (status) {
      case 'pending':
        return 'time-outline';
      case 'confirmed':
        return 'checkmark-circle-outline';
      case 'processing':
        return 'cog-outline';
      case 'shipped':
        return 'airplane-outline';
      case 'delivered':
        return 'home-outline';
      case 'cancelled':
      case 'cancelled_by_store':
      case 'cancelled_by_user':
        return 'close-circle-outline';
      default:
        return 'help-circle-outline';
    }
  };

  const handleContactSupport = () => {
    // Get the tenant's WhatsApp number, fallback to default
    const whatsappNumber = tenantContact?.whatsapp || brandWhatsAppDigits();
    const message = t('orders.support.whatsappMessage', { orderNumber: order?.orderNumber });
    const url = `whatsapp://send?phone=${whatsappNumber}&text=${encodeURIComponent(message)}`;
    
    Linking.openURL(url).catch(() => {
      Alert.alert(t('common.error'), t('orders.support.whatsappError', { defaultValue: 'WhatsApp is not installed on this device' }));
    });
  };

  const handleTrackOrder = () => {
    if (order?.trackingNumber) {
      Alert.alert(t('orders.trackingNumber'), order.trackingNumber);
    } else {
      Alert.alert(t('orders.noTracking'), t('orders.noTrackingMessage'));
    }
  };

  const handleShareOrder = async () => {
    if (!order) return;
    
    try {
      await Share.share({
        message: `${t('orders.shareText')}\n${t('orders.orderLabel')} #${order.orderNumber || ''}\n${t('orders.total')}: ${formatOrderTotal(order, order.currency || currency, exchangeRateIQD)}`,
      });
    } catch {
      // Share cancelled or failed
    }
  };

  // Handle Message Seller - Sends order details automatically
  const handleMessageSeller = async () => {
    if (!order || !order.items || order.items.length === 0) {
      Alert.alert(t('common.error'), t('orders.noProductsToMessage', { defaultValue: 'No products found in this order' }));
      return;
    }

    // Get the first product's ID to create/reuse a conversation
    const firstItem = order.items[0];
    const productId = firstItem.productId;

    if (!productId) {
      Alert.alert(t('common.error'), t('orders.noProductId', { defaultValue: 'Could not find product information' }));
      return;
    }

    // Prevent double-send / double-navigate from rapid taps
    if (messagingSellerRef.current) return;
    messagingSellerRef.current = true;

    // Supabase order rows can carry a null order_number, and OrderService maps it
    // straight through — guard before stripping the dashes.
    const plainOrderNumber = (order.orderNumber || '').replace(/-/g, '');

    try {
      // Get or create conversation for this product
      // CONSOLIDATION: Try to find existing conversation with this tenant first
      let conv;
      if (firstItem.tenantId) {
        // We have tenantId, try to find existing chat
        const existingConv = await findConversationByTenant(firstItem.tenantId, user?.uid || '');
        if (existingConv) {
          conv = existingConv;
        } else {
          // No existing chat, create new via product
          conv = await getOrCreateConversation(productId);
        }
      } else {
        // No tenantId on item, fallback to product
        conv = await getOrCreateConversation(productId);
      }

      if (conv && conv.id) {
        // Color emoji mapping for chat messages
        const colorEmojis: Record<string, string> = {
          red: '🔴', blue: '🔵', green: '🟢', yellow: '🟡', orange: '🟠',
          purple: '🟣', brown: '🟤', black: '⚫', white: '⚪',
        };

        // Build order details message with variant info
        const itemsList = order.items
          .map((item, idx) => {
            let line = `${idx + 1}. ${item.productName || 'Product'} x${item.quantity}  ${formatOrderLineTotal(item, order.currency || currency, order.exchangeRate || exchangeRateIQD)}`;
            if (item.partNumber) {
              line += ` | P/N: ${item.partNumber}`;
            }
            if (item.selectedOptions) {
              const parts: string[] = [];
              if (item.selectedOptions.color) {
                const emoji = colorEmojis[item.selectedOptions.color.trim().toLowerCase()] || '🎨';
                parts.push(`${emoji} ${item.selectedOptions.color}`);
              }
              if (item.selectedOptions.size) {
                parts.push(`📏 ${item.selectedOptions.size}`);
              }
              if (parts.length > 0) {
                line += `\n   ${parts.join(' | ')}`;
              }
            }
            return line;
          })
          .join('\n');

        const orderDetailsMessage = `📦 ${t('orders.orderInquiry', { defaultValue: 'Order Inquiry' })}

🔢 ${t('orders.orderNumberLabel', { defaultValue: 'Order Number' })}: ${plainOrderNumber}
📅 ${t('orders.status.label', { defaultValue: 'Status' })}: ${t(`orders.status.${order.status}`, { defaultValue: order.status })}

📝 ${t('orders.items', { defaultValue: 'Items' })}:
${itemsList}

💰 ${t('orders.total', { defaultValue: 'Total' })}: ${formatOrderTotal(order, order.currency || currency, exchangeRateIQD)}

${t('orders.messagePrompt', { defaultValue: 'Hi, I have a question about this order:' })}`;

        // Send the order details as the first message
        const userId = user?.uid || '';
        const userName = user?.name || 'Customer';
        await sendMessage(conv.id, orderDetailsMessage, userId, 'user', userName);

        // Navigate to chat screen
        navigation.navigate('ChatScreen' as any, {
          conversationId: conv.id,
          productId: productId,
          productName: `${t('orders.orderLabel', { defaultValue: 'Order' })} #${plainOrderNumber}`,
          productImage: firstItem.imageUrl || null,
          tenantId: firstItem.tenantId || conv.tenantId,
          attachProduct: false,
        });
      }
    } catch (err: any) {
      console.error('Message seller error:', err);
      Alert.alert(
        t('common.error'),
        t('orders.messageSellerError', { defaultValue: 'Could not start conversation. Please try again.' })
      );
    } finally {
      messagingSellerRef.current = false;
    }
  };

  const handleCancelOrder = () => {
    if (order && (order.status === 'pending' || order.status === 'confirmed')) {
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
                await OrderService.cancelOrder(orderId);
                Alert.alert(t('orders.cancel.success'), t('orders.cancel.successMessage'));
                loadOrderDetails(++loadReqIdRef.current);
              } catch (cancelError: any) {
                if (cancelError.message?.includes('cannot be cancelled')) {
                  Alert.alert(
                    t('orders.cannotCancel'),
                    t('orders.cannotCancelMessage')
                  );
                } else {
                  Alert.alert(t('common.error'), cancelError.message || t('orders.cancel.failedMessage'));
                }
              }
            },
          },
        ]
      );
    } else {
      Alert.alert(t('orders.cannotCancel'), t('orders.cannotCancelMessage'));
    }
  };

  const handleDeleteOrder = () => {
    if (order && isCancelledStatus(order.status)) {
      Alert.alert(
        t('orders.delete.title', { defaultValue: 'Delete Order' }),
        t('orders.delete.confirmation', { defaultValue: 'Are you sure you want to delete this order? This action cannot be undone.' }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: async () => {
              try {
                setLoading(true);
                await OrderService.deleteOrder(orderId);
                // Go back to orders list
                navigation.goBack();
                Alert.alert(t('common.success'), t('orders.delete.success', { defaultValue: 'Order deleted successfully' }));
              } catch (deleteError: any) {
                setLoading(false);
                Alert.alert(t('common.error'), deleteError.message || t('orders.delete.failed', { defaultValue: 'Failed to delete order' }));
              }
            },
          },
        ]
      );
    }
  };

  const handleReorder = async () => {
    if (!order) return;

    // Prevent a double reorder (which would double cart quantities) from same-frame taps
    if (reorderingRef.current) return;
    reorderingRef.current = true;

    try {
      setLoading(true);
      const result = await OrderService.reorder(orderId);
      setLoading(false);

      if (result.addedItems > 0) {
        // Refresh cart context so CartScreen shows the new items immediately
        await refreshCart();
        
        if (result.skippedItems > 0) {
           Alert.alert(
             t('orders.reorder.partialSuccess', { defaultValue: 'Partial Success' }),
             t('orders.reorder.someItemsSkipped', { defaultValue: `Added ${result.addedItems} items. ${result.skippedItems} items were skipped or reduced due to current stock limits.` }),
             [{ text: t('common.ok', { defaultValue: 'OK' }), onPress: () => navigation.navigate('Cart' as any) }]
           );
        } else {
           // Go to cart
           navigation.navigate('Cart' as any);
        }
      } else {
        Alert.alert(t('common.error'), t('orders.reorder.noItemsAdded', { defaultValue: 'No items could be added to cart. They may be out of stock.' }));
      }
    } catch (reorderError: any) {
      setLoading(false);
      Alert.alert(t('common.error'), reorderError.message || t('orders.reorder.failed', { defaultValue: 'Failed to reorder' }));
    } finally {
      reorderingRef.current = false;
    }
  };

  // =================================================================
  // ALIBABA: Skeleton Loading - Static, matches final layout
  // =================================================================
  if (loading) {
    const skeletonOpacity = isDark ? 0.2 : 0.12;
    const skeletonColor = theme.colors.text;
    
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Feather name={isRTL ? 'arrow-right' : 'arrow-left'} size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text allowFontScaling={false} style={styles.title}>{t('orders.orderDetails')}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Status Card Skeleton */}
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: skeletonColor, opacity: skeletonOpacity, marginRight: SPACING.md }} />
              <View style={{ flex: 1 }}>
                <View style={{ width: '60%', height: 20, backgroundColor: skeletonColor, opacity: skeletonOpacity, borderRadius: 4, marginBottom: 8 }} />
                <View style={{ width: '40%', height: 16, backgroundColor: skeletonColor, opacity: skeletonOpacity, borderRadius: 4 }} />
              </View>
            </View>
          </View>
          
          {/* Items Card Skeleton */}
          <View style={styles.card}>
            <View style={{ width: 100, height: 16, backgroundColor: skeletonColor, opacity: skeletonOpacity, borderRadius: 4, marginBottom: SPACING.sm }} />
            {[1, 2].map((i) => (
              <View key={i} style={{ flexDirection: 'row', paddingVertical: SPACING.sm }}>
                <View style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: skeletonColor, opacity: skeletonOpacity, marginRight: SPACING.sm }} />
                <View style={{ flex: 1 }}>
                  <View style={{ width: '70%', height: 16, backgroundColor: skeletonColor, opacity: skeletonOpacity, borderRadius: 4, marginBottom: 6 }} />
                  <View style={{ width: '40%', height: 14, backgroundColor: skeletonColor, opacity: skeletonOpacity, borderRadius: 4 }} />
                </View>
              </View>
            ))}
          </View>
          
          {/* Address Card Skeleton */}
          <View style={styles.card}>
            <View style={{ width: 120, height: 16, backgroundColor: skeletonColor, opacity: skeletonOpacity, borderRadius: 4, marginBottom: SPACING.sm }} />
            <View style={{ width: '80%', height: 14, backgroundColor: skeletonColor, opacity: skeletonOpacity, borderRadius: 4, marginBottom: 6 }} />
            <View style={{ width: '60%', height: 14, backgroundColor: skeletonColor, opacity: skeletonOpacity, borderRadius: 4 }} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Error state
  if (error || !order) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Feather name={isRTL ? 'arrow-right' : 'arrow-left'} size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text allowFontScaling={false} style={styles.title}>{t('orders.orderDetails')}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={theme.colors.error} />
          <Text allowFontScaling={false} style={styles.errorTitle}>{t('orders.errorLoadingOrder')}</Text>
          <Text allowFontScaling={false} style={styles.errorText}>{error || t('orders.orderNotFound')}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => loadOrderDetails(++loadReqIdRef.current)}>
            <Text allowFontScaling={false} style={styles.retryButtonText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Normalize items once: a legacy/malformed order can arrive with items null/undefined,
  // and the render body dereferences it (.length / .map) below.
  const items = Array.isArray(order.items) ? order.items : [];

  // Get shipping amount using helper
  const shippingAmount = getShippingAmount(order);
  const isFreeShipping = shippingAmount === 0;

  const displayCurrency = (order.currency || currency) as 'USD' | 'IQD';
  const displayExchangeRate = order.exchangeRate || exchangeRateIQD;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Feather name={isRTL ? 'arrow-right' : 'arrow-left'} size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text allowFontScaling={false} style={styles.title}>{t('orders.orderDetails')}</Text>
        <TouchableOpacity style={styles.shareButton} onPress={handleShareOrder}>
          <Feather name="share-2" size={20} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Order Status Card - ALIBABA: No animation */}
        <View style={styles.card}>
          <View style={styles.statusHeader}>
            <View style={[styles.statusIconContainer, { backgroundColor: getStatusColor(order.status) + '20' }]}>
              {order.status === 'shipped' ? (
                <Image 
                  source={require('../../assets/shipped-icon.png')} 
                  style={{ width: '100%', height: '100%', borderRadius: 999 }} 
                  contentFit="cover" 
                />
              ) : (
                <Ionicons name={getStatusIcon(order.status) as any} size={28} color={getStatusColor(order.status)} />
              )}
            </View>
            <View style={styles.statusInfo}>
              <Text allowFontScaling={false} style={styles.statusTitle}>
                {t(`orders.status.${order.status}`)}
              </Text>
              <Text allowFontScaling={false} style={styles.orderNumber}>
                {order.orderNumber ? order.orderNumber.replace(/ORD|#|-/g, '') : ''}
              </Text>
            </View>
          </View>

          <View style={styles.orderMeta}>
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={16} color={theme.colors.textSecondary} />
              <Text allowFontScaling={false} style={styles.metaText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                {formatFirestoreDate(order.createdAt, i18n.language)}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="pricetag-outline" size={16} color={theme.colors.primary} />
              <Text allowFontScaling={false} style={[styles.metaText, { color: theme.colors.primary, fontWeight: '600' }]}>
                {formatOrderTotal(order, displayCurrency, displayExchangeRate)}
              </Text>
            </View>
          </View>

          {/* GOLDEN: Cancellation Notice - Shows who cancelled */}
          {isCancelledStatus(order.status) && (
            <View style={[styles.cancellationNotice, { backgroundColor: theme.colors.error + '15', borderColor: theme.colors.error }]}>
              <Ionicons name="close-circle" size={20} color={theme.colors.error} />
              <View style={styles.cancellationNoticeContent}>
                <Text allowFontScaling={false} style={[styles.cancellationNoticeTitle, { color: theme.colors.error }]}>
                  {t('orders.cancelledTitle', { defaultValue: 'Order Cancelled' })}
                </Text>
                <Text allowFontScaling={false} style={[styles.cancellationNoticeText, { color: theme.colors.textSecondary }]}>
                  {order.status === 'cancelled_by_user' || order.cancelledBy === 'user'
                    ? t('orders.cancelledByYou', { defaultValue: 'You cancelled this order.' })
                    : t('orders.cancelledByStore', { defaultValue: 'This order was cancelled by the store.' })
                  }
                </Text>
              </View>
            </View>
          )}
        </View>

          {/* Live Map Tracking - Only active when shipped */}
          {order.status === 'shipped' && (
            <LiveOrderMap 
              orderId={orderId} 
              trackingUrl={order.trackingUrl}
              deliveryAddress={order.shippingAddress?.coordinates}
            />
          )}

          {/* Order Items */}
        <View style={styles.card}>
          <Text allowFontScaling={false} style={styles.cardTitle}>
            {" "}{t('orders.itemsOrdered')} ({items.length}){" "}
          </Text>

          {items.map((item, index) => {
            const hasWholesaleDiscount = item.originalPriceUSD && item.originalPriceUSD > item.priceUSD;
            const savingsPercent = hasWholesaleDiscount 
              ? Math.round((1 - item.priceUSD / item.originalPriceUSD!) * 100) 
              : 0;
            
            return (
              <View key={`${item.productId}-${index}`} style={[styles.orderItem, isRTL && { flexDirection: 'row-reverse' }]}>
                <Image
                  source={{ uri: getProductImageUrl({ imageUrl: item.imageUrl, category: item.productName }) }}
                  style={[styles.itemImage, isRTL && { marginRight: 0, marginLeft: SPACING.sm }]}
                  contentFit="cover"
                />
                <View style={styles.itemDetails}>
                  <Text allowFontScaling={false} style={[styles.itemName, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={2}>
                    {" "}{i18n.language === 'ar' && ((item as any).productNameAr || (item as any).productSnapshot?.nameAr) ? ((item as any).productNameAr || (item as any).productSnapshot?.nameAr) : i18n.language === 'ku' && ((item as any).productNameKu || (item as any).productSnapshot?.nameKu) ? ((item as any).productNameKu || (item as any).productSnapshot?.nameKu) : item.productName}{" "}
                  </Text>
                  {item.partNumber && (
                    <Text allowFontScaling={false} style={styles.itemPartNumber}>
                      {item.partNumber}
                    </Text>
                  )}
                  
                  {/* GOLDEN TEMPLATE: Display Selected Options (read-only) */}
                  {item.selectedOptions && (
                    <View style={styles.selectedOptionsContainer}>
                      {item.selectedOptions.color && (() => {
                        const colorHex = getColorHex(item.selectedOptions!.color!, isDark);
                        return (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                            {colorHex && (
                              <View style={{
                                width: 14,
                                height: 14,
                                borderRadius: 7,
                                backgroundColor: COLOR_NAME_TO_HEX[item.selectedOptions!.color!.trim().toLowerCase()] || colorHex,
                                borderWidth: 1,
                                borderColor: theme.colors.border,
                                marginRight: 6,
                              }} />
                            )}
                            <Text allowFontScaling={false} style={[styles.selectedOptionText, colorHex ? { color: colorHex, fontWeight: 'bold' } : {}]}>
                              {t('order.color', { defaultValue: 'Color' })}: {item.selectedOptions!.color}
                            </Text>
                          </View>
                        );
                      })()}
                      {item.selectedOptions.size && (
                        <Text allowFontScaling={false} style={styles.selectedOptionText}>
                          {t('order.size', { defaultValue: 'Size' })}: {item.selectedOptions.size}
                        </Text>
                      )}
                    </View>
                  )}
                  
                  {/* Wholesale badge on its own full-width line (no cramped char-by-char wrapping) */}
                  {hasWholesaleDiscount && (
                    <View style={{ flexDirection: 'row', marginTop: 4 }}>
                      <View style={{
                        backgroundColor: theme.colors.success + '20',
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 6,
                      }}>
                        <Text allowFontScaling={false} style={{ fontSize: 11, fontWeight: '600', color: theme.colors.success }}>
                          {t('product.wholesalePricing')} -{savingsPercent}%
                        </Text>
                      </View>
                    </View>
                  )}
                  {/* Price line — the leading number is already the quantity, so no separate "Quantity" label */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                    <Text allowFontScaling={false} style={[styles.itemPrice, { flex: 1 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                      {`${item.quantity} x ${formatItemPrice(item, displayCurrency, displayExchangeRate)} = `}
                      <Text allowFontScaling={false} style={hasWholesaleDiscount ? { color: theme.colors.success } : undefined}>
                        {formatOrderLineTotal(item, displayCurrency, displayExchangeRate)}
                      </Text>
                    </Text>
                    {hasWholesaleDiscount && (
                      <Text allowFontScaling={false} style={{ fontSize: 12, color: theme.colors.error, textDecorationLine: 'line-through', marginLeft: 8, flexShrink: 0 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                        {formatPrice(item.originalPriceUSD! * item.quantity, displayCurrency, displayExchangeRate)}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        {/* Delivery Address */}
        <View style={styles.card}>
          <Text allowFontScaling={false} style={styles.cardTitle}>{t('orders.deliveryAddress')}</Text>
          <View style={styles.addressContainer}>
            <View style={styles.addressIcon}>
              <Ionicons name="location" size={24} color={theme.colors.primary} />
            </View>
            <View style={styles.addressDetails}>
              <Text allowFontScaling={false} 
                style={styles.addressName}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {" "}{order.shippingAddress?.fullName || '-'}{" "}
              </Text>
              <Text allowFontScaling={false} 
                style={styles.addressText}
                numberOfLines={2}
                adjustsFontSizeToFit
              >
                {order.shippingAddress?.address || '-'}
              </Text>
              <Text allowFontScaling={false} 
                style={styles.addressText}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {order.shippingAddress?.city || '-'}, {order.shippingAddress?.region || '-'}
              </Text>
              <View style={styles.phoneRow}>
                <Ionicons name="call-outline" size={14} color={theme.colors.textSecondary} />
                <Text allowFontScaling={false} 
                  style={styles.addressPhone}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {order.shippingAddress?.phone || '-'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Shipping Office Info (if applicable) */}
        {order.shippingOfficeInfo && (
          <View style={styles.card}>
            <View style={styles.shippingOfficeCardHeader}>
              <Ionicons name="business-outline" size={20} color={theme.colors.primary} />
              <Text allowFontScaling={false} style={[styles.cardTitle, { color: theme.colors.primary, marginBottom: 0, marginLeft: 8 }]}>
                {t('shippingInfo.title', { defaultValue: 'Shipping Office' })}
              </Text>
            </View>
            <View style={styles.shippingOfficeContainer}>
              <View style={styles.shippingOfficeRow}>
                <Text allowFontScaling={false} style={[styles.shippingOfficeLabel, { color: theme.colors.textSecondary }]}>
                  {t('shippingInfo.recipientName', { defaultValue: 'Recipient' })}:
                </Text>
                <Text allowFontScaling={false} style={[styles.shippingOfficeValue, { color: theme.colors.text }]}>
                  {order.shippingOfficeInfo.recipientName}
                </Text>
              </View>
              <View style={styles.shippingOfficeRow}>
                <Text allowFontScaling={false} style={[styles.shippingOfficeLabel, { color: theme.colors.textSecondary }]}>
                  {t('shippingInfo.mobileNumber', { defaultValue: 'Mobile' })}:
                </Text>
                <Text allowFontScaling={false} style={[styles.shippingOfficeValue, { color: theme.colors.text }]}>
                  {order.shippingOfficeInfo.mobileNumber}
                </Text>
              </View>
              <View style={styles.shippingOfficeRow}>
                <Text allowFontScaling={false} style={[styles.shippingOfficeLabel, { color: theme.colors.textSecondary }]}>
                  {t('shippingInfo.officeName', { defaultValue: 'Office' })}:
                </Text>
                <Text allowFontScaling={false} style={[styles.shippingOfficeValue, { color: theme.colors.text }]}>
                  {order.shippingOfficeInfo.officeName}
                </Text>
              </View>
              <View style={styles.shippingOfficeRow}>
                <Text allowFontScaling={false} style={[styles.shippingOfficeLabel, { color: theme.colors.textSecondary }]}>
                  {t('shippingInfo.officePhone', { defaultValue: 'Office Phone' })}:
                </Text>
                <Text allowFontScaling={false} style={[styles.shippingOfficeValue, { color: theme.colors.text }]}>
                  {order.shippingOfficeInfo.officePhone}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Order Summary - Price Breakdown */}
        <View style={styles.card}>
          <Text allowFontScaling={false} style={styles.cardTitle}>{t('orders.summary')}</Text>

          {/* Summary Items */}
          <View style={styles.summaryContainer}>
            <View style={styles.waterfallLine} pointerEvents="none" />
            {/* Subtotal */}
            <View style={styles.summaryItemRow}>
              <View style={styles.summaryLabelWrapper}>
                <Ionicons name="receipt-outline" size={18} color={theme.colors.textSecondary} style={styles.summaryIcon} />
                <View style={styles.textWrapper}>
                  <Text allowFontScaling={false} 
                    style={styles.summaryItemLabel}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {t('orders.subtotal')}
                  </Text>
                </View>
              </View>
              <View style={styles.textWrapper}>
                <Text allowFontScaling={false} 
                  style={styles.summaryItemValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatPrice(order.subtotalUSD || 0, displayCurrency, displayExchangeRate)}
                </Text>
              </View>
            </View>

            {/* Shipping */}
            <View style={styles.summaryItemRow}>
              <View style={styles.summaryLabelWrapper}>
                <MaterialCommunityIcons name="truck-fast-outline" size={18} color={theme.colors.primary} style={styles.summaryIcon} />
                <View>
                  <View style={styles.textWrapper}>
                    <Text allowFontScaling={false} 
                      style={styles.summaryItemLabel}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {t('orders.shipping')}
                    </Text>
                  </View>
                  {order.shippingAddress?.city && (
                    <Text allowFontScaling={false} style={styles.shippingCityText}>
                      {order.shippingAddress.city}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.textWrapper}>
                <Text allowFontScaling={false} 
                  style={[styles.summaryItemValue, isFreeShipping && styles.freeShippingValue]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {isFreeShipping ? t('cart.freeShipping') : formatPrice(shippingAmount, displayCurrency, displayExchangeRate)}
                </Text>
              </View>
            </View>

            {/* Tax (only show if > 0) */}
            {(order.taxUSD || 0) > 0 && (
              <View style={styles.summaryItemRow}>
                <View style={styles.summaryLabelWrapper}>
                  <Ionicons name="document-text-outline" size={18} color={theme.colors.textSecondary} style={styles.summaryIcon} />
                  <View style={styles.textWrapper}>
                    <Text allowFontScaling={false} 
                      style={styles.summaryItemLabel}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {t('orders.tax')}
                    </Text>
                  </View>
                </View>
                <View style={styles.textWrapper}>
                  <Text allowFontScaling={false} 
                    style={styles.summaryItemValue}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {formatPrice(order.taxUSD || 0, displayCurrency, displayExchangeRate)}
                  </Text>
                </View>
              </View>
            )}

            {/* Discount */}
            {order.appliedDiscount && order.appliedDiscount.savedAmount > 0 && (
              <View style={styles.summaryItemRow}>
                <View style={styles.summaryLabelWrapper}>
                  <Feather name="tag" size={16} color={theme.colors.success} style={styles.summaryIcon} />
                  <View style={styles.textWrapper}>
                    <Text allowFontScaling={false} style={[styles.summaryItemLabel, { color: theme.colors.success }]}>
                      {/* Same helper the confirmation screen uses. Rendering the raw
                          name here meant an Arabic shopper saw the localized name at
                          checkout and the English one when reopening the order. */}
                      {discountDisplayName(order.appliedDiscount, i18n.language)}
                    </Text>
                  </View>
                </View>
                <View style={styles.textWrapper}>
                  <Text allowFontScaling={false} 
                    style={styles.discountAmount}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    -{formatPrice(order.appliedDiscount.savedAmount, displayCurrency, displayExchangeRate)}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Total */}
          <View style={styles.totalDivider} />
          <View style={styles.totalSection}>
            <View style={styles.textWrapper}>
              <Text allowFontScaling={false} 
                style={styles.totalText}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {t('orders.total')}
              </Text>
            </View>
            <View style={styles.textWrapper}>
              <Text allowFontScaling={false} 
                style={styles.totalAmount}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatOrderTotal(order, displayCurrency, displayExchangeRate)}
              </Text>
            </View>
          </View>
        </View>

        {/* Payment Method */}
        <View style={styles.card}>
          <Text allowFontScaling={false} style={styles.cardTitle}>{t('orders.paymentMethod')}</Text>
          <View style={styles.paymentContainer}>
            <View style={styles.paymentIconContainer}>
              <MaterialCommunityIcons
                name={
                  getPaymentMethodType(order.paymentMethod) === 'cash_on_delivery' ? 'cash' :
                  (getPaymentMethodType(order.paymentMethod) === 'money_exchanger' || order.moneyExchangerInfo) ? 'bank-transfer' : 
                  'credit-card'
                }
                size={24}
                color={theme.colors.primary}
              />
            </View>
            <View style={styles.paymentInfo}>
              <Text allowFontScaling={false} style={styles.paymentText}>
                {" "}{
                  getPaymentMethodType(order.paymentMethod) === 'cash_on_delivery' ? t('payment.methods.cod') :
                  (getPaymentMethodType(order.paymentMethod) === 'money_exchanger' || order.moneyExchangerInfo) ? t('payment.methods.moneyExchanger', { defaultValue: 'Money Exchanger' }) :
                  t('payment.methods.card')
                }{" "}
              </Text>
              <Text allowFontScaling={false} style={[
                styles.paymentStatus,
                { color: ['completed', 'paid'].includes(getPaymentMethodStatus(order)) ? theme.colors.success : 
                         ['failed', 'cancelled'].includes(getPaymentMethodStatus(order)) ? theme.colors.error :
                         theme.colors.warning }
              ]}>
                {t(`payment.status.${getPaymentMethodStatus(order)}`, { defaultValue: getPaymentMethodStatus(order) })}
              </Text>
            </View>
          </View>
        </View>

        {/* Special Instructions (if any) */}
        {order.specialInstructions && (
          <View style={styles.card}>
            <Text allowFontScaling={false} style={styles.cardTitle}>{t('checkout.specialInstructions', { defaultValue: 'Special Instructions' })}</Text>
            <Text allowFontScaling={false} style={styles.instructionsText}>{order.specialInstructions}</Text>
          </View>
        )}

        {/* Action Buttons - ALIBABA: Static feedback only */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleContactSupport}
            activeOpacity={0.8}
          >
            <Ionicons name="logo-whatsapp" size={20} color="#ffffff" />
            <Text allowFontScaling={false} style={styles.primaryButtonText}>{t('orders.support.whatsapp', { defaultValue: 'WhatsApp Support' })}</Text>
          </TouchableOpacity>

          {/* Message Seller Button */}
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.colors.primary, marginTop: SPACING.sm }]}
            onPress={handleMessageSeller}
            activeOpacity={0.8}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={20} color="#ffffff" />
            <Text allowFontScaling={false} style={styles.primaryButtonText}>{t('orders.messageSeller', { defaultValue: 'Message Seller' })}</Text>
          </TouchableOpacity>

          {/* GPS Tracking Button - Only active when shipped and trackingUrl is set */}
          {order.trackingUrl && order.status === 'shipped' && (
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: '#4285F4', marginTop: SPACING.sm }]}
              onPress={() => {
                Linking.openURL(order.trackingUrl!).catch(() => {
                  Alert.alert(t('common.error'), t('orders.trackingUrlError', { defaultValue: 'Could not open tracking link' }));
                });
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="location-outline" size={20} color="#ffffff" />
              <Text allowFontScaling={false} style={styles.primaryButtonText}>{t('orders.trackGPS', { defaultValue: 'Track GPS Location' })}</Text>
            </TouchableOpacity>
          )}

          {order.trackingNumber && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleTrackOrder}
              activeOpacity={0.7}
            >
              <Feather name="truck" size={20} color={theme.colors.primary} />
              <Text allowFontScaling={false} style={[styles.secondaryButtonText, { color: theme.colors.primary }]}>
                {t('orders.trackOrder')}
              </Text>
            </TouchableOpacity>
          )}

          {/* Delete Order Button - Only for Cancelled Orders */}
          {isCancelledStatus(order.status) && (
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.colors.error + '15', borderColor: theme.colors.error, borderWidth: 1 }]}
              onPress={handleDeleteOrder}
              activeOpacity={0.8}
            >
              <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
              <Text allowFontScaling={false} style={[styles.actionButtonText, { color: theme.colors.error }]}>
                {t('orders.deleteOrder', { defaultValue: 'Delete Order' })}
              </Text>
            </TouchableOpacity>
          )}



          {/* Reorder Button - For Cancelled/Delivered Orders */}
          {(isCancelledStatus(order.status) || order.status === 'delivered') && (
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: theme.colors.text, marginTop: SPACING.sm }]}
              onPress={handleReorder}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh-outline" size={20} color={theme.colors.background} />
              <Text allowFontScaling={false} style={[styles.primaryButtonText, { color: theme.colors.background }]}>
                {t('orders.reorder.button', { defaultValue: 'Reorder Items' })}
              </Text>
            </TouchableOpacity>
          )}

          {/* Cancel Order Button - Only for Pending/Confirmed */}
          {(order.status === 'pending' || order.status === 'confirmed') && (
            <TouchableOpacity
              style={[styles.actionButton, styles.cancelButton]}
              onPress={handleCancelOrder}
              activeOpacity={0.8}
            >
              <Text allowFontScaling={false} style={[styles.actionButtonText, styles.cancelButtonText]}>
                {t('orders.cancelOrder')}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Bottom spacing */}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

/* eslint-disable react-native/no-unused-styles */
/* eslint-disable react-native/no-color-literals */
const createStyles = (theme: Theme, isDark: boolean, isRTL: boolean) => StyleSheet.create({
  container: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  backButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  shareButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  title: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 44,
  },
  content: {
    flex: 1,
    padding: SPACING.md,
  },

  // Center container for loading/error
  centerContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  loadingText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    marginTop: SPACING.md,
  },
  errorTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '600',
    marginBottom: SPACING.xs,
    marginTop: SPACING.md,
  },
  errorText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Card styles
  card: {
    backgroundColor: isDark ? theme.colors.surface : '#FF781610',
    borderRadius: 16,
    marginBottom: SPACING.md,
    padding: SPACING.md,
    // Removed shadows to match Admin styling
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: SPACING.sm,
    textAlign: isRTL ? 'right' : 'left',
  },

  // Status card
  statusHeader: {
    alignItems: 'center',
    flexDirection: isRTL ? 'row-reverse' : 'row',
    marginBottom: SPACING.md,
  },
  statusIconContainer: {
    alignItems: 'center',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    marginLeft: isRTL ? SPACING.md : 0,
    marginRight: isRTL ? 0 : SPACING.md,
    width: 56,
  },
  statusInfo: {
    flex: 1,
  },
  statusTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: isRTL ? 'right' : 'left',
  },
  orderNumber: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: '500',
    textAlign: isRTL ? 'right' : 'left',
  },
  orderMeta: {
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: SPACING.sm,
  },
  metaItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 16,
    padding: 12,
  },
  actionButtonText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.error,
  },
  cancelButtonText: {
    color: theme.colors.error,
  },
  metaText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  
  // Cancellation notice
  cancellationNotice: {
    alignItems: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    padding: SPACING.sm,
  },
  cancellationNoticeContent: {
    flex: 1,
  },
  cancellationNoticeTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  cancellationNoticeText: {
    fontSize: 13,
  },

  // Order items
  orderItem: {
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingVertical: SPACING.sm,
  },
  itemImage: {
    backgroundColor: theme.colors.background,
    borderRadius: 10,
    height: 64,
    marginRight: SPACING.sm,
    width: 64,
  },
  itemDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  itemName: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 2,
  },
  itemPartNumber: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    marginBottom: 4,
  },
  itemMeta: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  itemQuantity: {
    color: theme.colors.textSecondary,
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  itemPrice: {
    color: theme.colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  
  // GOLDEN TEMPLATE: Selected options display (read-only, order history)
  selectedOptionsContainer: {
    alignItems: 'flex-start',
    flexDirection: 'column',
    marginBottom: 4,
    marginTop: 4,
  },
  selectedOptionText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  },

  // Address
  addressContainer: {
    alignItems: 'flex-start',
    flexDirection: isRTL ? 'row-reverse' : 'row',
  },
  addressIcon: {
    alignItems: 'center',
    backgroundColor: theme.colors.primary + '15',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    marginLeft: isRTL ? SPACING.sm : 0,
    marginRight: isRTL ? 0 : SPACING.sm,
    width: 40,
  },
  addressDetails: {
    flex: 1,
  },
  addressName: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    paddingVertical: 2, // Prevent clipping
    textAlign: isRTL ? 'right' : 'left',
  },
  addressText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 2, // Prevent clipping
    textAlign: isRTL ? 'right' : 'left',
  },
  phoneRow: {
    alignItems: 'center',
    flexDirection: isRTL ? 'row-reverse' : 'row',
    gap: 6,
    marginTop: 6,
    paddingVertical: 2, // Prevent clipping
  },
  addressPhone: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 2, // Prevent clipping
    textAlign: isRTL ? 'right' : 'left',
  },

  // Summary section - Redesigned
  summaryContainer: {
    gap: 12,
    position: 'relative',
  },
  summaryItemRow: {
    alignItems: 'center',
    flexDirection: isRTL ? 'row-reverse' : 'row',
    justifyContent: 'space-between',
    minHeight: 40,
    paddingVertical: 12,
  },
  summaryLabelWrapper: {
    alignItems: 'center',
    flexDirection: isRTL ? 'row-reverse' : 'row',
    flex: 1,
    minWidth: 0,
  },
  textWrapper: {
    justifyContent: 'center',
    minHeight: 36,
    paddingVertical: 4,
  },
  summaryIcon: {
    flexShrink: 0,
    marginLeft: isRTL ? 12 : 0,
    marginRight: isRTL ? 0 : 12,
    padding: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.primary + '14',
    overflow: 'hidden',
    zIndex: 1,
  },
  waterfallLine: {
    position: 'absolute',
    left: isRTL ? undefined : 14,
    right: isRTL ? 14 : undefined,
    top: 26,
    bottom: 26,
    width: 2,
    backgroundColor: theme.colors.border,
    borderRadius: 1,
  },
  summaryItemLabel: {
    color: theme.colors.text,
    flexShrink: 0,
    fontSize: 15,
    lineHeight: 24,
    textAlign: isRTL ? 'right' : 'left',
  },
  shippingCityText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  summaryItemValue: {
    color: theme.colors.text,
    flexShrink: 0,
    fontSize: 15,
    lineHeight: 24,
    paddingVertical: 2, // Prevent clipping
  },
  freeShippingValue: {
    color: theme.colors.success,
  },
  discountAmount: {
    color: theme.colors.success,
    flexShrink: 0,
    fontSize: 15,
    lineHeight: 24,
    paddingVertical: 2, // Prevent clipping
  },
  totalDivider: {
    backgroundColor: theme.colors.border,
    height: 1,
    marginVertical: SPACING.sm,
  },
  totalSection: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingBottom: 8,
    paddingTop: 16,
  },
  totalText: {
    color: theme.colors.text,
    flexShrink: 0,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 28,
    paddingVertical: 2, // Prevent descender clipping
  },
  totalAmount: {
    color: theme.colors.primary,
    flexShrink: 0,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 32,
    paddingVertical: 2, // Prevent descender clipping
  },

  // Payment
  paymentContainer: {
    alignItems: 'center',
    flexDirection: isRTL ? 'row-reverse' : 'row',
  },
  paymentIconContainer: {
    alignItems: 'center',
    backgroundColor: theme.colors.primary + '15',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    marginLeft: isRTL ? SPACING.sm : 0,
    marginRight: isRTL ? 0 : SPACING.sm,
    width: 44,
  },
  paymentInfo: {
    flex: 1,
  },
  paymentText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
    textAlign: isRTL ? 'right' : 'left',
  },
  paymentStatus: {
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'capitalize',
  },

  // Special instructions
  instructionsText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },

  // Actions
  actionsContainer: {
    gap: SPACING.sm,
    paddingTop: SPACING.sm,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: theme.colors.primary,
    borderRadius: 12,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  dangerButton: {
    alignItems: 'center',
    borderColor: theme.colors.error,
    borderRadius: 12,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  dangerButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  // Shipping Office
  shippingOfficeCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: SPACING.md,
  },
  shippingOfficeContainer: {
    gap: 6,
  },
  shippingOfficeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  shippingOfficeLabel: {
    color: theme.colors.textSecondary,
    flex: 1,
    fontSize: 13,
  },
  shippingOfficeValue: {
    color: theme.colors.text,
    flex: 2,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'right',
  },
});

export default OrderDetailScreen;
////////////// waterfall sky down line at left side to continue the jar as in couum coumn 