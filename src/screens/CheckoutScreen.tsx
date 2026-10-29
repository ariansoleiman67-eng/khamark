import { supabase } from '../services/supabase';
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  Animated as RNAnimated,
  ActivityIndicator,
  AccessibilityInfo,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  I18nManager,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
// iOS CRASH FIX: react-native-maps crashes on iOS with newArchEnabled (Fabric).
// Only import on Android. iOS uses coordinate text fallback.
let MapView: any = null;
let Marker: any = null;
if (Platform.OS === 'android') {
  try {
    const maps = require('react-native-maps');
    MapView = maps.default || maps.MapView;
    Marker = maps.Marker;
  } catch {}
}
import { useNavigation, useFocusEffect, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../components/ThemeProvider';
import { formatPrice, isIQDPriced } from '../utils/currency';
import { getEffectiveUnitPrice, vipDinarUnit } from '../utils/pricingUtils';
import { getProductImageUrl, logImageDebug } from '../utils/imageUtils';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { ShippingAddress, Theme, Address, AppliedDiscount, CartItem } from '../types';
import { CartService } from '../services/cartService';
import { LocalCartService } from '../services/localCartService';
import { OrderService } from '../services/OrderService';
import addressService from '../services/addressService';
import { RootStackParamList } from '../types';
import { getCountryByCode } from '../constants/countries';
import discountService, { discountDisplayName, discountDisplayDescription } from '../services/discountService';
import { promoService, computePromoDiscount, Promo } from '../services/promoService';
import { QiCardPaymentService } from '../services/qiCardPaymentService';
import { QI_CARD_ENABLED } from '../constants/config';

type CheckoutScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Checkout'>;
type CheckoutScreenRouteProp = RouteProp<RootStackParamList, 'Checkout'>;

// GOLDEN TEMPLATE: CTA height for padding calculation
const CTA_BAR_HEIGHT = 80;

// Khamark Brand Palette
const FIGMA_ORANGE = '#A61920';

const PRODUCT_BG_COLORS = [
  '#F7F7F8',
  '#F5F5F7',
  '#F7F7F8',
  '#F5F5F7',
];

interface PaymentMethodOption {
  id: string;
  name: string;
  icon: string;
  description: string;
  isAvailable: boolean;
  color: string; // ALIBABA STYLE: Each payment method has its own accent color
}

/**
 * CHECKOUT SCREEN - GOLDEN TEMPLATE
 * 
 * Architecture:
 * SafeAreaView (edges: ['top','left','right'])
 *  └── KeyboardAvoidingView
 *      ├── ScrollView (SINGLE vertical scroll owner)
 *      │    ├── Header
 *      │    ├── Shipping Address
 *      │    ├── Payment Method
 *      │    ├── Special Instructions
 *      │    ├── Order Summary
 *      │    └── paddingBottom for CTA bar
 *      │
 *      └── Sticky CTA Bar (OUTSIDE ScrollView)
 * 
 * Rules enforced:
 * - ONE vertical scroll owner
 * - NO fixed heights on inputs
 * - KeyboardAvoidingView for keyboard handling
 * - NO shadows on scrollable content
 * - Proper bottom insets
 */
const CheckoutScreen: React.FC = () => {
  const navigation = useNavigation<CheckoutScreenNavigationProp>();
  const route = useRoute<CheckoutScreenRouteProp>();
  const insets = useSafeAreaInsets();
  
  // Get route params (from StartOrderBottomSheet)
  const { preselectedPaymentMethod, preselectedAddressId, specialInstructions: preselectedNotes } = route.params || {};

  const { user, isVip } = useAuth();
  const { cart, clearCart, refreshCart } = useCart();
  const { currency, exchangeRateIQD } = useCurrency();
  const { theme, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';

  const PAYMENT_METHODS: PaymentMethodOption[] = [
    // Card payment is hidden unless QI_CARD_ENABLED — see the note on that flag.
    // Offering a method that cannot complete is a Guideline 2.1 rejection.
    ...(QI_CARD_ENABLED ? [{
      id: 'qi_card',
      name: t('payment.methods.qiCardNew', { defaultValue: 'New QiCard' }),
      icon: 'credit-card-plus-outline',
      description: t('checkout.qiCardNewDescription', { defaultValue: 'Pay securely with a new QiCard' }),
      isAvailable: true,
      color: '#1976D2', // QiCard blue
    }] as PaymentMethodOption[] : []),
    {
      id: 'cash_on_delivery',
      name: t('payment.methods.cod'),
      icon: 'cash',
      description: t('checkout.codDescription'),
      isAvailable: true,
      color: '#4CAF50', // Green for COD
    },
    {
      id: 'money_exchanger',
      name: t('payment.methods.moneyExchanger', { defaultValue: 'Money Exchanger' }),
      icon: 'swap-horizontal',
      description: t('checkout.moneyExchangerDescription', { defaultValue: 'Pay through money exchanger service' }),
      isAvailable: true,
      color: '#FF9800', // Orange for Money Exchanger
    },
  ];



  const styles = useMemo(() => createStyles(theme), [theme]);

  const [isProcessing, setIsProcessing] = useState(false);
  // Ref-based guard: blocks instantly on first tap (state updates are async and can miss rapid taps)
  const isSubmittingRef = useRef(false);
  // Monotonic id for address loads, so a superseded response cannot overwrite the
  // address the user has since chosen. See loadUserAddresses.
  const addressReqIdRef = useRef(0);
  const processingSpinAnim = useRef(new RNAnimated.Value(0)).current;
  // Use preselected payment method if provided (from StartOrderBottomSheet)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>(preselectedPaymentMethod || 'cash_on_delivery');
  // Use preselected notes if provided
  const [specialInstructions, setSpecialInstructions] = useState(preselectedNotes || '');
  
  // Address-related state
  const [userAddresses, setUserAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [addressesLoading, setAddressesLoading] = useState(true);
  // A failed/timed-out address fetch must not be rendered as "you have no addresses".
  const [addressesError, setAddressesError] = useState(false);
  const [useManualAddress, setUseManualAddress] = useState(false);

  // Saved Cards state
  const [savedCards, setSavedCards] = useState<{ id: string; payment_token: string; card_mask: string; payment_system: string }[]>([]);
  const [savedCardsLoading, setSavedCardsLoading] = useState(false);
  const [saveCardForFuture, setSaveCardForFuture] = useState(false);
  
  // Discount state
  const [appliedDiscount, setAppliedDiscount] = useState<AppliedDiscount | null>(null);
  const [discountLoading, setDiscountLoading] = useState(false);
  // Promo code (manual) state. When a code is applied, manualPromoRef guards the
  // auto-best-discount effect from clobbering it.
  const [promoInput, setPromoInput] = useState('');
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoApplying, setPromoApplying] = useState(false);
  const manualPromoRef = useRef(false);
  const appliedPromoRef = useRef<Promo | null>(null);
  // Which store's promo table the applied code came from — a code may only discount
  // that store's lines, never the whole basket.
  const appliedPromoTenantRef = useRef<string | null>(null);
  const [promoStoreScoped, setPromoStoreScoped] = useState(false);
  
  // Shipping office state (for out-of-country customers)
  const [useShippingOffice, setUseShippingOffice] = useState(false);
  const [shippingOfficeInfo, setShippingOfficeInfo] = useState<{
    recipientName: string;
    mobileNumber: string;
    officeName: string;
    officePhone: string;
  } | null>(null);
  const [shippingOfficeLoading, setShippingOfficeLoading] = useState(false);
  
  // Money Exchanger payment details state
  const [moneyExchangerInfo, setMoneyExchangerInfo] = useState<{
    officeName: string;
    officePhone: string;
    receiverName: string;
    receiverPhone: string;
    totalAmount: string;
  }>({
    officeName: '',
    officePhone: '',
    receiverName: '',
    receiverPhone: '',
    totalAmount: '',
  });
  const [exchangerSaved, setExchangerSaved] = useState(false);
  const [exchangerSaving, setExchangerSaving] = useState(false);
  
  // ALIBABA: Motion safety state
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  // Track if initial data load is done to prevent useFocusEffect race condition
  const initialLoadDoneRef = useRef(false);
  // Flipped inside the focus callback so the very first (mount) focus is
  // genuinely skipped — the mount effects already load the data.
  const hasFocusedOnceRef = useRef(false);
  
  // Add saved cards dynamically
  const allPaymentMethods: PaymentMethodOption[] = [
    // Untrusted DB rows (cast to any[] on load): a null/absent card_mask or
    // payment_token must never crash this render-path map.
    ...(QI_CARD_ENABLED ? (savedCards || []) : [])
      .filter(card => !!card?.payment_token)
      .map(card => ({
        id: `saved_card_${card.payment_token}`,
        name: t('checkout.savedCardEndingIn', {
          defaultValue: 'QiCard ending in {{last4}}',
          last4: (card.card_mask ?? '').slice(-4) || '••••',
        }),
        icon: 'credit-card',
        description: t('checkout.savedCard', { defaultValue: 'Saved Card' }),
        isAvailable: true,
        color: '#1976D2',
      })),
    ...PAYMENT_METHODS
  ];
  
  // =================================================================
  // ALIBABA: Check Reduce Motion on mount
  // =================================================================
  useEffect(() => {
    const checkMotion = async () => {
      try {
        const isEnabled = await AccessibilityInfo.isReduceMotionEnabled();
        setReduceMotionEnabled(isEnabled);
      } catch {
        // Default to false
      }
    };
    checkMotion();
  }, []);

  // ─── PERFORMANCE: Load all checkout data in parallel ───────────────
  const loadUserAddresses = useCallback(async () => {
    if (!user?.uid) {
      setAddressesLoading(false);
      return;
    }

    // This is re-invoked on every screen focus (the useFocusEffect below returns no
    // cleanup) and can refire faster than an 8s-timeout request resolves, so a plain
    // boolean is not enough — a monotonic request id is needed to drop superseded
    // responses. Without it a slow earlier fetch lands last and overwrites the
    // address the user just picked, silently changing where the order ships.
    const reqId = ++addressReqIdRef.current;
    const isLatest = () => reqId === addressReqIdRef.current;

    try {
      setAddressesLoading(true);
      setAddressesError(false);
      // Race against timeout to prevent infinite loading
      const addresses = await Promise.race([
        addressService.getUserAddresses(user.uid),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Address fetch timeout')), 8000)),
      ]);
      if (!isLatest()) return;
      setUserAddresses(addresses);

      // Check if a preselected address was passed from StartOrderBottomSheet
      if (preselectedAddressId) {
        const preselected = addresses.find(addr => addr.id === preselectedAddressId);
        if (preselected) {
          setSelectedAddress(preselected);
          setUseManualAddress(false);
          return;
        }
      }

      // Fallback: use default address or first available
      const defaultAddress = addresses.find(addr => addr.isDefault);
      if (defaultAddress) {
        setSelectedAddress(defaultAddress);
        setUseManualAddress(false);
      } else if (addresses.length > 0) {
        setSelectedAddress(addresses[0]);
        setUseManualAddress(false);
      } else {
        setSelectedAddress(null);
        setUseManualAddress(false);
      }
    } catch (error) {
      if (!isLatest()) return;
      console.error('Error loading addresses:', error);
      setAddressesError(true);
    } finally {
      if (isLatest()) setAddressesLoading(false);
    }
  }, [user?.uid, preselectedAddressId]);

  const loadSavedCards = useCallback(async () => {
    if (!user?.uid) {
      setSavedCardsLoading(false);
      return;
    }
    try {
      setSavedCardsLoading(true);
      const { data, error } = await supabase
        .from('saved_cards')
        .select('*')
        .eq('user_id', user.uid)
        .order('created_at', { ascending: false });
      
      if (!error && data) {
        setSavedCards(data);
      }
    } catch (e) {
      console.error('Error loading saved cards', e);
    } finally {
      setSavedCardsLoading(false);
    }
  }, [user?.uid]);

  // Load saved cards once on mount. Addresses are loaded by the user-scoped
  // effect below (single source of truth) to avoid duplicate concurrent fetches.
  useEffect(() => {
    if (!initialLoadDoneRef.current) {
      loadSavedCards();
      initialLoadDoneRef.current = true;
    }
  }, [loadSavedCards]);

  const loadShippingOffice = useCallback(async () => {
    if (!user?.uid) return;
    setShippingOfficeLoading(true);
    try {
      const { data: row } = await supabase
        .from('users')
        .select('shipping_info')
        .eq('id', user.uid)
        .maybeSingle();
      const data = row?.shipping_info;
      if (data && data.recipientName && data.officeName) {
        setShippingOfficeInfo({
          recipientName: data.recipientName || '',
          mobileNumber: data.mobileNumber || '',
          officeName: data.officeName || '',
          officePhone: data.officePhone || '',
        });
      }
    } catch {}
    setShippingOfficeLoading(false);
  }, [user?.uid]);

  const loadMoneyExchanger = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const { data: row } = await supabase
        .from('users')
        .select('money_exchanger_info')
        .eq('id', user.uid)
        .maybeSingle();
      const data = row?.money_exchanger_info;
      if (data && data.officeName && !data.deleted) {
        setMoneyExchangerInfo({
          officeName: data.officeName || '',
          officePhone: data.officePhone || '',
          receiverName: data.receiverName || '',
          receiverPhone: data.receiverPhone || '',
          totalAmount: data.totalAmount || '',
        });
        setExchangerSaved(true);
      }
    } catch {}
  }, [user?.uid]);

  // Load shipping office + money exchanger + addresses ALL in parallel
  useEffect(() => {
    if (!user?.uid) {
      setAddressesLoading(false);
      setShippingOfficeLoading(false);
      return;
    }

    const loadAllCheckoutData = async () => {
      // Run ALL three in parallel instead of sequentially
      await Promise.all([
        loadShippingOffice(),
        loadMoneyExchanger(),
        loadUserAddresses()
      ]);
    };


    loadAllCheckoutData().finally(() => {
      initialLoadDoneRef.current = true;
    });

    // Safety timeout: if loading gets stuck, force it to false after 10 seconds
    const safetyTimeout = setTimeout(() => {
      setAddressesLoading(false);
      setShippingOfficeLoading(false);
    }, 10000);

    return () => clearTimeout(safetyTimeout);
  }, [user?.uid]);

  // Reload ALL data when returning from edit screens (skip initial mount).
  // The first focus fires on mount when the mount effects are already loading,
  // so skip exactly once — regardless of load timing — to avoid a redundant fetch.
  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnceRef.current) {
        hasFocusedOnceRef.current = true;
        return;
      }
      loadUserAddresses();
      loadShippingOffice();
      loadMoneyExchanger();
    }, [loadUserAddresses, loadShippingOffice, loadMoneyExchanger])
  );

  // Cart summary with async shipping
  const [cartSummary, setCartSummary] = useState<{
    subtotal: number;
    shipping: number;
    tax: number;
    total: number;
    itemCount: number;
    freeShippingThreshold: number;
    remainingForFreeShipping: number;
  } | null>(null);

  useEffect(() => {
    const loadCartSummary = async () => {
      if (!cart || !cart.items.length) {
        setCartSummary(null);
        return;
      }
      
      const region = selectedAddress?.city || 'Erbil';
      const country = selectedAddress?.countryCode || '';
      
      try {
        const summary = await CartService.getCartSummaryAsync(cart, region, country, isVip);
        setCartSummary(summary);
      } catch (error) {
        console.error('Failed to load cart summary', error);
      }
    };

    loadCartSummary();
  }, [cart, selectedAddress?.city, selectedAddress?.region, selectedAddress?.id, isVip]);

  // Calculate VIP savings (difference between regular price and VIP price)
  const vipInfo = useMemo(() => {
    if (!isVip || !cart || !cart.items.length) return null;
    let regularSubtotal = 0;
    let vipSubtotal = 0;
    for (const item of cart.items) {
      const regularPrice = LocalCartService.getTieredPrice(item.product, item.quantity, false);
      const vipPrice = LocalCartService.getTieredPrice(item.product, item.quantity, true);
      regularSubtotal += regularPrice * item.quantity;
      vipSubtotal += vipPrice * item.quantity;
    }
    const savings = Math.max(regularSubtotal - vipSubtotal, 0);
    const discountPercent = regularSubtotal > 0 ? Math.round((savings / regularSubtotal) * 100) : 0;
    if (savings < 0.01) return null;
    return { regularSubtotal, vipSubtotal, savings, discountPercent };
  }, [isVip, cart]);

  // Cart lines grouped by store. Both discounts and promo codes are tenant-scoped,
  // so anything applied to the cart has to be measured against one store's lines.
  const itemsByTenant = useMemo(() => {
    const map = new Map<string, CartItem[]>();
    for (const item of cart?.items || []) {
      const tenantId = (item.product as any)?.tenantId;
      if (!tenantId) continue;
      if (!map.has(tenantId)) map.set(tenantId, []);
      map.get(tenantId)!.push(item);
    }
    return map;
  }, [cart]);

  // Subtotal a store-scoped code may discount.
  //
  // The whole-cart fallback applies ONLY to a code with no owning store (legacy
  // cart rows that carry no tenant). Once a code IS owned by a store, removing
  // that store's last line must yield 0, not the whole cart: itemsByTenant only
  // holds stores that currently have lines, so falling back here would silently
  // re-aim the code at the OTHER store's items — discounting them by more than it
  // ever discounted its own.
  const promoSubtotal = useCallback((tenantId: string | null): number => {
    if (!tenantId) return cartSummary?.subtotal || 0;
    const items = itemsByTenant.get(tenantId);
    return items ? discountService.subtotalForItems(items, isVip) : 0;
  }, [itemsByTenant, isVip, cartSummary?.subtotal]);

  // Fetch and apply the best AUTO discount (skipped while a manual promo is active).
  const runAutoDiscount = useCallback(async () => {
    if (!cart || cart.items.length === 0) {
      setAppliedDiscount(null);
      manualPromoRef.current = false;
      appliedPromoRef.current = null;
      appliedPromoTenantRef.current = null;
      setPromoStoreScoped(false);
      return;
    }
    // A manually-entered promo code wins over the auto-best-discount.
    if (manualPromoRef.current) return;

    setDiscountLoading(true);
    try {
      const best = await discountService.getBestDiscountForCart(cart, isVip);
      // Apply to the winning store's lines only — the winner was picked from those
      // lines, so a tenant-wide offer measured against the whole cart would come
      // off the other stores' items as well.
      setAppliedDiscount(best ? discountService.applyDiscountToItems(best.items, best.discount, isVip) : null);
    } catch (error) {
      setAppliedDiscount(null);
    } finally {
      setDiscountLoading(false);
    }
  }, [cart, isVip]);

  useEffect(() => { runAutoDiscount(); }, [runAutoDiscount]);

  // Keep a manually-applied promo in sync with cart changes: recompute its saved
  // amount off the current subtotal, and drop it (restoring auto-discounts) if it
  // no longer qualifies (e.g. cart fell below the code's minimum purchase).
  useEffect(() => {
    if (!manualPromoRef.current) return;
    const promo = appliedPromoRef.current;
    if (!promo) return;
    const saved = computePromoDiscount(promo, promoSubtotal(appliedPromoTenantRef.current));
    if (saved <= 0) {
      manualPromoRef.current = false;
      appliedPromoRef.current = null;
      appliedPromoTenantRef.current = null;
      setPromoStoreScoped(false);
      setAppliedDiscount(null);
      setPromoInput('');
      setPromoError(t('checkout.promoNoLongerEligible', { defaultValue: 'Promo code no longer applies to your cart' }));
      runAutoDiscount();
    } else {
      setAppliedDiscount((prev) => (prev ? { ...prev, savedAmount: saved } : prev));
      // Recompute the disclosure too: set once at apply time it kept claiming
      // "one store's items only" after the cart had dropped back to a single store.
      setPromoStoreScoped(itemsByTenant.size > 1 && !!appliedPromoTenantRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartSummary?.subtotal]);

  // Apply a manually-entered promo code (resolves via promoService, then flows
  // through the same appliedDiscount pipeline as the auto-discount).
  const applyPromo = useCallback(async () => {
    const code = promoInput.trim();
    if (!code) return;
    setPromoApplying(true);
    setPromoError(null);
    try {
      // Promo codes live in one store's promo table, so resolve the code against
      // each store in the cart rather than asking for it storelessly (which would
      // let another store's code be redeemed here).
      const tenantIds = Array.from(itemsByTenant.keys());
      let promo: Promo | null = null;
      let promoTenantId: string | null = null;
      if (tenantIds.length === 0) {
        promo = await promoService.findByCode(code);
      } else {
        for (const tenantId of tenantIds) {
          const found = await promoService.findByCode(code, tenantId);
          if (found) {
            promo = found;
            promoTenantId = tenantId;
            break;
          }
        }
      }
      if (!promo) {
        setPromoError(t('checkout.promoInvalid', { defaultValue: 'Invalid or expired code' }));
        return;
      }
      // Only the owning store's lines are discountable by this code.
      const saved = computePromoDiscount(promo, promoSubtotal(promoTenantId));
      if (saved <= 0) {
        setPromoError(t('checkout.promoNotEligible', { defaultValue: "This code doesn't apply to your cart" }));
        return;
      }
      manualPromoRef.current = true;
      appliedPromoRef.current = promo;
      appliedPromoTenantRef.current = promoTenantId;
      setPromoStoreScoped(tenantIds.length > 1 && !!promoTenantId);
      setAppliedDiscount({
        discountId: promo.id,
        discountName: `${t('checkout.promoCodeLabel', { defaultValue: 'Code' })} ${promo.code}`,
        discountType: promo.type,
        discountValue: promo.value,
        savedAmount: saved,
      });
    } finally {
      setPromoApplying(false);
    }
  }, [promoInput, itemsByTenant, promoSubtotal, t]);

  const removePromo = useCallback(() => {
    manualPromoRef.current = false;
    appliedPromoRef.current = null;
    appliedPromoTenantRef.current = null;
    setPromoStoreScoped(false);
    setAppliedDiscount(null);
    setPromoInput('');
    setPromoError(null);
    runAutoDiscount();
  }, [runAutoDiscount]);

  // Identify the promo row by the code actually in hand, not by the id's shape:
  // Supabase promo ids are UUIDs, so a 'promo-' prefix test only ever matched the
  // mock seed data and left real customers with no way to remove a code.
  const isPromoDiscount =
    !!appliedDiscount && !!appliedPromoRef.current && appliedDiscount.discountId === appliedPromoRef.current.id;

  const validateShippingAddress = useCallback((): boolean => {
    if (selectedAddress) {
      return true;
    }
    
    Alert.alert(
      t('checkout.addressRequiredTitle', { defaultValue: 'Address Required' }),
      t('checkout.selectAddressToContinue', { defaultValue: 'Please select a delivery address to continue with your order.' })
    );
    return false;
  }, [selectedAddress, t]);

  const validatePayment = useCallback((): boolean => {
    if (!selectedPaymentMethod) {
      Alert.alert(t('checkout.paymentMethod'), t('checkout.paymentRequired'));
      return false;
    }



    // Validate Money Exchanger fields
    if (selectedPaymentMethod === 'money_exchanger') {
      const { officeName, officePhone, receiverName, receiverPhone, totalAmount } = moneyExchangerInfo;
      
      if (!officeName.trim()) {
        Alert.alert(
          t('checkout.requiredField', { defaultValue: 'Required Field' }),
          t('checkout.exchangeOfficeNameRequired', { defaultValue: 'Please enter the exchange office name.' })
        );
        return false;
      }
      
      if (!officePhone.trim()) {
        Alert.alert(
          t('checkout.requiredField', { defaultValue: 'Required Field' }),
          t('checkout.exchangeOfficePhoneRequired', { defaultValue: 'Please enter the office phone number.' })
        );
        return false;
      }
      
      if (!receiverName.trim()) {
        Alert.alert(
          t('checkout.requiredField', { defaultValue: 'Required Field' }),
          t('checkout.receiverNameRequired', { defaultValue: 'Please enter the receiver name.' })
        );
        return false;
      }
      
      if (!receiverPhone.trim()) {
        Alert.alert(
          t('checkout.requiredField', { defaultValue: 'Required Field' }),
          t('checkout.receiverPhoneRequired', { defaultValue: 'Please enter the receiver phone number.' })
        );
        return false;
      }
      
      if (!totalAmount.trim()) {
        Alert.alert(
          t('checkout.requiredField', { defaultValue: 'Required Field' }),
          t('checkout.totalAmountRequired', { defaultValue: 'Please enter the total amount.' })
        );
        return false;
      }
      
      // Validate amount is a valid number
      const amount = parseFloat(totalAmount);
      if (isNaN(amount) || amount <= 0) {
        Alert.alert(
          t('checkout.invalidAmount', { defaultValue: 'Invalid Amount' }),
          t('checkout.enterValidAmount', { defaultValue: 'Please enter a valid amount greater than 0.' })
        );
        return false;
      }
    }

    return true;
  }, [selectedPaymentMethod, moneyExchangerInfo, t]);

  const handlePlaceOrder = useCallback(async () => {
    // INSTANT GUARD: Prevent duplicate orders from rapid taps
    // useRef is synchronous — blocks immediately unlike useState which is async
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    if (!user?.uid) {
      // This auth check runs BEFORE the main try/finally below, so a network
      // rejection here would otherwise leave isSubmittingRef stuck true forever
      // (permanently dead Place Order button). Guard it explicitly.
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          Alert.alert(
            t('errors.authenticationError', { defaultValue: 'Authentication Error' }),
            t('errors.loginAgainToOrder', { defaultValue: 'Please log out and log back in to place orders.' })
          );
          isSubmittingRef.current = false;
          return;
        }
      } catch (authError) {
        console.error('Auth check failed before placing order:', authError);
        Alert.alert(
          t('errors.authenticationError', { defaultValue: 'Authentication Error' }),
          t('errors.loginAgainToOrder', { defaultValue: 'Please log out and log back in to place orders.' })
        );
        isSubmittingRef.current = false;
        return;
      }
    }

    if (!cart || !cart.items.length) {
      Alert.alert(t('errors.cartEmpty'), t('cart.emptySubtitle'));
      isSubmittingRef.current = false;
      navigation.goBack();
      return;
    }

    const validation = await CartService.validateCart(cart);
    if (!validation.valid) {
      Alert.alert(
        t('cart.issues', { defaultValue: 'Cart Issues' }),
        validation.errors.join('\n'),
        [{ text: t('cart.update'), onPress: () => navigation.goBack() }]
      );
      isSubmittingRef.current = false;
      return;
    }

    // A server-side price move is not a cart error, so validation stays valid —
    // but the total on screen was computed from the OLD prices while the order
    // would be placed from the new ones. Never charge a number the shopper was
    // not shown: surface the change and make them confirm the fresh total.
    if (validation.pricesChanged && validation.updatedCart) {
      // validateCart already persisted the repriced cart, so a refresh pulls the
      // new prices into the summary the shopper is looking at.
      await refreshCart();
      Alert.alert(
        t('checkout.pricesUpdatedTitle', { defaultValue: 'Prices updated' }),
        t('checkout.pricesUpdatedMessage', {
          defaultValue: 'Some prices in your cart changed. Please review the new total before placing your order.',
        })
      );
      isSubmittingRef.current = false;
      setIsProcessing(false);
      return;
    }

    if (!validateShippingAddress() || !validatePayment()) {
      isSubmittingRef.current = false;
      return;
    }

    setIsProcessing(true);
    // Start spin animation for the overlay
    RNAnimated.loop(
      RNAnimated.timing(processingSpinAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      })
    ).start();

    try {
      // Use the updated cart from validation if available (contains latest prices and basePriceUSD)
      const effectiveCart = validation.updatedCart || cart;
      const finalRegion = selectedAddress?.city || 'Erbil';
      const finalCountry = selectedAddress?.countryCode || '';
      const finalSummary = await CartService.getCartSummaryAsync(effectiveCart, finalRegion, finalCountry, isVip);

      const orderItems = effectiveCart.items.map(cartItem => {
        let tieredPrice: number;
        
        // VARIATION: Apply % discount based on base product wholesale tiers
        if (cartItem.variationId) {
          // Use stored original base price if available (from validateCart), otherwise fallback to current price
          const basePriceForCalc = (cartItem.product as any).basePriceUSD || cartItem.product.priceUSD;
          
          // Create a temporary product object with the correct base price for calculation
          // This ensures getDiscountPercentage compares the correct Base Price ($10) vs Tier Price ($8)
          const productForCalc = { ...cartItem.product, priceUSD: basePriceForCalc };
          
          const discountPct = LocalCartService.getDiscountPercentage(productForCalc, cartItem.quantity, isVip);
          
          if (discountPct > 0) {
             // Apply the % discount to the VARIATION price ($25 * 0.8 = $20)
             tieredPrice = cartItem.product.priceUSD * (1 - discountPct);
             // Round to 2 decimal places
             tieredPrice = Math.round(tieredPrice * 100) / 100;
          } else {
             // No discount met, use full variation price
             tieredPrice = cartItem.product.priceUSD;
          }

          // A VIP price on this line — the option's own, or the product's when the
          // option does not price itself — wins if it is cheaper. Without this the
          // cart quoted a VIP one price (it prices through getEffectiveUnitPrice,
          // which honours the VIP figure) and the ORDER was written at another,
          // because this branch deliberately bypasses getTieredPrice to avoid
          // applying the product's absolute tiers to a variation price.
          //
          // Math.min, so it can only ever lower the price: a VIP figure that is
          // not actually cheaper is ignored, exactly as getEffectiveUnitPrice
          // ignores it.
          if (isVip) {
            const vipUnit = getEffectiveUnitPrice(cartItem.product, 1, true, exchangeRateIQD);
            if (vipUnit > 0 && vipUnit < tieredPrice) tieredPrice = vipUnit;
          }
        } else {
          // STANDARD: Use existing tiered pricing logic (absolute tiers)
          tieredPrice = LocalCartService.getTieredPrice(cartItem.product, cartItem.quantity, isVip);
        }
        
        // Build order item
        const orderItem: any = {
          productId: cartItem.productId,
          productName: cartItem.product.name,
          productNameAr: cartItem.product.nameAr || '',
          productNameKu: cartItem.product.nameKu || '',
          partNumber: cartItem.product.partNumber,
          quantity: cartItem.quantity,
          priceUSD: tieredPrice,
          originalPriceUSD: cartItem.product.priceUSD, // This shows the unit price before discount (e.g. $25)
          // WHICH OPTION was sold. The server's orders_stamp_cost reads this to
          // find that option's cost in parts.variation_costs; without it the
          // per-option cost lookup could never match and every variation line was
          // costed at the product's price instead.
          ...(cartItem.variationId ? { variationId: cartItem.variationId } : {}),
          ...((cartItem as any).colorVariationId ? { colorVariationId: (cartItem as any).colorVariationId } : {}),
          shippingCost: cartItem.product.shippingCost || 0,
          imageUrl: cartItem.product.imageUrls?.[0] || '',
          // Snapshot the dinar price only when a dinar figure is what is actually
          // being charged. A wholesale tier is a dollar amount and converts
          // normally — stamping a dinar price for it would bill the wrong number.
          //
          // A VIP price can itself be authored in dinar, and when it wins it is
          // the figure to stamp. vipDinarUnit reports that and returns null when
          // the VIP dinar price lost the "is it actually cheaper" test, so a
          // losing VIP price cannot leak onto the order line.
          ...(() => {
            const vipIQD = vipDinarUnit(cartItem.product, isVip, tieredPrice, exchangeRateIQD, 0);
            if (vipIQD != null) return { priceIQD: vipIQD };
            if (isIQDPriced(cartItem.product) && tieredPrice === cartItem.product.priceUSD) {
              return { priceIQD: Number(cartItem.product.priceIQD) };
            }
            return {};
          })(),
          tenantId: cartItem.product.tenantId || null, // carried so OrderService can stamp order.tenant_id
        };
        
        // ✅ GOLDEN FIX: Pass through selectedOptions (only if exists - Firestore rejects undefined)
        if (cartItem.selectedOptions) {
          orderItem.selectedOptions = cartItem.selectedOptions;
        }
        
        return orderItem;
      });

      if (!selectedAddress) {
        throw new Error('No shipping address selected');
      }
      
      const finalShippingAddress: ShippingAddress = {
        fullName: selectedAddress.fullName,
        phone: selectedAddress.phone,
        region: selectedAddress.region,
        city: selectedAddress.city || 'Erbil',
        address: selectedAddress.address,
        notes: selectedAddress.landmark || '',
        coordinates: selectedAddress.coordinates,
        countryCode: selectedAddress.countryCode,
        cityCode: selectedAddress.cityCode,
      };

      const isQiCardNew = selectedPaymentMethod === 'qi_card';
      const isSavedCard = selectedPaymentMethod.startsWith('saved_card_');
      const isQiCard = isQiCardNew || isSavedCard;
      
      const paymentMethodToSave = isQiCard ? 'qi_card' : selectedPaymentMethod;

      const orderResult = await OrderService.createOrder(
        orderItems,
        finalShippingAddress,
        paymentMethodToSave,
        specialInstructions.trim() || undefined,
        finalSummary.shipping,
        appliedDiscount,
        useShippingOffice && shippingOfficeInfo ? shippingOfficeInfo : null,
        selectedPaymentMethod === 'money_exchanger' ? moneyExchangerInfo : null,
        currency,
        exchangeRateIQD,
        !isQiCard // Only clear cart if NOT QiCard
      );

      if (!isQiCard) {
        await clearCart();
      }

      // ── QI CARD: Initiate payment and open WebView or Instant Pay ──
      if (isQiCard) {
        try {
          // Charge the dinar total the order was written with, when there is one.
          // Re-converting totalUSD here would re-apply the rate and the 250 snap
          // to prices the shop typed in dinar, so the customer could be charged a
          // different figure from the one they agreed to on the previous screen.
          const amountIQD = orderResult.totalIQD != null && orderResult.totalIQD > 0
            ? orderResult.totalIQD
            : QiCardPaymentService.convertToIQD(orderResult.totalUSD, exchangeRateIQD);
          
          let tokenOptions: any = undefined;
          
          if (isSavedCard) {
            const token = selectedPaymentMethod.replace('saved_card_', '');
            tokenOptions = { paymentToken: token };
          } else if (isQiCardNew && saveCardForFuture && user?.uid) {
            tokenOptions = { needPaymentToken: true, accountId: user.uid };
          }

          const qiResult = await QiCardPaymentService.initiatePayment(
            orderResult.orderId,
            amountIQD,
            undefined, // No customer info needed unless we have it
            tokenOptions,
            i18n.language, // open the QiCard page in the app's language
          );
          
          // Saved-card (tokenized) charge: QiCard may settle instantly with no
          // 3DS form. NEVER assume success — verify the real status before
          // clearing the cart. If it isn't confirmed, keep the cart and the
          // user on checkout so they can retry or switch methods.
          if (!qiResult.formUrl && isSavedCard) {
            let finalStatus = qiResult.status;
            try {
              if (finalStatus !== 'SUCCESS' && qiResult.paymentId) {
                // Short poll only — a tokenized (no-3DS) charge settles quickly,
                // so don't freeze checkout for ~1 minute waiting on the default budget.
                const polled = await QiCardPaymentService.pollForCompletion(qiResult.paymentId, 4, 1500);
                finalStatus = polled.status;
              }
            } catch {
              finalStatus = 'UNKNOWN';
            }

            if (finalStatus === 'SUCCESS') {
              await clearCart();
              navigation.replace('OrderConfirmation', {
                orderId: orderResult.orderId,
                orderNumber: orderResult.orderNumber,
              });
            } else if (finalStatus === 'FAILED' || finalStatus === 'AUTHENTICATION_FAILED') {
              // Definitively failed → no charge, safe to retry. Cart preserved.
              Alert.alert(
                t('qiCard.failedTitle', { defaultValue: 'Payment Failed' }),
                t('qiCard.savedCardFailed', { defaultValue: 'We could not confirm the payment with your saved card. Your cart is saved — please try again or choose another payment method.' }),
                [{ text: t('common.ok'), onPress: () => {} }]
              );
            } else {
              // Outcome uncertain (still processing / could not confirm). Do NOT
              // invite an immediate retry — that risks a double charge. Cart is
              // preserved; point the user to their order status instead.
              Alert.alert(
                t('qiCard.timeoutTitle', { defaultValue: "Couldn't Confirm Payment" }),
                t('qiCard.savedCardPending', { defaultValue: 'Your payment is being processed. Please check your order status shortly, and do not pay again.' }),
                [{ text: t('common.ok'), onPress: () => {} }]
              );
            }
          } else {
            navigation.replace('QiCardPayment', {
              formUrl: qiResult.formUrl,
              paymentId: qiResult.paymentId,
              orderId: orderResult.orderId,
              orderNumber: orderResult.orderNumber,
            });
          }
        } catch (qiError: any) {
          console.error('QiCard payment initiation failed:', qiError);
          Alert.alert(
            t('qiCard.failedTitle', { defaultValue: 'Payment Failed' }),
            qiError.message || t('qiCard.failedMessage', { defaultValue: 'Failed to start payment. You can try again or choose a different payment method.' }),
            [
              {
                text: t('common.ok'),
                onPress: () => {}, // Stay on Checkout Screen, cart is preserved
              },
            ]
          );
          return; // Stop execution, don't navigate
        }
        return; // Don't navigate to order confirmation yet, WebView will handle it
      }

      // ── Standard flow: COD / Money Exchanger ──
      try {
        navigation.navigate('OrderConfirmation', {
          orderId: orderResult.orderId,
          orderNumber: orderResult.orderNumber
        });
      } catch (navError) {
        Alert.alert(
          t('checkout.orderPlaced'),
          t('checkout.orderSuccess', { orderNumber: orderResult.orderNumber, defaultValue: `Your order ${orderResult.orderNumber} has been placed successfully.` }),
          [{ text: t('common.ok'), onPress: () => navigation.navigate('Main', { screen: 'Home' }) }]
        );
      }

    } catch (error: any) {
      Alert.alert(
        t('checkout.orderFailed'),
        error.message || t('checkout.orderFailedMessage', { defaultValue: 'Failed to place order. Please try again.' }),
        [{ text: t('common.ok') }]
      );
    } finally {
      setIsProcessing(false);
      isSubmittingRef.current = false;
      processingSpinAnim.stopAnimation();
      processingSpinAnim.setValue(0);
    }
  }, [
    user?.uid,
    cart,
    selectedAddress,
    selectedPaymentMethod,
    specialInstructions,
    cartSummary,
    validateShippingAddress,
    validatePayment,
    navigation,
    clearCart,
    appliedDiscount,
    useShippingOffice,
    shippingOfficeInfo,
    t,
    moneyExchangerInfo,
    currency,
    exchangeRateIQD,
    saveCardForFuture,
    isVip,
    i18n.language,
  ]);

  // Empty cart state
  if (!cart || !cart.items || cart.items.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? theme.colors.background : '#FFFbf0' }]} edges={['top', 'left', 'right']}>
        <View style={[styles.header, { backgroundColor: isDark ? theme.colors.background : '#FFFbf0', borderBottomColor: theme.colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Feather name={isRTL ? 'arrow-right' : 'arrow-left'} size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text allowFontScaling={false} style={[styles.title, { color: theme.colors.text }]}>{t('checkout.title')}</Text>
          <View style={styles.headerSpacer} />
        </View>
        
        <View style={styles.emptyContainer}>
          <Feather name="shopping-cart" size={64} color={theme.colors.textSecondary} />
          <Text allowFontScaling={false} style={[styles.emptyTitle, { color: theme.colors.text }]}>{t('checkout.emptyCart')}</Text>
          <Text allowFontScaling={false} style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
            {t('checkout.addItems')}
          </Text>
          <TouchableOpacity
            style={[styles.shopButton, { backgroundColor: FIGMA_ORANGE }]}
            onPress={() => navigation.navigate('Main', { screen: 'Categories' })}
          >
            <Text allowFontScaling={false} style={styles.shopButtonText}>{t('cart.continueShopping')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    // GOLDEN TEMPLATE: SafeAreaView with edges (NO bottom)
    <SafeAreaView 
      style={[styles.container, { backgroundColor: isDark ? theme.colors.background : '#FFFbf0' }]}
      edges={['top', 'left', 'right']}
    >
      {/* GOLDEN TEMPLATE: KeyboardAvoidingView */}
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* GOLDEN TEMPLATE: ScrollView as SINGLE vertical scroll owner */}
        {/* ALIBABA: keyboard dismiss + handled taps */}
        <ScrollView 
          style={styles.scrollView} 
          showsVerticalScrollIndicator={false} 
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            // GOLDEN TEMPLATE: Padding for CTA bar
            paddingBottom: CTA_BAR_HEIGHT + insets.bottom,
          }}
        >
          {/* Header - Inside ScrollView */}
          <View style={[styles.header, { backgroundColor: isDark ? theme.colors.background : '#FFFbf0', borderBottomColor: theme.colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.7}>
              <Feather name={isRTL ? 'arrow-right' : 'arrow-left'} size={24} color={theme.colors.text} />
            </TouchableOpacity>
            <Text allowFontScaling={false} style={[styles.title, { color: theme.colors.text }]}>{t('checkout.title')}</Text>
            <View style={styles.headerSpacer} />
          </View>

          {/* Shipping Address Section */}
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.sectionHeader}>
              <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('checkout.shippingAddress')}</Text>
              {userAddresses.length > 0 && (
                <TouchableOpacity
                  style={[styles.manageAddressButton, { backgroundColor: theme.colors.primary + '1A' }]}
                  onPress={() => navigation.navigate('MyAddress')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="settings-outline" size={16} color={theme.colors.primary} />
                  <Text allowFontScaling={false} style={[styles.manageAddressText, { color: theme.colors.primary }]}>{t('addresses.manage')}</Text>
                </TouchableOpacity>
              )}
            </View>
            
            {/* ALIBABA: Static skeleton instead of spinner */}
            {addressesLoading ? (
              <View style={styles.loadingContainer}>
                {/* Address card skeleton */}
                <View style={[styles.addressCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                  <View style={styles.addressInfo}>
                    <View style={{ width: 60, height: 14, backgroundColor: theme.colors.text, opacity: isDark ? 0.2 : 0.12, borderRadius: 4, marginBottom: 8 }} />
                    <View style={{ width: '70%', height: 16, backgroundColor: theme.colors.text, opacity: isDark ? 0.2 : 0.12, borderRadius: 4, marginBottom: 6 }} />
                    <View style={{ width: '90%', height: 14, backgroundColor: theme.colors.text, opacity: isDark ? 0.2 : 0.12, borderRadius: 4, marginBottom: 4 }} />
                    <View style={{ width: '50%', height: 14, backgroundColor: theme.colors.text, opacity: isDark ? 0.2 : 0.12, borderRadius: 4 }} />
                  </View>
                  <View style={[styles.radioButton, { borderColor: theme.colors.border }]} />
                </View>
              </View>
            ) : (
              <>
                {/* Saved Addresses */}
                {userAddresses.length > 0 && (
                  <View>
                    {userAddresses.map((address) => (
                      <TouchableOpacity
                        key={address.id}
                        style={[
                          styles.addressCard,
                          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                          selectedAddress?.id === address.id && !useManualAddress && [styles.addressCardSelected, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '0D' }]
                        ]}
                        activeOpacity={0.8}
                        onPress={() => {
                          setSelectedAddress(address);
                          setUseManualAddress(false);
                        }}
                      >
                        <View style={styles.addressInfo}>
                          <View style={styles.addressHeader}>
                            <Text allowFontScaling={false} style={[styles.addressTitle, { color: theme.colors.primary }]}>{address.title}</Text>
                            {address.isDefault && (
                              <View style={[styles.defaultBadge, { backgroundColor: theme.colors.primary }]}>
                                <Text allowFontScaling={false} style={styles.defaultBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{t('checkout.setAsDefault')}</Text>
                              </View>
                            )}
                          </View>
                          <Text allowFontScaling={false} style={[styles.addressName, { color: theme.colors.text }]}>{address.fullName}</Text>
                          <Text allowFontScaling={false} style={[styles.addressDetails, { color: theme.colors.textSecondary }]}>
                            {address.address}
                          </Text>
                          <Text allowFontScaling={false} style={[styles.addressDetails, { color: theme.colors.textSecondary }]}>
                            {address.city}, {address.region}
                          </Text>
                          <Text allowFontScaling={false} style={[styles.addressPhone, { color: theme.colors.textSecondary }]}>
                            {(() => {
                              const phoneCode = address.countryCode && getCountryByCode(address.countryCode)?.phoneCode;
                              const phone = address.phone || '';
                              if (phoneCode && !phone.startsWith(phoneCode)) {
                                return `${phoneCode} ${phone}`;
                              }
                              return phone;
                            })()}
                          </Text>
                          
                          {/* Location Map - Only render for selected address to avoid performance issues */}
                          {address.coordinates && Number.isFinite(address.coordinates.latitude) && Number.isFinite(address.coordinates.longitude) && selectedAddress?.id === address.id && !useManualAddress ? (
                            <View style={[styles.mapContainer, { backgroundColor: theme.colors.border }]}>
                              {(() => {
                                // On iOS, MapView is null (not loaded) to prevent native crash
                                if (!MapView || !Marker) {
                                  return (
                                    <View style={[styles.mapErrorContainer, { backgroundColor: theme.colors.surface }]}>
                                      <Ionicons name="location" size={20} color={theme.colors.textSecondary} />
                                      <Text allowFontScaling={false} style={[styles.mapErrorText, { color: theme.colors.textSecondary }]}>
                                        {address.coordinates.latitude.toFixed(4)}, {address.coordinates.longitude.toFixed(4)}
                                      </Text>
                                    </View>
                                  );
                                }
                                try {
                                  return (
                                    <MapView
                                      style={styles.map}
                                      initialRegion={{
                                        latitude: address.coordinates.latitude,
                                        longitude: address.coordinates.longitude,
                                        latitudeDelta: 0.005,
                                        longitudeDelta: 0.005,
                                      }}
                                      scrollEnabled={false}
                                      zoomEnabled={false}
                                      pitchEnabled={false}
                                      rotateEnabled={false}
                                    >
                                      <Marker
                                        coordinate={{
                                          latitude: address.coordinates.latitude,
                                          longitude: address.coordinates.longitude,
                                        }}
                                        title={address.title}
                                        description={address.address}
                                      />
                                    </MapView>
                                  );
                                } catch (error) {
                                  return (
                                    <View style={[styles.mapErrorContainer, { backgroundColor: theme.colors.surface }]}>
                                      <Ionicons name="location" size={20} color={theme.colors.textSecondary} />
                                      <Text allowFontScaling={false} style={[styles.mapErrorText, { color: theme.colors.textSecondary }]}>
                                        {address.coordinates.latitude.toFixed(4)}, {address.coordinates.longitude.toFixed(4)}
                                      </Text>
                                    </View>
                                  );
                                }
                              })()}
                              
                              <View style={styles.mapOverlay}>
                                <View style={styles.mapOverlayContent}>
                                  <MaterialCommunityIcons name="google-maps" size={12} color="#fff" />
                                  <Text allowFontScaling={false} style={styles.mapOverlayText}>
                                    {address.coordinates.latitude.toFixed(6)}, {address.coordinates.longitude.toFixed(6)}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          ) : address.coordinates && Number.isFinite(address.coordinates.latitude) && Number.isFinite(address.coordinates.longitude) ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 4 }}>
                              <Ionicons name="location" size={14} color={theme.colors.success} />
                              <Text allowFontScaling={false} style={{ fontSize: 12, color: theme.colors.success }}>{t('checkout.locationSaved', { defaultValue: 'Location saved' })}</Text>
                            </View>
                          ) : (
                            <View style={[styles.noLocationBadge, { backgroundColor: theme.colors.warning + '1A' }]}>
                              <Ionicons name="location-outline" size={10} color={theme.colors.warning} />
                              <Text allowFontScaling={false} style={[styles.noLocationText, { color: theme.colors.warning }]}>
                                {t('checkout.noLocationSet', { defaultValue: 'No location set' })}
                              </Text>
                            </View>
                          )}
                        </View>
                        <View style={[
                          styles.radioButton,
                          { borderColor: theme.colors.border },
                          selectedAddress?.id === address.id && !useManualAddress && [styles.radioButtonSelected, { borderColor: theme.colors.primary }]
                        ]}>
                          {selectedAddress?.id === address.id && !useManualAddress && (
                            <View style={[styles.radioButtonInner, { backgroundColor: theme.colors.primary }]} />
                          )}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Load failed — distinct from "no saved addresses", and retryable */}
                {addressesError && userAddresses.length === 0 && (
                  <View style={[styles.noAddressContainer, { backgroundColor: theme.colors.surface, borderColor: theme.colors.error }]}>
                    <Ionicons name="cloud-offline-outline" size={48} color={theme.colors.error} />
                    <Text allowFontScaling={false} style={[styles.noAddressTitle, { color: theme.colors.text }]}>
                      {t('addresses.failedToLoad')}
                    </Text>
                    <TouchableOpacity
                      onPress={loadUserAddresses}
                      style={[styles.addAddressButton, { backgroundColor: theme.colors.primary }]}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="refresh" size={20} color="white" />
                      <Text allowFontScaling={false} style={styles.addAddressText}>
                        {t('common.retry')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* No addresses */}
                {userAddresses.length === 0 && !addressesError && (
                  <View style={[styles.noAddressContainer, { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary }]}>
                    <Ionicons name="location-outline" size={48} color={theme.colors.primary} />
                    <Text allowFontScaling={false} style={[styles.noAddressTitle, { color: theme.colors.text }]}>
                      {t('checkout.noDeliveryAddressFound', { defaultValue: 'No Delivery Address Found' })}
                    </Text>
                    <Text allowFontScaling={false} style={[styles.noAddressSubtitle, { color: theme.colors.textSecondary }]}>
                      {t('checkout.addAddressToContinue', { defaultValue: 'Please add a delivery address first to continue with your order.' })}
                    </Text>
                    <TouchableOpacity
                      onPress={() => navigation.navigate('AddEditAddress')}
                      style={[styles.addAddressButton, { backgroundColor: theme.colors.primary }]}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="add" size={20} color="white" />
                      <Text allowFontScaling={false} style={styles.addAddressText}>
                        {t('startOrder.addAddress', { defaultValue: 'Add Delivery Address' })}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </View>

          {/* Payment Method Section */}
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('checkout.paymentMethod')}</Text>
            
            {allPaymentMethods.map((method) => (
              <React.Fragment key={method.id}>
                <TouchableOpacity
                  style={[
                    styles.paymentMethod,
                    { 
                      backgroundColor: selectedPaymentMethod === method.id ? method.color + '10' : 'transparent',
                      borderColor: selectedPaymentMethod === method.id ? method.color : theme.colors.border,
                    },
                    selectedPaymentMethod === method.id && styles.paymentMethodSelected,
                    !method.isAvailable && styles.paymentMethodDisabled
                  ]}
                  onPress={() => method.isAvailable && setSelectedPaymentMethod(method.id)}
                  disabled={!method.isAvailable}
                  activeOpacity={0.8}
                >
                  <View style={styles.paymentMethodInfo}>
                    {/* ALIBABA STYLE: Colored icon container */}
                    <View style={[styles.paymentIconContainer, { backgroundColor: method.color + '20' }]}>
                      <MaterialCommunityIcons 
                        name={method.icon as any}
                        size={24} 
                        color={method.color}
                      />
                    </View>
                    <View style={styles.paymentMethodText}>
                      <View style={styles.paymentNameRow}>
                        <Text allowFontScaling={false} style={[
                          styles.paymentMethodName,
                          { color: theme.colors.text },
                          selectedPaymentMethod === method.id && [styles.paymentMethodNameSelected, { color: method.color }]
                        ]}>
                          {method.name}
                        </Text>
                        {!method.isAvailable && (
                          <View style={[styles.comingSoonBadge, { backgroundColor: theme.colors.warning + '20' }]}>
                            <Text allowFontScaling={false} style={[styles.comingSoonBadgeText, { color: theme.colors.warning }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                              {t('common.comingSoon', { defaultValue: 'Soon' })}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text allowFontScaling={false} style={[styles.paymentMethodDescription, { color: theme.colors.textSecondary }]}>
                        {method.description}
                      </Text>
                    </View>
                  </View>
                  <View style={[
                    styles.radioButton,
                    { borderColor: selectedPaymentMethod === method.id ? method.color : theme.colors.border },
                  ]}>
                    {selectedPaymentMethod === method.id && (
                      <View style={[styles.radioButtonInner, { backgroundColor: method.color }]} />
                    )}
                  </View>
                </TouchableOpacity>

                {/* Save Card Checkbox for new QiCard */}
                {selectedPaymentMethod === method.id && method.id === 'qi_card' && (
                  <TouchableOpacity
                    style={[styles.saveCardContainer, { backgroundColor: theme.colors.background }]}
                    onPress={() => setSaveCardForFuture(!saveCardForFuture)}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons 
                      name={saveCardForFuture ? "checkbox-marked" : "checkbox-blank-outline"} 
                      size={24} 
                      color={saveCardForFuture ? method.color : theme.colors.textSecondary} 
                    />
                    <Text allowFontScaling={false} style={[styles.saveCardText, { color: theme.colors.text }]}>
                      {t('checkout.saveCardFuture', { defaultValue: 'Save this card for future purchases' })}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Money Exchanger Form */}
                {selectedPaymentMethod === method.id && method.id === 'money_exchanger' && (
                  <View style={[styles.moneyExchangerForm, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
                    <Text allowFontScaling={false} style={[styles.moneyExchangerFormTitle, { color: theme.colors.text }]}>
                      {t('checkout.moneyExchangerDetails', { defaultValue: 'Money Transfer Details' })}
                    </Text>
                    
                    {/* Office Name */}
                    <View style={styles.moneyExchangerInputGroup}>
                      <Text allowFontScaling={false} style={[styles.moneyExchangerLabel, { color: theme.colors.textSecondary }]}>
                        {t('checkout.exchangeOfficeName', { defaultValue: 'Exchange Office Name' })} *
                      </Text>
                      <TextInput allowFontScaling={false}
                        style={[styles.moneyExchangerInput, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.text }]}
                        value={moneyExchangerInfo.officeName}
                        onChangeText={(text) => setMoneyExchangerInfo(prev => ({ ...prev, officeName: text }))}
                        placeholder={t('checkout.exchangeOfficeNamePlaceholder', { defaultValue: 'Enter office name' })}
                        placeholderTextColor={theme.colors.textSecondary}
                      />
                    </View>

                    {/* Office Phone */}
                    <View style={styles.moneyExchangerInputGroup}>
                      <Text allowFontScaling={false} style={[styles.moneyExchangerLabel, { color: theme.colors.textSecondary }]}>
                        {t('checkout.exchangeOfficePhone', { defaultValue: 'Office Phone Number' })} *
                      </Text>
                      <TextInput allowFontScaling={false}
                        style={[styles.moneyExchangerInput, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.text }]}
                        value={moneyExchangerInfo.officePhone}
                        onChangeText={(text) => setMoneyExchangerInfo(prev => ({ ...prev, officePhone: text }))}
                        placeholder={t('checkout.exchangeOfficePhonePlaceholder', { defaultValue: 'Enter office phone' })}
                        placeholderTextColor={theme.colors.textSecondary}
                        keyboardType="phone-pad"
                      />
                    </View>

                    {/* Receiver Name */}
                    <View style={styles.moneyExchangerInputGroup}>
                      <Text allowFontScaling={false} style={[styles.moneyExchangerLabel, { color: theme.colors.textSecondary }]}>
                        {t('checkout.receiverName', { defaultValue: 'Receiver Name' })} *
                      </Text>
                      <TextInput allowFontScaling={false}
                        style={[styles.moneyExchangerInput, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.text }]}
                        value={moneyExchangerInfo.receiverName}
                        onChangeText={(text) => setMoneyExchangerInfo(prev => ({ ...prev, receiverName: text }))}
                        placeholder={t('checkout.receiverNamePlaceholder', { defaultValue: 'Enter receiver name' })}
                        placeholderTextColor={theme.colors.textSecondary}
                      />
                    </View>

                    {/* Receiver Phone */}
                    <View style={styles.moneyExchangerInputGroup}>
                      <Text allowFontScaling={false} style={[styles.moneyExchangerLabel, { color: theme.colors.textSecondary }]}>
                        {t('checkout.receiverPhone', { defaultValue: 'Receiver Phone Number' })} *
                      </Text>
                      <TextInput allowFontScaling={false}
                        style={[styles.moneyExchangerInput, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.text }]}
                        value={moneyExchangerInfo.receiverPhone}
                        onChangeText={(text) => setMoneyExchangerInfo(prev => ({ ...prev, receiverPhone: text }))}
                        placeholder={t('checkout.receiverPhonePlaceholder', { defaultValue: 'Enter receiver phone number' })}
                        placeholderTextColor={theme.colors.textSecondary}
                        keyboardType="phone-pad"
                      />
                    </View>

                    {/* Total Amount */}
                    <View style={styles.moneyExchangerInputGroup}>
                      <Text allowFontScaling={false} style={[styles.moneyExchangerLabel, { color: theme.colors.textSecondary }]}>
                        {t('checkout.totalAmount', { defaultValue: 'Total Amount (USD)' })} *
                      </Text>
                      <TextInput allowFontScaling={false}
                        style={[styles.moneyExchangerInput, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.text }]}
                        value={moneyExchangerInfo.totalAmount}
                        onChangeText={(text) => setMoneyExchangerInfo(prev => ({ ...prev, totalAmount: text }))}
                        placeholder={t('checkout.totalAmountPlaceholder', { defaultValue: 'Enter total amount' })}
                        placeholderTextColor={theme.colors.textSecondary}
                        keyboardType="numeric"
                      />
                    </View>

                    {/* Save for future use button */}
                    {!exchangerSaved && moneyExchangerInfo.officeName.trim() && moneyExchangerInfo.receiverName.trim() && (
                      <TouchableOpacity
                        style={[styles.saveExchangerButton, { backgroundColor: theme.colors.primary }]}
                        onPress={async () => {
                          if (!user?.uid) return;
                          setExchangerSaving(true);
                          try {
                            const { error: saveError } = await supabase
                              .from('users')
                              .update({
                                money_exchanger_info: {
                                  officeName: moneyExchangerInfo.officeName,
                                  officePhone: moneyExchangerInfo.officePhone,
                                  receiverName: moneyExchangerInfo.receiverName,
                                  receiverPhone: moneyExchangerInfo.receiverPhone,
                                  savedAt: new Date().toISOString(),
                                },
                              })
                              .eq('id', user.uid);
                            if (saveError) throw saveError;
                            setExchangerSaved(true);
                            Alert.alert(
                              t('common.success', { defaultValue: 'Success' }),
                              t('checkout.exchangerSaved', { defaultValue: 'Money exchanger info saved! It will be auto-filled next time.' })
                            );
                          } catch (error) {
                            Alert.alert(
                              t('common.error', { defaultValue: 'Error' }),
                              t('checkout.exchangerSaveFailed', { defaultValue: 'Failed to save exchanger info.' })
                            );
                          } finally {
                            setExchangerSaving(false);
                          }
                        }}
                        disabled={exchangerSaving}
                        activeOpacity={0.7}
                      >
                        {exchangerSaving ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="save-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                            <Text allowFontScaling={false} style={styles.saveExchangerButtonText}>
                              {t('checkout.saveExchangerInfo', { defaultValue: 'Save for future use' })}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                    
                    {exchangerSaved && (
                      <View style={[styles.exchangerSavedBadge, { backgroundColor: theme.colors.success + '1A' }]}>
                        <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} />
                        <Text allowFontScaling={false} style={[styles.exchangerSavedText, { color: theme.colors.success }]}>
                          {t('checkout.exchangerInfoSaved', { defaultValue: 'Saved ✓ Auto-filled from your saved info' })}
                        </Text>
                      </View>
                    )}

                    <View style={[styles.moneyExchangerNote, { backgroundColor: theme.colors.primary + '10' }]}>
                      <Ionicons name="information-circle-outline" size={18} color={theme.colors.primary} />
                      <Text allowFontScaling={false} style={[styles.moneyExchangerNoteText, { color: theme.colors.primary }]}>
                        {t('checkout.moneyExchangerNote', { defaultValue: 'Please ensure all details are correct. We will verify the transfer before processing your order.' })}
                      </Text>
                    </View>
                  </View>
                )}

                {/* QI Card info note */}
                {selectedPaymentMethod === method.id && method.id === 'qi_card' && (
                  <View style={[styles.moneyExchangerNote, { backgroundColor: '#1976D2' + '10' }]}>
                    <Ionicons name="card-outline" size={18} color={'#1976D2'} />
                    <Text allowFontScaling={false} style={[styles.moneyExchangerNoteText, { color: '#1976D2' }]}>
                      {t('checkout.qiCardNote', { defaultValue: 'You will be redirected to a secure payment page to enter your card details.' })}
                    </Text>
                  </View>
                )}
              </React.Fragment>
            ))}
          </View>

          {/* Shipping Office Section (for out-of-country customers) */}
          {!shippingOfficeLoading && (
            <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
              <View style={styles.sectionHeader}>
                <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
                  {t('shippingInfo.title', { defaultValue: 'Shipping Company' })}
                </Text>
                <Text allowFontScaling={false} style={[styles.sectionSubtitle, { color: theme.colors.textSecondary }]}>
                  {t('checkout.optional', { defaultValue: 'Optional' })}
                </Text>
              </View>
              
              {shippingOfficeInfo ? (
                <>
                  {/* Toggle to use shipping office */}
                  <TouchableOpacity
                    style={[
                      styles.shippingOfficeToggle,
                      { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                      useShippingOffice && { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '0D' }
                    ]}
                    onPress={() => setUseShippingOffice(!useShippingOffice)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.shippingOfficeToggleContent}>
                      <Ionicons 
                        name="business-outline" 
                        size={24} 
                        color={useShippingOffice ? theme.colors.primary : theme.colors.textSecondary} 
                      />
                      <View style={styles.shippingOfficeToggleInfo}>
                        <Text allowFontScaling={false} style={[
                          styles.shippingOfficeToggleTitle,
                          { color: useShippingOffice ? theme.colors.primary : theme.colors.text }
                        ]}>
                          {t('shippingInfo.useShippingOffice', { defaultValue: 'Ship to my shipping office' })}
                        </Text>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeToggleSubtitle, { color: theme.colors.textSecondary }]}>
                          {shippingOfficeInfo.officeName}
                        </Text>
                      </View>
                    </View>
                    <View style={[
                      styles.checkbox,
                      { borderColor: theme.colors.border },
                      useShippingOffice && { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary }
                    ]}>
                      {useShippingOffice && (
                        <Ionicons name="checkmark" size={16} color="white" />
                      )}
                    </View>
                  </TouchableOpacity>

                  {/* Show shipping office details when enabled */}
                  {useShippingOffice && (
                    <View style={[styles.shippingOfficeDetails, { backgroundColor: theme.colors.primary + '0D', borderColor: theme.colors.primary }]}>
                      <View style={styles.shippingOfficeRow}>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeLabel, { color: theme.colors.textSecondary }]}>
                          {t('shippingInfo.recipientName', { defaultValue: 'Recipient' })}
                        </Text>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeValue, { color: theme.colors.text }]}>
                          {shippingOfficeInfo.recipientName}
                        </Text>
                      </View>
                      <View style={styles.shippingOfficeRow}>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeLabel, { color: theme.colors.textSecondary }]}>
                          {t('shippingInfo.mobileNumber', { defaultValue: 'Mobile' })}
                        </Text>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeValue, { color: theme.colors.text }]}>
                          {shippingOfficeInfo.mobileNumber}
                        </Text>
                      </View>
                      <View style={styles.shippingOfficeRow}>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeLabel, { color: theme.colors.textSecondary }]}>
                          {t('shippingInfo.officeName', { defaultValue: 'Office' })}
                        </Text>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeValue, { color: theme.colors.text }]}>
                          {shippingOfficeInfo.officeName}
                        </Text>
                      </View>
                      <View style={styles.shippingOfficeRow}>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeLabel, { color: theme.colors.textSecondary }]}>
                          {t('shippingInfo.officePhone', { defaultValue: 'Office Phone' })}
                        </Text>
                        <Text allowFontScaling={false} style={[styles.shippingOfficeValue, { color: theme.colors.text }]}>
                          {shippingOfficeInfo.officePhone}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.editShippingOfficeButton, { backgroundColor: theme.colors.primary + '1A' }]}
                        onPress={() => navigation.navigate('ShippingInfo')}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="pencil" size={14} color={theme.colors.primary} />
                        <Text allowFontScaling={false} style={[styles.editShippingOfficeText, { color: theme.colors.primary }]}>
                          {t('common.edit', { defaultValue: 'Edit' })}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              ) : (
                /* No shipping office set */
                <TouchableOpacity
                  style={[styles.addShippingOfficeCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                  onPress={() => navigation.navigate('ShippingInfo')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="business-outline" size={32} color={theme.colors.textSecondary} />
                  <Text allowFontScaling={false} style={[styles.addShippingOfficeTitle, { color: theme.colors.text }]}>
                    {t('shippingInfo.addShippingOffice', { defaultValue: 'Add Shipping Office' })}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.addShippingOfficeSubtitle, { color: theme.colors.textSecondary }]}>
                    {t('shippingInfo.addDescription', { defaultValue: 'Optional: For shipping to external offices' })}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Special Instructions - GOLDEN TEMPLATE: minHeight, not height */}
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.sectionHeader}>
              <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
                {t('checkout.specialInstructions', { defaultValue: 'Special Instructions' })}
              </Text>
              <Text allowFontScaling={false} style={[styles.sectionSubtitle, { color: theme.colors.textSecondary }]}>
                {t('checkout.optional', { defaultValue: 'Optional' })}
              </Text>
            </View>
            <TextInput allowFontScaling={false}
              style={[styles.textArea, { borderColor: theme.colors.border, color: theme.colors.text }]}
              value={specialInstructions}
              onChangeText={setSpecialInstructions}
              placeholder={t('checkout.specialInstructionsPlaceholder', { defaultValue: 'Any special delivery instructions...' })}
              placeholderTextColor={theme.colors.placeholder}
              multiline={true}
              textAlignVertical="top"
            />
          </View>

          {/* Order Summary */}
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('checkout.orderSummary')}</Text>
            
            {/* GOLDEN TEMPLATE: Order Items with Selected Options (read-only) */}
            {cart.items.map((item, index) => (
              <View key={`${item.productId}-${item.selectedOptions?.color || ''}-${item.selectedOptions?.size || ''}`} style={[styles.orderItem, { borderBottomColor: theme.colors.border }]}>
                {/* Product Image */}
                <View style={[styles.productThumbContainer, { backgroundColor: PRODUCT_BG_COLORS[index % PRODUCT_BG_COLORS.length] }]}>
                  <Image 
                    source={{ uri: getProductImageUrl({
                      imageUrls: item.product.imageUrls,
                      category: item.product.category
                    }) }}
                    style={styles.productImage}
                    contentFit="cover"
                    transition={0}
                    cachePolicy="memory-disk"
                    priority="normal"
                  />
                </View>
                
                <View style={styles.orderItemInfo}>
                  <Text allowFontScaling={false} style={[styles.orderItemName, { color: theme.colors.text }]} numberOfLines={2}>
                    {i18n.language === 'ar' && item.product.nameAr ? item.product.nameAr : i18n.language === 'ku' && item.product.nameKu ? item.product.nameKu : item.product.name}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.orderItemPartNumber, { color: theme.colors.textSecondary }]}>
                    {item.product.partNumber}
                  </Text>
                  {/* Same look as Order Details: wholesale badge + "qty x price = total" + struck original */}
                  {(() => {
                    // isVip was missing here, so the review strip quoted every
                    // VIP shopper the non-VIP price while the summary below it,
                    // and the order actually placed, used the VIP one.
                    const unitPrice = LocalCartService.getTieredPrice(item.product, item.quantity, isVip);
                    const basePrice = item.product.priceUSD;
                    const hasWholesaleDiscount = basePrice > unitPrice;
                    const savingsPercent = hasWholesaleDiscount
                      ? Math.round((1 - unitPrice / basePrice) * 100)
                      : 0;
                    return (
                      <>
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
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                          <Text allowFontScaling={false}
                            style={{ flex: 1, fontSize: 14, fontWeight: '600', color: theme.colors.primary }}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.8}
                          >
                            {`${item.quantity} x ${formatPrice(unitPrice, currency, exchangeRateIQD)} = `}
                            <Text allowFontScaling={false} style={hasWholesaleDiscount ? { color: theme.colors.success } : undefined}>
                              {formatPrice(unitPrice * item.quantity, currency, exchangeRateIQD)}
                            </Text>
                          </Text>
                          {hasWholesaleDiscount && (
                            <Text allowFontScaling={false}
                              style={{ fontSize: 12, color: theme.colors.error, textDecorationLine: 'line-through', marginLeft: 8, flexShrink: 0 }}
                              numberOfLines={1}
                              adjustsFontSizeToFit
                              minimumFontScale={0.85}
                            >
                              {formatPrice(basePrice * item.quantity, currency, exchangeRateIQD)}
                            </Text>
                          )}
                        </View>
                      </>
                    );
                  })()}
                  
                  {/* GOLDEN TEMPLATE: Selected Options (read-only, display-only) */}
                  {item.selectedOptions && (
                    <View style={styles.selectedOptionsContainer}>
                      {item.selectedOptions.color && (
                        <Text allowFontScaling={false} 
                          style={[styles.selectedOptionText, { color: theme.colors.textSecondary }]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                        >
                          {t('checkout.color', { defaultValue: 'Color' })}: {item.selectedOptions.color}
                        </Text>
                      )}
                      {item.selectedOptions.size && (
                        <Text allowFontScaling={false} 
                          style={[styles.selectedOptionText, { color: theme.colors.textSecondary }]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                        >
                          {t('checkout.size', { defaultValue: 'Size' })}: {item.selectedOptions.size}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              </View>
            ))}
            
            <View style={[styles.orderItemsDivider, { backgroundColor: theme.colors.border }]} />
            
            <View style={styles.summaryRow}>
              <Text allowFontScaling={false} 
                style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {t('cart.subtotal')} ({t('cart.items', { count: cartSummary?.itemCount || 0 })})
              </Text>
              <Text allowFontScaling={false} 
                style={[styles.summaryValue, { color: theme.colors.text }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatPrice(cartSummary?.subtotal || 0, currency, exchangeRateIQD)}
              </Text>
            </View>
            
            <View style={styles.summaryRow}>
              <Text allowFontScaling={false} 
                style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {t('cart.shipping')} {t('common.in')} {selectedAddress?.city || 'Erbil'}
              </Text>
              <Text allowFontScaling={false} style={[
                styles.summaryValue, 
                { color: (cartSummary?.shipping || 0) === 0 ? theme.colors.success : theme.colors.text }
              ]}>
                {(cartSummary?.shipping || 0) === 0 ? t('cart.freeShipping') : formatPrice(cartSummary?.shipping || 0, currency, exchangeRateIQD)}
              </Text>
            </View>

            {(cartSummary?.tax || 0) > 0 && (
              <View style={styles.summaryRow}>
                <Text allowFontScaling={false} style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>{t('cart.tax')}</Text>
                <Text allowFontScaling={false} style={[styles.summaryValue, { color: theme.colors.text }]}>
                  {formatPrice(cartSummary?.tax || 0, currency, exchangeRateIQD)}
                </Text>
              </View>
            )}

            {/* Promo code */}
            {isPromoDiscount && appliedDiscount ? (
              <View style={{ paddingVertical: 8 }}>
                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name="check-circle" size={16} color={theme.colors.success} />
                    <Text allowFontScaling={false} style={{ color: theme.colors.success, fontWeight: '700' }}>
                      {discountDisplayName(appliedDiscount, i18n.language)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 12 }}>
                    <Text allowFontScaling={false} style={{ color: theme.colors.success, fontWeight: '700' }}>
                      -{formatPrice(appliedDiscount.savedAmount, currency, exchangeRateIQD)}
                    </Text>
                    <TouchableOpacity onPress={removePromo} hitSlop={8}>
                      <Text allowFontScaling={false} style={{ color: theme.colors.error, fontWeight: '600' }}>
                        {t('checkout.promoRemove', { defaultValue: 'Remove' })}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {/* The basket holds more than one store, so be explicit about which
                    items the code actually came off. */}
                {promoStoreScoped && (
                  <Text allowFontScaling={false} style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 6, textAlign: isRTL ? 'right' : 'left' }}>
                    {t('checkout.promoSingleStore', { defaultValue: "This code applies to one store's items only." })}
                  </Text>
                )}
              </View>
            ) : (
              <View style={{ paddingVertical: 8 }}>
                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    value={promoInput}
                    onChangeText={(v) => { setPromoInput(v); if (promoError) setPromoError(null); }}
                    placeholder={t('checkout.promoPlaceholder', { defaultValue: 'Promo code' })}
                    placeholderTextColor={theme.colors.placeholder}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    style={{
                      flex: 1, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10,
                      paddingHorizontal: 14, paddingVertical: 10, color: theme.colors.text,
                      textAlign: isRTL ? 'right' : 'left', backgroundColor: theme.colors.surface,
                    }}
                  />
                  <TouchableOpacity
                    onPress={applyPromo}
                    disabled={promoApplying || !promoInput.trim()}
                    style={{
                      backgroundColor: theme.colors.primary, borderRadius: 10,
                      paddingHorizontal: 18, paddingVertical: 11, opacity: promoApplying || !promoInput.trim() ? 0.5 : 1,
                    }}
                  >
                    {promoApplying
                      ? <ActivityIndicator size="small" color={theme.colors.textOnPrimary} />
                      : <Text allowFontScaling={false} style={{ color: theme.colors.textOnPrimary, fontWeight: '700' }}>{t('checkout.promoApply', { defaultValue: 'Apply' })}</Text>}
                  </TouchableOpacity>
                </View>
                {promoError && (
                  <Text allowFontScaling={false} style={{ color: theme.colors.error, fontSize: 12, marginTop: 6, textAlign: isRTL ? 'right' : 'left' }}>
                    {promoError}
                  </Text>
                )}
              </View>
            )}

            {/* Discount Row (auto-discounts only; promo codes render above) */}
            {appliedDiscount && !isPromoDiscount && (
              <>
                <View style={styles.discountRow}>
                  <View style={styles.discountInfo}>
                    <Feather name="tag" size={16} color={theme.colors.success} />
                    <Text allowFontScaling={false} style={[styles.discountLabel, { color: theme.colors.success }]}>
                      {discountDisplayName(appliedDiscount, i18n.language)}
                    </Text>
                  </View>
                  <Text allowFontScaling={false} style={[styles.discountValue, { color: theme.colors.success }]}>
                    -{formatPrice(appliedDiscount.savedAmount, currency, exchangeRateIQD)}
                  </Text>
                </View>
                {!!discountDisplayDescription(appliedDiscount, i18n.language) && (
                  <Text allowFontScaling={false} style={[styles.discountDescription, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
                    {discountDisplayDescription(appliedDiscount, i18n.language)}
                  </Text>
                )}
              </>
            )}
            
            {/* Discount loading */}
            {discountLoading && (
              <View style={styles.discountLoadingRow}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text allowFontScaling={false} style={[styles.discountLoadingText, { color: theme.colors.textSecondary }]}>
                  {t('checkout.checkingDiscounts', { defaultValue: 'Checking for discounts...' })}
                </Text>
              </View>
            )}

            <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

            <View style={styles.totalRow}>
              <Text allowFontScaling={false} style={[styles.totalLabel, { color: theme.colors.text }]}>{t('cart.total')}</Text>
              <View style={styles.totalValues}>
                {appliedDiscount && (
                  <Text allowFontScaling={false} style={[styles.originalTotal, { color: theme.colors.textSecondary }]}>
                    {formatPrice(cartSummary?.total || 0, currency, exchangeRateIQD)}
                  </Text>
                )}
                <Text allowFontScaling={false} style={[styles.totalValue, { color: theme.colors.primary }]}>
                  {formatPrice(
                    appliedDiscount
                      ? Math.max(0, (cartSummary?.total || 0) - appliedDiscount.savedAmount)
                      : (cartSummary?.total || 0),
                    currency,
                    exchangeRateIQD
                  )}
                </Text>
              </View>
            </View>
            
            {/* VIP Price Breakdown Card */}
            {vipInfo && (
              <View style={styles.vipCard}>
                {/* VIP Header */}
                <View style={styles.vipCardHeader}>
                  <View style={styles.vipBadge}>
                    <Ionicons name="diamond" size={14} color="#FFF" />
                    <Text allowFontScaling={false} style={styles.vipBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>VIP</Text>
                  </View>
                  {vipInfo.discountPercent > 0 && (
                    <View style={styles.vipPercentBadge}>
                      <Text allowFontScaling={false} style={styles.vipPercentText}>-{vipInfo.discountPercent}%</Text>
                    </View>
                  )}
                </View>

                {/* Price Breakdown */}
                <View style={styles.vipBreakdown}>
                  <View style={styles.vipBreakdownRow}>
                    <Text allowFontScaling={false} style={styles.vipBreakdownLabel}>
                      {t('checkout.vipOriginalPrice', { defaultValue: 'Regular Price' })}
                    </Text>
                    <Text allowFontScaling={false} style={styles.vipOriginalPrice}>
                      {formatPrice(vipInfo.regularSubtotal, currency, exchangeRateIQD)}
                    </Text>
                  </View>
                  <View style={styles.vipBreakdownRow}>
                    <Text allowFontScaling={false} style={[styles.vipBreakdownLabel, { color: '#059669' }]}>
                      {t('checkout.vipDiscount', { defaultValue: 'VIP Discount' })}
                    </Text>
                    <Text allowFontScaling={false} style={styles.vipDiscountAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                      -{formatPrice(vipInfo.savings, currency, exchangeRateIQD)}
                    </Text>
                  </View>
                  <View style={[styles.vipDivider]} />
                  <View style={styles.vipBreakdownRow}>
                    <Text allowFontScaling={false} style={styles.vipYouPayLabel}>
                      {t('checkout.vipYouPay', { defaultValue: 'Your VIP Price' })}
                    </Text>
                    <Text allowFontScaling={false} style={styles.vipFinalPrice}>
                      {formatPrice(vipInfo.vipSubtotal, currency, exchangeRateIQD)}
                    </Text>
                  </View>
                </View>

                {/* Bottom message */}
                <View style={styles.vipFooter}>
                  <Ionicons name="star" size={12} color="#F59E0B" />
                  <Text allowFontScaling={false} style={styles.vipFooterText}>
                    {t('checkout.vipSavingsMessage', {
                      defaultValue: 'You saved {{amount}} with your VIP membership!',
                      amount: formatPrice(vipInfo.savings, currency, exchangeRateIQD),
                    })}
                  </Text>
                </View>
              </View>
            )}

            {/* Savings banner */}
            {appliedDiscount && (
              <View style={[styles.savingsBanner, { backgroundColor: theme.colors.success + '1A' }]}>
                <Feather name="check-circle" size={16} color={theme.colors.success} />
                <Text allowFontScaling={false} style={[styles.savingsText, { color: theme.colors.success }]}>
                  {t('checkout.youAreSaving', { amount: formatPrice(appliedDiscount.savedAmount, currency, exchangeRateIQD), defaultValue: "You're saving {{amount}}!" })}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>

        {/* GOLDEN TEMPLATE: Sticky CTA Bar OUTSIDE ScrollView */}
        <View style={[
          styles.bottomContainer,
          { 
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
            paddingBottom: insets.bottom + 16,
          }
        ]}>
          <TouchableOpacity 
            style={[
              styles.placeOrderButton, 
              isProcessing && styles.placeOrderButtonDisabled
            ]}
            onPress={handlePlaceOrder}
            disabled={isProcessing}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={isProcessing ? ['#C0C0C0', '#A0A0A0'] : ['#A61920', '#831319']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.placeOrderGradient}
            >
              {isProcessing ? (
                <>
                  <ActivityIndicator color="#ffffff" size="small" />
                  <Text allowFontScaling={false} style={styles.placeOrderButtonText}>
                    {t('checkout.processingOrder', { defaultValue: 'Processing...' })}
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="cart" size={20} color="#ffffff" />
                  <Text allowFontScaling={false} style={styles.placeOrderButtonText}>
                    {t('checkout.placeOrder')} • {formatPrice(
                      appliedDiscount
                        ? Math.max(0, (cartSummary?.total || 0) - appliedDiscount.savedAmount)
                        : (cartSummary?.total || 0),
                      currency,
                      exchangeRateIQD
                    )}
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Full-screen processing overlay — prevents all interaction while order is being placed */}
          <Modal
            visible={isProcessing}
            transparent
            animationType="fade"
            statusBarTranslucent
          >
            <View style={styles.processingOverlay}>
              <View style={[styles.processingCard, { backgroundColor: theme.colors.surface }]}>
                <RNAnimated.View style={{
                  transform: [{
                    rotate: processingSpinAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '360deg'],
                    })
                  }]
                }}>
                  <Ionicons name="cart" size={40} color={theme.colors.primary} />
                </RNAnimated.View>
                <Text allowFontScaling={false} style={[styles.processingTitle, { color: theme.colors.text }]}>
                  {t('checkout.placingOrder', { defaultValue: 'Placing Your Order' })}
                </Text>
                <Text allowFontScaling={false} style={[styles.processingSubtitle, { color: theme.colors.textSecondary }]}>
                  {t('checkout.pleaseWait', { defaultValue: 'Please wait, do not close the app...' })}
                </Text>
                <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginTop: 16 }} />
              </View>
            </View>
          </Modal>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

/* eslint-disable react-native/no-unused-styles, react-native/sort-styles, react-native/no-color-literals */
// ALIBABA DESIGN: Premium checkout styling (uses FIGMA_ORANGE from top of file)

const createStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  // Header - ALIBABA STYLE: Clean with subtle accent
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 0,
    backgroundColor: theme.colors.background,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: theme.colors.surface,
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  headerSpacer: {
    width: 44,
  },
  // Empty State - ALIBABA STYLE: Engaging empty state
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 24,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: 15,
    marginTop: 12,
    marginBottom: 32,
    textAlign: 'center',
    lineHeight: 22,
    opacity: 0.7,
  },
  shopButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 25,
    ...Platform.select({
      ios: {
        shadowColor: FIGMA_ORANGE,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  shopButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  // Sections - ALIBABA STYLE: Card with subtle elevation
  section: {
    borderRadius: 16,
    marginBottom: 12,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  // Loading
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: {
    fontSize: 14,
    marginTop: 8,
  },
  // Address - ALIBABA STYLE: Modern address cards
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 12,
    padding: 16,
  },
  addressCardSelected: {
    // Removed shadow/elevation to prevent "black border" effect reported by user
    // The colored border and background are sufficient indicators
  },
  addressInfo: {
    flex: 1,
  },
  addressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  addressTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  defaultBadge: {
    borderRadius: 6,
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  defaultBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  addressName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  addressDetails: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 3,
    opacity: 0.75,
  },
  addressPhone: {
    fontSize: 13,
    opacity: 0.75,
  },
  // Map - aspectRatio instead of fixed height
  mapContainer: {
    borderRadius: 8,
    marginTop: 8,
    overflow: 'hidden',
    aspectRatio: 3, // Width / Height ratio
  },
  map: {
    width: '100%',
    height: '100%',
  },
  mapErrorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapErrorText: {
    fontSize: 10,
    marginTop: 4,
  },
  mapOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 6,
  },
  mapOverlayContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mapOverlayText: {
    color: '#ffffff',
    fontFamily: 'monospace',
    fontSize: 9,
    marginLeft: 3,
  },
  // No Address
  noAddressContainer: {
    alignItems: 'center',
    borderRadius: 12,
    borderStyle: 'dashed',
    borderWidth: 2,
    marginTop: 16,
    padding: 20,
  },
  noAddressTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 12,
    textAlign: 'center',
  },
  noAddressSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
    textAlign: 'center',
  },
  addAddressButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  addAddressText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  noLocationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 3,
    marginTop: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  noLocationText: {
    fontSize: 9,
    marginLeft: 3,
  },
  manageAddressButton: {
    flexDirection: 'row',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  manageAddressText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  // Payment Method - ALIBABA STYLE: Modern selection cards
  paymentMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 12,
    padding: 16,
  },
  paymentMethodSelected: {
    // Removed shadow/elevation to prevent "black border" effect reported by user
    // The colored border and background are sufficient indicators
  },
  paymentMethodDisabled: {
    opacity: 0.5,
  },
  paymentMethodInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  // ALIBABA STYLE: Colored icon container matching StartOrderBottomSheet
  paymentIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentMethodText: {
    flex: 1,
  },
  paymentNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paymentMethodName: {
    fontSize: 14,
    fontWeight: '600',
  },
  paymentMethodNameSelected: {
    fontWeight: '700',
  },
  comingSoonBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  comingSoonBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  paymentMethodDescription: {
    fontSize: 12,
    marginTop: 2,
    opacity: 0.7,
  },
  // Radio Button - ALIBABA STYLE: Modern radio
  radioButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioButtonSelected: {},
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  // Coming Soon
  comingSoonCard: {
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 16,
    padding: 16,
  },
  comingSoonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  comingSoonTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  comingSoonText: {
    fontSize: 14,
    lineHeight: 20,
  },
  // Text Area - GOLDEN TEMPLATE: minHeight, not height
  textArea: {
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  // ALIBABA STYLE: Order Items in Checkout Summary
  orderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.04)',
  },
  productThumbContainer: {
    width: 60,
    height: 60,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  orderItemInfo: {
    flex: 1,
    marginLeft: 14,
    marginRight: 14,
  },
  orderItemName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 3,
    letterSpacing: -0.2,
  },
  orderItemPartNumber: {
    fontSize: 11,
    marginBottom: 5,
    opacity: 0.6,
  },
  orderItemRight: {
    alignItems: 'flex-end',
  },
  orderItemQty: {
    fontSize: 12,
    marginBottom: 3,
    opacity: 0.6,
  },
  orderItemPrice: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  orderItemsDivider: {
    height: 1,
    marginTop: 10,
    marginBottom: 18,
  },
  // ALIBABA STYLE: Selected options display (read-only, no price impact)
  selectedOptionsContainer: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 5,
  },
  selectedOptionText: {
    fontSize: 11,
    opacity: 0.7,
  },
  // Summary - ALIBABA STYLE: Clean totals
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  summaryLabel: {
    fontSize: 14,
    opacity: 0.7,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginVertical: 18,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  totalLabel: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  totalValue: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  totalValues: {
    alignItems: 'flex-end',
  },
  originalTotal: {
    fontSize: 14,
    marginBottom: 3,
    textDecorationLine: 'line-through',
    opacity: 0.5,
  },
  // Discount - ALIBABA STYLE: Highlighted savings
  discountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  discountInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  discountLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  discountValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  discountDescription: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
    marginTop: -6,
  },
  discountLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 4,
  },
  discountLoadingText: {
    fontSize: 13,
    marginLeft: 8,
  },
  savingsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  savingsText: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 8,
  },
  vipCard: {
    marginTop: 16,
    borderRadius: 14,
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#FCD34D',
    overflow: 'hidden',
  },
  vipCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F59E0B',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  vipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  vipBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 1.5,
  },
  vipPercentBadge: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  vipPercentText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
  },
  vipBreakdown: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  vipBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  vipBreakdownLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#78716C',
  },
  vipOriginalPrice: {
    fontSize: 13,
    fontWeight: '500',
    color: '#78716C',
    textDecorationLine: 'line-through',
  },
  vipDiscountAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#059669',
  },
  vipDivider: {
    height: 1,
    backgroundColor: '#FCD34D',
    marginVertical: 4,
  },
  vipYouPayLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
  },
  vipFinalPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: '#B45309',
  },
  vipFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FEF3C7',
  },
  vipFooterText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400E',
    flex: 1,
  },
  // Bottom Container - ALIBABA STYLE: Premium CTA bar
  bottomContainer: {
    borderTopWidth: 0,
    padding: 16,
    paddingTop: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  placeOrderButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  placeOrderButtonDisabled: {
    opacity: 0.7,
  },
  placeOrderGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 10,
  },
  placeOrderButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  // Processing Overlay
  processingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingCard: {
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '75%',
    maxWidth: 300,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  processingTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
  },
  processingSubtitle: {
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 18,
  },
  // Shipping Office
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '400',
    textTransform: 'uppercase',
  },
  shippingOfficeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  shippingOfficeToggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  shippingOfficeToggleInfo: {
    marginLeft: 12,
    flex: 1,
  },
  shippingOfficeToggleTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  shippingOfficeToggleSubtitle: {
    fontSize: 13,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveCardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  saveCardText: {
    marginLeft: 10,
    fontSize: 14,
    fontWeight: '500',
  },
  shippingOfficeDetails: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  shippingOfficeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  shippingOfficeLabel: {
    fontSize: 13,
    flex: 1,
  },
  shippingOfficeValue: {
    fontSize: 14,
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  editShippingOfficeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 8,
    marginTop: 8,
  },
  editShippingOfficeText: {
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 6,
  },
  addShippingOfficeCard: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: 24,
  },
  addShippingOfficeTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 4,
  },
  addShippingOfficeSubtitle: {
    fontSize: 13,
    textAlign: 'center',
  },
  // Money Exchanger Form Styles
  moneyExchangerForm: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  moneyExchangerFormTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  moneyExchangerInputGroup: {
    marginBottom: 16,
  },
  moneyExchangerLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
  },
  moneyExchangerInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 0,
    fontSize: 15,
    height: 40,
    textAlignVertical: 'center' as const,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  moneyExchangerNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    gap: 8,
  },
  moneyExchangerNoteText: {
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  saveExchangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginTop: 10,
  },
  saveExchangerButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  exchangerSavedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 10,
    gap: 6,
  },
  exchangerSavedText: {
    fontSize: 13,
    fontWeight: '500',
  },
});

export default CheckoutScreen;
