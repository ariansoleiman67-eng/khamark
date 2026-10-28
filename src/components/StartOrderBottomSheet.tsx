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
  ActivityIndicator,
  Alert,
  TextInput,
  Platform,
  PanResponder,
  KeyboardAvoidingView,
  useWindowDimensions,
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
import { formatPrice, formatVariantPrice, variantCompareAtUSD, variantPriceUSD } from '../utils/currency';
import { formatLineTotal, formatUnitPrice } from '../utils/pricingUtils';
import { orderSheetLine } from '../utils/orderSheetPricing';
import { Product, Address, RootStackParamList } from '../types';
import { getDirection } from '../locales';
import addressService from '../services/addressService';
import AppText from './AppText';
import AppNumber from './AppNumber';
import { clampQty, parseQtyInput, commitQtyInput, qtyBounds, qtyMaxLength } from '../utils/quantityStepper';

/*
 * LAYOUT, and why it is shaped like this.
 *
 * The sheet is one column: drag handle + header, a ScrollView, and the footer —
 * all IN FLOW. The footer used to be position:absolute over the bottom of the
 * ScrollView, with a fixed 120pt spacer to make room. Two things grew it past
 * that spacer: a long dinar total ("IQD 1,480,000" at 28pt) wrapping onto extra
 * lines in a column ~146pt wide, and a long option list (23 sizes on the clear
 * cases) pushing the quantity stepper down under it. The stepper ended up
 * underneath the footer, which is what "the +/- buttons break" was.
 *
 * The ScrollView fills the space remaining above the footer and can shrink
 * without covering controls. The quantity stepper lives IN the footer,
 * beside the button, so it is on screen however many options the product has.
 * Totals stay on one line and shrink their font to fit.
 */

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

  // Read per render, not once at import: the window size the sheet was first
  // imported under is not necessarily the one it opens in.
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  // Narrow phones (320-359pt: small Androids, older iPhones). The footer holds a
  // ~142pt stepper beside the button; at 320pt that leaves the button ~126pt, so
  // everything that can give a little room, does.
  const compact = windowWidth < 360;
  // Tall enough for a long option list, never under the status bar.
  const sheetMaxHeight = Math.min(windowHeight * 0.92, windowHeight - insets.top - 8);

  // Animation. The sheet slides from a full window height down, which is always
  // past its own height, so it starts fully off screen whatever its content.
  const slideAnim = useRef(new Animated.Value(windowHeight)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);

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
          toValue: windowHeight,
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
  }), [slideAnim, onClose, windowHeight]);

  // State
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('cash_on_delivery');
  const [orderNotes, setOrderNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [showAddressSelector, setShowAddressSelector] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  // ===== LOCAL QUANTITY STATE (editable in sheet) =====
  const [localQty, setLocalQty] = useState(totalQuantity || 1);
  const [localQtyText, setLocalQtyText] = useState(String(totalQuantity || 1));
  // ONE choice per group, not a quantity per variation. The sheet is a chooser.
  const [selectedSizeId, setSelectedSizeId] = useState<string | null>(null);
  const [selectedColorId, setSelectedColorId] = useState<string | null>(null);
  const initializedProductRef = useRef<string | null>(null);

  const hasSizeVars = !!(product?.variations && product.variations.length > 0);
  const hasColorVars = !!(product?.colorVariations && product.colorVariations.length > 0);
  const hasAnyVars = hasSizeVars || hasColorVars;

  // Initialize local state from props when the sheet opens
  useEffect(() => {
    if (!visible) {
      initializedProductRef.current = null;
      return;
    }
    if (initializedProductRef.current === product?.id) return;
    if (visible && product) {
      initializedProductRef.current = product.id;
      // Re-open on whatever was already chosen, if anything.
      const preSize = variationSelections.find(v => v.quantity > 0);
      const preColor = colorSelections.find(v => v.quantity > 0);
      setSelectedSizeId(preSize?.variationId ?? null);
      setSelectedColorId(preColor?.variationId ?? null);
      const preQty = preSize?.quantity ?? preColor?.quantity ?? totalQuantity ?? 1;
      const initialQty = clampQty(preQty, Number.MAX_SAFE_INTEGER);
      setLocalQty(initialQty);
      setLocalQtyText(String(initialQty));
    }
  }, [visible, product, totalQuantity, variationSelections, colorSelections]);

  // A chip shows a price only when the variant carries one of its own — in either
  // currency. Comparing priceUSD to product.priceUSD missed a dinar-only variant
  // entirely, so the one variant whose price actually differs showed nothing.
  const hasOwnPrice = useCallback((v: { priceUSD?: number; priceIQD?: number } | null | undefined) => {
    if (!v || !product) return false;
    if (typeof v.priceIQD === 'number' && v.priceIQD > 0) return true;
    return typeof v.priceUSD === 'number' && v.priceUSD > 0 && v.priceUSD !== product.priceUSD;
  }, [product]);

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
  }, [selectedSize, selectedColor, hasOwnPrice]);

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
    if (qtyEnabled && localQty > maxSelectable) {
      const capped = clampQty(maxSelectable, maxSelectable);
      setLocalQty(capped);
      setLocalQtyText(String(capped));
    }
  }, [maxSelectable, localQty, qtyEnabled]);

  const { canDecrease, canIncrease } = qtyBounds(localQty, maxSelectable);

  const stepQty = useCallback((delta: number) => {
    const next = clampQty(localQty + delta, maxSelectable);
    setLocalQty(next);
    setLocalQtyText(String(next));
  }, [localQty, maxSelectable]);

  const onQtyTextChange = useCallback((text: string) => {
    const parsed = parseQtyInput(text, maxSelectable);
    setLocalQtyText(parsed.text);
    if (parsed.qty !== null) setLocalQty(parsed.qty);
  }, [maxSelectable]);

  const onQtyBlur = useCallback(() => {
    const settled = commitQtyInput(localQtyText, maxSelectable);
    setLocalQty(settled);
    setLocalQtyText(String(settled));
  }, [localQtyText, maxSelectable]);

  // What the product card says was chosen. Read from THIS sheet's choice — it used
  // to print the product page's selections as "256GB: 1", which went stale the
  // moment a different chip was tapped here.
  const selectionLabels = [selectedSize?.sizeValue, selectedColor?.colorValue]
    .filter(v => v !== undefined && v !== null && String(v).trim() !== '')
    .map(v => String(v));

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

  // The cart line this choice becomes, priced with the cart's OWN formatters
  // (formatUnitPrice / formatLineTotal), so the sheet prints exactly what the
  // cart and the product page print. It used to do its own dollar arithmetic and
  // convert back, which put today's rate on a price_usd stored at an older one:
  // the Redmi Note 17 Pro Max (665,000 IQD) showed as 707,250. See
  // src/utils/orderSheetPricing.ts.
  const linePreview = useMemo(
    () => orderSheetLine(product, {
      size: selectedSize,
      color: selectedColor,
      pricedVariant,
      exchangeRate: exchangeRateIQD,
    }),
    [product, selectedSize, selectedColor, pricedVariant, exchangeRateIQD],
  );

  // The card shows the chosen line's unit price once there is one, and the
  // product's own price until then. The tier is picked by the quantity chosen.
  const tierQty = localTotalQty > 0 ? localTotalQty : 1;
  const unitPriceLabel = product
    ? formatUnitPrice(linePreview ?? product, isVip, currency, exchangeRateIQD, {}, tierQty)
    : '';
  const totalPriceLabel = linePreview && localTotalQty > 0
    ? formatLineTotal(linePreview, isVip, currency, exchangeRateIQD, {}, localTotalQty)
    : formatPrice(0, currency, exchangeRateIQD);

  // Sorted on a COPY. Sorting product.priceTiers in place reordered the product
  // object every other screen is holding.
  const sortedTiers = useMemo(
    () => [...(product?.priceTiers ?? [])].sort((a, b) => a.minQty - b.minQty),
    [product?.priceTiers],
  );


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

  const styles = useMemo(() => createStyles(theme, isDark, compact), [theme, isDark, compact]);

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
          toValue: windowHeight,
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
  }, [visible, slideAnim, fadeAnim, windowHeight]);

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

  const rowDir = isRTL ? 'row-reverse' : 'row';
  const textStart = isRTL ? 'right' : 'left';
  const textEnd = isRTL ? 'left' : 'right';
  const sheetBg = isDark ? 'rgba(30,30,30,0.95)' : 'rgba(255,255,255,0.97)';
  const qtyLocked = isProcessing || !qtyEnabled;
  const totalLabel = isCartMode
    ? t('cart.total', { defaultValue: 'Total' })
    : t('startOrder.totalToPay', { defaultValue: 'Total to Pay' });

  // Sections are separated by a hairline and a label, not boxed in cards: the
  // grey card around every section, with bordered chips and bordered payment
  // cards inside it, was three layers of box for one choice.
  const hairline = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const renderDivider = () => <View style={[styles.divider, { backgroundColor: hairline }]} />;
  const renderSectionLabel = (text: string) => (
    <AppText style={[styles.sectionLabel, { color: theme.colors.text, textAlign: textStart }]} numberOfLines={1}>
      {text}
    </AppText>
  );

  // One renderer for both groups. A SIZE is a tile that can carry its own price
  // underneath; a COLOUR is a slim pill led by its swatch.
  const renderOptionChip = (
    v: any,
    label: string,
    selected: boolean,
    onPress: () => void,
    kind: 'size' | 'color',
    colorHex?: string,
  ) => {
    const soldOut = v.stockQuantity === 0;
    const was = optionWasPrice(v);
    const showPrice = hasOwnPrice(v);
    return (
      <TouchableOpacity
        key={v.variationId}
        disabled={soldOut || isProcessing}
        activeOpacity={0.8}
        onPress={onPress}
        hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected, disabled: soldOut }}
        style={[
          kind === 'size' ? styles.sizeTile : styles.colorPill,
          {
            flexDirection: kind === 'color' ? rowDir : 'column',
            backgroundColor: selected ? theme.colors.primary + '14' : 'transparent',
            borderColor: selected ? theme.colors.primary : hairline,
            opacity: soldOut ? 0.4 : 1,
          },
        ]}
      >
        {kind === 'color' && (
          <View
            style={[
              styles.colorDot,
              {
                backgroundColor: colorHex || theme.colors.border,
                borderColor: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.12)',
              },
            ]}
          />
        )}
        <AppText
          numberOfLines={2}
          style={[
            styles.optionChipText,
            {
              color: selected ? theme.colors.primary : theme.colors.text,
              textDecorationLine: soldOut ? 'line-through' : 'none',
            },
          ]}
        >
          {label}
        </AppText>
        {showPrice && (
          <AppNumber
            value={formatVariantPrice(v, product, currency, exchangeRateIQD, {}, isVip)}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            containerStyle={kind === 'size' ? styles.chipPriceBox : undefined}
            style={[styles.optionChipPrice, { color: selected ? theme.colors.primary : theme.colors.textSecondary }]}
          />
        )}
        {!!was && (
          <AppNumber
            value={was}
            numberOfLines={1}
            containerStyle={kind === 'size' ? styles.chipPriceBox : undefined}
            style={[styles.optionChipWas, { color: theme.colors.textSecondary }]}
          />
        )}
        {soldOut && kind === 'size' && (
          <AppText numberOfLines={1} style={[styles.optionChipSoldOut, { color: '#E5484D' }]}>
            {t('product.outOfStock', { defaultValue: 'Out of Stock' })}
          </AppText>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleDismiss}
      statusBarTranslucent
    >
      <View style={styles.root}>
        {/* Backdrop — a tap outside the sheet closes it. */}
        <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
          <TouchableOpacity
            style={styles.backdropTouchable}
            activeOpacity={1}
            onPress={handleDismiss}
            accessibilityRole="button"
            accessibilityLabel={t('common.close', { defaultValue: 'Close' })}
          />
        </Animated.View>

        {/* The keyboard lifts the WHOLE sheet, so the footer (stepper and button)
            stays above it. box-none so a tap above the sheet still reaches the
            backdrop. */}
        <KeyboardAvoidingView
          // Android too: with edge-to-edge on, the modal's window no longer
          // resizes for the keyboard, and the quantity field and Buy now sit at
          // the very bottom of the sheet. KeyboardAvoidingView measures its own
          // overlap with the keyboard, so where the window DOES resize it adds
          // nothing.
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardLayer}
          pointerEvents="box-none"
        >
          {/* Sized by its content, up to sheetMaxHeight. It used to be a fixed
              92% of the screen, which left a product with nothing to choose
              floating above a sea of empty sheet. */}
          <Animated.View
            style={[
              styles.sheet,
              { maxHeight: sheetMaxHeight, transform: [{ translateY: slideAnim }] },
            ]}
          >
            {/* Glass and tint are BACKGROUND layers. As wrappers they had to be
                flex:1 to pass a height down, which is what forced the fixed
                height in the first place. */}
            <BlurView intensity={isDark ? 40 : 80} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: sheetBg }]} />

            {/* Handle and header together: drag either to dismiss. The close
                button still takes its own tap — a touchable claims it first. */}
            <View {...panResponder.panHandlers}>
              <View style={styles.dragHandleContainer}>
                <View style={[styles.dragHandle, { backgroundColor: theme.colors.border }]} />
              </View>
              <View style={[styles.header, { flexDirection: rowDir }]}>
                <Text
                  allowFontScaling={false}
                  style={[styles.headerTitle, { color: theme.colors.text, textAlign: textStart }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {isCartMode
                    ? t('cart.addToCart', { defaultValue: 'Add to Cart' })
                    : t('startOrder.title', { defaultValue: 'Start Order' })}
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
            </View>

            {/* The ONLY part that shrinks. Long option lists scroll here; nothing
                below can be covered by the footer, because the footer is in flow. */}
            <ScrollView
              ref={scrollRef}
              testID="order-sheet-scroll"
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
            >
              {/* ==================== PRICE TAG ==================== */}
              {/* The one strong element: what you are buying and what it costs,
                  updating live as you choose. The spec line replaces the grey
                  badges, and reads like the label on the box. */}
              <View style={[styles.productHeader, { flexDirection: rowDir }]}>
                <Image
                  source={{ uri: product.imageUrls?.[0] }}
                  style={[styles.productImage, { borderColor: hairline }]}
                  contentFit="cover"
                  transition={200}
                />
                <View style={[styles.productInfo, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                  <AppText
                    style={[styles.productName, { color: theme.colors.text, textAlign: textStart }]}
                    numberOfLines={2}
                  >
                    {getProductName()}
                  </AppText>

                  {selectionLabels.length > 0 && (
                    <AppText
                      numberOfLines={1}
                      style={[styles.specLine, { color: theme.colors.textSecondary, textAlign: textStart }]}
                    >
                      {selectionLabels.join('  ·  ')}
                    </AppText>
                  )}

                  <View style={[styles.priceLine, { flexDirection: rowDir }]}>
                    <AppNumber
                      value={unitPriceLabel}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                      containerStyle={styles.unitPriceBox}
                      style={[styles.unitPrice, { color: theme.colors.text }]}
                    />
                    {/* Availability only — never a quantity. */}
                    <View style={[styles.stockTag, { flexDirection: rowDir }]}>
                      <View
                        style={[
                          styles.stockDot,
                          { backgroundColor: maxStock > 10 ? '#34A853' : maxStock > 0 ? '#F29900' : '#E5484D' },
                        ]}
                      />
                      <AppText style={[styles.stockText, { color: maxStock > 0 ? theme.colors.textSecondary : '#E5484D' }]}>
                        {maxStock > 0
                          ? t('product.inStock', { defaultValue: 'In Stock' })
                          : t('product.outOfStock', { defaultValue: 'Out of Stock' })}
                      </AppText>
                    </View>
                  </View>

                  {/* Bulk discounts */}
                  {maxStock > 0 && sortedTiers.length > 0 && (
                    <View style={[styles.tiersRow, { flexDirection: rowDir }]}>
                      {sortedTiers.map((tier, idx) => {
                        const isActive = localTotalQty >= tier.minQty && (!tier.maxQty || localTotalQty <= tier.maxQty);
                        return (
                          <View
                            key={`${tier.minQty}-${idx}`}
                            style={[
                              styles.tierChip,
                              {
                                flexDirection: rowDir,
                                backgroundColor: isActive ? theme.colors.primary + '14' : 'transparent',
                                borderColor: isActive ? theme.colors.primary : hairline,
                              },
                            ]}
                          >
                            <AppText style={[styles.tierQty, { color: isActive ? theme.colors.primary : theme.colors.textSecondary }]}>
                              {`${tier.minQty}+`}
                            </AppText>
                            <AppNumber
                              value={formatPrice(tier.priceUSD, currency, exchangeRateIQD)}
                              numberOfLines={1}
                              style={[styles.tierPrice, { color: isActive ? theme.colors.primary : theme.colors.text }]}
                            />
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              </View>

              {/* ==================== OPTIONS ==================== */}
              {/* No section card and no "Select Items" heading: the size and colour
                  labels already say what each row is. */}
              {hasSizeVars && product.variations && (
                <View style={styles.section}>
                  {renderDivider()}
                  {renderSectionLabel(t('product.size', { defaultValue: 'Size' }))}
                  <View style={[styles.chipWrap, { flexDirection: rowDir }]}>
                    {product.variations.map((v) => {
                      const sel = selectedSizeId === v.variationId;
                      return renderOptionChip(
                        v,
                        String(v.sizeValue ?? ''),
                        sel,
                        () => setSelectedSizeId(sel ? null : v.variationId),
                        'size',
                      );
                    })}
                  </View>
                </View>
              )}

              {hasColorVars && product.colorVariations && (
                <View style={styles.section}>
                  {!hasSizeVars && renderDivider()}
                  {renderSectionLabel(t('product.color', { defaultValue: 'Color' }))}
                  <View style={[styles.chipWrap, { flexDirection: rowDir }]}>
                    {product.colorVariations.map((v) => {
                      const sel = selectedColorId === v.variationId;
                      return renderOptionChip(
                        v,
                        String(v.colorValue ?? ''),
                        sel,
                        () => setSelectedColorId(sel ? null : v.variationId),
                        'color',
                        v.colorHex || undefined,
                      );
                    })}
                  </View>
                </View>
              )}

              {/* ==================== DELIVERY ADDRESS (order mode only) ==================== */}
              {!isCartMode && user && (
                <View style={styles.section}>
                  {renderDivider()}
                  {renderSectionLabel(t('startOrder.deliveryAddress', { defaultValue: 'Delivery Address' }))}

                  {addressesLoading ? (
                    <View style={styles.addressLoading}>
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                    </View>
                  ) : selectedAddress ? (
                    <View style={[styles.listGroup, { borderColor: hairline }]}>
                      <TouchableOpacity
                        style={[styles.listRow, { flexDirection: rowDir }]}
                        onPress={() => setShowAddressSelector(!showAddressSelector)}
                        disabled={addresses.length < 2}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: showAddressSelector }}
                      >
                        <Ionicons name="location-outline" size={20} color={theme.colors.primary} />
                        <View style={styles.listRowBody}>
                          <Text
                            allowFontScaling={false}
                            style={[styles.rowTitle, { color: theme.colors.text, textAlign: textStart }]}
                            numberOfLines={1}
                          >
                            {selectedAddress.title || selectedAddress.fullName}
                          </Text>
                          <Text
                            allowFontScaling={false}
                            style={[styles.rowDetail, { color: theme.colors.textSecondary, textAlign: textStart }]}
                            numberOfLines={2}
                          >
                            {selectedAddress.address}, {selectedAddress.city}
                          </Text>
                        </View>
                        {addresses.length > 1 && (
                          <Ionicons
                            name={showAddressSelector ? 'chevron-up' : 'chevron-down'}
                            size={18}
                            color={theme.colors.textSecondary}
                          />
                        )}
                      </TouchableOpacity>

                      {showAddressSelector && addresses.length > 1 &&
                        addresses.map((addr) => {
                          const isSelected = selectedAddress?.id === addr.id;
                          return (
                            <TouchableOpacity
                              key={addr.id}
                              style={[
                                styles.listRow,
                                styles.listRowDivided,
                                { flexDirection: rowDir, borderTopColor: hairline },
                                isSelected && { backgroundColor: theme.colors.primary + '0F' },
                              ]}
                              onPress={() => {
                                setSelectedAddress(addr);
                                setShowAddressSelector(false);
                              }}
                              accessibilityRole="button"
                              accessibilityState={{ selected: isSelected }}
                            >
                              <View style={styles.listRowBody}>
                                <Text
                                  allowFontScaling={false}
                                  style={[styles.rowTitle, { color: theme.colors.text, textAlign: textStart }]}
                                  numberOfLines={1}
                                >
                                  {addr.title || addr.fullName}
                                </Text>
                                <Text
                                  allowFontScaling={false}
                                  style={[styles.rowDetail, { color: theme.colors.textSecondary, textAlign: textStart }]}
                                  numberOfLines={1}
                                >
                                  {addr.address}
                                </Text>
                              </View>
                              {isSelected && <Ionicons name="checkmark" size={20} color={theme.colors.primary} />}
                            </TouchableOpacity>
                          );
                        })}
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.addAddressButton, { flexDirection: rowDir, borderColor: theme.colors.primary }]}
                      onPress={() => {
                        onClose();
                        navigation.navigate('AddEditAddress');
                      }}
                      accessibilityRole="button"
                    >
                      <Ionicons name="add" size={20} color={theme.colors.primary} />
                      <Text
                        allowFontScaling={false}
                        style={[styles.addAddressText, { color: theme.colors.primary }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      >
                        {t('startOrder.addAddress', { defaultValue: 'Add Delivery Address' })}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* ==================== PAYMENT METHODS (order mode only) ==================== */}
              {/* One grouped list instead of three tall cards. Only the chosen
                  method shows its one-line explanation. */}
              {!isCartMode && (
                <View style={styles.section}>
                  {renderDivider()}
                  {renderSectionLabel(t('startOrder.paymentMethod', { defaultValue: 'Payment Method' }))}
                  <View style={[styles.listGroup, { borderColor: hairline }]}>
                    {PAYMENT_METHODS.map((method, i) => {
                      const isSelected = selectedPaymentMethod === method.id;
                      return (
                        <TouchableOpacity
                          key={method.id}
                          style={[
                            styles.listRow,
                            i > 0 && styles.listRowDivided,
                            {
                              flexDirection: rowDir,
                              borderTopColor: hairline,
                              backgroundColor: isSelected ? theme.colors.primary + '0F' : 'transparent',
                              opacity: method.isAvailable ? 1 : 0.5,
                            },
                          ]}
                          onPress={() => method.isAvailable && setSelectedPaymentMethod(method.id)}
                          disabled={!method.isAvailable}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: isSelected, disabled: !method.isAvailable }}
                        >
                          <View style={[styles.payIcon, { backgroundColor: method.color + '1F' }]}>
                            {method.iconType === 'ionicons' ? (
                              <Ionicons name={method.icon as any} size={18} color={method.color} />
                            ) : (
                              <MaterialCommunityIcons name={method.icon as any} size={18} color={method.color} />
                            )}
                          </View>

                          <View style={[styles.listRowBody, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                            <View style={[styles.payNameRow, { flexDirection: rowDir }]}>
                              <Text
                                allowFontScaling={false}
                                style={[styles.rowTitle, { color: theme.colors.text, textAlign: textStart }]}
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                minimumFontScale={0.8}
                              >
                                {getLocalizedName(method)}
                              </Text>
                              {!method.isAvailable && (
                                <View style={[styles.comingSoonBadge, { backgroundColor: theme.colors.warning + '20' }]}>
                                  <Text
                                    allowFontScaling={false}
                                    style={[styles.comingSoonText, { color: theme.colors.warning }]}
                                    numberOfLines={1}
                                  >
                                    {t('common.comingSoon', { defaultValue: 'Soon' })}
                                  </Text>
                                </View>
                              )}
                            </View>
                            {isSelected && (
                              <Text
                                allowFontScaling={false}
                                style={[styles.rowDetail, { color: theme.colors.textSecondary, textAlign: textStart }]}
                                numberOfLines={2}
                              >
                                {getLocalizedDescription(method)}
                              </Text>
                            )}
                          </View>

                          <View
                            style={[
                              styles.radioOuter,
                              { borderColor: isSelected ? theme.colors.primary : theme.colors.border },
                            ]}
                          >
                            {isSelected && <View style={[styles.radioInner, { backgroundColor: theme.colors.primary }]} />}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* ==================== ORDER NOTES (order mode only) ==================== */}
              {/* Folded to one line. Most orders carry no note, and an empty 88pt
                  box took the room the options needed. */}
              {!isCartMode && (
                <View style={styles.section}>
                  {renderDivider()}
                  {notesOpen || orderNotes.length > 0 ? (
                    <>
                      {renderSectionLabel(
                        `${t('startOrder.notes', { defaultValue: 'Order Notes' })} ${t('common.optional', { defaultValue: '(Optional)' })}`,
                      )}
                      <TextInput
                        allowFontScaling={false}
                        autoFocus={notesOpen && orderNotes.length === 0}
                        style={[
                          styles.notesInput,
                          {
                            color: theme.colors.text,
                            borderColor: hairline,
                            textAlign: textStart,
                          },
                        ]}
                        placeholder={t('startOrder.notesPlaceholder', { defaultValue: 'Add special instructions...' })}
                        placeholderTextColor={theme.colors.placeholder}
                        value={orderNotes}
                        onChangeText={setOrderNotes}
                        // The notes are the last thing in the list. When the keyboard
                        // lifts the sheet, the list shrinks and they can end up below
                        // its fold — bring them back into view.
                        onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250)}
                        multiline
                        numberOfLines={3}
                        textAlignVertical="top"
                      />
                    </>
                  ) : (
                    <TouchableOpacity
                      style={[styles.noteToggle, { flexDirection: rowDir }]}
                      onPress={() => setNotesOpen(true)}
                      accessibilityRole="button"
                    >
                      <Ionicons name="create-outline" size={18} color={theme.colors.primary} />
                      <Text
                        allowFontScaling={false}
                        style={[styles.noteToggleText, { color: theme.colors.primary, textAlign: textStart }]}
                        numberOfLines={1}
                      >
                        {t('startOrder.notes', { defaultValue: 'Order Notes' })}
                      </Text>
                      <Text
                        allowFontScaling={false}
                        style={[styles.noteToggleHint, { color: theme.colors.textSecondary }]}
                        numberOfLines={1}
                      >
                        {t('common.optional', { defaultValue: '(Optional)' })}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </ScrollView>

            {/* ==================== FOOTER ==================== */}
            {/* In flow, never over the list. Two rows: what it costs, then how many
                and go. The stepper sits beside the button so it is always on
                screen, however many options the list above holds. */}
            <View
              style={[
                styles.footer,
                { borderTopColor: theme.colors.border + '30', paddingBottom: Math.max(insets.bottom, 12) + 8 },
              ]}
            >
              <View style={[styles.summaryRow, { flexDirection: rowDir }]}>
                <Text
                  allowFontScaling={false}
                  style={[styles.footerLabel, { color: theme.colors.textSecondary, textAlign: textStart }]}
                  numberOfLines={1}
                >
                  {totalLabel}
                </Text>
                {selectionHint ? (
                  <AppText
                    numberOfLines={2}
                    style={[styles.footerHint, { color: theme.colors.textSecondary, textAlign: textEnd }]}
                  >
                    {selectionHint}
                  </AppText>
                ) : (
                  // One line, always. A long dinar total shrinks its font instead
                  // of wrapping — the wrapping is what used to grow the footer.
                  <AppNumber
                    value={totalPriceLabel}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.5}
                    containerStyle={[styles.footerTotalBox, { alignItems: isRTL ? 'flex-start' : 'flex-end' }]}
                    style={[styles.footerTotal, { color: theme.colors.primary }]}
                  />
                )}
              </View>

              <View style={[styles.actionRow, { flexDirection: rowDir }]}>
                <View
                  style={[styles.quantitySelector, { flexDirection: rowDir, opacity: qtyEnabled ? 1 : 0.4 }]}
                  pointerEvents={qtyEnabled ? 'auto' : 'none'}
                >
                  <TouchableOpacity
                    testID="order-quantity-decrease"
                    style={[styles.qtyButton, !canDecrease && styles.qtyButtonDisabled]}
                    onPress={() => stepQty(-1)}
                    disabled={qtyLocked || !canDecrease}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('startOrder.decreaseQuantity', { defaultValue: 'Decrease quantity' })}
                    accessibilityState={{ disabled: qtyLocked || !canDecrease }}
                  >
                    <Ionicons name="remove" size={20} color={theme.colors.primary} />
                  </TouchableOpacity>
                  <TextInput
                    allowFontScaling={false}
                    testID="order-quantity-input"
                    value={localQtyText}
                    onChangeText={onQtyTextChange}
                    onBlur={onQtyBlur}
                    keyboardType="number-pad"
                    maxLength={qtyMaxLength(maxSelectable)}
                    editable={!qtyLocked}
                    selectTextOnFocus
                    accessibilityLabel={t('startOrder.quantity', { defaultValue: 'Quantity' })}
                    style={[styles.qtyInput, { color: theme.colors.text }]}
                  />
                  <TouchableOpacity
                    testID="order-quantity-increase"
                    style={[styles.qtyButton, !canIncrease && styles.qtyButtonDisabled]}
                    onPress={() => stepQty(1)}
                    disabled={qtyLocked || !canIncrease}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('startOrder.increaseQuantity', { defaultValue: 'Increase quantity' })}
                    accessibilityState={{ disabled: qtyLocked || !canIncrease }}
                  >
                    <Ionicons name="add" size={20} color={theme.colors.primary} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.confirmButton, { opacity: isProcessing || maxStock === 0 ? 0.7 : 1 }]}
                  onPress={handleConfirm}
                  // NOT disabled for an empty quantity, deliberately. It used to be,
                  // and the only cue was opacity 0.7 — so a shopper who had not picked
                  // a size tapped Buy and NOTHING happened, with nothing to read. The
                  // handler has the right words for this ("Please select quantity
                  // before ordering") and they were unreachable, because a disabled
                  // button never calls its handler. Now the tap lands and the app
                  // says why. Still disabled while a request is in flight and when
                  // the product genuinely has no stock — in both cases pressing again
                  // must not do anything.
                  disabled={isProcessing || maxStock === 0}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isProcessing || maxStock === 0, busy: isProcessing }}
                >
                  <LinearGradient
                    colors={['#A61920', '#831319']}
                    start={{ x: isRTL ? 1 : 0, y: 0 }}
                    end={{ x: isRTL ? 0 : 1, y: 0 }}
                    style={[styles.confirmGradient, { flexDirection: rowDir }]}
                  >
                    {isProcessing ? (
                      <>
                        <ActivityIndicator size="small" color="#FFFFFF" />
                        <Text allowFontScaling={false} style={styles.confirmText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>
                          {t('startOrder.processing', { defaultValue: 'Starting…' })}
                        </Text>
                      </>
                    ) : maxStock === 0 ? (
                      <>
                        {!compact && <Ionicons name="alert-circle" size={20} color="#FFFFFF" />}
                        <Text allowFontScaling={false} style={styles.confirmText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>
                          {t('product.outOfStock', { defaultValue: 'Out of Stock' })}
                        </Text>
                      </>
                    ) : (
                      <>
                        {/* At 320-359pt the words need the room more than the glyph does. */}
                        {!compact && <Ionicons name={isCartMode ? 'cart' : (user ? 'cart' : 'log-in')} size={20} color="#FFFFFF" />}
                        <Text allowFontScaling={false} style={styles.confirmText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>
                          {isCartMode
                            ? t('cart.addToCart', { defaultValue: 'Add to Cart' })
                            : user
                              ? t('startOrder.confirmOrder', { defaultValue: 'Confirm Order' })
                              : t('startOrder.loginToOrder', { defaultValue: 'Login to Order' })}
                        </Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const createStyles = (theme: any, isDark: boolean, compact: boolean) =>
  StyleSheet.create({
    // ========== SHEET ==========
    root: {
      flex: 1,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.6)',
    },
    backdropTouchable: {
      flex: 1,
    },
    keyboardLayer: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    sheet: {
      alignSelf: 'center',
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      elevation: 24,
      // Shrinks when the keyboard leaves less room than its content needs; the
      // ScrollView inside is what actually gives way.
      flexShrink: 1,
      maxWidth: 640,
      overflow: 'hidden',
      width: '100%',
    },

    // ========== DRAG HANDLE + HEADER ==========
    dragHandleContainer: {
      alignItems: 'center',
      paddingBottom: 10,
      paddingTop: 12,
    },
    dragHandle: {
      borderRadius: 999,
      height: 5,
      opacity: 0.8,
      width: 44,
    },
    header: {
      alignItems: 'center',
      gap: 12,
      paddingBottom: 6,
      paddingHorizontal: compact ? 16 : 20,
    },
    headerTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: '700',
      letterSpacing: 0.2,
      minWidth: 0,
    },
    closeButton: {
      alignItems: 'center',
      borderRadius: 20,
      height: 36,
      justifyContent: 'center',
      width: 36,
    },

    // ========== SCROLL ==========
    scrollView: {
      // Content-sized, but the first thing to give way: grow never, shrink first.
      flexGrow: 0,
      flexShrink: 1,
    },
    scrollContent: {
      gap: compact ? 14 : 18,
      paddingBottom: 18,
      paddingHorizontal: compact ? 16 : 20,
      paddingTop: 10,
    },

    // ========== PRICE TAG ==========
    productHeader: {
      alignItems: 'center',
      gap: 14,
    },
    productImage: {
      backgroundColor: theme.colors.background,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      height: compact ? 72 : 84,
      width: compact ? 72 : 84,
    },
    productInfo: {
      flex: 1,
      minWidth: 0,
    },
    productName: {
      fontSize: 16,
      fontWeight: '600',
      lineHeight: 21,
    },
    specLine: {
      fontSize: 13,
      fontWeight: '500',
      letterSpacing: 0.2,
      marginTop: 3,
    },
    priceLine: {
      alignItems: 'center',
      gap: 10,
      marginTop: 6,
      maxWidth: '100%',
    },
    unitPriceBox: {
      flexShrink: 1,
      minWidth: 0,
    },
    unitPrice: {
      fontSize: compact ? 20 : 22,
      fontWeight: '800',
      letterSpacing: -0.4,
    },
    stockTag: {
      alignItems: 'center',
      flexShrink: 0,
      gap: 5,
    },
    stockDot: {
      borderRadius: 3.5,
      height: 7,
      width: 7,
    },
    stockText: {
      fontSize: 12,
      fontWeight: '600',
    },
    tiersRow: {
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 8,
    },
    tierChip: {
      alignItems: 'center',
      borderRadius: 8,
      borderWidth: 1,
      gap: 4,
      maxWidth: '100%',
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    tierQty: {
      fontSize: 11,
      fontWeight: '600',
    },
    tierPrice: {
      fontSize: 11,
      fontWeight: '800',
    },

    // ========== SECTIONS ==========
    section: {
      gap: 10,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      marginBottom: 6,
    },
    sectionLabel: {
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: 0.1,
    },

    // ========== OPTIONS ==========
    chipWrap: {
      flexWrap: 'wrap',
      gap: 8,
    },
    sizeTile: {
      alignItems: 'center',
      borderRadius: 12,
      // Constant: a selected tile that thickened its border nudged the row.
      borderWidth: 1.5,
      gap: 2,
      justifyContent: 'center',
      maxWidth: '100%',
      minHeight: 48,
      minWidth: 84,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    colorPill: {
      alignItems: 'center',
      borderRadius: 999,
      borderWidth: 1.5,
      gap: 8,
      maxWidth: '100%',
      minHeight: 40,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    optionChipText: {
      flexShrink: 1,
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
    },
    chipPriceBox: {
      alignItems: 'center',
      alignSelf: 'stretch',
    },
    optionChipPrice: {
      fontSize: 12,
      fontWeight: '500',
    },
    optionChipWas: {
      fontSize: 11,
      textDecorationLine: 'line-through',
    },
    optionChipSoldOut: {
      fontSize: 10,
      fontWeight: '600',
    },
    colorDot: {
      borderRadius: 9,
      borderWidth: 1,
      height: 18,
      width: 18,
    },

    // ========== GROUPED LISTS (address, payment) ==========
    listGroup: {
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
    },
    listRow: {
      alignItems: 'center',
      gap: 12,
      minHeight: 52,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    listRowDivided: {
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    listRowBody: {
      flex: 1,
      minWidth: 0,
    },
    rowTitle: {
      flexShrink: 1,
      fontSize: 15,
      fontWeight: '600',
    },
    rowDetail: {
      fontSize: 13,
      lineHeight: 18,
      marginTop: 2,
    },
    payIcon: {
      alignItems: 'center',
      borderRadius: 10,
      height: 34,
      justifyContent: 'center',
      width: 34,
    },
    payNameRow: {
      alignItems: 'center',
      gap: 8,
      maxWidth: '100%',
    },
    comingSoonBadge: {
      borderRadius: 6,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    comingSoonText: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    radioOuter: {
      alignItems: 'center',
      borderRadius: 11,
      borderWidth: 2,
      height: 22,
      justifyContent: 'center',
      width: 22,
    },
    radioInner: {
      borderRadius: 6,
      height: 12,
      width: 12,
    },
    addressLoading: {
      alignItems: 'center',
      padding: 16,
    },
    addAddressButton: {
      alignItems: 'center',
      borderRadius: 14,
      borderStyle: 'dashed',
      borderWidth: 1.5,
      gap: 8,
      justifyContent: 'center',
      minHeight: 52,
      paddingHorizontal: 14,
    },
    addAddressText: {
      flexShrink: 1,
      fontSize: 15,
      fontWeight: '600',
    },

    // ========== NOTES ==========
    noteToggle: {
      alignItems: 'center',
      gap: 8,
      minHeight: 40,
    },
    noteToggleText: {
      flexShrink: 1,
      fontSize: 15,
      fontWeight: '600',
    },
    noteToggleHint: {
      fontSize: 13,
    },
    notesInput: {
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      fontSize: 15,
      lineHeight: 21,
      minHeight: 76,
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 12,
    },

    // ========== FOOTER ==========
    footer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: 10,
      paddingHorizontal: compact ? 16 : 20,
      paddingTop: 12,
    },
    summaryRow: {
      alignItems: 'center',
      gap: 12,
      minHeight: 32,
    },
    footerLabel: {
      flexShrink: 0,
      fontSize: 14,
      fontWeight: '500',
      maxWidth: '45%',
    },
    footerHint: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      minWidth: 0,
    },
    footerTotalBox: {
      flex: 1,
      minWidth: 0,
    },
    footerTotal: {
      fontSize: 24,
      fontWeight: '800',
      letterSpacing: -0.5,
    },
    actionRow: {
      alignItems: 'center',
      gap: compact ? 8 : 12,
    },

    // ========== QUANTITY STEPPER ==========
    // Fixed width and never shrinks: 4 + 40 + 52 + 40 + 4 + borders = ~142pt
    // (~126pt compact). The button beside it takes whatever is left.
    quantitySelector: {
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f2f2f2',
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
      borderRadius: 26,
      borderWidth: 1,
      flexShrink: 0,
      padding: 4,
    },
    qtyButton: {
      alignItems: 'center',
      backgroundColor: theme.colors.background,
      borderRadius: 20,
      elevation: 2,
      height: compact ? 36 : 40,
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      width: compact ? 36 : 40,
    },
    qtyButtonDisabled: {
      opacity: 0.35,
    },
    qtyInput: {
      fontSize: compact ? 18 : 20,
      fontWeight: '700',
      height: compact ? 36 : 40,
      includeFontPadding: false,
      padding: 0,
      textAlign: 'center',
      textAlignVertical: 'center',
      width: compact ? 46 : 52,
    },

    // ========== CONFIRM BUTTON ==========
    confirmButton: {
      borderRadius: 14,
      elevation: 4,
      flex: 1,
      minWidth: 0,
      overflow: 'hidden',
      shadowColor: '#A61920',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
    },
    confirmGradient: {
      alignItems: 'center',
      gap: 8,
      justifyContent: 'center',
      minHeight: compact ? 46 : 50,
      paddingHorizontal: compact ? 8 : 12,
      paddingVertical: 12,
    },
    // Up to two lines: the Kurdish labels ("چوونە ژوورەوە بۆ داواکردن") run
    // nearly twice the English, and one line cut them off with "…".
    confirmText: {
      color: '#FFFFFF',
      flexShrink: 1,
      fontSize: compact ? 15 : 16,
      lineHeight: compact ? 18 : 19,
      textAlign: 'center',
      fontWeight: '700',
      letterSpacing: 0.3,
    },
  });

export default StartOrderBottomSheet;
