/**
 * StartOrderBottomSheet - Alibaba-style Order Flow
 * 
 * A premium, modern bottom sheet that slides up from the product details
 * screen showing product summary, quantity selection, payment methods,
 * and order confirmation.
 * 
 * Payment Methods:
 * - Cash on Delivery
 * - Money Exchanger Office (popular in Iraq)
 * - QI Card (coming soon)
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
  ActivityIndicator,
  Alert,
  TextInput,
  Platform,
  PanResponder,
  KeyboardAvoidingView,
} from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from './ThemeProvider';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '../contexts/CurrencyContext';
import { formatPrice } from '../utils/currency';
import { Product, Address, RootStackParamList } from '../types';
import { SPACING } from '../constants/theme';
import { getDirection } from '../locales';
import addressService from '../services/addressService';
import { LocalCartService } from '../services/localCartService';
import AppText from './AppText';
import AppNumber from './AppNumber';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.85;

interface PaymentMethod {
  id: string;
  name: string;
  nameAr?: string;
  nameKu?: string;
  icon: string;
  iconType: 'ionicons' | 'material';
  description: string;
  descriptionAr?: string;
  descriptionKu?: string;
  isAvailable: boolean;
  color: string;
}

// Variation selection passed from ProductDetailsScreen
interface VariationSelection {
  variationId: string;
  name: string;
  quantity: number;
  price: number;
  stock: number;
}

interface StartOrderBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  onConfirmOrder: (orderData: {
    quantity: number;
    paymentMethod: string;
    notes?: string;
    addressId?: string;
    variationSelections?: VariationSelection[];
    colorSelections?: VariationSelection[];
  }) => Promise<void>;
  product: Product | null;
  // Size variation selections from ProductDetailsScreen
  variationSelections?: VariationSelection[];
  // Color variation selections from ProductDetailsScreen
  colorSelections?: VariationSelection[];
  // Total quantity (either from variations or main quantity)
  totalQuantity: number;
  // Calculated total price (includes wholesale pricing)
  calculatedTotalPrice: number;
  // Active unit price (may be wholesale price)
  activeUnitPrice: number;
  // Savings from wholesale pricing
  wholesaleSavings?: number;
  // Active tier info
  activeTierRange?: string;
  // Mode: 'order' for Start Order flow, 'cart' for Add to Cart flow
  mode?: 'order' | 'cart';
}

export const StartOrderBottomSheet: React.FC<StartOrderBottomSheetProps> = ({
  visible,
  onClose,
  onConfirmOrder,
  product,
  variationSelections = [],
  colorSelections = [],
  totalQuantity,
  // calculatedTotalPrice, activeUnitPrice, wholesaleSavings, activeTierRange
  // are kept in props interface for backward compatibility but no longer used;
  // the sheet now computes its own prices from local state.
  mode = 'order',
}) => {
  const isCartMode = mode === 'cart';
  const { theme, isDark } = useTheme();
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const { currency, exchangeRateIQD } = useCurrency();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const isRTL = getDirection(i18n.language) === 'rtl';

  // Animation
  const slideAnim = useState(new Animated.Value(SHEET_MAX_HEIGHT))[0];
  const fadeAnim = useState(new Animated.Value(0))[0];

  // Declared here rather than beside handleConfirm because the PanResponder below
  // closes over it. A ref (not state) so it is readable and settable synchronously.
  const submittingRef = useRef(false);

  // Swipe-to-dismiss PanResponder on drag handle
  const panResponder = useMemo(() => PanResponder.create({
    // Refuse to even claim the gesture while an order is being placed.
    onStartShouldSetPanResponder: () => !submittingRef.current,
    onMoveShouldSetPanResponder: (_, gestureState) => !submittingRef.current && gestureState.dy > 5,
    onPanResponderMove: (_, gestureState) => {
      if (gestureState.dy > 0) {
        slideAnim.setValue(gestureState.dy);
      }
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dy > 100 || gestureState.vy > 0.5) {
        // Swipe far enough or fast enough — dismiss
        Animated.timing(slideAnim, {
          toValue: SHEET_MAX_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }).start(() => { if (!submittingRef.current) onClose(); });
      } else {
        // Snap back
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }).start();
      }
    },
  }), [slideAnim, onClose]);

  // State
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('cash_on_delivery');
  const [orderNotes, setOrderNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [showAddressSelector, setShowAddressSelector] = useState(false);

  // ===== LOCAL QUANTITY STATE (editable in sheet) =====
  const [localQty, setLocalQty] = useState(totalQuantity || 1);
  const [localQtyText, setLocalQtyText] = useState(String(totalQuantity || 1));
  const [localVarQtys, setLocalVarQtys] = useState<Record<string, number>>({});
  const [localColorQtys, setLocalColorQtys] = useState<Record<string, number>>({});

  const hasSizeVars = !!(product?.variations && product.variations.length > 0);
  const hasColorVars = !!(product?.colorVariations && product.colorVariations.length > 0);
  const hasAnyVars = hasSizeVars || hasColorVars;

  // Initialize local state from props when the sheet opens
  useEffect(() => {
    if (visible && product) {
      if (hasSizeVars) {
        const initSizes: Record<string, number> = {};
        variationSelections.forEach(v => { initSizes[v.variationId] = v.quantity; });
        product.variations?.forEach(v => {
          if (!(v.variationId in initSizes)) initSizes[v.variationId] = 0;
        });
        setLocalVarQtys(initSizes);
      }
      if (hasColorVars) {
        const initColors: Record<string, number> = {};
        colorSelections.forEach(v => { initColors[v.variationId] = v.quantity; });
        product.colorVariations?.forEach(v => {
          if (!(v.variationId in initColors)) initColors[v.variationId] = 0;
        });
        setLocalColorQtys(initColors);
      }
      if (!hasAnyVars) {
        setLocalQty(totalQuantity || 1);
        setLocalQtyText(String(totalQuantity || 1));
      }
    }
  }, [visible, product, totalQuantity]);

  // Computed local totals
  const localTotalQty = useMemo(() => {
    if (!hasAnyVars) return localQty;
    const sizeTotal = Object.values(localVarQtys).reduce((s, q) => s + q, 0);
    const colorTotal = Object.values(localColorQtys).reduce((s, q) => s + q, 0);
    return sizeTotal + colorTotal;
  }, [hasAnyVars, localQty, localVarQtys, localColorQtys]);

  const localUnitPrice = useMemo(() => {
    if (!product) return 0;
    const isVip = user?.role === 'vip';
    return LocalCartService.getTieredPrice(product, localTotalQty > 0 ? localTotalQty : 1, isVip);
  }, [product, localTotalQty, user?.role]);

  const localTotalPrice = useMemo(() => {
    if (!product) return 0;
    if (!hasAnyVars) return localUnitPrice * localQty;
    // For variation products: sum each variation * its price (or tiered unit price)
    let total = 0;
    if (hasSizeVars && product.variations) {
      product.variations.forEach(v => {
        const qty = localVarQtys[v.variationId] || 0;
        const price = v.priceUSD ?? product.priceUSD;
        // Apply tiered discount ratio
        const ratio = localUnitPrice / product.priceUSD;
        total += qty * price * (ratio < 1 ? ratio : 1);
      });
    }
    if (hasColorVars && product.colorVariations) {
      product.colorVariations.forEach(v => {
        const qty = localColorQtys[v.variationId] || 0;
        const price = v.priceUSD ?? product.priceUSD;
        const ratio = localUnitPrice / product.priceUSD;
        total += qty * price * (ratio < 1 ? ratio : 1);
      });
    }
    return total;
  }, [product, hasAnyVars, hasSizeVars, hasColorVars, localVarQtys, localColorQtys, localUnitPrice, localQty]);

  // Helpers for +/- 
  const updateSizeQty = (variationId: string, delta: number) => {
    const variation = product?.variations?.find(v => v.variationId === variationId);
    if (!variation) return;
    setLocalVarQtys(prev => {
      const cur = prev[variationId] || 0;
      const next = Math.max(0, Math.min(cur + delta, variation.stockQuantity));
      return { ...prev, [variationId]: next };
    });
  };

  // TAPPING THE ROW SELECTS IT. Until now only the small +/- circles responded, so
  // a shopper who tapped "Black" or "256GB" — the obvious target — got nothing, and
  // then found Confirm Order did nothing either because the quantity was still 0.
  // One tap picks one; tapping a selected row clears it. The steppers still handle
  // more than one.
  const toggleVarRow = (variationId: string, qty: number, outOfStock: boolean) => {
    if (outOfStock) return;
    updateSizeQty(variationId, qty > 0 ? -qty : 1);
  };

  const toggleColorRow = (variationId: string, qty: number, outOfStock: boolean) => {
    if (outOfStock) return;
    updateColorQty(variationId, qty > 0 ? -qty : 1);
  };

  const updateColorQty = (variationId: string, delta: number) => {
    const variation = product?.colorVariations?.find(v => v.variationId === variationId);
    if (!variation) return;
    setLocalColorQtys(prev => {
      const cur = prev[variationId] || 0;
      const next = Math.max(0, Math.min(cur + delta, variation.stockQuantity));
      return { ...prev, [variationId]: next };
    });
  };

  // Payment methods
  const PAYMENT_METHODS: PaymentMethod[] = useMemo(() => [
    {
      id: 'cash_on_delivery',
      name: 'Cash on Delivery',
      nameAr: 'الدفع عند الاستلام',
      nameKu: 'پارەدان لەکاتی وەرگرتن',
      icon: 'cash-outline',
      iconType: 'ionicons',
      description: 'Pay when you receive your order',
      descriptionAr: 'ادفع عند استلام طلبك',
      descriptionKu: 'پارە بدە کاتێک داواکاریەکەت وەردەگریت',
      isAvailable: true,
      color: '#4CAF50',
    },
    {
      id: 'money_exchanger',
      name: 'Money Exchanger Office',
      nameAr: 'مكتب الصرافة',
      nameKu: 'نوسینگەی ئاڵوگۆڕی پارە',
      icon: 'bank-transfer',
      iconType: 'material',
      description: 'Send money to our exchanger office',
      descriptionAr: 'أرسل المال إلى مكتب الصرافة الخاص بنا',
      descriptionKu: 'پارە بنێرە بۆ نوسینگەی ئاڵوگۆڕی پارەی ئێمە',
      isAvailable: true,
      color: '#FF9800',
    },
    {
      id: 'qi_card',
      name: 'QI Card',
      nameAr: 'بطاقة كي كارد',
      nameKu: 'کارتی کیو ئای',
      icon: 'card-outline',
      iconType: 'ionicons',
      description: 'Coming Soon',
      descriptionAr: 'قريباً',
      descriptionKu: 'بەم زووانە',
      isAvailable: false,
      color: '#9E9E9E',
    },
  ], []);

  const styles = useMemo(() => createStyles(theme, isDark, insets, isRTL), [theme, isDark, insets, isRTL]);

  // Drop any address state belonging to the previous account the moment the
  // signed-in user changes, so nothing can survive into the next session.
  useEffect(() => {
    setAddresses([]);
    setSelectedAddress(null);
  }, [user?.uid]);

  // Load addresses
  useEffect(() => {
    let cancelled = false;
    const loadAddresses = async () => {
      if (!user?.uid) return;
      setAddressesLoading(true);
      try {
        const userAddresses = await addressService.getUserAddresses(user.uid);
        if (cancelled) return;
        setAddresses(userAddresses);
        const defaultAddr = userAddresses.find(a => a.isDefault) || userAddresses[0];
        // Assigned unconditionally. Guarding this with `if (defaultAddr)` meant that
        // when the new user has no addresses the setter was skipped and the previous
        // user's selection stayed in state — and because handleConfirm's "no address"
        // check reads `!selectedAddress && addresses.length === 0`, a stale selection
        // made it skip the guard entirely and ship to the previous user's address.
        setSelectedAddress(defaultAddr ?? null);
      } catch (error) {
        // Silent fail
      } finally {
        if (!cancelled) setAddressesLoading(false);
      }
    };
    if (visible && user?.uid) loadAddresses();
    return () => { cancelled = true; };
  }, [visible, user?.uid]);

  // Animate in/out
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SHEET_MAX_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, fadeAnim]);

  // Calculate TOTAL stock (main stockQty + all size variations + all color variations)
  const maxStock = useMemo(() => {
    if (!product) return 0;
    
    // Main product stock
    const mainStock = product.stockQty || 0;
    
    // Stock from size variations
    const sizeVariationStock = product.variations?.reduce((sum, v) => sum + (v.stockQuantity || 0), 0) || 0;
    
    // Stock from color variations
    const colorVariationStock = product.colorVariations?.reduce((sum, v) => sum + (v.stockQuantity || 0), 0) || 0;
    
    // Return total of all stocks
    return mainStock + sizeVariationStock + colorVariationStock;
  }, [product]);

  // Get localized text
  const getLocalizedName = useCallback((item: PaymentMethod) => {
    if (i18n.language === 'ar' && item.nameAr) return item.nameAr;
    if (i18n.language === 'ku' && item.nameKu) return item.nameKu;
    return item.name;
  }, [i18n.language]);

  const getLocalizedDescription = useCallback((item: PaymentMethod) => {
    if (i18n.language === 'ar' && item.descriptionAr) return item.descriptionAr;
    if (i18n.language === 'ku' && item.descriptionKu) return item.descriptionKu;
    return item.description;
  }, [i18n.language]);

  // Handler for confirming order - uses LOCAL state
  const handleConfirm = async () => {
    // Cart mode: skip user/address checks - guests can add to cart
    if (!isCartMode) {
      if (!user) {
        onClose();
        navigation.navigate('SignIn');
        return;
      }
    }

    if (localTotalQty === 0) {
      Alert.alert(
        t('startOrder.noSelection', { defaultValue: 'No Selection' }),
        t('startOrder.selectItemsFirst', { defaultValue: 'Please select quantity before ordering.' })
      );
      return;
    }

    if (!isCartMode && !selectedAddress && addresses.length === 0) {
      Alert.alert(
        t('startOrder.noAddress', { defaultValue: 'No Address' }),
        t('startOrder.addAddressFirst', { defaultValue: 'Please add a delivery address first.' }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { 
            text: t('startOrder.addAddress', { defaultValue: 'Add Address' }), 
            onPress: () => {
              onClose();
              navigation.navigate('AddEditAddress');
            }
          },
        ]
      );
      return;
    }

    // Build selections from local state
    const localSizeSelections = (product?.variations || [])
      .filter(v => (localVarQtys[v.variationId] || 0) > 0)
      .map(v => ({
        variationId: v.variationId,
        name: v.sizeValue,
        quantity: localVarQtys[v.variationId] || 0,
        price: v.priceUSD ?? product!.priceUSD,
        stock: v.stockQuantity,
      }));

    const localColorSelections = (product?.colorVariations || [])
      .filter(v => (localColorQtys[v.variationId] || 0) > 0)
      .map(v => ({
        variationId: v.variationId,
        name: v.colorValue,
        quantity: localColorQtys[v.variationId] || 0,
        price: v.priceUSD ?? product!.priceUSD,
        stock: v.stockQuantity,
      }));

    // Set synchronously before the first await. `isProcessing` is state, so it only
    // takes effect on the next render and two taps in the same frame would both
    // place an order.
    if (submittingRef.current) return;
    submittingRef.current = true;

    setIsProcessing(true);
    try {
      await onConfirmOrder({
        quantity: localTotalQty,
        paymentMethod: selectedPaymentMethod,
        notes: orderNotes.trim() || undefined,
        addressId: selectedAddress?.id,
        variationSelections: localSizeSelections,
        colorSelections: localColorSelections,
      });
    } catch (error: any) {
      Alert.alert(
        t('common.error'),
        error.message || t('startOrder.orderFailed', { defaultValue: 'Failed to place order' })
      );
    } finally {
      setIsProcessing(false);
      submittingRef.current = false;
    }
  };

  // Every dismissal path routes through here so an in-flight order cannot be
  // torn out from under itself: backdrop, close button, hardware back and the
  // swipe-to-dismiss gesture all consult the same ref.
  const handleDismiss = useCallback(() => {
    if (submittingRef.current) return;
    onClose();
  }, [onClose]);

  const getProductName = () => {
    if (!product) return '';
    if (i18n.language === 'ar' && product.nameAr) return product.nameAr;
    if (i18n.language === 'ku' && product.nameKu) return product.nameKu;
    return product.name;
  };

  if (!product) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleDismiss}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity 
          style={styles.backdropTouchable}
          activeOpacity={1}
          onPress={handleDismiss}
        />
      </Animated.View>

      {/* Sheet */}
      <Animated.View 
        style={[
          styles.sheetContainer,
          { transform: [{ translateY: slideAnim }] }
        ]}
      >
        {/* Glass Effect Background */}
        <BlurView intensity={isDark ? 40 : 80} tint={isDark ? 'dark' : 'light'} style={styles.blurView}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
          <View style={[styles.sheetContent, { backgroundColor: isDark ? 'rgba(30,30,30,0.92)' : 'rgba(255,255,255,0.95)' }]}>
            
            {/* Drag Handle — swipe to dismiss */}
            <View style={styles.dragHandleContainer} {...panResponder.panHandlers}>
              <View style={[styles.dragHandle, { backgroundColor: theme.colors.border }]} />
            </View>

            {/* Header */}
            <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text allowFontScaling={false} style={[styles.headerTitle, { color: theme.colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
                {isCartMode
                  ? t('cart.addToCart', { defaultValue: 'Add to Cart' })
                  : t('startOrder.title', { defaultValue: 'Start Order' })
                }
              </Text>
              <TouchableOpacity
                onPress={handleDismiss}
                style={styles.closeButton}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={t('common.close', { defaultValue: 'Close' })}
                accessibilityState={{ disabled: isProcessing }}
              >
                <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView 
              style={styles.scrollView} 
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              {/* ==================== PRODUCT CARD ==================== */}
              <View style={styles.productCard}>
                <Image
                  source={{ uri: product.imageUrls?.[0] }}
                  style={styles.productImage}
                  contentFit="cover"
                  transition={200}
                />
                <View style={[styles.productInfo, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                  <AppText 
                    style={[styles.productName, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]} 
                    numberOfLines={2}
                  >
                    {getProductName()}
                  </AppText>
                  
                  {/* Selected variations */}
                  {(variationSelections.length > 0 || colorSelections.length > 0) && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                      {variationSelections.map((v, i) => (
                        <View key={i} style={[styles.variationBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#f2f2f2' }]}>
                          <AppText style={[styles.variationText, { color: theme.colors.textSecondary }]}>
                            {`${v.name}: ${v.quantity}`}
                          </AppText>
                        </View>
                      ))}
                      {colorSelections.map((v, i) => (
                        <View key={`c${i}`} style={[styles.variationBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#f2f2f2' }]}>
                          <AppText style={[styles.variationText, { color: theme.colors.textSecondary }]}>
                            {`${v.name}: ${v.quantity}`}
                          </AppText>
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={[styles.priceRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <AppNumber 
                      value={formatPrice(localUnitPrice, currency, exchangeRateIQD)} 
                      style={[styles.unitPrice, { color: theme.colors.primary }]} 
                    />
                  </View>

                  {/* Stock Status */}
                  <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <View style={{ 
                      flexDirection: isRTL ? 'row-reverse' : 'row',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      <View style={[styles.stockDot, { 
                        backgroundColor: maxStock > 10 ? '#4CAF50' : maxStock > 0 ? '#FF9800' : '#F44336' 
                      }]} />
                      <AppText style={[styles.stockText, { 
                        color: maxStock > 0 ? '#4CAF50' : '#F44336' 
                      }]}>
                        {/* Availability only — never a quantity. */}
                        {maxStock > 0
                          ? t('product.inStock', { defaultValue: 'In Stock' })
                          : t('product.outOfStock', { defaultValue: 'Out of Stock' })
                        }
                      </AppText>
                    </View>
                  </View>

                  {/* Bulk Discounts Minimal List */}
                  {maxStock > 0 && product.priceTiers && product.priceTiers.length > 0 && (
                    <View style={{ marginTop: 8, width: '100%', alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
                      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                        <Ionicons name="flash" size={14} color="#FF6B00" />
                        <AppText style={{ fontSize: 13, fontWeight: '700', color: '#FF6B00' }}>
                          {t('product.bulkDiscount', { defaultValue: 'Bulk Discounts' })}
                        </AppText>
                      </View>
                      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 6 }}>
                        {product.priceTiers
                          .sort((a, b) => a.minQty - b.minQty)
                          .map((tier, idx) => {
                            const isActive = localTotalQty >= tier.minQty && (!tier.maxQty || localTotalQty <= tier.maxQty);
                            return (
                              <View key={idx} style={{
                                flexDirection: isRTL ? 'row-reverse' : 'row',
                                alignItems: 'center',
                                backgroundColor: isActive ? '#FF6B0015' : 'transparent',
                                borderRadius: 8,
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                gap: 4,
                                borderWidth: 1,
                                borderColor: isActive ? '#FF6B00' : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'),
                              }}>
                                <AppText style={{ fontSize: 11, color: isActive ? '#FF6B00' : theme.colors.textSecondary, fontWeight: '600' }}>
                                  {`${tier.minQty}+`}
                                </AppText>
                                <AppText style={{ fontSize: 11, color: isActive ? '#FF6B00' : theme.colors.text, fontWeight: '800' }}>
                                  {formatPrice(tier.priceUSD, currency, exchangeRateIQD)}
                                </AppText>
                              </View>
                            );
                          })}
                      </View>
                    </View>
                  )}
                </View>
              </View>

              {/* ==================== QUANTITY & VARIANTS ==================== */}
              <View style={[styles.sectionCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}>
                <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Ionicons name="cube-outline" size={20} color={theme.colors.primary} />
                  <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text, marginLeft: isRTL ? 0 : 8, marginRight: isRTL ? 8 : 0 }]} numberOfLines={1} adjustsFontSizeToFit>
                    {hasAnyVars
                      ? t('startOrder.selectVariants', { defaultValue: 'Select Items' })
                      : t('startOrder.quantity', { defaultValue: 'Quantity' })
                    }
                  </Text>
                </View>

                {/* ---- Simple product: single quantity selector ---- */}
                {!hasAnyVars && (
                  <View style={[styles.quantityRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <View style={[styles.quantitySelector, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                      <TouchableOpacity
                        style={styles.qtyButton}
                        onPress={() => {
                          const newQ = Math.max(1, localQty - 1);
                          setLocalQty(newQ);
                          setLocalQtyText(String(newQ));
                        }}
                      >
                        <Ionicons name="remove" size={22} color={theme.colors.primary} />
                      </TouchableOpacity>
                      <View style={styles.qtyDisplay}>
                        <TextInput allowFontScaling={false}
                          value={localQtyText}
                          onChangeText={(text) => {
                            const cleaned = text.replace(/[^0-9]/g, '');
                            setLocalQtyText(cleaned);
                            if (cleaned.length > 0) {
                              const num = parseInt(cleaned, 10);
                              const maxS = product?.stockQty || 999;
                              if (num > maxS) {
                                setLocalQty(maxS);
                                setLocalQtyText(String(maxS));
                              } else if (num >= 1) {
                                setLocalQty(num);
                              }
                            }
                          }}
                          onBlur={() => {
                            const num = parseInt(localQtyText, 10);
                            const maxS = product?.stockQty || 999;
                            if (isNaN(num) || num < 1) {
                              setLocalQty(1);
                              setLocalQtyText('1');
                            } else if (num > maxS) {
                              setLocalQty(maxS);
                              setLocalQtyText(String(maxS));
                            } else {
                              setLocalQty(num);
                              setLocalQtyText(String(num));
                            }
                          }}
                          keyboardType="number-pad"
                          selectTextOnFocus
                          style={[styles.qtyText, {
                            color: theme.colors.text,
                            textAlign: 'center',
                            includeFontPadding: false,
                            padding: 0,
                            minWidth: 40,
                          }]}
                        />
                      </View>
                      <TouchableOpacity
                        style={styles.qtyButton}
                        onPress={() => {
                          const maxS = product?.stockQty || 999;
                          const newQ = Math.min(localQty + 1, maxS);
                          setLocalQty(newQ);
                          setLocalQtyText(String(newQ));
                        }}
                      >
                        <Ionicons name="add" size={22} color={theme.colors.primary} />
                      </TouchableOpacity>
                    </View>

                    <View style={[styles.totalPriceContainer, { alignItems: isRTL ? 'flex-start' : 'flex-end' }]}>
                      <Text allowFontScaling={false} style={[styles.totalLabel, { color: theme.colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit>
                        {t('startOrder.total', { defaultValue: 'Total' })}
                      </Text>
                      <AppNumber
                        value={formatPrice(localTotalPrice, currency, exchangeRateIQD)}
                        style={[styles.totalPrice, { color: theme.colors.primary }]}
                      />
                    </View>
                  </View>
                )}

                {/* ---- Size Variations ---- */}
                {hasSizeVars && product?.variations && (
                  <View style={{ marginTop: hasColorVars ? 0 : 0 }}>
                    <AppText style={[styles.varSectionLabel, { color: theme.colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit>
                      {t('product.size', { defaultValue: 'Size' })}
                    </AppText>
                    {product.variations.map((v) => {
                      const qty = localVarQtys[v.variationId] || 0;
                      const outOfStock = v.stockQuantity === 0;
                      return (
                        <TouchableOpacity
                          key={v.variationId}
                          activeOpacity={outOfStock ? 1 : 0.7}
                          onPress={() => toggleVarRow(v.variationId, qty, outOfStock)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: qty > 0, disabled: outOfStock }}
                          style={[
                            styles.varRow,
                            { flexDirection: isRTL ? 'row-reverse' : 'row', opacity: outOfStock ? 0.4 : 1 },
                            qty > 0 && {
                              backgroundColor: theme.colors.primary + '12',
                              borderColor: theme.colors.primary,
                              borderWidth: 1,
                            },
                          ]}
                        >
                          <View style={[styles.varInfo, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                            <AppText style={[styles.varName, { color: theme.colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
                              {v.sizeValue}
                            </AppText>
                            <AppText style={[styles.varStock, { color: outOfStock ? '#F44336' : theme.colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit>
                              {outOfStock
                                ? t('product.outOfStock', { defaultValue: 'Out of Stock' })
                                : ''
                              }
                            </AppText>
                            {!outOfStock && product.priceTiers && product.priceTiers.length > 0 && (
                              <AppText style={[styles.varStock, { color: '#FF6B00', fontSize: 10, marginTop: 2 }]} numberOfLines={1} adjustsFontSizeToFit>
                                {`${t('product.wholesalePricing', { defaultValue: 'Wholesale' })}: ${formatPrice(Math.min(...product.priceTiers.map(tier => tier.priceUSD)), currency, exchangeRateIQD)}`}
                              </AppText>
                            )}
                          </View>
                          {v.priceUSD && v.priceUSD !== product.priceUSD && (
                            <AppNumber
                              value={formatPrice(v.priceUSD, currency, exchangeRateIQD)}
                              style={[styles.varPrice, { color: theme.colors.primary }]}
                            />
                          )}
                          <View style={[styles.varQtyControls, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                            <TouchableOpacity
                              style={styles.varQtyBtn}
                              onPress={() => updateSizeQty(v.variationId, -1)}
                              disabled={outOfStock || qty === 0}
                            >
                              <Ionicons name="remove" size={18} color={theme.colors.primary} />
                            </TouchableOpacity>
                            <AppNumber value={qty} style={[styles.varQtyText, { color: theme.colors.text }]} />
                            <TouchableOpacity
                              style={styles.varQtyBtn}
                              onPress={() => updateSizeQty(v.variationId, 1)}
                              disabled={outOfStock || qty >= v.stockQuantity}
                            >
                              <Ionicons name="add" size={18} color={theme.colors.primary} />
                            </TouchableOpacity>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* ---- Color Variations ---- */}
                {hasColorVars && product?.colorVariations && (
                  <View style={{ marginTop: hasSizeVars ? SPACING.md : 0 }}>
                    <AppText style={[styles.varSectionLabel, { color: theme.colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit>
                      {t('product.color', { defaultValue: 'Color' })}
                    </AppText>
                    {product.colorVariations.map((v) => {
                      const qty = localColorQtys[v.variationId] || 0;
                      const outOfStock = v.stockQuantity === 0;
                      return (
                        <TouchableOpacity
                          key={v.variationId}
                          activeOpacity={outOfStock ? 1 : 0.7}
                          onPress={() => toggleColorRow(v.variationId, qty, outOfStock)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: qty > 0, disabled: outOfStock }}
                          style={[
                            styles.varRow,
                            { flexDirection: isRTL ? 'row-reverse' : 'row', opacity: outOfStock ? 0.4 : 1 },
                            qty > 0 && {
                              backgroundColor: theme.colors.primary + '12',
                              borderColor: theme.colors.primary,
                              borderWidth: 1,
                            },
                          ]}
                        >
                          <View style={[styles.varInfo, { alignItems: isRTL ? 'flex-end' : 'flex-start', flexDirection: isRTL ? 'row-reverse' : 'row', gap: 8 }]}>
                            {v.colorHex && (
                              <View
                                style={[
                                  styles.colorDot,
                                  { backgroundColor: v.colorHex, borderColor: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.15)' },
                                ]}
                              />
                            )}
                            <View style={{ alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
                              <AppText style={[styles.varName, { color: theme.colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
                                {v.colorValue}
                              </AppText>
                              <AppText style={[styles.varStock, { color: outOfStock ? '#F44336' : theme.colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit>
                                {outOfStock
                                  ? t('product.outOfStock', { defaultValue: 'Out of Stock' })
                                  : ''
                                }
                              </AppText>
                              {!outOfStock && product.priceTiers && product.priceTiers.length > 0 && (
                                <AppText style={[styles.varStock, { color: '#FF6B00', fontSize: 10, marginTop: 2 }]} numberOfLines={1} adjustsFontSizeToFit>
                                  {`${t('product.wholesalePricing', { defaultValue: 'Wholesale' })}: ${formatPrice(Math.min(...product.priceTiers.map(tier => tier.priceUSD)), currency, exchangeRateIQD)}`}
                                </AppText>
                              )}
                            </View>
                          </View>
                          {v.priceUSD && v.priceUSD !== product.priceUSD && (
                            <AppNumber
                              value={formatPrice(v.priceUSD, currency, exchangeRateIQD)}
                              style={[styles.varPrice, { color: theme.colors.primary }]}
                            />
                          )}
                          <View style={[styles.varQtyControls, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                            <TouchableOpacity
                              style={styles.varQtyBtn}
                              onPress={() => updateColorQty(v.variationId, -1)}
                              disabled={outOfStock || qty === 0}
                            >
                              <Ionicons name="remove" size={18} color={theme.colors.primary} />
                            </TouchableOpacity>
                            <AppNumber value={qty} style={[styles.varQtyText, { color: theme.colors.text }]} />
                            <TouchableOpacity
                              style={styles.varQtyBtn}
                              onPress={() => updateColorQty(v.variationId, 1)}
                              disabled={outOfStock || qty >= v.stockQuantity}
                            >
                              <Ionicons name="add" size={18} color={theme.colors.primary} />
                            </TouchableOpacity>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* ---- Totals summary (for variant products) ---- */}
                {hasAnyVars && (
                  <View style={[styles.varTotalRow, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: theme.colors.primary + '10', marginTop: SPACING.sm }]}>
                    <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 6 }}>
                      <AppText style={{ color: theme.colors.textSecondary, fontSize: 13 }} numberOfLines={1} adjustsFontSizeToFit>
                        {t('startOrder.totalItems', { defaultValue: 'Total Items:' })}
                      </AppText>
                      <AppNumber value={localTotalQty} style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text }} />
                    </View>
                    <AppNumber
                      value={formatPrice(localTotalPrice, currency, exchangeRateIQD)}
                      style={[styles.totalPrice, { color: theme.colors.primary }]}
                    />
                  </View>
                )}
              </View>

              {/* ==================== DELIVERY ADDRESS (order mode only) ==================== */}
              {!isCartMode && user && (
                <View style={[styles.sectionCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}>
                  <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <Ionicons name="location-outline" size={20} color={theme.colors.primary} />
                    <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text, marginLeft: isRTL ? 0 : 8, marginRight: isRTL ? 8 : 0 }]} numberOfLines={1} adjustsFontSizeToFit>
                      {t('startOrder.deliveryAddress', { defaultValue: 'Delivery Address' })}
                    </Text>
                  </View>

                  {addressesLoading ? (
                    <View style={styles.addressLoading}>
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                    </View>
                  ) : selectedAddress ? (
                    <TouchableOpacity 
                      style={[styles.addressCard, { borderColor: theme.colors.primary + '40' }]}
                      onPress={() => setShowAddressSelector(!showAddressSelector)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text allowFontScaling={false} style={[styles.addressTitle, { color: theme.colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
                          {selectedAddress.title || selectedAddress.fullName}
                        </Text>
                        <Text allowFontScaling={false} style={[styles.addressText, { color: theme.colors.textSecondary }]} numberOfLines={2} adjustsFontSizeToFit>
                          {selectedAddress.address}, {selectedAddress.city}
                        </Text>
                      </View>
                      <Ionicons 
                        name={showAddressSelector ? "chevron-up" : "chevron-down"} 
                        size={20} 
                        color={theme.colors.textSecondary} 
                      />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity 
                      style={[styles.addAddressButton, { borderColor: theme.colors.primary }]}
                      onPress={() => {
                        onClose();
                        navigation.navigate('AddEditAddress');
                      }}
                    >
                      <Ionicons name="add-circle-outline" size={24} color={theme.colors.primary} />
                      <Text allowFontScaling={false} style={[styles.addAddressText, { color: theme.colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>
                        {t('startOrder.addAddress', { defaultValue: 'Add Delivery Address' })}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* Address Selector Dropdown */}
                  {showAddressSelector && addresses.length > 1 && (
                    <View style={[styles.addressDropdown, { backgroundColor: theme.colors.surface }]}>
                      {addresses.map((addr) => (
                        <TouchableOpacity
                          key={addr.id}
                          style={[
                            styles.addressOption,
                            selectedAddress?.id === addr.id && { backgroundColor: theme.colors.primary + '10' }
                          ]}
                          onPress={() => {
                            setSelectedAddress(addr);
                            setShowAddressSelector(false);
                          }}
                        >
                          <Text allowFontScaling={false} style={[styles.addressOptionTitle, { color: theme.colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
                            {addr.title || addr.fullName}
                          </Text>
                          <Text allowFontScaling={false} style={[styles.addressOptionText, { color: theme.colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit>
                            {addr.address}
                          </Text>
                          {selectedAddress?.id === addr.id && (
                            <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* ==================== PAYMENT METHODS (order mode only) ==================== */}
              {!isCartMode && (
              <View style={[styles.sectionCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}>
                <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Ionicons name="wallet-outline" size={20} color={theme.colors.primary} />
                  <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text, marginLeft: isRTL ? 0 : 8, marginRight: isRTL ? 8 : 0 }]} numberOfLines={1} adjustsFontSizeToFit>
                    {t('startOrder.paymentMethod', { defaultValue: 'Payment Method' })}
                  </Text>
                </View>

                {PAYMENT_METHODS.map((method) => (
                  <TouchableOpacity
                    key={method.id}
                    style={[
                      styles.paymentOption,
                      { 
                        borderColor: selectedPaymentMethod === method.id ? method.color : theme.colors.border,
                        backgroundColor: selectedPaymentMethod === method.id ? method.color + '10' : 'transparent',
                        opacity: method.isAvailable ? 1 : 0.5,
                        flexDirection: isRTL ? 'row-reverse' : 'row',
                      }
                    ]}
                    onPress={() => method.isAvailable && setSelectedPaymentMethod(method.id)}
                    disabled={!method.isAvailable}
                  >
                    <View style={[styles.paymentIconContainer, { backgroundColor: method.color + '20' }]}>
                      {method.iconType === 'ionicons' ? (
                        <Ionicons name={method.icon as any} size={24} color={method.color} />
                      ) : (
                        <MaterialCommunityIcons name={method.icon as any} size={24} color={method.color} />
                      )}
                    </View>

                    <View style={[styles.paymentInfo, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                      <View style={[styles.paymentNameRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                        <Text allowFontScaling={false} style={[styles.paymentName, { color: theme.colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
                          {getLocalizedName(method)}
                        </Text>
                        {!method.isAvailable && (
                          <View style={[styles.comingSoonBadge, { backgroundColor: theme.colors.warning + '20' }]}>
                            <Text allowFontScaling={false} style={[styles.comingSoonText, { color: theme.colors.warning }]} numberOfLines={1} adjustsFontSizeToFit>
                              {t('common.comingSoon', { defaultValue: 'Soon' })}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text allowFontScaling={false} style={[styles.paymentDescription, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={2} adjustsFontSizeToFit>
                        {getLocalizedDescription(method)}
                      </Text>
                    </View>

                    <View style={[
                      styles.radioOuter,
                      { borderColor: selectedPaymentMethod === method.id ? method.color : theme.colors.border }
                    ]}>
                      {selectedPaymentMethod === method.id && (
                        <View style={[styles.radioInner, { backgroundColor: method.color }]} />
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
              )}

              {/* ==================== ORDER NOTES (order mode only) ==================== */}
              {!isCartMode && (
              <View style={[styles.sectionCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}>
                <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Ionicons name="document-text-outline" size={20} color={theme.colors.primary} />
                  <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text, marginLeft: isRTL ? 0 : 8, marginRight: isRTL ? 8 : 0 }]} numberOfLines={1} adjustsFontSizeToFit>
                    {t('startOrder.notes', { defaultValue: 'Order Notes' })}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.optionalLabel, { color: theme.colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit>
                    ({t('common.optional', { defaultValue: 'Optional' })})
                  </Text>
                </View>

                <TextInput allowFontScaling={false}
                  style={[
                    styles.notesInput,
                    { 
                      color: theme.colors.text,
                      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                      borderColor: theme.colors.border,
                      textAlign: isRTL ? 'right' : 'left',
                    }
                  ]}
                  placeholder={t('startOrder.notesPlaceholder', { defaultValue: 'Add special instructions...' })}
                  placeholderTextColor={theme.colors.placeholder}
                  value={orderNotes}
                  onChangeText={setOrderNotes}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>
              )}

              {/* Bottom Padding */}
              <View style={{ height: 120 }} />
            </ScrollView>

            {/* ==================== CONFIRM BUTTON ==================== */}
            <View style={[styles.footer, { backgroundColor: isDark ? 'rgba(30,30,30,0.98)' : 'rgba(255,255,255,0.98)' }]}>
              <View style={[styles.footerContent, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <View style={[styles.footerPrice, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                  <Text allowFontScaling={false} style={[styles.footerLabel, { color: theme.colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit>
                    {isCartMode
                      ? t('cart.total', { defaultValue: 'Total' })
                      : t('startOrder.totalToPay', { defaultValue: 'Total to Pay' })
                    }
                  </Text>
                  <AppNumber 
                    value={formatPrice(localTotalPrice, currency, exchangeRateIQD)} 
                    style={styles.footerTotal} 
                  />
                </View>

                <TouchableOpacity
                  style={[styles.confirmButton, { opacity: isProcessing || maxStock === 0 ? 0.7 : 1 }]}
                  onPress={handleConfirm}
                  // NOT disabled for an empty quantity, deliberately. It used to be,
                  // and the only cue was opacity 0.7 — so a shopper who had not picked
                  // a size tapped Buy and NOTHING happened, with nothing to read. The
                  // handler already has the right words for this ("Please select
                  // quantity before ordering", :425) and they were unreachable, because
                  // a disabled button never calls its handler. Now the tap lands and the
                  // app says why. Still disabled while a request is in flight and when
                  // the product genuinely has no stock — in both cases pressing again
                  // must not do anything.
                  disabled={isProcessing || maxStock === 0}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={['#FF5A00', '#FF8C00']}
                    start={{ x: isRTL ? 1 : 0, y: 0 }}
                    end={{ x: isRTL ? 0 : 1, y: 0 }}
                    style={styles.confirmGradient}
                  >
                    {isProcessing ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <ActivityIndicator size="small" color="#FFFFFF" />
                        <Text allowFontScaling={false} style={styles.confirmText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                          {t('startOrder.processing', { defaultValue: 'Starting…' })}
                        </Text>
                      </View>
                    ) : maxStock === 0 ? (
                      <>
                        <Ionicons name="alert-circle" size={20} color="#FFFFFF" />
                        <Text allowFontScaling={false} style={styles.confirmText} numberOfLines={1} adjustsFontSizeToFit>
                          {t('product.outOfStock', { defaultValue: 'Out of Stock' })}
                        </Text>
                      </>
                    ) : (
                      <>
                        <Ionicons name={isCartMode ? "cart" : (user ? "cart" : "log-in")} size={20} color="#FFFFFF" />
                        <Text allowFontScaling={false} style={styles.confirmText} numberOfLines={1} adjustsFontSizeToFit>
                          {isCartMode
                            ? t('cart.addToCart', { defaultValue: 'Add to Cart' })
                            : user 
                              ? t('startOrder.confirmOrder', { defaultValue: 'Confirm Order' })
                              : t('startOrder.loginToOrder', { defaultValue: 'Login to Order' })
                          }
                        </Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          </KeyboardAvoidingView>
        </BlurView>
      </Animated.View>
    </Modal>
  );
};

const createStyles = (theme: any, isDark: boolean, insets: any, isRTL: boolean) =>
  StyleSheet.create({
    // ========== LUXURY SHEET CONTAINER ==========
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.6)',
    },
    backdropTouchable: {
      flex: 1,
    },
    sheetContainer: {
      bottom: 0,
      left: 0,
      maxHeight: SHEET_MAX_HEIGHT,
      position: 'absolute',
      right: 0,
      // Luxury: wide soft shadow
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -8 },
      shadowOpacity: 0.18,
      shadowRadius: 40,
      elevation: 24,
    },
    blurView: {
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      overflow: 'hidden',
    },
    sheetContent: {
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
    },

    // ========== LUXURY DRAG HANDLE ==========
    dragHandleContainer: {
      alignItems: 'center',
      paddingBottom: 10,
      paddingTop: 14,
    },
    dragHandle: {
      borderRadius: 999,
      height: 5,
      opacity: isDark ? 0.1 : 0.06,
      width: 44,
    },

    // ========== LUXURY HEADER ==========
    header: {
      alignItems: 'center',
      borderBottomColor: theme.colors.border + '15',
      borderBottomWidth: StyleSheet.hairlineWidth,
      justifyContent: 'space-between',
      paddingBottom: 16,
      paddingHorizontal: 20,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    closeButton: {
      alignItems: 'center',
      borderRadius: 20,
      height: 36,
      justifyContent: 'center',
      width: 36,
    },

    // ========== LUXURY SCROLL ==========
    scrollView: {
      maxHeight: SCREEN_HEIGHT * 0.55,
    },
    scrollContent: {
      gap: 14,
      paddingBottom: 8,
      paddingHorizontal: 20,
      paddingTop: 16,
    },

    // ========== LUXURY PRODUCT CARD ==========
    productCard: {
      flexDirection: isRTL ? 'row-reverse' : 'row',
      alignItems: 'flex-start',
      paddingHorizontal: 0,
      paddingVertical: 4,
      gap: 16,
    },
    productImage: {
      backgroundColor: theme.colors.background,
      borderRadius: 14,
      height: 110,
      width: 110,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 4,
    },
    productInfo: {
      flex: 1,
      justifyContent: 'center',
    },
    productName: {
      fontSize: 18,
      fontWeight: '600',
      letterSpacing: 0,
      lineHeight: 24,
    },
    variationBadge: {
      alignSelf: isRTL ? 'flex-end' : 'flex-start',
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    variationText: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.2,
    },
    priceRow: {
      alignItems: 'baseline',
      gap: 4,
      marginTop: 6,
    },
    unitPrice: {
      fontSize: 20,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    perUnit: {
      fontSize: 12,
      fontWeight: '400',
      opacity: 0.6,
    },
    stockBadge: {
      alignItems: 'center',
      alignSelf: isRTL ? 'flex-end' : 'flex-start',
      borderRadius: 10,
      gap: 5,
      marginTop: 8,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    stockDot: {
      borderRadius: 4,
      height: 7,
      width: 7,
    },
    stockText: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.2,
    },

    // ========== LUXURY SECTION CARDS ==========
    sectionCard: {
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
      borderRadius: 20,
      borderWidth: 1,
      padding: 16,
    },
    sectionHeader: {
      alignItems: 'center',
      gap: 6,
      marginBottom: 12,
    },
    sectionTitle: {
      flex: 1,
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0.1,
    },
    optionalLabel: {
      fontSize: 12,
      fontWeight: '400',
      opacity: 0.5,
    },

    // ========== LUXURY QUANTITY ==========
    quantityRow: {
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    quantitySelector: {
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f2f2f2',
      borderRadius: 24,
      paddingHorizontal: 4,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.03)',
    },
    qtyButton: {
      alignItems: 'center',
      borderRadius: 20,
      height: 40,
      justifyContent: 'center',
      width: 40,
      backgroundColor: theme.colors.background,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    qtyDisplay: {
      alignItems: 'center',
      height: 44,
      justifyContent: 'center',
      minWidth: 54,
      paddingHorizontal: 8,
    },
    qtyText: {
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: -0.2,
      height: 44,
      paddingVertical: 0,
      textAlignVertical: 'center',
      includeFontPadding: false,
    },
    totalPriceContainer: {
      gap: 3,
    },
    totalLabel: {
      fontSize: 12,
      fontWeight: '500',
      letterSpacing: 0.3,
      opacity: 0.6,
      textTransform: 'uppercase',
    },
    totalPrice: {
      color: '#FF5A00',
      fontSize: 24,
      fontWeight: '800',
      letterSpacing: -0.5,
    },

    // ========== LUXURY ADDRESS ==========
    addressLoading: {
      alignItems: 'center',
      padding: 20,
    },
    addressCard: {
      alignItems: 'center',
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: isRTL ? 'row-reverse' : 'row',
      gap: SPACING.sm,
      padding: 14,
    },
    addressTitle: {
      fontSize: 15,
      fontWeight: '600',
      letterSpacing: 0.1,
    },
    addressText: {
      fontSize: 13,
      marginTop: 3,
      opacity: 0.7,
    },
    addAddressButton: {
      alignItems: 'center',
      borderRadius: 16,
      borderStyle: 'dashed',
      borderWidth: 1.5,
      flexDirection: isRTL ? 'row-reverse' : 'row',
      gap: 10,
      justifyContent: 'center',
      padding: 16,
    },
    addAddressText: {
      fontSize: 15,
      fontWeight: '600',
    },
    addressDropdown: {
      borderColor: theme.colors.border + '40',
      borderRadius: 16,
      borderWidth: 1,
      marginTop: 10,
      overflow: 'hidden',
    },
    addressOption: {
      alignItems: 'center',
      borderBottomColor: theme.colors.border + '15',
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: isRTL ? 'row-reverse' : 'row',
      padding: 14,
    },
    addressOptionTitle: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
    },
    addressOptionText: {
      flex: 2,
      fontSize: 13,
      marginHorizontal: SPACING.sm,
      opacity: 0.6,
    },

    // ========== LUXURY PAYMENT METHODS ==========
    paymentOption: {
      alignItems: 'center',
      borderRadius: 18,
      borderWidth: 1.5,
      gap: 12,
      marginBottom: 10,
      padding: 14,
    },
    paymentIconContainer: {
      alignItems: 'center',
      borderRadius: 16,
      height: 52,
      justifyContent: 'center',
      width: 52,
    },
    paymentInfo: {
      flex: 1,
    },
    paymentNameRow: {
      alignItems: 'center',
      gap: 8,
    },
    paymentName: {
      fontSize: 15,
      fontWeight: '600',
      letterSpacing: 0.1,
    },
    comingSoonBadge: {
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    comingSoonText: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    paymentDescription: {
      fontSize: 13,
      marginTop: 3,
      opacity: 0.6,
    },
    radioOuter: {
      alignItems: 'center',
      borderRadius: 12,
      borderWidth: 2,
      height: 24,
      justifyContent: 'center',
      width: 24,
    },
    radioInner: {
      borderRadius: 7,
      height: 14,
      width: 14,
    },

    // ========== LUXURY NOTES ==========
    notesInput: {
      borderRadius: 16,
      borderWidth: 1,
      fontSize: 15,
      lineHeight: 22,
      minHeight: 88,
      padding: 14,
    },

    // ========== LUXURY VARIATION ROWS ==========
    varSectionLabel: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 1,
      marginBottom: 8,
      marginTop: 6,
      opacity: 0.5,
      textTransform: 'uppercase',
    },
    varRow: {
      alignItems: 'center',
      borderBottomColor: theme.colors.border + '12',
      borderBottomWidth: StyleSheet.hairlineWidth,
      gap: 10,
      paddingVertical: 12,
    },
    varInfo: {
      flex: 1,
      gap: 3,
    },
    varName: {
      fontSize: 15,
      fontWeight: '600',
      letterSpacing: 0.1,
    },
    varStock: {
      fontSize: 12,
      opacity: 0.7,
    },
    varPrice: {
      fontSize: 14,
      fontWeight: '700',
      marginHorizontal: 6,
    },
    varQtyControls: {
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f2f2f2',
      borderRadius: 18,
      paddingHorizontal: 3,
      paddingVertical: 3,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.03)',
    },
    varQtyBtn: {
      alignItems: 'center',
      borderRadius: 15,
      height: 30,
      justifyContent: 'center',
      width: 30,
      backgroundColor: theme.colors.background,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    varQtyText: {
      fontSize: 18,
      fontWeight: '700',
      minWidth: 36,
      textAlign: 'center',
    },
    varTotalRow: {
      alignItems: 'center',
      borderRadius: 14,
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    colorDot: {
      borderRadius: 12,
      borderWidth: 2,
      height: 24,
      width: 24,
    },

    // ========== LUXURY FOOTER ==========
    footer: {
      borderTopColor: theme.colors.border + '15',
      borderTopWidth: StyleSheet.hairlineWidth,
      bottom: 0,
      left: 0,
      paddingBottom: insets.bottom + 16,
      paddingHorizontal: 20,
      paddingTop: 14,
      position: 'absolute',
      right: 0,
    },
    footerContent: {
      alignItems: 'center',
      gap: 14,
    },
    footerPrice: {
      flex: 1,
    },
    footerLabel: {
      fontSize: 12,
      fontWeight: '500',
      letterSpacing: 0.3,
      opacity: 0.5,
      textTransform: 'uppercase',
    },
    footerTotal: {
      color: '#FF5A00',
      fontSize: 28,
      fontWeight: '800',
      letterSpacing: -0.5,
    },
    confirmButton: {
      borderRadius: 18,
      flex: 1.2,
      overflow: 'hidden',
      // Luxury shadow on CTA
      shadowColor: '#FF5A00',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 8,
    },
    confirmGradient: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 10,
      justifyContent: 'center',
      paddingVertical: 18,
    },
    confirmText: {
      color: '#FFFFFF',
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
  });

export default StartOrderBottomSheet;
