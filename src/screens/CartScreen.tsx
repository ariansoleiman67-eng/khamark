import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  FlatList,
  Platform,
  KeyboardAvoidingView,
  AccessibilityInfo,
  Animated,
  TextInput,
  I18nManager,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '../components/ThemeProvider';
import { convertUSDToIQD, formatCurrencyIQD, formatPrice, isIQDPriced } from '../utils/currency';
import { formatLineTotal, vipDinarUnit } from '../utils/pricingUtils';
import { getProductImageUrl, getThumbnailUrl, logImageDebug } from '../utils/imageUtils';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import i18n from '../locales';
import { CartItem, AppliedDiscount, Discount } from '../types';
import { CartService } from '../services/cartService';
import { LocalCartService } from '../services/localCartService';
import discountService, { discountDisplayName, discountDisplayDescription, pickLocalizedText } from '../services/discountService';
import addressService from '../services/addressService';
import { RootStackParamList } from '../navigation/types';
import { Theme } from '../types';
import AppNumber from '../components/AppNumber';
import AppText from '../components/AppText';
import { CartIcon } from '../components/icons/CartIcon';
import { useAuthGate } from '../hooks/useAuthGate';

type CartScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Cart'>;

// Khamark Brand Palette
const FIGMA_ORANGE = '#A61920';
const FIGMA_DARK = '#191919';

// Summary bar height for padding calculation
const SUMMARY_BAR_BASE_HEIGHT = 200;

interface CartItemComponentProps {
  item: CartItem;
  index: number;
  onUpdateQuantity: (productId: string, quantity: number, selectedOptions?: { color?: string; size?: string }) => void;
  onRemove: (productId: string, selectedOptions?: { color?: string; size?: string }) => void;
  isUpdating: boolean;
  theme: Theme;
  t: (key: string, options?: any) => string;
}

// Neutral backdrop palette for accessory product thumbnails
const PRODUCT_BG_COLORS = [
  '#F7F7F8',
  '#F5F5F7',
  '#F7F7F8',
  '#F5F5F7',
];

/**
 * Cart Item Component - FIGMA DESIGN
 * - Colored thumbnail background
 * - Clean product info layout
 * - Price on the right side
 */
const CartItemComponent: React.FC<CartItemComponentProps> = ({
  item,
  index,
  onUpdateQuantity,
  onRemove,
  isUpdating,
  theme,
  t,
}) => {
  const { currency, exchangeRateIQD } = useCurrency();
  const { isVip } = useAuth();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const [localQuantity, setLocalQuantity] = useState(item.quantity);
  const [localQtyText, setLocalQtyText] = useState(String(item.quantity));
  const [isQuantityLoading, setIsQuantityLoading] = useState(false);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(20)).current;
  const typingTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  // Animate in
  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, translateY, index]);

  // Sync localQuantity when item.quantity changes from outside
  useEffect(() => {
    setLocalQuantity(item.quantity);
    setLocalQtyText(String(item.quantity));
  }, [item.quantity]);

  // Calculate available stock based on variations
  const availableStock = React.useMemo(() => {
    // Untrusted DB columns (stock_qty / variation stock) are typed `number` but can
    // arrive null/NaN. Coerce every return to a finite number so downstream comparisons,
    // Math.min and totals never produce null / 'null' text / NaN.
    const toFiniteStock = (n: number | null | undefined): number =>
      typeof n === 'number' && Number.isFinite(n) ? n : 0;

    // 1. Try to find by ID first
    if (item.variationId) {
      const sizeVar = item.product.variations?.find(v => v.variationId === item.variationId);
      if (sizeVar) return toFiniteStock(sizeVar.stockQuantity);

      const colorVar = item.product.colorVariations?.find(v => v.variationId === item.variationId);
      if (colorVar) return toFiniteStock(colorVar.stockQuantity);
    }

    // 2. Fallback to matching Selected Options
    if (item.selectedOptions) {
      const sizeVal = item.selectedOptions.size?.trim().toLowerCase();
      const colorVal = item.selectedOptions.color?.trim().toLowerCase();

      if (sizeVal && item.product.variations) {
        const v = item.product.variations.find(v =>
          v.variationId === item.variationId ||
          v.sizeValue?.trim().toLowerCase() === sizeVal ||
          `${v.sizeValue} ${v.sizeUnit || ''}`.trim().toLowerCase() === sizeVal
        );
        if (v) return toFiniteStock(v.stockQuantity);
      }

      if (colorVal && item.product.colorVariations) {
        const v = item.product.colorVariations.find(v =>
          v.variationId === item.variationId ||
          v.colorValue?.trim().toLowerCase() === colorVal
        );
        if (v) return toFiniteStock(v.stockQuantity);
      }
    }

    // 3. Fallback to main stock
    return toFiniteStock(item.product.stockQty);
  }, [item.product, item.variationId, item.selectedOptions]);

  const handleQuantityChange = useCallback(async (newQuantity: number) => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    if (newQuantity === item.quantity) {
      setLocalQuantity(item.quantity);
      setLocalQtyText(String(item.quantity));
      return;
    }
    
    setIsQuantityLoading(true);
    setLocalQuantity(newQuantity);
    setLocalQtyText(String(newQuantity));

    try {
      await onUpdateQuantity(item.productId, newQuantity, item.selectedOptions);
    } catch {
      setLocalQuantity(item.quantity);
      setLocalQtyText(String(item.quantity));
    } finally {
      setIsQuantityLoading(false);
    }
  }, [item.productId, item.quantity, item.selectedOptions, onUpdateQuantity]);

  const handleRemove = useCallback(() => {
    onRemove(item.productId, item.selectedOptions);
  }, [item.productId, item.selectedOptions, onRemove]);

  // Get tiered pricing
  const tieredPrice = LocalCartService.getTieredPrice(item.product, localQuantity, isVip);
  const hasDiscount = item.product.priceTiers && item.product.priceTiers.length > 0 && tieredPrice < item.product.priceUSD;

  // Get background color for this item — now using a very subtle tint
  const bgColor = PRODUCT_BG_COLORS[index % PRODUCT_BG_COLORS.length];

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY }] }}>
      <View style={[styles.cartItem, theme.dark && { backgroundColor: theme.colors.surface }]}>
        {/* ===== TOP ROW: Image + Product Details ===== */}
        <View style={[styles.cartItemTop, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {/* Product Image */}
          <View style={[styles.productThumbContainer, { backgroundColor: bgColor, marginRight: isRTL ? 0 : 14, marginLeft: isRTL ? 14 : 0 }]}>
            <Image
              source={{ uri: getThumbnailUrl(getProductImageUrl({
                imageUrls: item.product.imageUrls,
                category: item.product.category
              }), 160) }}
              style={styles.productImage}
              contentFit="cover"
              transition={0}
              cachePolicy="memory-disk"
              priority="normal"
              recyclingKey={`${item.productId}-${item.selectedOptions?.color || ''}-${item.selectedOptions?.size || ''}`}
              onError={() => {
                if (__DEV__) {
                  logImageDebug({
                    imageUrls: item.product.imageUrls,
                    category: item.product.category
                  }, `CartScreen - ${item.product.name}`);
                }
              }}
            />
            {!item.product.isActive && (
              <View style={styles.unavailableOverlay}>
                <Text allowFontScaling={false} style={styles.unavailableText}>{t('products.unavailable')}</Text>
              </View>
            )}
          </View>

          {/* Product Info */}
          <View style={styles.productInfo}>
            {/* Product Name - clear and prominent */}
            <AppText style={[styles.productName, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={2}>
              {i18n.language === 'ar' && item.product.nameAr ? item.product.nameAr : i18n.language === 'ku' && item.product.nameKu ? item.product.nameKu : item.product.name}
            </AppText>

            {/* Part Number */}
            {item.product.partNumber ? (
              <Text allowFontScaling={false} style={[styles.partNumberText, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                {item.product.partNumber}
              </Text>
            ) : null}

            {/* Selected options (color/size) */}
            {item.selectedOptions && (
              <View style={[styles.selectedOptionsRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                {item.selectedOptions.color && (
                  <AppText style={[styles.optionText, { backgroundColor: theme.colors.surface, color: theme.colors.textSecondary }]}>
                    {item.selectedOptions.color}
                  </AppText>
                )}
                {item.selectedOptions.size && (
                  <AppText style={[styles.optionText, { backgroundColor: theme.colors.surface, color: theme.colors.textSecondary }]}>
                    {item.selectedOptions.size}
                  </AppText>
                )}
              </View>
            )}

            {/* The low-stock warning printed the remaining quantity. Customers are
                not shown stock numbers; the + button is still capped at real stock,
                so nobody can order more than exists. */}

            {/* Wholesale badge */}
            {hasDiscount && (
              <View style={styles.wholesaleBadge}>
                <AppText style={styles.wholesaleText}>
                  {t('product.wholesalePricing', 'Bulk discount')}
                </AppText>
              </View>
            )}
          </View>
        </View>

        {/* ===== BOTTOM ROW: Qty Controls + Price + Delete ===== */}
        <View style={[styles.cartItemBottom, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {/* Quantity controls */}
          <View style={[styles.actionsColumn, {
            backgroundColor: theme.dark ? 'rgba(255,255,255,0.06)' : '#f2f2f2',
            borderColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.03)',
            borderRadius: 24,
            paddingHorizontal: 4,
            paddingVertical: 4,
            borderWidth: 1,
          }]}>
            <TouchableOpacity
              style={[styles.qtyBtn, { backgroundColor: theme.colors.background }, localQuantity <= 1 && styles.qtyBtnDisabled]}
              onPress={() => handleQuantityChange(Math.max(1, localQuantity - 1))}
              disabled={localQuantity <= 1 || isQuantityLoading || isUpdating}
            >
              <Ionicons name="remove" size={20} color={localQuantity <= 1 ? '#ccc' : theme.colors.primary} />
            </TouchableOpacity>

            <View style={{ position: 'relative', justifyContent: 'center', alignItems: 'center' }}>
              <TextInput allowFontScaling={false}
                value={localQtyText}
                onChangeText={(text) => {
                  const cleaned = text.replace(/[^0-9]/g, '');
                  setLocalQtyText(cleaned);
                  
                  if (typingTimeoutRef.current) {
                    clearTimeout(typingTimeoutRef.current);
                  }
                  
                  if (cleaned.length > 0) {
                    const num = parseInt(cleaned, 10);
                    if (num > availableStock) {
                      setLocalQuantity(availableStock);
                      setLocalQtyText(String(availableStock));
                      typingTimeoutRef.current = setTimeout(() => {
                        handleQuantityChange(availableStock);
                      }, 500);
                    } else if (num >= 1) {
                      setLocalQuantity(num);
                      typingTimeoutRef.current = setTimeout(() => {
                        handleQuantityChange(num);
                      }, 500);
                    }
                  }
                }}
                onBlur={() => {
                  if (typingTimeoutRef.current) {
                    clearTimeout(typingTimeoutRef.current);
                  }
                  const num = parseInt(localQtyText, 10);
                  if (isNaN(num) || num < 1) {
                    handleQuantityChange(1);
                  } else if (num > availableStock) {
                    handleQuantityChange(availableStock);
                  } else {
                    handleQuantityChange(num);
                  }
                }}
                keyboardType="number-pad"
                selectTextOnFocus
                style={[styles.qtyNumber, {
                  color: theme.dark ? '#F2EDE6' : FIGMA_DARK,
                  includeFontPadding: false,
                  padding: 0,
                  height: 40,
                  paddingVertical: 0,
                  textAlignVertical: 'center',
                  opacity: isQuantityLoading ? 0 : 1,
                }]}
              />
              {isQuantityLoading && (
                <ActivityIndicator 
                  size="small" 
                  color={theme.dark ? theme.colors.primary : FIGMA_ORANGE} 
                  style={{ position: 'absolute' }} 
                />
              )}
            </View>

            <TouchableOpacity
              style={[styles.qtyBtn, { backgroundColor: theme.colors.background }, localQuantity >= availableStock && styles.qtyBtnDisabled]}
              onPress={() => handleQuantityChange(Math.min(availableStock, localQuantity + 1))}
              disabled={localQuantity >= availableStock || isQuantityLoading || isUpdating}
            >
              <Ionicons name="add" size={20} color={localQuantity >= availableStock ? '#ccc' : theme.colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Price */}
          <View style={styles.priceColumn}>
            <AppNumber
              value={formatLineTotal(item.product, isVip, currency, exchangeRateIQD, {}, localQuantity)}
              style={[styles.itemPrice, { color: theme.dark ? theme.colors.primary : FIGMA_DARK }]}
            />
          </View>

          {/* Delete button */}
          <TouchableOpacity
            style={[styles.removeBtn, theme.dark && { backgroundColor: 'rgba(255, 107, 107, 0.15)' }]}
            onPress={handleRemove}
            disabled={isUpdating}
          >
            <Feather name="trash-2" size={16} color="#FF6B6B" />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
};

/**
 * CART SCREEN - FIGMA DESIGN
 * 
 * Features:
 * - Orange header with "My Basket" / "Shopping Cart" title
 * - White content area with rounded top corners overlapping header
 * - Go back button with pill background
 * - Product items with colored thumbnail backgrounds
 * - Sticky bottom bar with Total and Checkout button
 */
const CartScreen: React.FC = () => {
  const navigation = useNavigation<CartScreenNavigationProp>();
  const { requireAuth } = useAuthGate();
  const { cart, refreshCart, isLoading, updateQuantity, removeFromCart } = useCart();
  const { currency, exchangeRateIQD } = useCurrency();
  const { theme, isDark } = useTheme();
  const { user, isVip } = useAuth();
  const cartAccent = isDark ? theme.colors.primary : FIGMA_ORANGE;
  const { t } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const insets = useSafeAreaInsets();
  
  const [isUpdating, setIsUpdating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // In-flight guard so a fast double-tap on Checkout can't push the screen twice.
  const navigatingRef = React.useRef(false);
  const [appliedDiscount, setAppliedDiscount] = useState<AppliedDiscount | null>(null);
  const [discountLoading, setDiscountLoading] = useState(false);
  const [opportunities, setOpportunities] = useState<{ discount: Discount; missingQuantity?: number; missingAmount?: number }[]>([]);
  
  // Motion safety state
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  
  // Check Reduce Motion on mount
  useEffect(() => {
    const checkReduceMotion = async () => {
      try {
        const isEnabled = await AccessibilityInfo.isReduceMotionEnabled();
        setReduceMotionEnabled(isEnabled);
      } catch {
        // Default to false
      }
    };
    checkReduceMotion();
  }, []);

  // Auto-sync: Refresh product data when cart opens
  useEffect(() => {
    let cancelled = false;

    const syncCartData = async () => {
      if (!user?.uid || !cart?.items?.length) return;

      try {
        await CartService.syncCartWithLatestData(user.uid);
        // refreshCart is captured from a context callback keyed to the user who was
        // signed in when this effect ran. Without this check, a sync that resolves
        // after a sign-out or account switch calls the frozen copy and repopulates
        // the cart from the previous user's id.
        if (cancelled) return;
        await refreshCart();
      } catch {
        // Silent fail - cart will show cached data
      }
    };

    syncCartData();
    return () => { cancelled = true; };
  }, [user?.uid]);

  const handleUpdateQuantity = useCallback(async (
    productId: string, 
    quantity: number,
    selectedOptions?: { color?: string; size?: string }
  ) => {
    setIsUpdating(true);
    try {
      await updateQuantity(productId, quantity, selectedOptions);
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message || t('cart.updateError', { defaultValue: 'Failed to update quantity' }));
    } finally {
      setIsUpdating(false);
    }
  }, [updateQuantity, t]);

  const handleRemoveItem = useCallback(async (
    productId: string,
    selectedOptions?: { color?: string; size?: string }
  ) => {
    setIsUpdating(true);
    try {
      await removeFromCart(productId, selectedOptions);
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message || t('cart.removeError', { defaultValue: 'Failed to remove item' }));
    } finally {
      setIsUpdating(false);
    }
  }, [removeFromCart, t]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshCart();
    setRefreshing(false);
  }, [refreshCart]);

  // Reset the checkout navigation guard whenever the cart regains focus
  // (returning from Checkout or the login gate), so checkout can be tapped again.
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      navigatingRef.current = false;
    });
    return unsubscribe;
  }, [navigation]);

  // Use useAuthGate for checkout
  const handleCheckout = useCallback(() => {
    if (!cart?.items.length) return;
    if (navigatingRef.current) return;
    navigatingRef.current = true;

    requireAuth(() => {
      (navigation as any).navigate('Checkout');
    }, 'checkout');
  }, [cart, navigation, requireAuth]);

  // Fetch and apply best discount
  useEffect(() => {
    // Guard against out-of-order responses (cart changes on every qty edit) and
    // setState after unmount: cleanup flips `ignore` so only the latest run writes.
    let ignore = false;
    const loadDiscounts = async () => {
      if (!cart || cart.items.length === 0) {
        if (!ignore) setAppliedDiscount(null);
        return;
      }

      if (!ignore) setDiscountLoading(true);
      try {
        const best = await discountService.getBestDiscountForCart(cart, isVip);
        if (ignore) return;
        if (best) {
          // Apply to the winning store's lines only — the discount was picked from
          // those lines, so charging it against the whole multi-store cart would
          // take a tenant-wide offer off the other stores' items too.
          const applied = discountService.applyDiscountToItems(best.items, best.discount, isVip);
          setAppliedDiscount(applied);
        } else {
          setAppliedDiscount(null);
        }
      } catch {
        if (!ignore) setAppliedDiscount(null);
      } finally {
        if (!ignore) setDiscountLoading(false);
      }

      try {
        const potential = await discountService.getPotentialDiscounts(cart, isVip);
        if (!ignore) setOpportunities(potential);
      } catch {
        // Silent fail
      }
    };

    loadDiscounts();
    return () => { ignore = true; };
  }, [cart, isVip]);

  const [shippingRegion, setShippingRegion] = useState('Erbil');
  const [shippingCountry, setShippingCountry] = useState('');

  // Fetch user default address for shipping calculation once
  useEffect(() => {
    let isMounted = true;
    const fetchUserAddress = async () => {
      if (!user?.uid) return;
      try {
        const addresses = await addressService.getUserAddresses(user.uid);
        if (addresses && addresses.length > 0) {
          const defaultAddress = addresses.find(addr => addr.isDefault) || addresses[0];
          if (defaultAddress && isMounted) {
            setShippingRegion(defaultAddress.city || 'Erbil');
            setShippingCountry(defaultAddress.region || '');
          }
        }
      } catch (error) {
        // Fallback to default
      }
    };
    fetchUserAddress();
    return () => { isMounted = false; };
  }, [user?.uid]);

  // Calculate cart summary
  const [cartSummary, setCartSummary] = useState<{
    subtotal: number;
    shipping: number;
    total: number;
    itemCount: number;
    freeShippingThreshold: number;
    remainingForFreeShipping: number;
  } | null>(null);

  useEffect(() => {
    // Guard against out-of-order responses / unmounted setState (see loadDiscounts).
    let ignore = false;
    const loadCartSummary = async () => {
      if (!cart || !cart.items.length) {
        if (!ignore) setCartSummary(null);
        return;
      }

      try {
        const summary = await CartService.getCartSummaryAsync(cart, shippingRegion, shippingCountry, isVip);
        if (!ignore) setCartSummary(summary);
      } catch (error) {
        console.error('Failed to load cart summary', error);
      }
    };

    loadCartSummary();
    return () => { ignore = true; };
  }, [cart, shippingRegion, shippingCountry, isVip]);

  /**
   * Format a cart-wide USD total without letting the exchange rate touch the
   * dinar-priced lines inside it.
   *
   * The dinar part is summed in dinar and the rest is converted as it always
   * was, so a cart holding no dinar-priced product produces byte-identical
   * output to before — including the single 250-IQD snap over the whole sum
   * rather than a snap per line, which would have shifted existing totals.
   */
  const formatCartTotal = useCallback((usdTotal: number): string => {
    if (currency !== 'IQD' || !cart?.items?.length) {
      return formatPrice(usdTotal, currency, exchangeRateIQD);
    }
    let dinarIQD = 0;
    let dinarUSD = 0;
    for (const it of cart.items) {
      const unitUSD = LocalCartService.getTieredPrice(it.product, it.quantity, isVip);

      // A VIP price can be authored in dinar too. When it is the figure winning,
      // it is the exact dinar amount this line contributes — excluding it sent the
      // line through the rate and the 250 snap, so the total printed under a set
      // of exact dinar prices did not add up to them.
      const vipIQD = vipDinarUnit(it.product, isVip, unitUSD, exchangeRateIQD, 0);
      if (vipIQD != null) {
        dinarIQD += vipIQD * it.quantity;
        dinarUSD += unitUSD * it.quantity;
        continue;
      }

      if (!isIQDPriced(it.product)) continue;
      // A wholesale tier is a dollar figure, so that line converts normally.
      if (unitUSD !== it.product.priceUSD) continue;
      dinarIQD += Number(it.product.priceIQD) * it.quantity;
      dinarUSD += unitUSD * it.quantity;
    }
    if (dinarIQD === 0) return formatPrice(usdTotal, currency, exchangeRateIQD);
    // Shipping and any discount stay inside the converted remainder.
    return formatCurrencyIQD(dinarIQD + convertUSDToIQD(usdTotal - dinarUSD, exchangeRateIQD));
  }, [currency, exchangeRateIQD, cart, isVip]);

  // Render cart item
  const renderCartItem = useCallback(({ item, index }: { item: CartItem; index: number }) => (
    <CartItemComponent
      item={item}
      index={index}
      onUpdateQuantity={handleUpdateQuantity}
      onRemove={handleRemoveItem}
      isUpdating={isUpdating}
      theme={theme}
      t={t}
    />
  ), [handleUpdateQuantity, handleRemoveItem, isUpdating, theme, t]);

  // Render empty state
  const renderEmptyState = useCallback(() => (
    <View style={styles.emptyContainer}>
      <View style={[
        styles.emptyIconContainer,
        {
          backgroundColor: isDark ? 'rgba(166, 25, 32, 0.10)' : '#FDF2F3',
          borderColor: isDark ? 'rgba(166, 25, 32, 0.22)' : 'rgba(166, 25, 32, 0.14)',
        }
      ]}>
        <Ionicons name="bag-handle-outline" size={54} color={cartAccent} />
      </View>
      <Text allowFontScaling={false} style={[styles.emptyTitle, { color: theme.colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{t('cart.empty')}</Text>
      <AppText style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
        {t('cart.emptySubtitle')}
      </AppText>
      <TouchableOpacity 
        style={styles.shopButtonShadow}
        activeOpacity={0.88}
        onPress={() => navigation.navigate('Main', { screen: 'Categories' })}
      >
        <LinearGradient
          colors={['#A61920', '#831319']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.shopButton}
        >
          <AppText style={styles.shopButtonText}>{t('orders.startShopping')}</AppText>
        </LinearGradient>
      </TouchableOpacity>
    </View>
    // theme, isDark, and cartAccent are read in the body above, so they must be dependencies.
  ), [t, navigation, theme, isDark, cartAccent]);

  // Loading skeleton
  if (isLoading && !cart) {
    return (
      <View style={[styles.container, { backgroundColor: isDark ? theme.colors.background : '#F7F7F8' }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          {/* Header skeleton */}
          <View style={[
            styles.headerContainer,
            {
              backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
              borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#E7E7EA',
            }
          ]}>
            <View style={styles.headerSpacer} />
            <View style={[styles.skeletonTitle, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E7E7EA' }]} />
            <View style={styles.headerSpacer} />
          </View>
          
          {/* Content area skeleton */}
          <View style={[styles.contentContainer, { backgroundColor: isDark ? theme.colors.background : '#F7F7F8' }]}>
            <View style={{ padding: 16 }}>
              {[1, 2, 3].map((i) => (
                <View key={i} style={[
                  styles.cartItem,
                  {
                    marginBottom: 12,
                    backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E7E7EA',
                  }
                ]}>
                  <View style={[styles.productThumbContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F0F0F2' }]} />
                  <View style={styles.productInfo}>
                    <View style={[styles.skeletonText, { width: '70%', height: 16, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E7E7EA' }]} />
                    <View style={[styles.skeletonText, { width: '40%', height: 14, marginTop: 8, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E7E7EA' }]} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const hasItems = cart?.items && cart.items.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: isDark ? theme.colors.background : '#F7F7F8' }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Luxury Header */}
        <View style={[
          styles.headerContainer,
          {
            flexDirection: isRTL ? 'row-reverse' : 'row',
            backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
            borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#E7E7EA',
          }
        ]}>
          {navigation.canGoBack() ? (
            <TouchableOpacity
              style={[
                styles.headerIconButton,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F7F7F8',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E7E7EA',
                }
              ]}
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('common.back', 'Go back')}
            >
              <Ionicons
                name={isRTL ? 'chevron-forward' : 'chevron-back'}
                size={20}
                color={isDark ? '#FFFFFF' : '#191919'}
              />
            </TouchableOpacity>
          ) : (
            <View style={styles.headerSpacer} />
          )}

          {/* Title & Badge */}
          <View style={[styles.headerTitleWrap, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <AppText style={[styles.headerTitle, { color: theme.colors.text }]}>
              {t('cart.title')}
            </AppText>
            {hasItems && (
              <View style={styles.headerCountBadge}>
                <AppText style={styles.headerCountText}>
                  {cart.items.reduce((sum, item) => sum + item.quantity, 0)}
                </AppText>
              </View>
            )}
          </View>

          {/* Spacer for symmetry */}
          <View style={styles.headerSpacer} />
        </View>

        {/* Content area */}
        <View style={[styles.contentContainer, { backgroundColor: isDark ? theme.colors.background : '#F7F7F8' }]}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <FlatList
              data={hasItems ? cart.items : []}
              renderItem={renderCartItem}
              keyExtractor={(item) => `${item.productId}-${item.selectedOptions?.color || ''}-${item.selectedOptions?.size || ''}`}
              ListEmptyComponent={renderEmptyState}
              showsVerticalScrollIndicator={false}
              removeClippedSubviews={true}
              initialNumToRender={6}
              maxToRenderPerBatch={4}
              windowSize={5}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                flexGrow: 1,
                paddingHorizontal: 16,
                paddingTop: 16,
                paddingBottom: hasItems && cartSummary ? SUMMARY_BAR_BASE_HEIGHT + insets.bottom : 40,
              }}
              refreshControl={
                <RefreshControl 
                  refreshing={refreshing} 
                  onRefresh={handleRefresh}
                  colors={[cartAccent]}
                  tintColor={cartAccent}
                />
              }
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />

            {hasItems && cartSummary && (
              <View style={[
                styles.summaryContainer,
                {
                  paddingBottom: Math.max(insets.bottom, 16),
                  backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
                  borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : '#E7E7EA',
                }
              ]}>
                {/* Discount banner */}
                {appliedDiscount && (
                  <View style={[styles.discountBanner, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <Feather name="tag" size={16} color="#4CAF50" />
                    <View style={[styles.discountBannerBody, { marginLeft: isRTL ? 0 : 10, marginRight: isRTL ? 10 : 0 }]}>
                      <View style={[styles.discountBannerLine, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                        <Text allowFontScaling={false} style={styles.discountBannerText}>
                          {/* cart.youSave, not cart.saving: the latter resolves to
                              "جارٍ الحفظ" / "پاشەکەوتکردن" — saving a FILE, in
                              progress — so the Arabic banner read "discount name -
                              saving in progress $30.00". */}
                          {discountDisplayName(appliedDiscount, i18n.language)}{' - '}{t('cart.youSave', { defaultValue: 'You save' })}
                        </Text>
                        <AppNumber
                          value={formatPrice(appliedDiscount.savedAmount, currency, exchangeRateIQD)}
                          style={styles.discountBannerAmount}
                        />
                      </View>
                      {!!discountDisplayDescription(appliedDiscount, i18n.language) && (
                        <AppText style={[styles.discountBannerNote, { textAlign: isRTL ? 'right' : 'left' }]}>
                          {discountDisplayDescription(appliedDiscount, i18n.language)}
                        </AppText>
                      )}
                    </View>
                  </View>
                )}

                {/* Upsell hint: what the customer still needs for the next deal.
                    Already computed on every render — surfacing it is the point. */}
                {opportunities.length > 0 && (() => {
                  const top = opportunities[0];
                  const needsAmount = typeof top.missingAmount === 'number' && top.missingAmount > 0;
                  const needsQuantity = typeof top.missingQuantity === 'number' && top.missingQuantity > 0;
                  if (!needsAmount && !needsQuantity) return null;
                  const dealName =
                    pickLocalizedText(i18n.language, top.discount.name, top.discount.nameAr, top.discount.nameKu) ||
                    top.discount.name;
                  return (
                    <View style={[styles.opportunityBanner, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                      <Feather name="gift" size={16} color="#E65100" />
                      <View style={[
                        styles.opportunityBody,
                        { flexDirection: isRTL ? 'row-reverse' : 'row', marginLeft: isRTL ? 0 : 10, marginRight: isRTL ? 10 : 0 },
                      ]}>
                        <AppNumber
                          value={needsAmount
                            ? formatPrice(top.missingAmount as number, currency, exchangeRateIQD)
                            : String(top.missingQuantity)}
                          style={styles.opportunityAmount}
                        />
                        <AppText style={[styles.opportunityText, { textAlign: isRTL ? 'right' : 'left' }]}>
                          {needsAmount
                            ? t('cart.moreToUnlock', { name: dealName, defaultValue: 'more to unlock {{name}}' })
                            : t('cart.moreItemsToUnlock', { name: dealName, defaultValue: 'more items to unlock {{name}}' })}
                        </AppText>
                      </View>
                    </View>
                  );
                })()}


                {/* Total row */}
                <View style={[styles.totalRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <View>
                    <AppText style={[styles.totalLabel, { color: isDark ? theme.colors.textSecondary : '#888' }]}>{t('cart.total', 'Total')}</AppText>
                    <View style={styles.totalPriceRow}>
                      <AppNumber
                        value={formatCartTotal(
                          appliedDiscount
                            ? Math.max(0, cartSummary.total - appliedDiscount.savedAmount)
                            : cartSummary.total
                        )}
                        style={[styles.totalPrice, { color: theme.colors.text }]}
                      />
                    </View>
                  </View>

                  {/* Checkout button — Khamark Crimson gradient */}
                  <TouchableOpacity
                    onPress={handleCheckout}
                    activeOpacity={0.85}
                    style={styles.checkoutButtonShadow}
                  >
                    <LinearGradient
                      colors={['#A61920', '#831319']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.checkoutButton}
                    >
                      <Feather name="shopping-bag" size={16} color="#fff" style={{ marginRight: 8 }} />
                      <AppText style={styles.checkoutButtonText}>
                        {t('cart.checkout', 'Checkout')}
                      </AppText>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </KeyboardAvoidingView>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // ========== LUXURY HEADER ==========
  headerContainer: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerIconButton: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  headerSpacer: {
    height: 40,
    width: 40,
  },
  headerTitleWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  headerCountBadge: {
    backgroundColor: 'rgba(166, 25, 32, 0.08)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  headerCountText: {
    color: '#A61920',
    fontSize: 12,
    fontWeight: '700',
  },
  goBackPill: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 999,
    elevation: 2,
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  goBackText: {
    color: FIGMA_DARK,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.1,
    marginLeft: 4,
  },

  // ========== LUXURY CONTENT AREA ==========
  contentContainer: {
    flex: 1,
  },

  // ========== LUXURY CART ITEMS ==========
  cartItem: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E7EA',
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  cartItemTop: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  cartItemBottom: {
    alignItems: 'center',
    borderTopColor: 'rgba(0,0,0,0.06)',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
  },
  productThumbContainer: {
    alignItems: 'center',
    borderRadius: 14,
    height: 72,
    justifyContent: 'center',
    marginRight: 14,
    overflow: 'hidden',
    width: 72,
  },
  productImage: {
    height: '100%',
    width: '100%',
  },
  unavailableOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 16,
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  unavailableText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  productInfo: {
    flex: 1,
    gap: 3,
  },
  productName: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.1,
    marginBottom: 2,
  },
  partNumberText: {
    color: '#999',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.3,
    marginBottom: 2,
  },

  selectedOptionsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  optionText: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    color: '#888',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  lowStockWarning: {
    color: '#FF9800',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginTop: 4,
  },
  wholesaleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  wholesaleText: {
    color: '#4CAF50',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  priceColumn: {
    alignItems: 'center',
    flex: 1,
  },
  itemPrice: {
    color: FIGMA_DARK,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },

  // ========== LUXURY QUANTITY CONTROLS ==========
  actionsColumn: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  qtyBtn: {
    alignItems: 'center',
    borderRadius: 20,
    height: 38,
    justifyContent: 'center',
    width: 38,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  qtyBtnDisabled: {
    opacity: 0.4,
  },
  qtyNumber: {
    color: FIGMA_DARK,
    fontSize: 16,
    fontWeight: '700',
    minWidth: 40,
    textAlign: 'center',
  },
  removeBtn: {
    alignItems: 'center',
    backgroundColor: '#FFF0F0',
    borderRadius: 10,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  separator: {
    backgroundColor: '#F4F4F4',
    height: StyleSheet.hairlineWidth,
    marginVertical: 6,
  },

  // ========== LUXURY EMPTY STATE ==========
  emptyContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 36,
  },
  emptyIconContainer: {
    alignItems: 'center',
    borderRadius: 60,
    borderWidth: 1,
    height: 110,
    justifyContent: 'center',
    marginBottom: 24,
    width: 110,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 8,
    textAlign: 'center',
    width: '100%',
  },
  emptySubtitle: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 28,
    opacity: 0.7,
    textAlign: 'center',
    maxWidth: 280,
  },
  shopButtonShadow: {
    borderRadius: 14,
    shadowColor: FIGMA_ORANGE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  shopButton: {
    borderRadius: 14,
    paddingHorizontal: 36,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ========== LUXURY SUMMARY BAR ==========
  summaryContainer: {
    backgroundColor: '#FFFFFF',
    borderTopColor: '#E7E7EA',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    elevation: 8,
    paddingHorizontal: 20,
    paddingTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
  },
  discountBanner: {
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    flexDirection: 'row',
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  discountBannerBody: {
    flex: 1,
  },
  discountBannerLine: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  discountBannerText: {
    color: '#4CAF50',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  discountBannerAmount: {
    color: '#4CAF50',
    fontSize: 13,
    fontWeight: '700',
  },
  discountBannerNote: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
    opacity: 0.9,
  },
  opportunityBanner: {
    alignItems: 'center',
    backgroundColor: '#FBEFF0',
    borderRadius: 12,
    flexDirection: 'row',
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  opportunityBody: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  opportunityAmount: {
    color: '#A61920',
    fontSize: 13,
    fontWeight: '800',
  },
  opportunityText: {
    color: '#A61920',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  subtotalRow: {
    alignItems: 'center',
    borderBottomColor: '#E7E7EA',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 14,
  },
  itemCountBadge: {
    backgroundColor: 'rgba(166, 25, 32, 0.08)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  itemCountText: {
    color: '#A61920',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  subtotalPriceRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  subtotalLabel: {
    color: '#666870',
    fontSize: 13,
    fontWeight: '500',
  },
  subtotalPrice: {
    color: '#191919',
    fontSize: 14,
    fontWeight: '700',
  },
  totalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: {
    color: '#666870',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  totalPriceRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  totalPrice: {
    color: '#A61920',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  checkoutButton: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  checkoutButtonShadow: {
    borderRadius: 14,
    elevation: 6,
    shadowColor: FIGMA_ORANGE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
  },
  checkoutButtonDisabled: {
    opacity: 0.6,
  },
  checkoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ========== SKELETON ==========
  skeletonCircle: {
    borderRadius: 12,
    height: 24,
    width: 24,
  },
  skeletonTitle: {
    borderRadius: 8,
    height: 24,
    width: 120,
  },
  skeletonText: {
    backgroundColor: '#e0e0e0',
    borderRadius: 6,
  },
});

export default CartScreen;
