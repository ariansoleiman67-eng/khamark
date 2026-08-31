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
import { convertIQDToUSD, formatPrice, formatVariantPrice, getPriceUSD, variantCompareAtUSD, variantPriceUSD } from '../utils/currency';
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
  // ONE choice per group, not a quantity per variation. The sheet is a chooser.
  const [selectedSizeId, setSelectedSizeId] = useState<string | null>(null);
  const [selectedColorId, setSelectedColorId] = useState<string | null>(null);

  const hasSizeVars = !!(product?.variations && product.variations.length > 0);
  const hasColorVars = !!(product?.colorVariations && product.colorVariations.length > 0);
  const hasAnyVars = hasSizeVars || hasColorVars;

  // Initialize local state from props when the sheet opens
  useEffect(() => {
    if (visible && product) {
      // Re-open on whatever was already chosen, if anything.
      const preSize = variationSelections.find(v => v.quantity > 0);
      const preColor = colorSelections.find(v => v.quantity > 0);
      setSelectedSizeId(preSize?.variationId ?? null);
      setSelectedColorId(preColor?.variationId ?? null);
      const preQty = preSize?.quantity ?? preColor?.quantity ?? totalQuantity ?? 1;
      setLocalQty(Math.max(1, preQty));
      setLocalQtyText(String(Math.max(1, preQty)));
    }
  }, [visible, product, totalQuantity]);

  // A chip shows a price only when the variant carries one of its own — in either
  // currency. Comparing priceUSD to product.priceUSD missed a dinar-only variant
  // entirely, so the one variant whose price actually differs showed nothing.
  const hasOwnPrice = (v: { priceUSD?: number; priceIQD?: number } | null | undefined) => {
    if (!v || !product) return false;
    if (typeof v.priceIQD === 'number' && v.priceIQD > 0) return true;
    return typeof v.priceUSD === 'number' && v.priceUSD > 0 && v.priceUSD !== product.priceUSD;
  };

  const selectedSize = useMemo(
    () => product?.variations?.find(v => v.variationId === selectedSizeId) ?? null,
    [product, selectedSizeId],
  );
  const selectedColor = useMemo(
    () => product?.colorVariations?.find(v => v.variationId === selectedColorId) ?? null,
    [product, selectedColorId],
  );

  // Every group the product offers must be answered before there is anything to buy.
  /**
   * The chosen variant whose price is charged.
   *
   * Size first, then colour — but only if it actually carries a price of its own.
   * Taking `selectedSize ?? selectedColor` looks equivalent and is not: the value
   * ladder this replaced fell THROUGH a priceless size to the colour's price, so a
   * shop that prices by colour and sizes by storage lost the colour price the
   * moment a size was picked.
   *
   * Computed once so the total in the sheet and the price written to the cart line
   * cannot disagree.
   */
  const pricedVariant = useMemo(() => {
    if (hasOwnPrice(selectedSize)) return selectedSize;
    if (hasOwnPrice(selectedColor)) return selectedColor;
    return selectedSize ?? selectedColor;
  }, [selectedSize, selectedColor, product]);

  const selectionComplete = (!hasSizeVars || !!selectedSize) && (!hasColorVars || !!selectedColor);
  const qtyEnabled = !hasAnyVars || selectionComplete;

  const selectionHint = useMemo(() => {
    if (!hasAnyVars || selectionComplete) return '';
    if (hasSizeVars && !selectedSize) return t('startOrder.chooseSize', { defaultValue: 'Choose a size to continue' });
    return t('startOrder.chooseColor', { defaultValue: 'Choose a colour to continue' });
  }, [hasAnyVars, selectionComplete, hasSizeVars, selectedSize, t]);

  // The chosen size and the chosen colour are the same physical phone, so the order
  // can never exceed the smaller of the two stocks.
  const maxSelectable = useMemo(() => {
    if (!hasAnyVars) return product?.stockQty || 999;
    const caps: number[] = [];
    if (selectedSize) caps.push(selectedSize.stockQuantity);
    if (selectedColor) caps.push(selectedColor.stockQuantity);
    return caps.length > 0 ? Math.max(1, Math.min(...caps)) : 1;
  }, [hasAnyVars, product?.stockQty, selectedSize, selectedColor]);

  // Changing the choice can lower the ceiling under a quantity already typed in.
  useEffect(() => {
    if (localQty > maxSelectable) {
      setLocalQty(maxSelectable);
      setLocalQtyText(String(maxSelectable));
    }
  }, [maxSelectable, localQty]);

  // Computed local totals
  const localTotalQty = useMemo(() => {
    if (!hasAnyVars) return localQty;
    return selectionComplete ? localQty : 0;
  }, [hasAnyVars, localQty, selectionComplete]);

  const isVip = user?.role === 'vip';

  /**
   * The struck-through "was" price for ONE option, or null when it has none or
   * the figure does not beat what this shopper actually pays for that option.
   *
   * Without this the per-option "was" price the shop can now set had no reader
   * anywhere: it was saved to the database and never shown to anybody.
   */
  const optionWasPrice = useCallback((v: any): string | null => {
    if (!product) return null;
    // Only an option's OWN "was" price. variantCompareAtUSD falls back to the
    // product's for an option that does not price itself, and printing that
    // under every chip would strike a price through beside options whose own
    // price is not even shown.
    const ownWas = Number((v as any)?.compareAtPriceIQD) > 0 || Number((v as any)?.compareAtPriceUSD) > 0;
    if (!ownWas) return null;
    const was = variantCompareAtUSD(v, product, exchangeRateIQD);
    if (!(was > 0)) return null;
    const pays = variantPriceUSD(v, product, exchangeRateIQD, isVip);
    if (!(pays > 0) || was <= pays) return null;
    return formatPrice(was, currency, exchangeRateIQD);
  }, [product, exchangeRateIQD, isVip, currency]);

  const localUnitPrice = useMemo(() => {
    if (!product) return 0;
    return LocalCartService.getTieredPrice(product, localTotalQty > 0 ? localTotalQty : 1, isVip);
  }, [product, localTotalQty, isVip]);

  // Does the CHOSEN option carry a VIP price of its own? If it does, that figure
  // replaces the discount worked out from the product, rather than stacking on
  // top of it — the ratio below is the product-level VIP/wholesale saving, and
  // applying both would discount twice.
  const variantOwnVipUSD = useMemo(() => {
    if (!isVip || !pricedVariant) return 0;
    const v = pricedVariant as any;
    const iqd = Number(v.vipPriceIQD);
    if (Number.isFinite(iqd) && iqd > 0) return convertIQDToUSD(iqd, exchangeRateIQD);
    const usd = Number(v.vipPriceUSD);
    return Number.isFinite(usd) && usd > 0 ? usd : 0;
  }, [isVip, pricedVariant, exchangeRateIQD]);

  const localTotalPrice = useMemo(() => {
    if (!product) return 0;
    if (!hasAnyVars) return localUnitPrice * localQty;
    if (!selectionComplete) return 0;
    // One line, one price: whichever chosen variant actually carries a price, size
    // first. Summing both is what charged for two phones.
    // variantPriceUSD, not `?? product.priceUSD`, so a variant priced in dinar is
    // charged at its dinar figure instead of silently falling through to dollars.
    const price = variantPriceUSD(pricedVariant, product, exchangeRateIQD);
    if (variantOwnVipUSD > 0 && variantOwnVipUSD < price) return variantOwnVipUSD * localQty;
    const base = getPriceUSD(product, exchangeRateIQD);
    const ratio = base > 0 ? localUnitPrice / base : 1;
    return price * localQty * (ratio < 1 ? ratio : 1);
  }, [product, hasAnyVars, selectionComplete, pricedVariant, localUnitPrice, localQty, exchangeRateIQD, variantOwnVipUSD]);


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
        selectionHint || t('startOrder.selectItemsFirst', { defaultValue: 'Please select quantity before ordering.' })
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

    // Build selections from local state.
    //
    // ONE cart line, even when both a size and a colour were chosen. Sending them as
    // two selections is what made "256GB" + "Black" arrive as two separate lines and
    // charge for two phones. The size carries the line (it holds the price) and the
    // colour rides along on it; only a colour-only product sends a colour selection.
    const localSizeSelections = selectedSize
      ? [{
          variationId: selectedSize.variationId,
          name: String(selectedSize.sizeValue ?? ''),
          quantity: localQty,
          price: variantPriceUSD(pricedVariant, product, exchangeRateIQD),
          stock: selectedSize.stockQuantity,
          color: selectedColor?.colorValue,
          colorVariationId: selectedColor?.variationId,
        }]
      : [];

    const localColorSelections = !selectedSize && selectedColor
      ? [{
          variationId: selectedColor.variationId,
          name: String(selectedColor.colorValue ?? ''),
          quantity: localQty,
          price: variantPriceUSD(pricedVariant, product, exchangeRateIQD),
          stock: selectedColor.stockQuantity,
        }]
      : [];

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

                {/* ---- Size: pick one ---- */}
                {hasSizeVars && product?.variations && (
                  <View>
                    <AppText style={[styles.varSectionLabel, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
                      {t('product.size', { defaultValue: 'Size' })}
                    </AppText>
                    <View style={[styles.chipWrap, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                      {product.variations.map((v) => {
                        const soldOut = v.stockQuantity === 0;
                        const sel = selectedSizeId === v.variationId;
                        return (
                          <TouchableOpacity
                            key={v.variationId}
                            disabled={soldOut}
                            activeOpacity={0.8}
                            onPress={() => setSelectedSizeId(sel ? null : v.variationId)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: sel, disabled: soldOut }}
                            style={[
                              styles.optionChip,
                              {
                                backgroundColor: sel ? theme.colors.primary + '12' : 'transparent',
                                borderColor: sel ? theme.colors.primary : theme.colors.border,
                                borderWidth: sel ? 2 : 1.5,
                                opacity: soldOut ? 0.45 : 1,
                              },
                            ]}
                          >
                            <AppText
                              style={[
                                styles.optionChipText,
                                {
                                  color: sel ? theme.colors.primary : theme.colors.text,
                                  textDecorationLine: soldOut ? 'line-through' : 'none',
                                },
                              ]}
                            >
                              {String(v.sizeValue ?? '')}
                            </AppText>
                            {hasOwnPrice(v) && (
                              <AppNumber
                                value={formatVariantPrice(v, product, currency, exchangeRateIQD, {}, isVip)}
                                style={[styles.optionChipPrice, { color: sel ? theme.colors.primary : theme.colors.textSecondary }]}
                              />
                            )}
                            {optionWasPrice(v) && (
                              <AppNumber
                                value={optionWasPrice(v) as string}
                                style={[styles.optionChipWas, { color: theme.colors.textSecondary }]}
                              />
                            )}
                            {soldOut && (
                              <AppText style={[styles.optionChipSoldOut, { color: '#F44336' }]}>
                                {t('product.outOfStock', { defaultValue: 'Out of Stock' })}
                              </AppText>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* ---- Colour: pick one ---- */}
                {hasColorVars && product?.colorVariations && (
                  <View>
                    <AppText style={[styles.varSectionLabel, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
                      {t('product.color', { defaultValue: 'Color' })}
                    </AppText>
                    <View style={[styles.chipWrap, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                      {product.colorVariations.map((v) => {
                        const soldOut = v.stockQuantity === 0;
                        const sel = selectedColorId === v.variationId;
                        return (
                          <TouchableOpacity
                            key={v.variationId}
                            disabled={soldOut}
                            activeOpacity={0.8}
                            onPress={() => setSelectedColorId(sel ? null : v.variationId)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: sel, disabled: soldOut }}
                            style={[
                              styles.optionChip,
                              {
                                backgroundColor: sel ? theme.colors.primary + '12' : 'transparent',
                                borderColor: sel ? theme.colors.primary : theme.colors.border,
                                borderWidth: sel ? 2 : 1.5,
                                opacity: soldOut ? 0.45 : 1,
                              },
                            ]}
                          >
                            <View style={[styles.optionChipLine, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                              {!!v.colorHex && (
                                <View
                                  style={[
                                    styles.colorDot,
                                    { backgroundColor: v.colorHex, borderColor: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.15)' },
                                  ]}
                                />
                              )}
                              <AppText
                                style={[
                                  styles.optionChipText,
                                  {
                                    color: sel ? theme.colors.primary : theme.colors.text,
                                    textDecorationLine: soldOut ? 'line-through' : 'none',
                                  },
                                ]}
                              >
                                {String(v.colorValue ?? '')}
                              </AppText>
                            </View>
                            {hasOwnPrice(v) && (
                              <AppNumber
                                value={formatVariantPrice(v, product, currency, exchangeRateIQD, {}, isVip)}
                                style={[styles.optionChipPrice, { color: sel ? theme.colors.primary : theme.colors.textSecondary }]}
                              />
                            )}
                            {optionWasPrice(v) && (
                              <AppNumber
                                value={optionWasPrice(v) as string}
                                style={[styles.optionChipWas, { color: theme.colors.textSecondary }]}
                              />
                            )}
                            {soldOut && (
                              <AppText style={[styles.optionChipSoldOut, { color: '#F44336' }]}>
                                {t('product.outOfStock', { defaultValue: 'Out of Stock' })}
                              </AppText>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* ---- Quantity: one stepper for the whole order ----
                     There used to be a +/- stepper on every variation row, so the sheet
                     asked "how many of each?" when the shopper only wanted to pick one.
                     Worse, a size AND a colour each became their own cart line, and a
                     shopper who picked "256GB" and "Black" was charged for two phones.
                     One choice per group, one quantity. */}
                <View style={{ marginTop: hasAnyVars ? SPACING.md : 0 }}>
                  {hasAnyVars && (
                    <AppText style={[styles.varSectionLabel, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
                      {t('startOrder.quantity', { defaultValue: 'Quantity' })}
                    </AppText>
                  )}
                  <View
                    style={[styles.quantityRow, { flexDirection: isRTL ? 'row-reverse' : 'row', opacity: qtyEnabled ? 1 : 0.4 }]}
                    pointerEvents={qtyEnabled ? 'auto' : 'none'}
                  >
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
                              if (num > maxSelectable) {
                                setLocalQty(maxSelectable);
                                setLocalQtyText(String(maxSelectable));
                              } else if (num >= 1) {
                                setLocalQty(num);
                              }
                            }
                          }}
                          onBlur={() => {
                            const num = parseInt(localQtyText, 10);
                            if (isNaN(num) || num < 1) {
                              setLocalQty(1);
                              setLocalQtyText('1');
                            } else if (num > maxSelectable) {
                              setLocalQty(maxSelectable);
                              setLocalQtyText(String(maxSelectable));
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
                          const newQ = Math.min(localQty + 1, maxSelectable);
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
                  {!!selectionHint && (
                    <AppText style={[styles.selectionHint, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
                      {selectionHint}
                    </AppText>
                  )}
                </View>
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
    chipWrap: {
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 4,
    },
    optionChip: {
      alignItems: 'center',
      borderRadius: 14,
      gap: 3,
      justifyContent: 'center',
      minHeight: 52,
      minWidth: 76,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    optionChipLine: {
      alignItems: 'center',
      gap: 8,
    },
    optionChipText: {
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: 0.1,
    },
    optionChipPrice: {
      fontSize: 12,
      fontWeight: '600',
    },
  optionChipWas: {
    fontSize: 11,
    marginTop: 1,
    textDecorationLine: 'line-through',
  },
    optionChipSoldOut: {
      fontSize: 10,
      fontWeight: '600',
    },
    selectionHint: {
      fontSize: 12,
      marginTop: 8,
      opacity: 0.8,
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
