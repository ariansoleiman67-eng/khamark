import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, I18nManager } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import i18n from '../locales';

import { useTheme } from '../components/ThemeProvider';
import { RootStackParamList, Order, OrderStatus } from '../types';
import { OrderService } from '../services/OrderService';
import { formatItemPrice, formatOrderLineTotal, formatOrderTotal, formatPrice } from '../utils/currency';
import { useCurrency } from '../contexts/CurrencyContext';
import { getProductImageUrl } from '../utils/imageUtils';
import { formatFirestoreDate } from '../utils/dateUtils';
import { discountDisplayName, discountDisplayDescription } from '../services/discountService';

type OrderConfirmationScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'OrderConfirmation'>;
type OrderConfirmationScreenRouteProp = RouteProp<RootStackParamList, 'OrderConfirmation'>;

// Helper to safely get shipping value from order
const getShippingAmount = (order: Order): number => {
  if (typeof order.shippingUSD === 'number' && !isNaN(order.shippingUSD)) {
    return order.shippingUSD;
  }
  if (typeof (order as any).shippingCost === 'number' && !isNaN((order as any).shippingCost)) {
    return (order as any).shippingCost;
  }
  return 0;
};

const OrderConfirmationScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<OrderConfirmationScreenNavigationProp>();
  const route = useRoute<OrderConfirmationScreenRouteProp>();
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { currency, exchangeRateIQD } = useCurrency();

  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';

  const { orderId, orderNumber } = route.params;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  const displayCurrency = (order?.currency || currency) as any;
  const displayExchangeRate = order?.exchangeRate || exchangeRateIQD;

  // Same status icon/color mapping as OrderDetailScreen, so the confirmation reads
  // as the first chapter of the order's life, in the same visual language.
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
      case 'pending': return 'time-outline';
      case 'confirmed': return 'checkmark-circle-outline';
      case 'processing': return 'cog-outline';
      case 'shipped': return 'airplane-outline';
      case 'delivered': return 'home-outline';
      case 'cancelled':
      case 'cancelled_by_store':
      case 'cancelled_by_user': return 'close-circle-outline';
      default: return 'help-circle-outline';
    }
  };

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const fetchedOrder = await OrderService.getOrderById(orderId);
        setOrder(fetchedOrder);
      } catch (error) {
        // Silent fail - items won't show but confirmation still works
      } finally {
        setLoading(false);
      }
    };
    fetchOrder();
  }, [orderId]);

  const handleContinueShopping = () => {
    navigation.navigate('Main', { screen: 'Home' });
  };

  const handleViewOrderDetails = () => {
    navigation.navigate('OrderDetail', { orderId });
  };

  const cardBg = isDark ? theme.colors.surface : '#FF781610';
  const status: OrderStatus = (order?.status || 'pending') as OrderStatus;
  const statusColor = getStatusColor(status);
  const cleanNumber = (order?.orderNumber || orderNumber || '').replace(/ORD|#|-/g, '');

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top', 'left', 'right']}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Success affirmation */}
        <View style={styles.successHeader}>
          <View style={[styles.checkMark, { backgroundColor: theme.colors.success }]}>
            <Feather name="check" size={34} color={theme.colors.background} />
          </View>
          <Text allowFontScaling={false} style={[styles.title, { color: theme.colors.text }]}>
            {t('checkout.orderPlaced')}
          </Text>
          <Text allowFontScaling={false} style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
            {t('checkout.orderThankYou', { defaultValue: 'Thank you for your order.' })}
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
          </View>
        ) : order ? (
          <>
            {/* Status card — same layout as Order Details */}
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <View style={[styles.statusHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <View style={[styles.statusIconContainer, { backgroundColor: statusColor + '20', marginRight: isRTL ? 0 : 16, marginLeft: isRTL ? 16 : 0 }]}>
                  <Ionicons name={getStatusIcon(status) as any} size={28} color={statusColor} />
                </View>
                <View style={styles.statusInfo}>
                  <Text allowFontScaling={false} style={[styles.statusTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                    {t(`orders.status.${status}`, { defaultValue: 'Processing' })}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.orderNumber, { color: theme.colors.primary, textAlign: isRTL ? 'right' : 'left' }]}>
                    {cleanNumber}
                  </Text>
                </View>
              </View>

              <View style={[styles.orderMeta, { borderTopColor: theme.colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <View style={[styles.metaItem, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Ionicons name="calendar-outline" size={16} color={theme.colors.textSecondary} />
                  <Text allowFontScaling={false} style={[styles.metaText, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                    {formatFirestoreDate(order.createdAt, i18n.language)}
                  </Text>
                </View>
                <View style={[styles.metaItem, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Ionicons name="pricetag-outline" size={16} color={theme.colors.primary} />
                  <Text allowFontScaling={false} style={[styles.metaText, { color: theme.colors.primary, fontWeight: '600', textAlign: isRTL ? 'right' : 'left' }]}>
                    {formatOrderTotal(order, displayCurrency, displayExchangeRate)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Items Ordered — wholesale badge + struck-through original, like Order Details */}
            {/* items is a nullable JSONB column mapped straight through as `Order`; guard before use. */}
            {Array.isArray(order.items) && order.items.length > 0 && (
              <View style={[styles.card, { backgroundColor: cardBg }]}>
                <Text allowFontScaling={false} style={[styles.cardTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('orders.itemsOrdered', { defaultValue: 'Items Ordered' })} ({order.items.length})
                </Text>

                {order.items.map((item, index) => {
                  const hasWholesaleDiscount = item.originalPriceUSD && item.originalPriceUSD > item.priceUSD;
                  const savingsPercent = hasWholesaleDiscount
                    ? Math.round((1 - item.priceUSD / item.originalPriceUSD!) * 100)
                    : 0;
                  const name = i18n.language === 'ar' && ((item as any).productNameAr || (item as any).productSnapshot?.nameAr)
                    ? ((item as any).productNameAr || (item as any).productSnapshot?.nameAr)
                    : i18n.language === 'ku' && ((item as any).productNameKu || (item as any).productSnapshot?.nameKu)
                      ? ((item as any).productNameKu || (item as any).productSnapshot?.nameKu)
                      : item.productName;

                  return (
                    <View
                      key={`${item.productId}-${index}`}
                      style={[
                        styles.orderItem,
                        { borderBottomColor: theme.colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' },
                        index === order.items.length - 1 && { borderBottomWidth: 0 },
                      ]}
                    >
                      <Image
                        source={{ uri: getProductImageUrl({ imageUrl: (item as any).imageUrl, category: item.productName }) }}
                        style={[styles.itemImage, { backgroundColor: theme.colors.background, marginRight: isRTL ? 0 : 12, marginLeft: isRTL ? 12 : 0 }]}
                        contentFit="cover"
                      />
                      <View style={styles.itemDetails}>
                        <Text allowFontScaling={false} style={[styles.itemName, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={2}>
                          {name}
                        </Text>
                        {!!item.partNumber && (
                          <Text allowFontScaling={false} style={[styles.itemPartNumber, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
                            {item.partNumber}
                          </Text>
                        )}

                        {item.selectedOptions && (
                          <View style={[styles.selectedOptionsContainer, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                            {!!item.selectedOptions.color && (
                              <Text allowFontScaling={false} style={[styles.selectedOptionText, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
                                {t('order.color', { defaultValue: 'Color' })}: {item.selectedOptions.color}
                              </Text>
                            )}
                            {!!item.selectedOptions.size && (
                              <Text allowFontScaling={false} style={[styles.selectedOptionText, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
                                {t('order.size', { defaultValue: 'Size' })}: {item.selectedOptions.size}
                              </Text>
                            )}
                          </View>
                        )}

                        {hasWholesaleDiscount && (
                          <View style={styles.wholesaleRow}>
                            <View style={[styles.wholesaleBadge, { backgroundColor: theme.colors.success + '20' }]}>
                              <Text allowFontScaling={false} style={[styles.wholesaleText, { color: theme.colors.success }]}>
                                {t('product.wholesalePricing', { defaultValue: 'Wholesale Pricing' })} -{savingsPercent}%
                              </Text>
                            </View>
                          </View>
                        )}

                        <View style={[styles.priceRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                          <Text allowFontScaling={false} style={[styles.itemPrice, { color: theme.colors.primary, flex: 1, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                            {`${item.quantity} x ${formatItemPrice(item, displayCurrency, displayExchangeRate)} = `}
                            <Text allowFontScaling={false} style={hasWholesaleDiscount ? { color: theme.colors.success } : undefined}>
                              {formatOrderLineTotal(item, displayCurrency, displayExchangeRate)}
                            </Text>
                          </Text>
                          {hasWholesaleDiscount && (
                            <Text allowFontScaling={false} style={[styles.originalPrice, { color: theme.colors.error, marginLeft: isRTL ? 0 : 8, marginRight: isRTL ? 8 : 0 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                              {formatPrice(item.originalPriceUSD! * item.quantity, displayCurrency, displayExchangeRate)}
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Payment summary */}
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <Text allowFontScaling={false} style={[styles.cardTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                {t('checkout.orderSummary', { defaultValue: 'Order Summary' })}
              </Text>

              <View style={[styles.summaryItemRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Text allowFontScaling={false} style={[styles.summaryItemLabel, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1} adjustsFontSizeToFit>
                  {t('orders.subtotal', { defaultValue: 'Subtotal' })}
                </Text>
                <Text allowFontScaling={false} style={[styles.summaryItemValue, { color: theme.colors.text, textAlign: isRTL ? 'left' : 'right' }]} numberOfLines={1} adjustsFontSizeToFit>
                  {formatPrice(order.subtotalUSD || 0, displayCurrency, displayExchangeRate)}
                </Text>
              </View>

              {(() => {
                const shippingPrice = getShippingAmount(order);
                const isFree = shippingPrice === 0;
                return (
                  <View style={[styles.summaryItemRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <Text allowFontScaling={false} style={[styles.summaryItemLabel, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1} adjustsFontSizeToFit>
                      {t('orders.shipping', { defaultValue: 'Shipping' })}
                    </Text>
                    <Text allowFontScaling={false} style={[styles.summaryItemValue, { textAlign: isRTL ? 'left' : 'right' }, isFree ? { color: theme.colors.success } : { color: theme.colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
                      {isFree ? t('cart.freeShipping', { defaultValue: 'Free Shipping' }) : formatPrice(shippingPrice, displayCurrency, displayExchangeRate)}
                    </Text>
                  </View>
                );
              })()}

              {(order.taxUSD || 0) > 0 && (
                <View style={[styles.summaryItemRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Text allowFontScaling={false} style={[styles.summaryItemLabel, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1} adjustsFontSizeToFit>
                    {t('orders.tax', { defaultValue: 'Tax' })}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.summaryItemValue, { color: theme.colors.text, textAlign: isRTL ? 'left' : 'right' }]} numberOfLines={1} adjustsFontSizeToFit>
                    {formatPrice(order.taxUSD || 0, displayCurrency, displayExchangeRate)}
                  </Text>
                </View>
              )}

              {order.appliedDiscount && order.appliedDiscount.savedAmount > 0 && (
                <View style={[styles.summaryItemRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  {/* The order stores the discount's translations alongside its name,
                      so a receipt opened in Arabic reads in Arabic. Orders placed
                      before that was captured fall back to the English name. */}
                  <View style={[styles.discountLabelColumn, { marginLeft: isRTL ? 8 : 0, marginRight: isRTL ? 0 : 8 }]}>
                    <Text allowFontScaling={false} style={[styles.summaryItemLabel, { color: theme.colors.success, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1} adjustsFontSizeToFit>
                      {discountDisplayName(order.appliedDiscount, i18n.language)}
                    </Text>
                    {!!discountDisplayDescription(order.appliedDiscount, i18n.language) && (
                      <Text allowFontScaling={false} style={[styles.discountDescription, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
                        {discountDisplayDescription(order.appliedDiscount, i18n.language)}
                      </Text>
                    )}
                  </View>
                  <Text allowFontScaling={false} style={[styles.summaryItemValue, { color: theme.colors.success, textAlign: isRTL ? 'left' : 'right' }]} numberOfLines={1} adjustsFontSizeToFit>
                    -{formatPrice(order.appliedDiscount.savedAmount, displayCurrency, displayExchangeRate)}
                  </Text>
                </View>
              )}

              <View style={[styles.divider, { borderBottomColor: theme.colors.border }]} />

              <View style={[styles.summaryItemRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Text allowFontScaling={false} style={[styles.summaryItemLabel, styles.summaryTotalText, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1} adjustsFontSizeToFit>
                  {t('orders.total', { defaultValue: 'Total' })}
                </Text>
                <Text allowFontScaling={false} style={[styles.summaryItemValue, styles.summaryTotalValue, { color: theme.colors.primary, textAlign: isRTL ? 'left' : 'right' }]} numberOfLines={1} adjustsFontSizeToFit>
                  {formatOrderTotal(order, displayCurrency, displayExchangeRate)}
                </Text>
              </View>
            </View>
          </>
        ) : (
          // Order fetch failed — still confirm with the number we have.
          <View style={[styles.card, { backgroundColor: cardBg, alignItems: 'center' }]}>
            <Text allowFontScaling={false} style={[styles.subtitle, { color: theme.colors.textSecondary, marginBottom: 8 }]}>
              {t('checkout.orderThankYou', { defaultValue: 'Thank you for your order. Your order number is:' })}
            </Text>
            <Text allowFontScaling={false} style={[styles.orderNumber, { color: theme.colors.primary, fontSize: 22 }]}>
              {cleanNumber}
            </Text>
          </View>
        )}

        <Text allowFontScaling={false} style={[styles.message, { color: theme.colors.textSecondary }]}>
          {t('checkout.orderConfirmationMessage', { defaultValue: 'We\'ll send you a confirmation email with tracking information shortly.' })}
        </Text>
      </ScrollView>

      <View style={[styles.actions, { backgroundColor: theme.colors.background, paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
          onPress={handleViewOrderDetails}
          activeOpacity={0.8}
        >
          <Text allowFontScaling={false} style={styles.primaryButtonText}>{t('orders.viewDetails')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryButton, { borderColor: theme.colors.border }]}
          onPress={handleContinueShopping}
          activeOpacity={0.7}
        >
          <Text allowFontScaling={false} style={[styles.secondaryButtonText, { color: theme.colors.text }]}>
            {t('cart.continueShopping')}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: 16 },

  // Success affirmation
  successHeader: { alignItems: 'center', marginBottom: 16, marginTop: 8 },
  checkMark: {
    alignItems: 'center',
    borderRadius: 36,
    height: 72,
    justifyContent: 'center',
    marginBottom: 14,
    width: 72,
  },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  subtitle: { fontSize: 15, textAlign: 'center' },

  loadingContainer: { padding: 24, alignItems: 'center' },

  // Card (matches OrderDetailScreen)
  card: { borderRadius: 16, marginBottom: 16, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },

  // Status card
  statusHeader: { alignItems: 'center', flexDirection: 'row', marginBottom: 16 },
  statusIconContainer: {
    alignItems: 'center',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    marginRight: 16,
    width: 56,
  },
  statusInfo: { flex: 1 },
  statusTitle: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  orderNumber: { fontSize: 16, fontWeight: '500' },
  orderMeta: {
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  metaItem: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  metaText: { fontSize: 14 },

  // Items
  orderItem: { borderBottomWidth: 1, flexDirection: 'row', paddingVertical: 12 },
  itemImage: { borderRadius: 10, height: 64, marginRight: 12, width: 64 },
  itemDetails: { flex: 1, justifyContent: 'center' },
  itemName: { fontSize: 15, fontWeight: '500', marginBottom: 2 },
  itemPartNumber: { fontSize: 13, marginBottom: 4 },
  itemPrice: { fontSize: 15, fontWeight: '600' },
  selectedOptionsContainer: { alignItems: 'flex-start', flexDirection: 'column', marginTop: 4, marginBottom: 2 },
  selectedOptionText: { fontSize: 13, fontWeight: '400', lineHeight: 18, marginTop: 2 },
  wholesaleRow: { flexDirection: 'row', marginTop: 4 },
  wholesaleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  wholesaleText: { fontSize: 11, fontWeight: '600' },
  priceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  originalPrice: { fontSize: 12, textDecorationLine: 'line-through', marginLeft: 8, flexShrink: 0 },

  // Summary
  divider: { borderBottomWidth: 1, marginVertical: 12 },
  summaryItemRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryItemLabel: { fontSize: 14 },
  discountLabelColumn: { flex: 1 },
  discountDescription: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  summaryItemValue: { fontSize: 14, fontWeight: '500' },
  summaryTotalText: { fontSize: 16, fontWeight: '700' },
  summaryTotalValue: { fontSize: 16, fontWeight: '700' },

  // Message + actions
  message: { fontSize: 14, lineHeight: 22, marginTop: 4, marginBottom: 8, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 12, padding: 16 },
  primaryButton: { alignItems: 'center', borderRadius: 12, flex: 1, justifyContent: 'center', paddingVertical: 16 },
  primaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  secondaryButton: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flex: 1, justifyContent: 'center', paddingVertical: 16 },
  secondaryButtonText: { fontSize: 16, fontWeight: '600' },
});

export default OrderConfirmationScreen;
