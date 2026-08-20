import React, { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Share,
  Alert,
  Modal,
  Platform,
  KeyboardAvoidingView,
  StyleSheet,
  TextInput,
  Linking, // Added for phone/whatsapp/map links
} from 'react-native';
import { Image } from 'expo-image';

import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../components/ThemeProvider';
import { Product } from '../types';
import { LocalCartService } from '../services/localCartService';
import { useCart } from '../contexts/CartContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { useAuth } from '../contexts/AuthContext';
import {
  getDisplayUnitPrice,
  getEffectiveUnitPrice,
  formatUnitPrice,
  formatLineTotal,
  hasCompareAtDiscount,
  getDiscountPercent,
  getEffectiveStock,
} from '../utils/pricingUtils';
import { useFavorites } from '../contexts/FavoritesContext';
import { COLLECTIONS, BRAND, brandContact } from '../constants/config';
import Button from '../components/Button';
import { Chip, Surface, Divider, Badge } from 'react-native-paper';
import AppNumber from '../components/AppNumber';
import AppText from '../components/AppText';

import { formatItemPrice, formatPrice } from '../utils/currency';
import { getProductImageUrls } from '../utils/imageUtils';
import { ProductService } from '../services/productService';
import { brandService } from '../services/brandService';
import { storeProfileService } from '../services/storeProfileService';
import { getTenantContactInfo, getTenantPrimaryLocation } from '../services/tenantInfoService';
import { getDirection } from '../locales';
import { SPACING } from '../constants/theme';
import GoldenCarousel from '../components/GoldenCarousel';
import { getOrCreateConversation, findConversationByTenant } from '../services/chatService';
import StartOrderBottomSheet from '../components/StartOrderBottomSheet';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Matches the low-stock cue used on the product cards, so "only a few left" means
// the same thing everywhere in the app.
const LOW_STOCK_THRESHOLD = 5;

// Column widths for the variation tables (size table and colour table). Shared so a
// header cell and its row cell can never drift apart.
//
// QTY has to fit two 28pt steppers plus the quantity field plus the gaps between
// them (VARIANT_QTY_FIELD_WIDTH below). At the old flex of 1.5 the cell measured
// narrower than its own contents, and because a flex row doesn't clip, the stepper
// spilled left over the STOCK number — the two collided on screen.
// The STOCK column was removed: exact per-variant quantities are business data and
// are no longer shown to customers. An unavailable variant is already conveyed by
// its row being disabled and its price greyed, so nothing was lost but the number.
// Its 1.0 of flex goes to model, which was the column that truncated most often.
const VARIANT_COL = {
  model: 2.6,
  price: 1.3,
  qty: 2.2,
} as const;

// Fixed, not minWidth: an unconstrained TextInput in a row grows to fill and pushes
// the minus button further left, which is what made the overflow worse.
const VARIANT_QTY_FIELD_WIDTH = 44;

// How far the white info sheet is pulled up over the bottom of the hero image. Any
// control anchored to the image bottom has to clear this, so both the sheet and the
// cart FAB derive from it rather than each hard-coding a number that can drift apart —
// which is exactly how the FAB ended up with its lower edge sliced off by the sheet.
const SHEET_OVERLAP = 28;

// Alibaba-style bottom bar is shorter than the old CTA.
// Keep this close to the real bar height (excluding safe-area inset).
const CTA_BAR_HEIGHT = 80;

// Brand logo lookup for the brand card below the SKU row.
//
// A product only stores its brand as a free-text name; the logo lives on the
// admin-managed `brands` row. Matching is by normalised name because the admin
// product form lets the brand be typed by hand as well as picked from a chip,
// so "apple " and "Apple" have to resolve to the same logo.
//
// Cached at module scope: the brand list is small, changes rarely, and without
// this every product opened would fire its own query for the same few rows.
const BRAND_CACHE_TTL_MS = 5 * 60 * 1000;
let brandLogoCache: { at: number; byName: Map<string, string | undefined> } | null = null;
let brandLogoInFlight: Promise<Map<string, string | undefined>> | null = null;

const normalizeBrandName = (name: string) => name.trim().toLowerCase();

// Font size for the no-logo wordmark, picked from the name length.
//
// Deliberately NOT adjustsFontSizeToFit: on Android that measurement clips the
// string rather than shrinking it inside a narrow box, which is how "HONOR"
// rendered as "HONO". A fixed size per length band always fits BRAND_LOGO_WIDTH.
const BRAND_LOGO_WIDTH = 84;
const BRAND_LOGO_HEIGHT = 56;

function brandWordmarkFontSize(label: string): number {
  const len = label.trim().length;
  if (len <= 4) return 16;
  if (len <= 6) return 13;
  if (len <= 9) return 11;
  if (len <= 12) return 9;
  return 8;
}

async function getBrandLogoMap(now: number): Promise<Map<string, string | undefined>> {
  if (brandLogoCache && now - brandLogoCache.at < BRAND_CACHE_TTL_MS) return brandLogoCache.byName;
  if (brandLogoInFlight) return brandLogoInFlight;

  brandLogoInFlight = (async () => {
    try {
      const brands = await brandService.getActiveBrands();
      const byName = new Map<string, string | undefined>();
      brands.forEach(b => {
        if (b?.name) byName.set(normalizeBrandName(b.name), b.logoUrl);
      });
      brandLogoCache = { at: now, byName };
      return byName;
    } catch {
      // Never let a brand-logo lookup break the product screen — the card falls
      // back to the wordmark, which is what a brand with no logo shows anyway.
      return brandLogoCache?.byName ?? new Map<string, string | undefined>();
    } finally {
      brandLogoInFlight = null;
    }
  })();

  return brandLogoInFlight;
}

type ProductDetailsRouteProp = RouteProp<{
  ProductDetails: { productId: string };
}, 'ProductDetails'>;

// Tenant type from tenants/{tenantId}
type Tenant = {
  storeName?: string;
  storeNameAr?: string;
  storeNameKu?: string;
  phone?: string;
  whatsapp?: string;
  ownerUid?: string; // Admin UID who owns this tenant
  settings?: Record<string, any>;
};

// Location type from locations collection
type StoreLocation = {
  id: string;
  name?: string;
  nameAr?: string;
  nameKu?: string;
  address?: string;
  addressAr?: string;
  addressKu?: string;
  city?: string;
  phone?: string;
  lat?: number;
  lng?: number;
  type?: 'main' | 'branch' | string;
  isActive?: boolean;
  createdByAdminId?: string;
  tenantId?: string;
};

// Combined store info for UI - Alibaba-style Store Card
type StoreDisplayInfo = {
  storeName?: string;
  storeNameAr?: string;
  storeNameKu?: string;
  logoUrl?: string;
  isVerified?: boolean;
  phone?: string;
  whatsapp?: string;
  city?: string;
  addressText?: string;
  addressTextAr?: string;
  addressTextKu?: string;
  location?: { lat: number; lng: number };
  tenantId?: string; // For "View Store" navigation
};

/**
 * PRODUCT DETAILS SCREEN - GOLDEN TEMPLATE
 *
 * Architecture:
 * SafeAreaView (edges: ['top','left','right'])
 *  └── View (flex: 1)
 *      ├── KeyboardAvoidingView
 *      │    └── ScrollView (SINGLE vertical scroll owner)
 *      │         └── paddingBottom for bottom bar
 *      └── Sticky Bottom Bar (OUTSIDE KeyboardAvoidingView)
 *
 * Rules enforced:
 * size max be limit 
 * to one insert of the size cold 
 \
 * badge counter flex local to max 
 * - ONE vertical scroll owner
 * - NO fixed heights (aspectRatio only)
 * - NO layout animations
 * - Guest can add to cart freely
 * - Bottom bar outside scroll, scroll padded for it
 */
export const ProductDetailsScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const route = useRoute<ProductDetailsRouteProp>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { addToCart, addVariationsToCart, getCartItemCount } = useCart();
  const { user, isVip } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites(); // FIXED: Add missing hook
  const { currency: currentCurrency, exchangeRateIQD } = useCurrency();

  const scrollViewRef = useRef<ScrollView>(null); // FIXED: Add missing ref
  const imageRef = useRef<View>(null); // FIXED: Add missing ref

  const { productId } = route.params ?? {};

  // State
  const [product, setProduct] = useState<Product | null>(null);
  // Monotonic id for product loads — see the effect that calls loadProductData.
  const loadReqIdRef = useRef(0);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  // A failed fetch is not the same as a deleted product: without this the catch
  // below fell through to the "not found" screen, which offers no way to retry.
  const [loadError, setLoadError] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const [qtyText, setQtyText] = useState('1');
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const [loginModalVisible, setLoginModalVisible] = useState(false);
  const [startOrderVisible, setStartOrderVisible] = useState(false);
  const [addToCartSheetVisible, setAddToCartSheetVisible] = useState(false);

  // GOLDEN TEMPLATE: Optional cosmetic selections (NOT variants)
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  // Storage/capacity selection (e.g. iPhone 256GB / 512GB / 1TB)
  const [selectedStorageId, setSelectedStorageId] = useState<string | null>(null);

  // ALIBABA VARIATION: Per-size quantity selection (Map<variationId, quantity>)
  const [variationQuantities, setVariationQuantities] = useState<Record<string, number>>({});
  const [variationQtyTexts, setVariationQtyTexts] = useState<Record<string, string>>({});

  // Store Info State
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [storeInfo, setStoreInfo] = useState<StoreDisplayInfo | null>(null);
  const [storeInfoLoading, setStoreInfoLoading] = useState(false);
  const [storeExpanded, setStoreExpanded] = useState(true); // Start expanded like Alibaba

  // ALIBABA VARIATION: Per-color quantity selection (Map<variationId, quantity>)
  const [colorVariationQuantities, setColorVariationQuantities] = useState<Record<string, number>>({});
  const [colorVariationQtyTexts, setColorVariationQtyTexts] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);

  // Logo for this product's brand, when the admin uploaded one in Brand Manager.
  // undefined = no logo (card draws the wordmark instead).
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | undefined>(undefined);

  const isProductFavorite = isFavorite(productId);

  // Helper to get translated category name
  const translateCategory = React.useCallback((productObj: Product | undefined) => {
    if (!productObj || !productObj.category) return '';
    const categoryName = productObj.category;
    if (categoryName === t('categories.all')) return categoryName;

    // Remove spaces and lowercase to build the key
    const translationKey = categoryName.toLowerCase().replace(/\s+/g, '');
    const fallback = t(`categories.${translationKey}`);

    // 1. If i18next successfully resolved the translation, use it OVER database fields for core categories
    if (fallback !== `categories.${translationKey}`) {
      return fallback;
    }

    // 2. Otherwise use database localized names if available (for custom categories)
    if (i18n.language === 'ar' && productObj.categoryAr && productObj.categoryAr.trim() !== '') {
      return productObj.categoryAr;
    }
    if (i18n.language === 'ku' && productObj.categoryKu && productObj.categoryKu.trim() !== '') {
      return productObj.categoryKu;
    }

    // 3. Otherwise return original english name
    return categoryName;
  }, [t, i18n.language]);

  // Load product data.
  //
  // productId genuinely changes on a MOUNTED instance: ProductDetails is registered
  // as a top-level linking route (product/:productId) and React Navigation v7 reuses
  // the focused route and replaces its params when navigating to the same route
  // name, so opening a shared product link while this screen is up swaps the id in
  // place. The effect then refires and can resolve out of order — a cached hit for
  // the new id can land before a cold round trip for the old one, leaving the
  // previous product's name, price, stock and images rendered under the new id.
  // Hence a monotonic request id rather than a boolean.
  useEffect(() => {
    const requestId = ++loadReqIdRef.current;
    loadProductData(requestId);
    // Invalidate anything still in flight when the id changes or we unmount.
    return () => { loadReqIdRef.current++; };
  }, [productId]);

  // GOLDEN TEMPLATE: Reset options when product changes
  useEffect(() => {
    setSelectedSize(null);
    setQuantity(1);
    setQtyText('1');
    setSelectedImageIndex(0);

  // ALIBABA VARIATION: Reset variation quantities
    setVariationQuantities({});
    setColorVariationQuantities({});
    
    // Reset ready state for smooth transition
    setReady(false);
  }, [productId]);

  // GOLDEN PERFORMANCE: Defer heavy rendering until after transition
  useEffect(() => {
    const task = requestAnimationFrame(() => {
      setReady(true);
    });
    return () => cancelAnimationFrame(task);
  }, [productId]);

  // Resolve the brand logo for the brand card. Clears first so a product with no
  // matching brand can't inherit the previous product's logo when the route param
  // is swapped in place (see the load effect above).
  useEffect(() => {
    const brand = product?.brand?.trim();
    setBrandLogoUrl(undefined);
    if (!brand) return;

    let cancelled = false;
    getBrandLogoMap(Date.now()).then(byName => {
      if (cancelled) return;
      setBrandLogoUrl(byName.get(normalizeBrandName(brand)));
    });
    return () => { cancelled = true; };
  }, [product?.brand]);

  // GOLDEN TEMPLATE: Toggle functions with trim normalization
  const toggleColor = (color: string) => {
    const normalized = color.trim();
    setSelectedColor(prev => (prev === normalized ? null : normalized));
  };

  const toggleSize = (size: string) => {
    const normalized = size.trim();
    setSelectedSize(prev => (prev === normalized ? null : normalized));
  };

  // ALIBABA VARIATION: Update quantity for a specific variation
  /**
   * Storage/size is a single choice: picking one clears the rest, and tapping the
   * selected card again deselects it — the same behaviour as the colour swatches.
   * Writes into the same variationQuantities map that pricing and the cart already
   * read, so no downstream code changed.
   */
  const selectSizeVariation = (variationId: string) => {
    setVariationQuantities((prev) => ((prev[variationId] || 0) > 0 ? {} : { [variationId]: 1 }));
  };

  const updateVariationQuantity = (variationId: string, delta: number) => {
    if (!product?.variations) return;

    const variation = product.variations.find(v => v.variationId === variationId);
    if (!variation) return;

    setVariationQuantities(prev => {
      const currentQty = prev[variationId] || 0;
      const newQty = Math.max(0, Math.min(currentQty + delta, variation.stockQuantity));
      setVariationQtyTexts(tPrev => ({ ...tPrev, [variationId]: String(newQty) }));
      return { ...prev, [variationId]: newQty };
    });
  };

  const handleVariationExact = (variationId: string, value: string, maxStock: number) => {
    const cleaned = value.replace(/[^0-9]/g, '');
    setVariationQtyTexts(prev => ({ ...prev, [variationId]: cleaned }));
    
    if (cleaned.length > 0) {
      const num = parseInt(cleaned, 10);
      if (num > maxStock) {
        setVariationQuantities(prev => ({ ...prev, [variationId]: maxStock }));
        setVariationQtyTexts(prev => ({ ...prev, [variationId]: String(maxStock) }));
      } else if (num >= 0) {
        setVariationQuantities(prev => ({ ...prev, [variationId]: num }));
      }
    }
  };

  const handleVariationBlur = (variationId: string, maxStock: number) => {
    setVariationQtyTexts(prev => {
      const currentText = prev[variationId] || '';
      const num = parseInt(currentText, 10);
      if (isNaN(num) || num <= 0) {
        setVariationQuantities(qPrev => {
          const copy = { ...qPrev };
          delete copy[variationId];
          return copy;
        });
        return { ...prev, [variationId]: '0' };
      } else if (num > maxStock) {
        setVariationQuantities(qPrev => ({ ...qPrev, [variationId]: maxStock }));
        return { ...prev, [variationId]: String(maxStock) };
      } else {
        setVariationQuantities(qPrev => ({ ...qPrev, [variationId]: num }));
        return { ...prev, [variationId]: String(num) };
      }
    });
  };

  // ALIBABA VARIATION: Get total quantity of all selected variations
  const getTotalVariationQuantity = (): number => {
    return Object.values(variationQuantities).reduce((sum, qty) => sum + qty, 0);
  };

  // ALIBABA VARIATION: Update quantity for a specific color variation
  const updateColorVariationQuantity = (variationId: string, delta: number) => {
    if (!product?.colorVariations) return;

    const variation = product.colorVariations.find(v => v.variationId === variationId);
    if (!variation) return;

    setColorVariationQuantities(prev => {
      const currentQty = prev[variationId] || 0;
      const newQty = Math.max(0, Math.min(currentQty + delta, variation.stockQuantity));
      setColorVariationQtyTexts(tPrev => ({ ...tPrev, [variationId]: String(newQty) }));
      return { ...prev, [variationId]: newQty };
    });
  };

  const handleColorVariationExact = (variationId: string, value: string, maxStock: number) => {
    const cleaned = value.replace(/[^0-9]/g, '');
    setColorVariationQtyTexts(prev => ({ ...prev, [variationId]: cleaned }));
    
    if (cleaned.length > 0) {
      const num = parseInt(cleaned, 10);
      if (num > maxStock) {
        setColorVariationQuantities(prev => ({ ...prev, [variationId]: maxStock }));
        setColorVariationQtyTexts(prev => ({ ...prev, [variationId]: String(maxStock) }));
      } else if (num >= 0) {
        setColorVariationQuantities(prev => ({ ...prev, [variationId]: num }));
      }
    }
  };

  const handleColorVariationBlur = (variationId: string, maxStock: number) => {
    setColorVariationQtyTexts(prev => {
      const currentText = prev[variationId] || '';
      const num = parseInt(currentText, 10);
      if (isNaN(num) || num <= 0) {
        setColorVariationQuantities(qPrev => {
          const copy = { ...qPrev };
          delete copy[variationId];
          return copy;
        });
        return { ...prev, [variationId]: '0' };
      } else if (num > maxStock) {
        setColorVariationQuantities(qPrev => ({ ...qPrev, [variationId]: maxStock }));
        return { ...prev, [variationId]: String(maxStock) };
      } else {
        setColorVariationQuantities(qPrev => ({ ...qPrev, [variationId]: num }));
        return { ...prev, [variationId]: String(num) };
      }
    });
  };

  // ALIBABA VARIATION: Get total quantity of all selected color variations
  const getTotalColorVariationQuantity = (): number => {
    return Object.values(colorVariationQuantities).reduce((sum, qty) => sum + qty, 0);
  };

  // ALIBABA VARIATION: Handle batch add to cart (Size AND Color)
  const handleVariationAddToCart = async (): Promise<boolean> => {
    // Collect size selections
    const sizeSelections = (product?.variations || [])
      .filter(v => (variationQuantities[v.variationId] || 0) > 0)
      .map(v => ({
        variationId: v.variationId,
        sizeValue: v.sizeValue,
        sizeUnit: v.sizeUnit,
        quantity: variationQuantities[v.variationId] || 0,
        priceUSD: v.priceUSD,
      }));

    // Collect color selections
    const colorSelections = (product?.colorVariations || [])
      .filter(v => (colorVariationQuantities[v.variationId] || 0) > 0)
      .map(v => ({
        variationId: v.variationId,
        colorValue: v.colorValue,
        quantity: colorVariationQuantities[v.variationId] || 0,
        priceUSD: undefined, // Colors usually don't override price, but could
      }));

    const allSelections = [...sizeSelections, ...colorSelections];

    if (allSelections.length === 0) return false;

    try {
      setAddingToCart(true);
      await addVariationsToCart(product!, allSelections);
      
      // Reset quantities
      setVariationQuantities({});
      setColorVariationQuantities({});
      
      // ALIBABA: Silent success or toast? Using silent for now as logic implies
      return true;
    } catch (error) {
      Alert.alert(t('errors.error'), t('cart.failedToAddItem'));
      return false;
    } finally {
      setAddingToCart(false);
    }
  };

  // =================================================================
  // STORE INFO HELPERS
  // =================================================================

  /**
   * Load the seller's store profile for the store card.
   *
   * The profile lives on the `tenants` row (see update_schema_store_profile.sql).
   * This used to query a `store_profiles` table that does not exist in this project,
   * so the lookup failed for every product and the whole card rendered empty; the
   * fallback then read camelCase keys off a raw snake_case row, losing the address.
   * Both reads now go through the services that own those tables.
   */
  const loadStoreInfo = async (tid: string) => {
    try {
      setStoreInfoLoading(true);

      const [profile, contact] = await Promise.all([
        storeProfileService.getStoreProfile(tid),
        // Covers tenants whose phone/WhatsApp still only exist in the legacy
        // business_info blob rather than the top-level columns.
        getTenantContactInfo(tid),
      ]);

      // Stores that never filled in the Store Profile address keep it on their
      // `store_locations` branch row instead.
      const needsBranch = !profile?.addressText || !profile?.city || !profile?.location;
      const branch = needsBranch ? await getTenantPrimaryLocation(tid) : null;

      if (!profile && !branch) {
        setStoreInfo(null);
        return;
      }

      // Coerced: tenants.location is jsonb, so a coordinate written as a string
      // would silently hide the Directions button.
      const lat = Number(profile?.location?.latitude ?? branch?.latitude);
      const lng = Number(profile?.location?.longitude ?? branch?.longitude);

      const displayInfo: StoreDisplayInfo = {
        storeName: profile?.storeName || branch?.name,
        storeNameAr: profile?.storeNameAr || branch?.nameAr,
        storeNameKu: profile?.storeNameKu || branch?.nameKu,
        logoUrl: profile?.logoUrl,
        isVerified: profile?.isVerified,
        phone: profile?.phone || contact.phone || branch?.phone,
        // Digits only: whatsapp:// rejects a leading "+" (it decodes to a space).
        whatsapp: (profile?.whatsapp || contact.whatsapp || profile?.phone || branch?.phone)?.replace(/[^0-9]/g, ''),
        city: profile?.city || branch?.city,
        addressText: profile?.addressText || branch?.address || branch?.name,
        addressTextAr: profile?.addressTextAr || branch?.addressAr || branch?.nameAr,
        addressTextKu: profile?.addressTextKu || branch?.addressKu || branch?.nameKu,
        location: (Number.isFinite(lat) && Number.isFinite(lng)) ? { lat, lng } : undefined,
        tenantId: tid,
      };

      setStoreInfo(displayInfo);
    } catch (e) {
      // Silent fail - hide store section
      setStoreInfo(null);
    } finally {
      setStoreInfoLoading(false);
    }
  };
  
  /**
   * Open Google Maps navigation to store coordinates
   */
  const openMapToStore = (loc?: { lat: number; lng: number }) => {
    if (!loc?.lat || !loc?.lng) {
      Alert.alert(t('common.error', 'Error'), t('product.noLocation', 'No location available'));
      return;
    }
    // Use directions API for navigation
    const url = `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`;
    Linking.openURL(url).catch(() =>
      Alert.alert(t('common.error', 'Error'), t('product.cantOpenMaps', 'Could not open maps'))
    );
  };
  
  /**
   * Call seller phone
   */
  const callSeller = (phone?: string) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() =>
      Alert.alert(t('common.error', 'Error'), t('product.cantCall', 'Could not open phone'))
    );
  };
  
  /**
   * Open WhatsApp chat with seller
   */
  const whatsappSeller = (phone?: string) => {
    if (!phone) return;
    const msg = t('product.whatsappMsg', 'Hello, I have a question about this product.');
    const url = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(msg)}`;
    Linking.openURL(url).catch(() =>
      Alert.alert(t('common.error', 'Error'), t('product.noWhatsApp', 'WhatsApp is not installed'))
    );
  };

  const loadProductData = async (requestId: number) => {
    const isLatest = () => requestId === loadReqIdRef.current;

    // Guard against a missing/empty productId (e.g. a malformed deep link or a
    // navigate('ProductDetails') without params). Fall through to the "not found"
    // branch instead of fetching with an undefined id.
    if (!productId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setLoadError(false);

      // Fetch product directly by ID from the `parts` table (mapped snake_case→camelCase).
      const product = await ProductService.getProduct(productId);
      if (!isLatest()) return;

      if (!product) {
        // getProduct returns null (it does not throw) for a deleted row. Without the
        // guard above, opening a product that the seller has since deleted and then
        // navigating back popped a context-free "Product not found" alert over
        // whatever screen the user had returned to.
        Alert.alert(t('errors.error'), t('errors.productNotFound'));
        if (navigation.canGoBack()) {
            navigation.goBack();
        } else {
            navigation.navigate('Home' as never);
        }
        return;
      }

      // Apply category-based image fallback
      product.imageUrls = getProductImageUrls({
        imageUrls: product.imageUrls,
        category: product.category,
      });

      setProduct(product);
      setLoading(false); // <--- UNBLOCK UI HERE (Main Content Ready)

      // Load Store Info using product's tenantId
      const tid = product.tenantId ?? null;
      setTenantId(tid);
      setStoreExpanded(true); // Start expanded

      if (tid) {
        loadStoreInfo(tid);
      } else {
        setStoreInfo(null);
      }

      // Fetch related products in background (same category). Note this is still in
      // flight after setLoading(false) above by design, so it stays pending for the
      // whole interactive window — all the more reason to re-check before writing.
      try {
        if (product.category) {
          const relatedAll = await ProductService.getProductsByCategory(product.category);
          if (!isLatest()) return;
          const related = relatedAll
            .filter((p) => p.id !== productId)
            .slice(0, 10)
            .map((p) => ({
              ...p,
              imageUrls: getProductImageUrls({ imageUrls: p.imageUrls, category: p.category }),
            }));
          setRelatedProducts(related);
        } else {
          setRelatedProducts([]);
        }
      } catch (e) {
        if (!isLatest()) return;
        setRelatedProducts([]);
      }
      } catch (error: any) {
        if (!isLatest()) return;
        console.error('Error loading product:', error);
        setLoadError(true);
        setLoading(false); // Ensure loading is disabled on error
    }
  };

  // GOLDEN TEMPLATE: Guest CAN add to cart - no auth blocking
  // GOLDEN FIX: Include selectedOptions when adding to cart
  // ALIBABA PATTERN: Silent add-to-cart, no confirmation dialog
  const handleAddToCart = async (): Promise<boolean> => {
    if (!product) return false;

    try {
      setAddingToCart(true);

      // ALIBABA: Fly-to-cart animation from product image
      const imageUrl = product.imageUrls?.[0];
      if (imageUrl) {
        imageRef.current?.measureInWindow((x, y, w, h) => {
          if (w > 0 && h > 0) {
            try {
              const { flyToCart } = require('../ui/FlyToCartLayer');
              // Center the 40x40 flying image
              flyToCart(imageUrl, x + w / 2 - 20, y + h / 2 - 20);
            } catch {
              // Silently ignore if FlyToCartLayer is unavailable
            }
          }
        });
      }

      // Build selectedOptions object (only include properties that have values)
      const storageLabel = storageOptions.find((s) => s.id === effectiveStorageId && s.priceDelta >= 0)?.label;
      const selectedOptions: { color?: string; size?: string; storage?: string } | undefined =
        effectiveColor || selectedSize || (storageLabel && storageOptions.length > 0)
          ? {
              ...(effectiveColor && { color: effectiveColor }),
              ...(selectedSize && { size: selectedSize }),
              ...(storageOptions.length > 0 && storageLabel && { storage: storageLabel }),
            }
          : undefined;

      // Bake the storage price delta into the cart line so it's charged correctly.
      const productForCart = storageDelta > 0
        ? {
            ...product,
            priceUSD: product.priceUSD + storageDelta,
            vipPriceUSD: typeof product.vipPriceUSD === 'number' ? product.vipPriceUSD + storageDelta : undefined,
          }
        : product;

      await addToCart(product.id, quantity, productForCart, selectedOptions);

      // ALIBABA: Silent success - no confirmation dialog
      // Cart badge update provides sufficient feedback
      return true;
    } catch (error: any) {
      if (error.message !== 'DIFFERENT_TENANT') {
        Alert.alert(t('errors.error'), t('cart.failedToAddItem'));
      }
      return false;
    } finally {
      setAddingToCart(false);
    }
  };

  const handleShare = async () => {
    if (!product) return;

    try {
      // Only link out once a real domain exists. This used to interpolate
      // BRAND.domain's placeholder directly, so every share sent the recipient
      // "https://ASANKARY_DOMAIN_TBD/product/<id>" — a link that cannot resolve.
      const domain = brandContact(BRAND.domain);
      const shareUrl = domain ? `https://${domain}/product/${product.id}` : null;

      // partNumber is optional on a product; without the guard an unset one
      // shares the literal "undefined" after the name.
      const heading = [product.name, product.partNumber].filter(Boolean).join(' - ');

      await Share.share({
        message: [
          heading,
          formatItemPrice(product, currentCurrency as any, exchangeRateIQD),
          '',
          t('product.shareText'),
          shareUrl,
        ].filter(line => line !== null && line !== undefined).join('\n'),
        url: product.imageUrls?.[0],
      });
    } catch (error) {
      // Silent fail
    }
  };

  const handleFavorite = () => {
    toggleFavorite(productId);
  };

  // Stable callback for related products navigation
  const handleRelatedProductPress = React.useCallback((productId: string) => {
    // Force push to same screen component
    navigation.push('ProductDetails', { productId });
  }, [navigation]);

  // Handle related product add to cart


  const updateQuantity = (delta: number) => {
    // Must clamp against the SAME ceiling the +/- buttons and the text input gate on
    // (effective stock = main + size + colour), not product.stockQty alone. They
    // diverge for a product that has storageOptions AND colourVariations: the has*
    // flags are suppressed by hasStorageOptions so the plain stepper renders, while
    // stockQty is 0 for variation products. The + button then looked enabled
    // (1 >= 15 is false) but clamped to `0 || 1` = 1, so quantity was frozen at 1
    // while typing into the adjacent box worked — the two controls contradicted each
    // other and the customer could not buy more than one.
    const sizeStockNow = product?.variations?.reduce((sum, v) => sum + (Number(v?.stockQuantity) || 0), 0) || 0;
    const colorStockNow = product?.colorVariations?.reduce((sum, v) => sum + (Number(v?.stockQuantity) || 0), 0) || 0;
    const maxStockNow = ((Number(product?.stockQty) || 0) + sizeStockNow + colorStockNow) || 1;

    const newQuantity = Math.max(1, Math.min(quantity + delta, maxStockNow));
    setQuantity(newQuantity);
    setQtyText(String(newQuantity));
  };



  // =================================================================
  // ALIBABA: Skeleton Loading (static, no shimmer)
  // Matches real layout to prevent layout shift
  // =================================================================
  if (loading) {
    const skeletonOpacity = isDark ? 0.2 : 0.12;
    const skeletonColor = theme.colors.text;

    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={['top', 'left', 'right']}
      >
        {/* Skeleton: Image Gallery */}
        <View
          style={[
            styles.imageGallery,
            { backgroundColor: skeletonColor, opacity: skeletonOpacity },
          ]}
        />

        {/* Skeleton: Product Info */}
        <View style={styles.infoContainer}>
          {/* Name */}
          <View
            style={[
              styles.skeletonText,
              {
                width: '80%',
                height: 24,
                backgroundColor: skeletonColor,
                opacity: skeletonOpacity,
              },
            ]}
          />
          {/* Part Number */}
          <View
            style={[
              styles.skeletonText,
              {
                width: '50%',
                height: 16,
                marginTop: 8,
                backgroundColor: skeletonColor,
                opacity: skeletonOpacity,
              },
            ]}
          />
          {/* Price */}
          <View
            style={[
              styles.skeletonText,
              {
                width: '40%',
                height: 28,
                marginTop: 12,
                backgroundColor: skeletonColor,
                opacity: skeletonOpacity,
              },
            ]}
          />
          {/* Stock Badge */}
          <View
            style={[
              styles.skeletonText,
              {
                width: '30%',
                height: 24,
                marginTop: 8,
                backgroundColor: skeletonColor,
                opacity: skeletonOpacity,
                borderRadius: 12,
              },
            ]}
          />

          {/* Quantity Section */}
          <View
            style={[
              styles.skeletonText,
              {
                width: '30%',
                height: 18,
                marginTop: 24,
                backgroundColor: skeletonColor,
                opacity: skeletonOpacity,
              },
            ]}
          />
          <View style={{ flexDirection: 'row', marginTop: 12, alignItems: 'center' }}>
            <View style={[styles.skeletonCircle, { backgroundColor: skeletonColor, opacity: skeletonOpacity }]} />
            <View
              style={[
                styles.skeletonText,
                {
                  width: 40,
                  height: 18,
                  marginHorizontal: 16,
                  backgroundColor: skeletonColor,
                  opacity: skeletonOpacity,
                },
              ]}
            />
            <View style={[styles.skeletonCircle, { backgroundColor: skeletonColor, opacity: skeletonOpacity }]} />
          </View>

          {/* Description Section */}
          <View
            style={[
              styles.skeletonText,
              {
                width: '40%',
                height: 18,
                marginTop: 24,
                backgroundColor: skeletonColor,
                opacity: skeletonOpacity,
              },
            ]}
          />
          <View
            style={[
              styles.skeletonText,
              {
                width: '100%',
                height: 14,
                marginTop: 8,
                backgroundColor: skeletonColor,
                opacity: skeletonOpacity,
              },
            ]}
          />
          <View
            style={[
              styles.skeletonText,
              {
                width: '90%',
                height: 14,
                marginTop: 4,
                backgroundColor: skeletonColor,
                opacity: skeletonOpacity,
              },
            ]}
          />
          <View
            style={[
              styles.skeletonText,
              {
                width: '95%',
                height: 14,
                marginTop: 4,
                backgroundColor: skeletonColor,
                opacity: skeletonOpacity,
              },
            ]}
          />

          {/* Specs Section */}
          <View
            style={[
              styles.skeletonText,
              {
                width: '40%',
                height: 18,
                marginTop: 24,
                backgroundColor: skeletonColor,
                opacity: skeletonOpacity,
              },
            ]}
          />
          <View style={[styles.skeletonSpec, { backgroundColor: skeletonColor, opacity: skeletonOpacity }]} />
          <View style={[styles.skeletonSpec, { backgroundColor: skeletonColor, opacity: skeletonOpacity }]} />
          <View style={[styles.skeletonSpec, { backgroundColor: skeletonColor, opacity: skeletonOpacity }]} />

          {/* Related Products Section */}
          <View
            style={[
              styles.skeletonText,
              {
                width: '50%',
                height: 18,
                marginTop: 24,
                backgroundColor: skeletonColor,
                opacity: skeletonOpacity,
              },
            ]}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
            {[1, 2, 3].map(i => (
              <View key={i} style={styles.skeletonRelatedCard}>
                <View
                  style={[
                    styles.skeletonRelatedImage,
                    { backgroundColor: skeletonColor, opacity: skeletonOpacity },
                  ]}
                />
                <View
                  style={[
                    styles.skeletonText,
                    {
                      width: '70%',
                      height: 12,
                      marginTop: 8,
                      backgroundColor: skeletonColor,
                      opacity: skeletonOpacity,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.skeletonText,
                    {
                      width: '40%',
                      height: 12,
                      marginTop: 4,
                      backgroundColor: skeletonColor,
                      opacity: skeletonOpacity,
                    },
                  ]}
                />
              </View>
            ))}
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <Ionicons name="cloud-offline-outline" size={64} color={theme.colors.error} />
        <Text allowFontScaling={false} style={[styles.errorText, { color: theme.colors.text }]}>{t('errors.failedToLoadProduct')}</Text>
        <Text allowFontScaling={false} style={[styles.errorText, { color: theme.colors.textSecondary, fontSize: 14 }]}>{t('search.loadErrorSubtitle')}</Text>
        <Button
          title={t('common.retry')}
          onPress={() => loadProductData(++loadReqIdRef.current)}
          style={{ marginTop: SPACING.lg }}
        />
        <Button
          title={t('common.goBack', 'Go Back')}
          variant="outline"
          onPress={() => {
            if (navigation.canGoBack()) {
                navigation.goBack();
            } else {
                navigation.navigate('Home' as never);
            }
          }}
          style={{ marginTop: SPACING.sm }}
        />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <Ionicons name="alert-circle-outline" size={64} color={theme.colors.error} />
        <Text allowFontScaling={false} style={[styles.errorText, { color: theme.colors.text }]}>{t('product.notFound')}</Text>
        <Button
          title={t('common.goBack', 'Go Back')}
          onPress={() => {
            if (navigation.canGoBack()) {
                navigation.goBack();
            } else {
                navigation.navigate('Home' as never);
            }
          }}
          style={{ marginTop: SPACING.lg }}
        />
      </View>
    );
  }

  const isRTL = i18n?.language ? getDirection(i18n.language) === 'rtl' : false;

  // Same fallback chain the product name uses. The admin saves description_ar /
  // description_ku and the service maps them, but every render site read the English
  // column, so Arabic and Kurdish shoppers got an English description on a fully
  // translated page.
  const localizedDescription =
    i18n.language === 'ar' && product.descriptionAr?.trim()
      ? product.descriptionAr
      : i18n.language === 'ku' && product.descriptionKu?.trim()
      ? product.descriptionKu
      : product.description;

  // Store card display values (same localisation fallback as the product name).
  const storeDisplayName =
    (i18n.language === 'ar' && storeInfo?.storeNameAr?.trim()
      ? storeInfo.storeNameAr
      : i18n.language === 'ku' && storeInfo?.storeNameKu?.trim()
      ? storeInfo.storeNameKu
      : storeInfo?.storeName) || '';
  const storeAddress =
    i18n.language === 'ar' && storeInfo?.addressTextAr?.trim()
      ? storeInfo.addressTextAr
      : i18n.language === 'ku' && storeInfo?.addressTextKu?.trim()
      ? storeInfo.addressTextKu
      : storeInfo?.addressText;
  const storeAddressLine = [storeInfo?.city, storeAddress].filter(Boolean).join(' · ');
  const hasStoreCard = !!(storeDisplayName || storeAddressLine || storeInfo?.phone || storeInfo?.whatsapp);

  // Stock from product - SUM all potential stock sources
  // This addresses user report: "out of stock just out of stock happen when there is no any stock of color , size , main"
  const sizeStock = product.variations?.reduce((sum, v) => sum + (v.stockQuantity || 0), 0) || 0;
  const colorStock = product.colorVariations?.reduce((sum, v) => sum + (v.stockQuantity || 0), 0) || 0;
  
  const effectiveStock = (product.stockQty || 0) + sizeStock + colorStock;

  const inStock = effectiveStock > 0;
  const maxStock = effectiveStock || 1;

  // ======================================================
  // Alibaba-style bottom bar helpers
  // ======================================================
  // Storage-option (phone-style) products use the simple single-select selector and
  // behave as a normal product for quantity/total — NOT the per-colour wholesale grid.
  // Which variant UI this product gets. Declared here because the bottom-bar quantity
  // maths below depends on it.
  //
  // The consumer selector (single-select colour swatches + storage chips) used to be
  // gated on storageOptions existing, so a phone with colours but no storage rows fell
  // through to the Alibaba per-colour quantity table — a bulk-ordering matrix shown to
  // someone buying one handset. Storage often lives only in the description text, so
  // that gate decided the entire purchase UX on a data-entry detail.
  //
  // The table exists for genuine bulk buying, so it keys on the actual bulk signal this
  // schema has: quantity-based price tiers. Everything else gets the consumer flow.
  const isBulkProduct = (product.priceTiers?.length ?? 0) > 0;
  const hasColorVariants = !!(product.colorVariations && product.colorVariations.length > 0);
  const showConsumerColors = hasColorVariants && !isBulkProduct;
  const showBulkColorTable = isBulkProduct && hasColorVariants;

  const hasStorageOptions = !!(product.storageOptions && product.storageOptions.length > 0);
  const hasSizeVariations = !hasStorageOptions && !!(product.variations && product.variations.length > 0);
  // NOTE: "does the per-colour quantity grid drive the total", not "does this product
  // have colours". Retail colour products use the plain quantity stepper instead.
  const hasColorVariations = !hasStorageOptions && showBulkColorTable;
  const variationTotalQty = hasSizeVariations ? getTotalVariationQuantity() : 0;
  const colorVariationTotalQty = hasColorVariations ? getTotalColorVariationQuantity() : 0;
  const totalSelectedQty = variationTotalQty + colorVariationTotalQty;

  // If user selected variation quantities, price based on total variation qty.
  // If NO variations exist, use main quantity selector.
  // If variations exist but user hasn't selected any, use 0 (or fallback to 1 for unit price lookup, but total is 0)
  const activeQtyForPricing = (hasSizeVariations || hasColorVariations) 
    ? (totalSelectedQty > 0 ? totalSelectedQty : 0)
    : quantity;

  // For unit price lookup, use at least 1 to show correct tier
  const pricingQty = activeQtyForPricing > 0 ? activeQtyForPricing : 1;

  // Calculate the tiered unit price based on the total quantity (for wholesale pricing).
  // isVip now comes from AuthContext (honours the demo "Preview as VIP" toggle).
  // Uses getEffectiveUnitPrice directly so a flat VIP price is always honoured.
  const tieredUnitPrice = getEffectiveUnitPrice(product, pricingQty, isVip);
  // Hero "from" unit price (qty 1), VIP-aware; storage delta added in the render.
  // Uses the flat-VIP-aware helper directly (same path as the product cards).
  const heroUnitPrice = getDisplayUnitPrice(product, isVip);
  // VIP pricing is visible ONLY to VIP users — non-VIPs get no hint it exists.
  const vipActive = isVip && typeof product.vipPriceUSD === 'number' && product.vipPriceUSD > 0;
  // Storage options (capacity) — selection adds a price delta to the base price.
  const storageOptions = product.storageOptions || [];
  const effectiveStorageId = selectedStorageId ?? (storageOptions[0]?.id ?? null);

  const showConsumerVariants = showConsumerColors || storageOptions.length > 0;

  // Colour defaults to the first in-stock option, mirroring what storage already does
  // via effectiveStorageId. The bulk table made a colourless order impossible (you had
  // to enter a quantity against a specific colour); the swatch path does not, and
  // selectedColor starts null with nothing enforcing a choice — so without this a
  // customer could add a phone to the cart with no colour recorded at all.
  const effectiveColor =
    selectedColor ??
    (product.colorVariations?.find((c) => (c.stockQuantity ?? 0) > 0)?.colorValue ?? null);
  const storageDelta = storageOptions.find((s) => s.id === effectiveStorageId)?.priceDelta ?? 0;

  // Gallery images from product. When a colour with its own image is selected,
  // that image leads the gallery so the hero swaps to the chosen colour.
  //
  // MOVED DOWN, deliberately: this block used to sit ~80 lines ABOVE
  // `effectiveColor` and read it there, in the component body, before its `const`
  // ran — a temporal-dead-zone access that only fails to throw because of how the
  // bundle transpiles today. It is a crash waiting for a toolchain change, and it
  // is one of the errors `@ts-nocheck` was hiding at the top of this file.
  const selectedColorImg = effectiveColor
    ? product.colorVariations?.find((c) => c.colorValue === effectiveColor)?.imageUrl
    : undefined;
  const baseGallery = product.imageUrls || [];
  const galleryImages = selectedColorImg
    ? [selectedColorImg, ...baseGallery.filter((u) => u !== selectedColorImg)]
    : baseGallery;

  // Calculate total price:
  // - For simple products: tieredUnitPrice × quantity
  // - For variation products: sum of (variation price × qty) for each selected variation,
  //   but apply the tiered discount if total qty reaches a wholesale tier
  // Calculate total price:
  // - For simple products: tieredUnitPrice × quantity
  // - For variation products: sum of (variation price × qty) for each selected variation,
  //   but apply the tiered discount if total qty reaches a wholesale tier
  let totalPriceNumber = 0;
  let isSimpleProduct = false;
  let simpleProductQty = 0;
  let originalPriceNumber = 0; // Track original price to show savings

  if (hasSizeVariations || hasColorVariations) {
    // For variation products, calculate the sum of (variation price × qty)
    // Then apply the tiered pricing discount ratio if applicable
    let variationSubtotal = 0;

    // Sum up size variations
    if (hasSizeVariations && product.variations) {
      product.variations.forEach(variation => {
        const qty = variationQuantities[variation.variationId] || 0;
        const price = variation.priceUSD ?? product.priceUSD;
        variationSubtotal += qty * price;
      });
    }

    // Sum up color variations
    if (hasColorVariations && product.colorVariations) {
      product.colorVariations.forEach(variation => {
        const qty = colorVariationQuantities[variation.variationId] || 0;
        const price = variation.priceUSD ?? product.priceUSD;
        variationSubtotal += qty * price;
      });
    }
    
    // The subtotal IS the original price before discount
    originalPriceNumber = variationSubtotal;

    // Apply tiered pricing discount ratio if applicable
    // If tiered price is different from base price, apply that discount ratio
    if (tieredUnitPrice !== product.priceUSD && product.priceUSD > 0) {
      const discountRatio = tieredUnitPrice / product.priceUSD;
      totalPriceNumber = variationSubtotal * discountRatio;
    } else {
      totalPriceNumber = variationSubtotal;
    }
  } else {
    // Simple product (incl. phone-style storage products) — add the storage delta.
    const qty = activeQtyForPricing > 0 ? activeQtyForPricing : 0;
    totalPriceNumber = (tieredUnitPrice + storageDelta) * qty;
    originalPriceNumber = (product.priceUSD + storageDelta) * qty;
    simpleProductQty = qty;
    isSimpleProduct = true;
  }

  // A dinar-priced product has to keep its total in dinar too. Formatting the USD
  // total instead would re-apply the rate and the 250 snap, so the total could
  // disagree with the unit price printed directly above it.
  const totalPriceText = isSimpleProduct
    ? formatLineTotal(product, isVip, currentCurrency as any, exchangeRateIQD, {}, simpleProductQty, storageDelta)
    : formatPrice(totalPriceNumber, currentCurrency as any, exchangeRateIQD);
  const savingsAmount = Math.max(0, originalPriceNumber - totalPriceNumber);
  const showSavings = savingsAmount > 0;

  // What the sticky action button displays. On a product with colour/size variations
  // nothing is selected on arrival, so totalPriceNumber is 0 and the button read
  // "Add to Cart  $0.00" on, for example, a $140 phone — which looks like a broken
  // price rather than an empty selection. Fall back to the price of a single unit
  // until the shopper picks something.
  //
  // Deliberately a separate value: totalPriceNumber stays 0 so the order and cart
  // sheets below still receive an empty selection and cannot bill for an unpicked item.
  const buttonPriceText =
    activeQtyForPricing > 0
      ? totalPriceText
      : formatUnitPrice(product, isVip, currentCurrency as any, exchangeRateIQD, {}, pricingQty, storageDelta);

  // add current selection to cart (variations if picked, else normal)
  const addCurrentSelectionToCart = async (): Promise<boolean> => {
    if (!inStock || addingToCart || (product?.status && product.status !== 'available')) return false;

    // If product has variations, require user to select at least one
    if (hasSizeVariations || hasColorVariations) {
      if (totalSelectedQty > 0) {
        return await handleVariationAddToCart();
      } else {
        // User hasn't selected any variation quantities - show alert
        Alert.alert(
          t('common.noSelection', { defaultValue: 'No Selection' }),
          t('product.selectVariationFirst', { defaultValue: 'Please select a quantity for at least one option before adding to cart.' })
        );
        return false;
      }
    }
    
    // Fallback for simple products (no variations)
    return await handleAddToCart();
  };

  const goToCart = () => {
    // TODO: change route name if yours differs (e.g. 'CartScreen')
    navigation.navigate('Cart');
  };

  const handleTotalButtonPress = async () => {
    // Flow A (retail): add the currently-selected color + storage as a single cart
    // line (handleAddToCart bakes the storage delta + does fly-to-cart). Only the
    // legacy per-size quantity table (no single-select UI) keeps the Start Order sheet.
    if (hasSizeVariations) {
      setStartOrderVisible(true);
      return;
    }
    await handleAddToCart();
  };

  // Handle add-to-cart confirmation from the Alibaba-style cart bottom sheet
  const handleAddToCartFromSheet = async (orderData: {
    quantity: number;
    paymentMethod: string;
    notes?: string;
    addressId?: string;
    variationSelections?: Array<{
      variationId: string;
      name: string;
      quantity: number;
      price: number;
      stock: number;
      // A size selection can carry the chosen colour, so one phone is one cart line.
      color?: string;
      colorVariationId?: string;
    }>;
    colorSelections?: Array<{
      variationId: string;
      name: string;
      quantity: number;
      price: number;
      stock: number;
    }>;
  }) => {
    if (!product) return;

    try {
      setAddingToCart(true);

      const hasVars = (orderData.variationSelections && orderData.variationSelections.length > 0) ||
                      (orderData.colorSelections && orderData.colorSelections.length > 0);

      if (hasVars) {
        const sizeSelections = (orderData.variationSelections || []).map(v => ({
          variationId: v.variationId,
          sizeValue: v.name,
          sizeUnit: '',
          quantity: v.quantity,
          priceUSD: v.price,
          colorValue: v.color,
          colorVariationId: v.colorVariationId,
        }));

        const colorSelectionsData = (orderData.colorSelections || []).map(v => ({
          variationId: v.variationId,
          colorValue: v.name,
          quantity: v.quantity,
          priceUSD: undefined,
        }));

        const allSelections = [...sizeSelections, ...colorSelectionsData];
        await addVariationsToCart(product, allSelections);
      } else {
        // Simple product (incl. phone-style storage products): bake the storage
        // price delta into the cart line and forward the selected cosmetic options
        // so the correct price + selection persist (mirrors handleAddToCart).
        const storageLabel = storageOptions.find((s) => s.id === effectiveStorageId && s.priceDelta >= 0)?.label;
        const selectedOptions: { color?: string; size?: string; storage?: string } | undefined =
          effectiveColor || selectedSize || (storageLabel && storageOptions.length > 0)
            ? {
                ...(effectiveColor && { color: effectiveColor }),
                ...(selectedSize && { size: selectedSize }),
                ...(storageOptions.length > 0 && storageLabel && { storage: storageLabel }),
              }
            : undefined;
        const productForCart = storageDelta > 0
          ? {
              ...product,
              priceUSD: product.priceUSD + storageDelta,
              vipPriceUSD: typeof product.vipPriceUSD === 'number' ? product.vipPriceUSD + storageDelta : undefined,
            }
          : product;
        await addToCart(product.id, orderData.quantity, productForCart, selectedOptions);
      }

      // Fly-to-cart animation
      const imageUrl = product.imageUrls?.[0];
      if (imageUrl) {
        imageRef.current?.measureInWindow((x, y, w, h) => {
          if (w > 0 && h > 0) {
            const { flyToCart } = require('../ui/FlyToCartLayer');
            flyToCart(imageUrl, x + w / 2 - 20, y + h / 2 - 20);
          }
        });
      }

      setAddToCartSheetVisible(false);
    } catch (error: any) {
      if (error.message !== 'DIFFERENT_TENANT') {
        Alert.alert(t('errors.error'), t('cart.failedToAddItem'));
      }
    } finally {
      setAddingToCart(false);
    }
  };

  // Handle order confirmation from the bottom sheet
  const handleConfirmOrder = async (orderData: {
    quantity: number;
    paymentMethod: string;
    notes?: string;
    addressId?: string;
    variationSelections?: Array<{
      variationId: string;
      name: string;
      quantity: number;
      price: number;
      stock: number;
      // A size selection can carry the chosen colour, so one phone is one cart line.
      color?: string;
      colorVariationId?: string;
    }>;
    colorSelections?: Array<{
      variationId: string;
      name: string;
      quantity: number;
      price: number;
      stock: number;
    }>;
  }) => {
    if (!product) return;

    try {
      setAddingToCart(true);

      const hasVars = (orderData.variationSelections && orderData.variationSelections.length > 0) ||
                      (orderData.colorSelections && orderData.colorSelections.length > 0);

      if (hasVars) {
        // Use the modal's local variation selections directly
        const sizeSelections = (orderData.variationSelections || []).map(v => ({
          variationId: v.variationId,
          sizeValue: v.name,
          sizeUnit: '',
          quantity: v.quantity,
          priceUSD: v.price,
          colorValue: v.color,
          colorVariationId: v.colorVariationId,
        }));

        const colorSelectionsData = (orderData.colorSelections || []).map(v => ({
          variationId: v.variationId,
          colorValue: v.name,
          quantity: v.quantity,
          priceUSD: undefined,
        }));

        const allSelections = [...sizeSelections, ...colorSelectionsData];
        await addVariationsToCart(product, allSelections);
      } else {
        // Simple product without variations (incl. phone-style storage products):
        // bake the storage price delta into the cart line and forward the selected
        // cosmetic options so the correct price + selection persist (mirrors handleAddToCart).
        const storageLabel = storageOptions.find((s) => s.id === effectiveStorageId && s.priceDelta >= 0)?.label;
        const selectedOptions: { color?: string; size?: string; storage?: string } | undefined =
          effectiveColor || selectedSize || (storageLabel && storageOptions.length > 0)
            ? {
                ...(effectiveColor && { color: effectiveColor }),
                ...(selectedSize && { size: selectedSize }),
                ...(storageOptions.length > 0 && storageLabel && { storage: storageLabel }),
              }
            : undefined;
        const productForCart = storageDelta > 0
          ? {
              ...product,
              priceUSD: product.priceUSD + storageDelta,
              vipPriceUSD: typeof product.vipPriceUSD === 'number' ? product.vipPriceUSD + storageDelta : undefined,
            }
          : product;
        await addToCart(product.id, orderData.quantity, productForCart, selectedOptions);
      }

      // Fly-to-cart animation for visual feedback
      const imageUrl = product.imageUrls?.[0];
      if (imageUrl) {
        imageRef.current?.measureInWindow((x, y, w, h) => {
          if (w > 0 && h > 0) {
            try {
              const { flyToCart } = require('../ui/FlyToCartLayer');
              flyToCart(imageUrl, x + w / 2 - 20, y + h / 2 - 20);
            } catch {}
          }
        });
      }

      setStartOrderVisible(false);
    } catch (error: any) {
      if (error.message !== 'DIFFERENT_TENANT') {
        Alert.alert(t('errors.error'), t('cart.failedToAddItem'));
      }
    } finally {
      setAddingToCart(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top', 'left', 'right']}
    >
      <StatusBar style={theme.dark ? 'light' : 'dark'} />

      <View style={{ flex: 1 }}>
        {/* Scroll area (Keyboard avoiding only for scroll content) */}
        <KeyboardAvoidingView
          style={styles.keyboardAvoid}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <ScrollView
            ref={scrollViewRef}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingBottom: CTA_BAR_HEIGHT + insets.bottom,
            }}
          >
            {/* Image Gallery - GOLDEN CAROUSEL: Alibaba-style auto-advancing */}
            <View
              ref={imageRef}
              collapsable={false}
              style={[styles.imageGallery, { backgroundColor: theme.colors.surface }]}
            >
              <GoldenCarousel
                images={galleryImages}
                videoUrl={(product as any).videoUrl || null}
                onImagePress={() => setImageModalVisible(true)}
                onIndexChange={setSelectedImageIndex}
              />

              {/* Navigation Buttons */}
              <View style={[styles.fabContainer, { top: SPACING.md, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <TouchableOpacity
                  onPress={() => {
                    // Debounce back press to preventing spamming and crashes
                    requestAnimationFrame(() => {
                        if (navigation.canGoBack()) {
                            navigation.goBack();
                        } else {
                            navigation.navigate('Home' as never);
                        }
                    });
                  }}
                  style={[styles.fabButton, { backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)' }]}
                >
                  <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={24} color="white" />
                </TouchableOpacity>

                <View style={styles.fabRight}>
                  <TouchableOpacity
                    onPress={handleFavorite}
                    style={[
                      styles.fabButton,
                      { backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)', marginRight: SPACING.sm },
                    ]}
                  >
                    <Ionicons
                      name={isProductFavorite ? 'heart' : 'heart-outline'}
                      size={24}
                      color={isProductFavorite ? theme.colors.error : 'white'}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleShare}
                    style={[styles.fabButton, { backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)', marginRight: SPACING.sm }]}
                  >
                    <Ionicons name="share-outline" size={24} color="white" />
                  </TouchableOpacity>

                  {/* Cart Icon with Badge */}
                  <TouchableOpacity
                    onPress={goToCart}
                    style={[styles.fabButton, { backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)' }]}
                  >
                    <Image 
                      source={require('../../assets/icons/order.png')} 
                      style={{ width: 22, height: 22 }}
                      contentFit="contain"
                    />
                    {getCartItemCount() > 0 && (
                      <Badge
                        size={18}
                        style={[
                          styles.cartBadge,
                          { backgroundColor: theme.colors.error }
                        ]}
                      >
                        {getCartItemCount() > 99 ? '99+' : getCartItemCount()}
                      </Badge>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Add to Cart Button - Bottom of Image */}
              <TouchableOpacity
                onPress={() => setAddToCartSheetVisible(true)}
                disabled={!inStock || addingToCart || (product.status && product.status !== 'available')}
                style={[
                  styles.fabButton, 
                  { 
                    position: 'absolute',
                    // Clear the sheet overlap, then the normal inset on top of it.
                    bottom: SHEET_OVERLAP + SPACING.md,
                    left: SPACING.md,
                    backgroundColor: inStock && (!product.status || product.status === 'available') ? theme.colors.primary : 'rgba(0,0,0,0.5)', 
                    opacity: !inStock || addingToCart || (product.status && product.status !== 'available') ? 0.6 : 1,
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }
                ]}
              >
                {addingToCart ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Ionicons name="cart" size={24} color="white" />
                )}
              </TouchableOpacity>
            </View>

            {/* Product Information */}
            <View style={[styles.infoContainer, { backgroundColor: theme.colors.card }]}>
              {/* Header Info */}
              <View style={styles.headerInfo}>
                {!!product.brand && (
                  <Text
                    allowFontScaling={false}
                    style={[styles.brandEyebrow, { color: theme.colors.primary, textAlign: isRTL ? 'right' : 'left' }]}
                  >
                    {product.brand}
                  </Text>
                )}
                <Text allowFontScaling={false}
                  style={[
                    styles.productName,
                    { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' },
                  ]}
                >
                  {i18n.language === 'ar' && product.nameAr
                    ? product.nameAr
                    : i18n.language === 'ku' && product.nameKu
                    ? product.nameKu
                    : product.name}
                </Text>

                {/* Hidden when unset — this rendered "Item Code: " with nothing after it
                    for every product the admin left blank. */}
                {!!String(product.partNumber ?? '').trim() && (
                  <Text allowFontScaling={false}
                    style={[
                      styles.partNumber,
                      { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' },
                    ]}
                  >
                    {t('product.partNumber')}: {product.partNumber}
                  </Text>
                )}

                <View style={[styles.priceRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <View style={{ flexShrink: 1 }}>
                    <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <AppNumber
                        value={formatUnitPrice(product, isVip, currentCurrency as any, exchangeRateIQD, {}, 1, storageDelta)}
                        style={[styles.price, { color: vipActive ? '#7C3AED' : theme.colors.primary }]}
                      />
                      {vipActive && (
                        <View style={{ backgroundColor: '#7C3AED', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginHorizontal: 8, marginBottom: 4 }}>
                          <Text allowFontScaling={false} style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 11, letterSpacing: 0.5 }}>VIP</Text>
                        </View>
                      )}
                      {/* Gated and computed through pricingUtils, same as the grid
                          cards. The old inline formula divided by priceUSD, so a VIP
                          saw one Save% on the card and a different one here. */}
                      {hasCompareAtDiscount(product, isVip) && (
                        <AppNumber
                          value={formatPrice(product.compareAtPriceUSD as number, currentCurrency as any, exchangeRateIQD)}
                          style={[styles.comparePrice, { color: theme.colors.textSecondary }]}
                        />
                      )}
                    </View>
                    {hasCompareAtDiscount(product, isVip) && (
                      <View style={[styles.saveBadge, { alignSelf: isRTL ? 'flex-end' : 'flex-start' }]}>
                        <Text allowFontScaling={false} style={styles.saveBadgeText}>
                          {t('product.save', { defaultValue: 'Save' })} {getDiscountPercent(product, isVip)}%
                        </Text>
                      </View>
                    )}
                  </View>

                  <View
                    style={[
                      styles.stockBadge,
                      {
                        backgroundColor:
                          product.status === 'on_the_way'
                            ? '#2196F320'
                            : product.status === 'coming_soon'
                            ? '#FF980020'
                            : inStock
                            ? theme.colors.success + '20'
                            : theme.colors.error + '20',
                        flexDirection: isRTL ? 'row-reverse' : 'row',
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.stockDot,
                        {
                          backgroundColor:
                            product.status === 'on_the_way'
                              ? '#2196F3'
                              : product.status === 'coming_soon'
                              ? '#FF9800'
                              : inStock
                              ? theme.colors.success
                              : theme.colors.error,
                        },
                      ]}
                    />

                    <AppText
                      fontSize={14}
                      numberOfLines={1}
                      adjustsFontSizeToFit={false}
                      style={[
                        styles.stockText,
                        {
                          color:
                            product.status === 'on_the_way'
                              ? '#2196F3'
                              : product.status === 'coming_soon'
                              ? '#FF9800'
                              : inStock
                              ? theme.colors.success
                              : theme.colors.error,
                        },
                      ]}
                    >
                      {product.status === 'on_the_way'
                        ? t('products.status.onTheWay', { defaultValue: 'On The Way' }).replace(/ /g, '\u00A0')
                        : product.status === 'coming_soon'
                        ? t('products.status.comingSoon', { defaultValue: 'Coming Soon' }).replace(/ /g, '\u00A0')
                        : inStock
                        ? t('product.inStock')
                        : t('product.outOfStock').replace(/ /g, '\u00A0')}
                    </AppText>
                  </View>
                </View>
              </View>

              {/* Brand + Category chips */}
              <View style={[styles.chipsRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                {!!product.brand && (
                  <View style={[styles.chipDark, { backgroundColor: theme.colors.text }]}>
                    <Text allowFontScaling={false} style={[styles.chipText, { color: theme.colors.card }]}>{product.brand}</Text>
                  </View>
                )}
                {!!product.category && (
                  <View style={[styles.chipAccent, { backgroundColor: theme.colors.primary }]}>
                    <Text allowFontScaling={false} style={[styles.chipText, { color: theme.colors.textOnPrimary }]}>{translateCategory(product)}</Text>
                  </View>
                )}
              </View>

              {/* Sku / Manufacturer / Barcode card.
                  Hidden entirely when the product carries none of the three. Most of
                  the catalogue has no SKU or manufacturer code, so this card used to
                  render "Sku: Not Available" beside "Manufacturer Code: Not Available"
                  on the main product page — two empty fields side by side, which reads
                  as an unfinished app rather than as a product without a code. */}
              {(!!product.sku?.trim() ||
                !!(product.specifications?.['Manufacturer Code'] || product.specifications?.['Manufacturer']) ||
                !!product.barcode?.trim()) && (
              <View style={[styles.skuCard, { borderColor: theme.colors.border }]}>
                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                  <View style={styles.skuCell}>
                    <Text allowFontScaling={false} style={[styles.skuLabel, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>{t('product.sku', { defaultValue: 'Sku' })}</Text>
                    {/* The admin types SKU and Part Number into separate fields; showing
                        partNumber here made the real SKU unreachable from the app.
                        No fallback to partNumber either — with SKU and Manufacturer
                        Code both falling back to it, one part number printed three
                        times on this screen under three different labels. */}
                    <Text allowFontScaling={false} style={[styles.skuValue, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>{product.sku?.trim() || t('product.notAvailable', { defaultValue: 'Not Available' })}</Text>
                  </View>
                  <View style={[styles.skuDivider, { backgroundColor: theme.colors.border }]} />
                  <View style={styles.skuCell}>
                    <Text allowFontScaling={false} style={[styles.skuLabel, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>{t('product.manufacturerCode', { defaultValue: 'Manufacturer Code' })}</Text>
                    <Text allowFontScaling={false} style={[styles.skuValue, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>{product.specifications?.['Manufacturer Code'] || product.specifications?.['Manufacturer'] || t('product.notAvailable', { defaultValue: 'Not Available' })}</Text>
                  </View>
                </View>
                {/* Full-width row rather than a third column: "Manufacturer Code" already
                    wraps at one third of a small phone's width. */}
                {!!product.barcode?.trim() && (
                  <>
                    <View style={[styles.skuRowDivider, { backgroundColor: theme.colors.border }]} />
                    <View style={styles.skuCell}>
                      <Text allowFontScaling={false} style={[styles.skuLabel, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>{t('product.barcode', { defaultValue: 'Barcode' })}</Text>
                      <AppNumber
                        value={product.barcode.trim()}
                        style={[styles.skuValue, { color: theme.colors.text }]}
                        containerStyle={{ alignItems: isRTL ? 'flex-end' : 'flex-start' }}
                        numberOfLines={1}
                      />
                    </View>
                  </>
                )}
              </View>
              )}

              {/* Brand card — logo (or wordmark) + name, opens every product of that brand */}
              {!!product.brand && (
                <TouchableOpacity
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={t('product.viewAllBrand', { brand: product.brand, defaultValue: `View all ${product.brand} products` })}
                  onPress={() => navigation.navigate('CategoryProducts', { brand: product.brand, title: product.brand })}
                  style={[
                    styles.brandCard,
                    {
                      borderColor: theme.colors.border,
                      flexDirection: isRTL ? 'row-reverse' : 'row',
                    },
                  ]}
                >
                  <View style={[styles.brandLogoBox, { backgroundColor: isDark ? theme.colors.surface : '#F1F2F4' }]}>
                    {brandLogoUrl ? (
                      <Image
                        source={{ uri: brandLogoUrl }}
                        style={styles.brandLogo}
                        contentFit="contain"
                        transition={0}
                        cachePolicy="memory-disk"
                        recyclingKey={brandLogoUrl}
                      />
                    ) : (
                      <Text
                        allowFontScaling={false}
                        numberOfLines={1}
                        style={[
                          styles.brandWordmark,
                          { color: theme.colors.text, fontSize: brandWordmarkFontSize(product.brand) },
                        ]}
                      >
                        {product.brand.toUpperCase()}
                      </Text>
                    )}
                  </View>

                  <View style={styles.brandCardText}>
                    <Text
                      allowFontScaling={false}
                      numberOfLines={1}
                      style={[styles.brandCardName, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}
                    >
                      {product.brand}
                    </Text>
                    <Text
                      allowFontScaling={false}
                      numberOfLines={1}
                      style={[styles.brandCardHint, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}
                    >
                      {t('product.viewAllBrand', { brand: product.brand, defaultValue: `View all ${product.brand} products` })}
                    </Text>
                  </View>

                  <Ionicons
                    name={isRTL ? 'chevron-back' : 'chevron-forward'}
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              )}

              {/* Wholesale Pricing Tiers */}
              {product.priceTiers && product.priceTiers.length > 0 && (
                <View style={styles.section}>
                  <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <MaterialIcons name="local-offer" size={20} color={theme.colors.primary} />
                    <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text }]}>
                      {t('product.wholesalePricing') || 'Wholesale Pricing'}
                    </Text>
                  </View>

                  <View style={[styles.tiersContainer, { borderColor: theme.colors.primary + '30' }]}>
                    {/* Table Header */}
                    <View
                      style={[
                        styles.tierHeaderRow,
                        {
                          backgroundColor: theme.colors.primary + '15',
                          flexDirection: isRTL ? 'row-reverse' : 'row',
                        },
                      ]}
                    >
                      <Text allowFontScaling={false}
                        style={[
                          styles.tierHeaderText,
                          { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' },
                        ]}
                      >
                        {t('product.quantity') || 'Quantity'}
                      </Text>
                      <Text allowFontScaling={false} style={[styles.tierHeaderText, { color: theme.colors.text, textAlign: 'center' }]}>
                        {t('product.pricePerUnit') || 'Price/Unit'}
                      </Text>
                      <Text allowFontScaling={false}
                        style={[
                          styles.tierHeaderText,
                          { color: theme.colors.text, textAlign: isRTL ? 'left' : 'right' },
                        ]}
                      >
                        {t('product.savings') || 'Savings'}
                      </Text>
                    </View>

                    {/* Base Price Row */}
                    <View
                      style={[
                        styles.tierRow,
                        {
                          flexDirection: isRTL ? 'row-reverse' : 'row',
                          backgroundColor:
                            activeQtyForPricing < (product.priceTiers[0]?.minQty || 1) && !isVip
                              ? theme.colors.primary + '10'
                              : 'transparent',
                          borderBottomColor: theme.colors.border,
                        },
                      ]}
                    >
                      <Text allowFontScaling={false}
                        style={[
                          styles.tierText,
                          { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' },
                        ]}
                      >
                        1 - {(product.priceTiers[0]?.minQty || 2) - 1}
                      </Text>
                      <AppNumber
                        value={formatItemPrice(product, currentCurrency as any, exchangeRateIQD)}
                        style={[
                          styles.tierPrice,
                          { 
                            color: activeQtyForPricing < (product.priceTiers[0]?.minQty || 1) && !isVip 
                              ? theme.colors.primary 
                              : theme.colors.text 
                          }
                        ]}
                      />
                      <Text allowFontScaling={false}
                        style={[
                          styles.tierText,
                          { color: theme.colors.textSecondary, textAlign: isRTL ? 'left' : 'right' },
                        ]}
                      >
                        —
                      </Text>
                    </View>

                    {/* Tier Rows */}
                    {[...product.priceTiers]
                      .sort((a, b) => a.minQty - b.minQty)
                      .map((tier, index) => {
                        const savings = Math.round((1 - tier.priceUSD / product.priceUSD) * 100);
                        const isCurrentTier =
                          (activeQtyForPricing >= tier.minQty && (!tier.maxQty || activeQtyForPricing <= tier.maxQty)) ||
                          (isVip && index === 0 && activeQtyForPricing < tier.minQty);

                        return (
                          <View
                            key={index}
                            style={[
                              styles.tierRow,
                              {
                                flexDirection: isRTL ? 'row-reverse' : 'row',
                                borderBottomWidth: index < product.priceTiers!.length - 1 ? 1 : 0,
                                borderBottomColor: theme.colors.border,
                                backgroundColor: isCurrentTier ? theme.colors.primary + '10' : 'transparent',
                              },
                            ]}
                          >
                            <Text allowFontScaling={false}
                              style={[
                                styles.tierText,
                                { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' },
                              ]}
                            >
                              {tier.minQty}
                              {tier.maxQty ? ` - ${tier.maxQty}` : '+'}
                            </Text>
                            <AppNumber
                              value={formatPrice(tier.priceUSD, currentCurrency as any, exchangeRateIQD)}
                              style={[styles.tierPrice, { color: isCurrentTier ? theme.colors.primary : theme.colors.text }]}
                            />
                            <Text allowFontScaling={false}
                              style={[
                                styles.tierText,
                                {
                                  fontWeight: '600',
                                  color: theme.colors.success,
                                  textAlign: isRTL ? 'left' : 'right',
                                },
                              ]}
                            >
                              {savings > 0 ? `-${savings}%` : '—'}
                            </Text>
                          </View>
                        );
                      })}
                  </View>

                  {/* Buy More Hint */}
                  {(() => {
                    const sortedTiers = [...product.priceTiers].sort((a, b) => a.minQty - b.minQty);
                    const nextTier = sortedTiers.find(tier => activeQtyForPricing < tier.minQty);
                    if (nextTier) {
                      const neededQty = nextTier.minQty - activeQtyForPricing;
                      const savingsAmount = Math.round((1 - nextTier.priceUSD / product.priceUSD) * 100);
                      return (
                        <View
                          style={[
                            styles.hintContainer,
                            { backgroundColor: theme.colors.warning + '20', flexDirection: isRTL ? 'row-reverse' : 'row' },
                          ]}
                        >
                          <Ionicons name="flash" size={16} color={theme.colors.warning} />
                          <Text allowFontScaling={false} style={[styles.hintText, { color: theme.colors.text }]}>
                            {t('product.buyMoreSave', { qty: neededQty, savings: savingsAmount }) ||
                              `Buy ${neededQty} more to save ${savingsAmount}%!`}
                          </Text>
                        </View>
                      );
                    }
                    return null;
                  })()}
                </View>
              )}

              {/* ALIBABA VARIATION: Table-style variation selector */}
              {product.variations && product.variations.length > 0 ? (
                <View style={styles.section}>
                  <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text, marginBottom: 0 }]}>
                      📏 {t('product.selectSize', { defaultValue: 'Select Size' })}
                    </Text>
                  </View>

                  {/* Storage is a single choice, not a quantity. The table with a
                      per-row +/- stepper let a shopper order two 128GB and one 256GB
                      of the same phone — wholesale behaviour, confusing in a retail
                      shop. Selecting a card sets that variant's quantity to 1 and
                      clears the others, so pricing, the cart and the totals below are
                      unchanged: they still read variationQuantities. */}
                  <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 10 }}>
                    {product.variations.map((variation) => {
                      const isOutOfStock = variation.stockQuantity <= 0;
                      const selected = (variationQuantities[variation.variationId] || 0) > 0;
                      const sizeDisplay = `${variation.sizeValue} ${variation.sizeUnit}`.trim();
                      const unitPrice = variation.priceUSD != null ? variation.priceUSD : product.priceUSD;
                      return (
                        <TouchableOpacity
                          key={variation.variationId}
                          disabled={isOutOfStock}
                          activeOpacity={0.8}
                          onPress={() => selectSizeVariation(variation.variationId)}
                          accessibilityRole="button"
                          accessibilityState={{ selected, disabled: isOutOfStock }}
                          accessibilityLabel={
                            isOutOfStock
                              ? `${sizeDisplay} — ${t('product.outOfStock', { defaultValue: 'Out of stock' })}`
                              : sizeDisplay
                          }
                          style={{
                            minWidth: 104,
                            paddingHorizontal: 16,
                            paddingVertical: 12,
                            borderRadius: 12,
                            borderWidth: selected ? 2 : 1.5,
                            borderColor: selected ? theme.colors.primary : theme.colors.border,
                            backgroundColor: selected ? theme.colors.primary + '12' : theme.colors.card,
                            opacity: isOutOfStock ? 0.4 : 1,
                            alignItems: 'center',
                          }}
                        >
                          <Text
                            allowFontScaling={false}
                            numberOfLines={1}
                            style={{
                              fontSize: 15,
                              fontWeight: selected ? '800' : '600',
                              color: isOutOfStock ? theme.colors.textSecondary : theme.colors.text,
                              textDecorationLine: isOutOfStock ? 'line-through' : 'none',
                            }}
                          >
                            {sizeDisplay}
                          </Text>
                          {/* Per-size price is why this is a card and not a bare chip:
                              256GB usually costs more than 128GB, and the shopper needs
                              to see that before choosing. */}
                          <Text
                            allowFontScaling={false}
                            numberOfLines={1}
                            style={{
                              marginTop: 3,
                              fontSize: 13,
                              fontWeight: '700',
                              color: isOutOfStock
                                ? theme.colors.textSecondary
                                : selected
                                  ? theme.colors.primary
                                  : theme.colors.textSecondary,
                            }}
                          >
                            {formatPrice(unitPrice ?? 0, currentCurrency as any, exchangeRateIQD)}
                          </Text>
                          {isOutOfStock && (
                            <Text
                              allowFontScaling={false}
                              style={{ marginTop: 2, fontSize: 10, color: theme.colors.error }}
                            >
                              {t('product.outOfStock', { defaultValue: 'Out of stock' })}
                            </Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {getTotalVariationQuantity() > 0 && (
                    <View style={[styles.alibabaTotalRow, { backgroundColor: theme.colors.primary + '10', flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                      <AppText 
                        style={[styles.alibabaTotalText, { color: theme.colors.primary, flex: 1 }]} 
                        numberOfLines={1} 
                        adjustsFontSizeToFit
                      >
                        {t('product.totalSelected', { defaultValue: 'Total selected' })}:
                      </AppText>
                      <AppNumber value={getTotalVariationQuantity()} style={[styles.alibabaTotalCount, { color: theme.colors.primary }]} />
                      <AppText style={[styles.alibabaTotalText, { color: theme.colors.primary, marginLeft: 4 }]}>
                        {t('product.items', { defaultValue: 'items' })}
                      </AppText>
                    </View>
                  )}
                </View>
              ) : (
                product.options?.sizes &&
                product.options.sizes.length > 0 && (
                  <View style={styles.section}>
                    <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                      📏 {t('product.selectSize', { defaultValue: 'Select Size' })}
                    </Text>
                    <View style={styles.optionChipsContainer}>
                      {product.options.sizes.map(size => (
                        <Chip
                          key={size}
                          selected={selectedSize === size}
                          onPress={() => toggleSize(size)}
                          mode="outlined"
                          showSelectedCheck={true}
                          selectedColor={theme.colors.success || '#4CAF50'}
                          style={[
                            styles.optionChip,
                            {
                              borderColor: selectedSize === size ? theme.colors.success : theme.colors.border,
                              backgroundColor:
                                selectedSize === size
                                  ? (theme.colors.success || '#4CAF50') + '15'
                                  : theme.colors.surface,
                            },
                          ]}
                          textStyle={[
                            styles.optionChipText,
                            { color: selectedSize === size ? (theme.colors.success || '#4CAF50') : theme.colors.text },
                          ]}
                        >
                          {size}
                        </Chip>
                      ))}
                    </View>
                  </View>
                )
              )}

              {/* Quantity Selector - Moved ABOVE variations per Alibaba pattern */}
              {/* Quantity Selector - Show ONLY if NO size/color variations exist */}
              {inStock && !hasSizeVariations && !hasColorVariations && (
                <View style={styles.section}>
                  <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                    {t('product.quantity')}
                  </Text>

                  <View style={[styles.quantityContainer, {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f2f2f2',
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.03)',
                    flexDirection: isRTL ? 'row-reverse' : 'row',
                  }]}>
                    <TouchableOpacity
                      onPress={() => updateQuantity(-1)}
                      disabled={quantity <= 1}
                      activeOpacity={0.7}
                      style={[
                        styles.quantityButton,
                        {
                          backgroundColor: theme.colors.background,
                          opacity: quantity <= 1 ? 0.4 : 1,
                        },
                      ]}
                    >
                      <Ionicons name="remove" size={20} color={quantity <= 1 ? theme.colors.textSecondary : theme.colors.primary} />
                    </TouchableOpacity>

                    <TextInput allowFontScaling={false}
                      value={qtyText}
                      onChangeText={(text) => {
                        const cleaned = text.replace(/[^0-9]/g, '');
                        setQtyText(cleaned);
                        if (cleaned.length > 0) {
                          const num = parseInt(cleaned, 10);
                          if (num > maxStock) {
                            setQuantity(maxStock);
                            setQtyText(String(maxStock));
                          } else if (num >= 1) {
                            setQuantity(num);
                          }
                        }
                      }}
                      onBlur={() => {
                        const num = parseInt(qtyText, 10);
                        if (isNaN(num) || num < 1) {
                          setQuantity(1);
                          setQtyText('1');
                        } else if (num > maxStock) {
                          setQuantity(maxStock);
                          setQtyText(String(maxStock));
                        } else {
                          setQuantity(num);
                          setQtyText(String(num));
                        }
                      }}
                      keyboardType="number-pad"
                      selectTextOnFocus
                      style={[styles.quantityText, {
                        color: theme.colors.text,
                        textAlign: 'center',
                        textAlignVertical: 'center',
                        includeFontPadding: false,
                        padding: 0,
                        height: 40,
                        minWidth: 40,
                        paddingVertical: 0,
                      }]}
                    />

                    <TouchableOpacity
                      onPress={() => updateQuantity(1)}
                      disabled={quantity >= maxStock}
                      activeOpacity={0.7}
                      style={[
                        styles.quantityButton,
                        {
                          backgroundColor: theme.colors.background,
                          opacity: quantity >= maxStock ? 0.4 : 1,
                        },
                      ]}
                    >
                      <Ionicons name="add" size={20} color={quantity >= maxStock ? theme.colors.textSecondary : theme.colors.primary} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Consumer variant selector (phone-style): single-select colour + storage */}
              {showConsumerVariants && (
                <View style={styles.section}>
                  {showConsumerColors && (
                    <>
                      <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                        {t('product.color', { defaultValue: 'Color' })}
                        {effectiveColor ? <Text style={{ color: theme.colors.textSecondary, fontWeight: '500' }}>{'  •  ' + effectiveColor}</Text> : null}
                      </Text>
                      {/* Availability only. Exact quantities are deliberately not shown
                          to customers — they expose stock levels to anyone browsing,
                          including competitors. The pill above is product-wide, so this
                          line still matters: it tells the customer the colour they picked
                          is unavailable even while the product itself is in stock. */}
                      {(() => {
                        const sc = product.colorVariations?.find((c) => c.colorValue === effectiveColor);
                        if (!sc || (Number(sc.stockQuantity) || 0) > 0) return null;
                        return (
                          <Text
                            allowFontScaling={false}
                            style={{
                              marginTop: 4,
                              fontSize: 13,
                              fontWeight: '600',
                              textAlign: isRTL ? 'right' : 'left',
                              color: theme.colors.error,
                            }}
                          >
                            {t('product.outOfStock', { defaultValue: 'Out of stock' })}
                          </Text>
                        );
                      })()}
                      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 12, marginTop: 10, marginBottom: 6 }}>
                        {(product.colorVariations ?? []).map((cv) => {
                          const sel = effectiveColor === cv.colorValue;
                          const soldOut = (cv.stockQuantity ?? 0) <= 0;
                          // A white or near-white swatch vanishes against the card, so
                          // pale colours get a visible ring and a dark tick instead of
                          // the white one used on saturated colours.
                          const hex = (cv.colorHex || '#cccccc').replace('#', '');
                          const rgb = hex.length === 6
                            ? [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
                            : [204, 204, 204];
                          const isPale = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 186;
                          return (
                            <TouchableOpacity
                              key={cv.variationId}
                              disabled={soldOut}
                              onPress={() => setSelectedColor(sel ? null : cv.colorValue)}
                              activeOpacity={0.8}
                              accessibilityRole="button"
                              accessibilityState={{ selected: sel, disabled: soldOut }}
                              accessibilityLabel={
                                soldOut
                                  ? `${cv.colorValue} — ${t('product.outOfStock', { defaultValue: 'Out of stock' })}`
                                  : cv.colorValue
                              }
                              style={{ alignItems: 'center', width: 68 }}
                            >
                              <View
                                style={{
                                  width: 52, height: 52, borderRadius: 26,
                                  alignItems: 'center', justifyContent: 'center',
                                  borderWidth: sel ? 2.5 : 1.5,
                                  borderColor: sel ? theme.colors.primary : theme.colors.border,
                                  opacity: soldOut ? 0.35 : 1,
                                  backgroundColor: theme.colors.card,
                                }}
                              >
                                <View
                                  style={{
                                    width: 38, height: 38, borderRadius: 19,
                                    backgroundColor: cv.colorHex || '#ccc',
                                    borderWidth: isPale ? 1 : 0,
                                    borderColor: theme.colors.border,
                                    alignItems: 'center', justifyContent: 'center',
                                  }}
                                >
                                  {/* The tick sits inside the swatch so the chosen colour
                                      is unmistakable at a glance, not just a thin ring. */}
                                  {sel && !soldOut && (
                                    <Ionicons name="checkmark" size={20} color={isPale ? '#111' : '#fff'} />
                                  )}
                                </View>
                                {soldOut && (
                                  <View
                                    style={{
                                      position: 'absolute', width: 52, height: 1.5,
                                      backgroundColor: theme.colors.error,
                                      transform: [{ rotate: '-45deg' }],
                                    }}
                                  />
                                )}
                              </View>
                              {/* Names matter here: shoppers ask for "the blue one", and a
                                  bare circle is unreadable to anyone colour-blind. */}
                              <Text
                                allowFontScaling={false}
                                numberOfLines={1}
                                style={{
                                  marginTop: 6,
                                  fontSize: 11,
                                  textAlign: 'center',
                                  fontWeight: sel ? '700' : '500',
                                  color: soldOut
                                    ? theme.colors.textSecondary
                                    : sel
                                      ? theme.colors.primary
                                      : theme.colors.text,
                                  textDecorationLine: soldOut ? 'line-through' : 'none',
                                }}
                              >
                                {cv.colorValue}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </>
                  )}

                  {storageOptions.length > 0 && (
                  <>
                  <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left', marginTop: 14 }]}>
                    {t('product.storage', { defaultValue: 'Storage' })}
                  </Text>
                  <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
                    {storageOptions.map((so) => {
                      const sel = effectiveStorageId === so.id;
                      return (
                        <TouchableOpacity
                          key={so.id}
                          onPress={() => setSelectedStorageId(so.id)}
                          activeOpacity={0.8}
                          style={{
                            paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12,
                            borderWidth: sel ? 2 : 1.5,
                            borderColor: sel ? theme.colors.primary : theme.colors.border,
                            backgroundColor: sel ? theme.colors.primary + '12' : 'transparent',
                            alignItems: 'center',
                          }}
                        >
                          <Text allowFontScaling={false} style={{ color: sel ? theme.colors.primary : theme.colors.text, fontWeight: '700', fontSize: 15 }}>{so.label}</Text>
                          {so.priceDelta > 0 && (
                            <Text allowFontScaling={false} style={{ color: theme.colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                              +{formatPrice(so.priceDelta, currentCurrency as any, exchangeRateIQD)}
                            </Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  </>
                  )}
                </View>
              )}

              {/* ALIBABA VARIATION: Table-style color variation selector */}
              {showBulkColorTable ? (
                <View style={styles.section}>
                  <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text, marginBottom: 0 }]}>
                      🎨 {t('product.selectColor', { defaultValue: 'Select Color' })}
                    </Text>
                  </View>

                  {/* Table Header */}
                  <View style={[styles.alibabaTableHeader, { backgroundColor: theme.colors.surface, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <Text allowFontScaling={false} style={[styles.alibabaHeaderText, { color: theme.colors.textSecondary, flex: VARIANT_COL.model, textAlign: isRTL ? 'right' : 'left' }]}>
                      {t('product.color', { defaultValue: 'Color' })}
                    </Text>
                    <Text allowFontScaling={false} style={[styles.alibabaHeaderText, { color: theme.colors.textSecondary, flex: VARIANT_COL.qty, textAlign: isRTL ? 'left' : 'right' }]}>
                      {t('product.quantity', { defaultValue: 'Qty' })}
                    </Text>
                  </View>

                  {/* Rows */}
                  {(product.colorVariations ?? []).map((colorVar, index) => {
                    const isOutOfStock = colorVar.stockQuantity <= 0;
                    const currentQty = colorVariationQuantities[colorVar.variationId] || 0;
                    // colorValue comes from admin-entered DB JSON and may be null/empty.
                    const cv = colorVar.colorValue || '';

                    return (
                      <View
                        key={colorVar.variationId}
                        style={[
                          styles.alibabaTableRow,
                          {
                            backgroundColor: currentQty > 0 ? theme.colors.primary + '08' : 'transparent',
                            borderBottomColor: theme.colors.border,
                            borderBottomWidth: index < product.colorVariations!.length - 1 ? 1 : 0,
                            flexDirection: isRTL ? 'row-reverse' : 'row',
                          },
                        ]}
                      >
                        <View style={{ flex: VARIANT_COL.model, flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }}>
                          {/* Color swatch */}
                          <View
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: 10,
                              backgroundColor: colorVar.colorHex || cv.toLowerCase() || '#ccc',
                              borderWidth: 1,
                              borderColor: theme.colors.border,
                              marginRight: isRTL ? 0 : 8,
                              marginLeft: isRTL ? 8 : 0,
                            }}
                          />
                          <Text allowFontScaling={false}
                            style={[
                              styles.alibabaModelText,
                              {
                                color: isOutOfStock ? theme.colors.textSecondary : theme.colors.text,
                                textDecorationLine: isOutOfStock ? 'line-through' : 'none',
                                textAlign: isRTL ? 'right' : 'left',
                              },
                            ]}
                            numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}
                          >
                            {t(`product.colors.${cv.toLowerCase()}`, cv)}
                          </Text>
                        </View>

                        <View style={[styles.alibabaQtyCell, { flex: VARIANT_COL.qty, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                          <TouchableOpacity
                            onPress={() => updateColorVariationQuantity(colorVar.variationId, -1)}
                            disabled={currentQty <= 0}
                            activeOpacity={0.7}
                            style={[
                              styles.alibabaQtyButton,
                              {
                                borderColor: currentQty <= 0 ? theme.colors.border : theme.colors.primary,
                                opacity: currentQty <= 0 ? 0.4 : 1,
                              },
                            ]}
                          >
                            <Ionicons name="remove" size={16} color={currentQty <= 0 ? theme.colors.textSecondary : theme.colors.primary} />
                          </TouchableOpacity>

                          <TextInput allowFontScaling={false}
                            value={colorVariationQtyTexts[colorVar.variationId] !== undefined ? colorVariationQtyTexts[colorVar.variationId] : String(currentQty)}
                            onChangeText={(text) => handleColorVariationExact(colorVar.variationId, text, colorVar.stockQuantity)}
                            onBlur={() => handleColorVariationBlur(colorVar.variationId, colorVar.stockQuantity)}
                            keyboardType="number-pad"
                            selectTextOnFocus
                            style={[styles.alibabaQtyText, { 
                              color: theme.colors.text,
                              backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                              width: VARIANT_QTY_FIELD_WIDTH,
                              height: 32,
                              textAlign: 'center',
                              textAlignVertical: 'center',
                              paddingVertical: 0,
                              paddingHorizontal: 0,
                              includeFontPadding: false,
                              borderRadius: 4,
                              borderWidth: 1,
                              borderColor: theme.colors.border
                            }]}
                          />

                          <TouchableOpacity
                            onPress={() => updateColorVariationQuantity(colorVar.variationId, 1)}
                            disabled={isOutOfStock || currentQty >= colorVar.stockQuantity}
                            activeOpacity={0.7}
                            style={[
                              styles.alibabaQtyButton,
                              {
                                borderColor: isOutOfStock || currentQty >= colorVar.stockQuantity ? theme.colors.border : theme.colors.primary,
                                opacity: isOutOfStock || currentQty >= colorVar.stockQuantity ? 0.4 : 1,
                              },
                            ]}
                          >
                            <Ionicons name="add" size={16} color={isOutOfStock || currentQty >= colorVar.stockQuantity ? theme.colors.textSecondary : theme.colors.primary} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}

                  {/* Total selected */}
                  {getTotalColorVariationQuantity() > 0 && (
                    <View style={[styles.alibabaTotalRow, { backgroundColor: theme.colors.primary + '10', flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                      <AppText 
                        style={[styles.alibabaTotalText, { color: theme.colors.primary, flex: 1 }]} 
                        numberOfLines={1} 
                        adjustsFontSizeToFit
                      >
                        {t('product.totalSelected', { defaultValue: 'Total Selected' })}:
                      </AppText>
                      <AppNumber value={getTotalColorVariationQuantity()} style={[styles.alibabaTotalCount, { color: theme.colors.primary }]} />
                      <AppText style={[styles.alibabaTotalText, { color: theme.colors.primary, marginLeft: 4 }]}>
                        {t('product.items', { defaultValue: 'items' })}
                      </AppText>
                    </View>
                  )}
                </View>
              ) : (
                /* Fallback: Optional Color Selector (cosmetic only) */
                product.options?.colors && product.options.colors.length > 0 && (
                  <View style={styles.section}>
                    <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                      🎨 {t('product.selectColor', { defaultValue: 'Select Color' })}
                    </Text>
                    <View style={styles.optionChipsContainer}>
                      {product.options.colors.filter(color => !!color).map(color => {
                        const colorLower = (color || '').toLowerCase();
                        const isLightColor = ['white', 'yellow', 'cream', 'ivory', 'beige', 'lightgray', 'silver'].includes(colorLower);
                        const textColor = isLightColor ? '#000000' : '#FFFFFF';
                        const isSelected = selectedColor === color;

                        return (
                          <TouchableOpacity
                            key={color}
                            style={[
                              styles.optionChip,
                              {
                                borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                                backgroundColor: colorLower,
                              },
                            ]}
                            onPress={() => toggleColor(color)}
                            activeOpacity={0.7}
                          >
                            <Text allowFontScaling={false}
                              style={[
                                styles.optionChipText,
                                { 
                                  color: textColor,
                                  fontWeight: isSelected ? '700' : '500',
                                },
                              ]}
                             numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                              {color}
                            </Text>
                            {isSelected && (
                              <Ionicons name="checkmark" size={14} color={textColor} style={{ marginLeft: 4 }} />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )
              )}

              {/* Description */}
              {!!localizedDescription && (
                <View style={styles.section}>
                  <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                    {t('product.description')}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.descriptionText, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
                    {localizedDescription}
                  </Text>
                </View>
              )}

              <Divider style={{ marginVertical: 4 }} />

              {/* Specifications */}
              <View style={styles.section}>
                <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('product.specifications')}
                </Text>

                <View style={[styles.infoCardsRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <View style={[styles.infoCard, { backgroundColor: isDark ? theme.colors.surface : '#F0F0F2' }]}>
                    <Text allowFontScaling={false} style={[styles.infoCardTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>{t('product.authentic', { defaultValue: 'Authentic' })}</Text>
                    <Text allowFontScaling={false} style={[styles.infoCardValue, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>{t('product.authenticValue', { defaultValue: '100% Authentic' })}</Text>
                  </View>
                  <View style={[styles.infoCard, { backgroundColor: isDark ? theme.colors.surface : '#F0F0F2' }]}>
                    <Text allowFontScaling={false} style={[styles.infoCardTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>{t('product.warranty', { defaultValue: 'Warranty' })}</Text>
                    <Text allowFontScaling={false} style={[styles.infoCardValue, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>{product.warranty || t('product.notAvailable', { defaultValue: 'Not Available' })}</Text>
                  </View>
                </View>
                <View style={[styles.infoCardsRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <View style={[styles.infoCard, { backgroundColor: isDark ? theme.colors.surface : '#F0F0F2' }]}>
                    <Text allowFontScaling={false} style={[styles.infoCardTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>{t('product.availability', { defaultValue: 'Availability' })}</Text>
                    <Text allowFontScaling={false} style={[styles.infoCardValue, { color: inStock ? theme.colors.success : theme.colors.error, textAlign: isRTL ? 'right' : 'left' }]}>{inStock ? t('product.available') : t('product.unavailable')}</Text>
                  </View>
                  <View style={[styles.infoCard, { backgroundColor: isDark ? theme.colors.surface : '#F0F0F2' }]}>
                    <Text allowFontScaling={false} style={[styles.infoCardTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>{t('product.condition')}</Text>
                    <Text allowFontScaling={false} style={[styles.infoCardValue, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>{t(`product.condition${(product.condition || 'new').charAt(0).toUpperCase()}${(product.condition || 'new').slice(1)}`)}</Text>
                  </View>
                </View>

                {/* Full technical spec sheet (admin-entered specs + weight + dimensions) */}
                {(() => {
                  const specRows: Array<{ k: string; v: string }> = [];
                  const specs = (product as any).specifications || {};
                  Object.keys(specs).forEach((k) => {
                    const v = specs[k];
                    if (v != null && String(v).trim() !== '') specRows.push({ k, v: String(v) });
                  });
                  const w = (product as any).weight;
                  if (w != null && w !== '') specRows.push({ k: t('product.weight', { defaultValue: 'Weight' }), v: `${w} kg` });
                  const d = (product as any).dimensions;
                  if (d && (d.length || d.width || d.height)) {
                    specRows.push({ k: t('product.dimensions', { defaultValue: 'Dimensions' }), v: `${d.length || 0} × ${d.width || 0} × ${d.height || 0} cm` });
                  }
                  if (specRows.length === 0) return null;
                  return (
                    <View style={{ marginTop: 12, borderRadius: 14, overflow: 'hidden', backgroundColor: isDark ? theme.colors.surface : '#F0F0F2' }}>
                      {specRows.map((row, i) => (
                        <View
                          key={`${row.k}-${i}`}
                          style={{
                            flexDirection: isRTL ? 'row-reverse' : 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingVertical: 12,
                            paddingHorizontal: 14,
                            borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                            borderTopColor: theme.colors.border,
                          }}
                        >
                          <Text allowFontScaling={false} style={{ color: theme.colors.textSecondary, fontSize: 13.5, flex: 1, textAlign: isRTL ? 'right' : 'left' }} numberOfLines={2}>{row.k}</Text>
                          <Text allowFontScaling={false} style={{ color: theme.colors.text, fontSize: 13.5, fontWeight: '600', flex: 1, textAlign: isRTL ? 'left' : 'right' }} numberOfLines={2}>{row.v}</Text>
                        </View>
                      ))}
                    </View>
                  );
                })()}
              </View>

              {/* Product Overview (collapsible) */}
              <View style={styles.section}>
                <TouchableOpacity
                  style={[styles.overviewBar, { backgroundColor: isDark ? theme.colors.surface : '#F0F0F2', flexDirection: isRTL ? 'row-reverse' : 'row' }]}
                  onPress={() => setOverviewExpanded(v => !v)}
                  activeOpacity={0.7}
                >
                  <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text, marginBottom: 0 }]}>
                    {t('product.overview', { defaultValue: 'Product Overview' })}
                  </Text>
                  <Ionicons name={overviewExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={theme.colors.textSecondary} />
                </TouchableOpacity>
                {overviewExpanded && (
                  <Text allowFontScaling={false} style={[styles.descriptionText, { color: theme.colors.textSecondary, marginTop: 12, textAlign: isRTL ? 'right' : 'left' }]}>
                    {localizedDescription || t('product.noOverview', { defaultValue: 'No additional details available.' })}
                  </Text>
                )}
              </View>

              {/* Payment Methods */}
              <View style={styles.section}>
                <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('product.paymentMethods', { defaultValue: 'Payment Methods' })}
                </Text>
                <View style={[styles.paymentRow, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: isDark ? theme.colors.surface : '#F0F0F2' }]}>
                  <Ionicons name="cash-outline" size={22} color={theme.colors.primary} />
                  <Text allowFontScaling={false} style={[styles.paymentText, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                    {t('product.cashOnDelivery', { defaultValue: 'Cash on Delivery' })}
                  </Text>
                </View>
              </View>

              {/* Seller store card. Everything here was loaded but never rendered. */}
              {hasStoreCard && (
                <View style={styles.section}>
                  <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                    {t('product.storeInfo')}
                  </Text>

                  <View style={[styles.storeCard, { borderColor: theme.colors.border, backgroundColor: isDark ? theme.colors.surface : '#FFFFFF' }]}>
                    <TouchableOpacity
                      style={[styles.storeHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel={t('product.viewStore')}
                      onPress={() => {
                        const tid = storeInfo?.tenantId || tenantId;
                        if (tid) navigation.navigate('StoreProducts', { tenantId: tid });
                      }}
                    >
                      {storeInfo?.logoUrl ? (
                        <Image
                          source={{ uri: storeInfo.logoUrl }}
                          style={styles.storeLogo}
                          contentFit="cover"
                          transition={0}
                          cachePolicy="memory-disk"
                          recyclingKey={storeInfo.logoUrl}
                        />
                      ) : (
                        <View style={[styles.storeIconContainer, { backgroundColor: isDark ? theme.colors.card : '#F0F0F2' }]}>
                          <Ionicons name="storefront-outline" size={24} color={theme.colors.primary} />
                        </View>
                      )}

                      <View style={styles.storeHeaderText}>
                        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }}>
                          <Text
                            allowFontScaling={false}
                            numberOfLines={1}
                            style={[styles.storeName, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left', flexShrink: 1 }]}
                          >
                            {storeDisplayName}
                          </Text>
                          {!!storeInfo?.isVerified && (
                            <View style={[styles.verifiedBadge, { backgroundColor: theme.colors.success }]}>
                              <Ionicons name="checkmark" size={11} color="#FFFFFF" />
                            </View>
                          )}
                        </View>

                        {/* Address is NOT gated on coordinates — a branch saved without
                            a pin still has a real address customers need to see. */}
                        {!!storeAddressLine && (
                          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'flex-start', marginTop: 2 }}>
                            <Ionicons name="location-outline" size={14} color={theme.colors.textSecondary} style={{ marginTop: 2 }} />
                            <Text
                              allowFontScaling={false}
                              numberOfLines={2}
                              style={[styles.storeLocation, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left', flex: 1 }]}
                            >
                              {storeAddressLine}
                            </Text>
                          </View>
                        )}
                      </View>

                      <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={theme.colors.textSecondary} />
                    </TouchableOpacity>

                    {!!(storeInfo?.phone || storeInfo?.whatsapp || storeInfo?.location) && (
                      <View style={[styles.storeActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                        {!!storeInfo?.phone && (
                          <TouchableOpacity
                            style={[styles.storeActionButton, { backgroundColor: theme.colors.primary, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            onPress={() => callSeller(storeInfo.phone)}
                          >
                            <Ionicons name="call" size={16} color="#FFFFFF" />
                            <Text allowFontScaling={false} numberOfLines={1} style={styles.storeActionText}>{t('common.call')}</Text>
                          </TouchableOpacity>
                        )}
                        {!!storeInfo?.whatsapp && (
                          <TouchableOpacity
                            style={[styles.storeActionButton, { backgroundColor: '#25D366', flexDirection: isRTL ? 'row-reverse' : 'row' }]}
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            onPress={() => whatsappSeller(storeInfo.whatsapp)}
                          >
                            <Ionicons name="logo-whatsapp" size={16} color="#FFFFFF" />
                            <Text allowFontScaling={false} numberOfLines={1} style={styles.storeActionText}>{t('common.whatsapp')}</Text>
                          </TouchableOpacity>
                        )}
                        {!!storeInfo?.location && (
                          <TouchableOpacity
                            style={[styles.storeActionButton, { backgroundColor: '#4285F4', flexDirection: isRTL ? 'row-reverse' : 'row' }]}
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            onPress={() => openMapToStore(storeInfo.location)}
                          >
                            <Ionicons name="navigate" size={16} color="#FFFFFF" />
                            <Text allowFontScaling={false} numberOfLines={1} style={styles.storeActionText}>{t('common.directions')}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                    <TouchableOpacity
                      style={[styles.viewStoreButton, { borderColor: theme.colors.border, marginTop: SPACING.sm, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      onPress={() => navigation.navigate('StoreLocation', {
                        // Without this the branches screen lists every seller's shops.
                        tenantId: storeInfo?.tenantId || product?.tenantId || tenantId || undefined,
                      })}
                    >
                      <Ionicons name="map-outline" size={15} color={theme.colors.primary} />
                      <Text
                        allowFontScaling={false}
                        numberOfLines={1}
                        style={[styles.viewStoreButtonText, { color: theme.colors.primary, marginHorizontal: 6 }]}
                      >
                        {t('product.viewAllBranches', { defaultValue: 'View all branches' })}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

            </View>

            {/* GOLDEN PERFORMANCE: Defer Related Products - luxury vertical cards */}
            {ready && relatedProducts.length > 0 && (
              <View style={[styles.section, { marginTop: SPACING.lg, paddingHorizontal: SPACING.md }]}>
                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left', marginBottom: 0 }]}>
                    {t('product.relatedProducts')}
                  </Text>
                  <View style={{ backgroundColor: theme.colors.primary + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                    <Text allowFontScaling={false} style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '700' }}>{relatedProducts.slice(0, 10).length} {t('product.items', { defaultValue: 'items' })}</Text>
                  </View>
                </View>

                {relatedProducts.slice(0, 10).map((item) => {
                  const itemImage = item.imageUrls?.[0];
                  const itemName = i18n.language === 'ar' && (item as any).nameAr
                    ? (item as any).nameAr
                    : i18n.language === 'ku' && (item as any).nameKu
                    ? (item as any).nameKu
                    : item.name;

                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={{
                        flexDirection: isRTL ? 'row-reverse' : 'row',
                        backgroundColor: theme.colors.surface,
                        borderRadius: 16,
                        marginBottom: 12,
                        overflow: 'hidden',
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: isDark ? 0.3 : 0.06,
                        shadowRadius: 8,
                        elevation: 2,
                      }}
                      onPress={() => handleRelatedProductPress(item.id)}
                      activeOpacity={0.7}
                    >
                      <Image
                        source={{ uri: itemImage }}
                        style={{
                          width: 110,
                          height: 110,
                          backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5',
                        }}
                        contentFit="cover"
                        transition={0}
                        cachePolicy="memory-disk"
                        recyclingKey={item.id}
                      />

                      <View style={{ flex: 1, padding: 12, justifyContent: 'center' }}>
                        <AppText
                          fontSize={14}
                          style={{ color: theme.colors.text, fontWeight: '700', lineHeight: 20 }}
                          numberOfLines={2}
                        >
                          {itemName}
                        </AppText>

                        {item.partNumber ? (
                          <AppText
                            fontSize={11}
                            style={{ color: theme.colors.textSecondary, marginTop: 4, fontWeight: '500' }}
                            numberOfLines={1}
                          >
                            {item.partNumber}
                          </AppText>
                        ) : null}

                        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', marginTop: 8 }}>
                          <View style={{ backgroundColor: theme.colors.primary + '12', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                            <AppNumber
                              value={formatUnitPrice(item, isVip, currentCurrency as any, exchangeRateIQD)}
                              style={[
                                styles.relatedPrice,
                                { color: theme.colors.primary }
                              ]}
                              numberOfLines={1}
                              adjustsFontSizeToFit
                              minimumFontScale={0.85}
                            />
                          </View>

                          {/* Availability, same rules as the grid cards. Without this a
                              coming-soon or sold-out product sat in the strip looking
                              exactly like a stocked one. Stock is the shared effective
                              figure, so a colour-only product is not called sold out. */}
                          {(() => {
                            const relStock = getEffectiveStock(item);
                            const label =
                              item.status === 'coming_soon'
                                ? t('products.status.comingSoon', { defaultValue: 'Coming Soon' })
                                : item.status === 'on_the_way'
                                ? t('products.status.onTheWay', { defaultValue: 'On The Way' })
                                : relStock <= 0
                                ? t('product.outOfStock')
                                : null;
                            if (!label) return null;
                            return (
                              <View
                                style={{
                                  marginLeft: isRTL ? 0 : 8,
                                  marginRight: isRTL ? 8 : 0,
                                  backgroundColor: theme.colors.textSecondary + '1A',
                                  paddingHorizontal: 8,
                                  paddingVertical: 3,
                                  borderRadius: 6,
                                }}
                              >
                                <AppText fontSize={10} numberOfLines={1} style={{ color: theme.colors.textSecondary, fontWeight: '700' }}>
                                  {label}
                                </AppText>
                              </View>
                            );
                          })()}
                        </View>
                      </View>

                      <View style={{ justifyContent: 'center', paddingRight: isRTL ? 0 : 12, paddingLeft: isRTL ? 12 : 0 }}>
                        <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={theme.colors.textSecondary} style={{ opacity: 0.4 }} />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

          </ScrollView>
        </KeyboardAvoidingView>

        {/* ===========================
            Alibaba-style Sticky Bottom Bar
            =========================== */}
        <View
          style={[
            styles.alibabaBar,
            {
              borderTopColor: '#E0E0E0',
              backgroundColor: isDark ? theme.colors.background : '#FAFAFA',
              paddingBottom: insets.bottom + 10,
            },
          ]}
        >
          <View style={[styles.alibabaBarRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            {/* Left: Store Button - Navigate to Store Profile */}
            <TouchableOpacity
              style={styles.alibabaIconAction}
              onPress={() => {
                if (storeInfo?.tenantId) {
                  navigation.navigate('StoreProducts', { tenantId: storeInfo.tenantId });
                } else if (tenantId) {
                  navigation.navigate('StoreProducts', { tenantId });
                }
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="storefront-outline" size={22} color={theme.colors.text} />
              <AppText
                fontSize={10}
                style={[styles.alibabaIconLabel, { color: theme.colors.text }]}
                numberOfLines={2}
                adjustsFontSizeToFit
              >
                {t('product.store', { defaultValue: 'Store' })}
              </AppText>
            </TouchableOpacity>

            {/* Middle: Chat now (outlined pill) */}
            <TouchableOpacity
              style={[
                styles.alibabaChatPill,
                {
                  borderColor: '#CCCCCC',
                  backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
                },
              ]}
              onPress={async () => {
                if (startingChat) return;

                // AUTH CHECK: User must be logged in to chat
                if (!user) {
                  setLoginModalVisible(true);
                  return;
                }

                setStartingChat(true);
                setStartingChat(true);
                try {
                  let conversation;
                  
                  // GROUPING FIX: Check if we already have a chat with this store (Tenant)
                  // If we do, use that conversation instead of creating a new one for this product.
                  if (storeInfo?.tenantId) {
                    conversation = await findConversationByTenant(storeInfo.tenantId, user.uid);
                  }
                  
                  // Fallback: If no existing chat (or no tenantId), create/get via product
                  if (!conversation) {
                    conversation = await getOrCreateConversation(product.id);
                  }

                  navigation.navigate('ChatScreen', {
                    conversationId: conversation.id,
                    adminId: conversation.adminId,
                    productId: product.id,
                    productName:
                      i18n.language === 'ar' && product.nameAr
                        ? product.nameAr
                        : i18n.language === 'ku' && product.nameKu
                        ? product.nameKu
                        : product.name,
                    productImage: product.imageUrls?.[0],
                    attachProduct: true,
                  });
                } catch (error) {
                  console.error('Error starting chat from product details:', error);
                  Alert.alert(t('common.error'), t('chat.errorStarting', 'Failed to start chat'));
                } finally {
                  setStartingChat(false);
                }
              }}
              disabled={startingChat}
              activeOpacity={0.85}
            >
              {startingChat ? (
                <ActivityIndicator color={theme.colors.textSecondary} size="small" />
              ) : (
                <>
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.colors.text} />
                  <AppText
                    fontSize={13}
                    style={[styles.alibabaChatText, { color: theme.colors.text }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {t('product.chat')}
                  </AppText>
                </>
              )}
            </TouchableOpacity>

            {/* Right: Orange button shows Total Price */}
            <TouchableOpacity
              style={[styles.alibabaTotalButton, { opacity: !inStock || addingToCart || (product.status && product.status !== 'available') ? 0.6 : 1 }]}
              onPress={() => {
                void handleTotalButtonPress();
              }}
              disabled={!inStock || addingToCart || (product.status !== undefined && product.status !== 'available')}
              activeOpacity={0.9}
            >
              {addingToCart ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <View style={{ alignItems: 'center' }}>
                    {product.status === 'coming_soon' ? (
                      <AppText fontSize={13} style={styles.alibabaTotalLabel} numberOfLines={1} adjustsFontSizeToFit>
                        {t('products.status.comingSoon', { defaultValue: 'Coming Soon' })}
                      </AppText>
                    ) : product.status === 'on_the_way' ? (
                      <AppText fontSize={13} style={styles.alibabaTotalLabel} numberOfLines={1} adjustsFontSizeToFit>
                        {t('products.status.onTheWay', { defaultValue: 'On The Way' })}
                      </AppText>
                    ) : (
                      <>
                        <AppText fontSize={10} style={styles.alibabaTotalLabel} numberOfLines={1} adjustsFontSizeToFit>
                          {hasSizeVariations
                            ? t('product.startOrder', { defaultValue: 'Start Order' })
                            : t('product.addToCart', { defaultValue: 'Add to Cart' })}
                        </AppText>

                        <AppNumber value={buttonPriceText} style={styles.alibabaTotalValue} />
                       
                        {showSavings && (
                          <View style={{ 
                            backgroundColor: 'rgba(255,255,255,0.25)', 
                            borderRadius: 4, 
                            paddingHorizontal: 6, 
                            marginTop: 2
                          }}>
                            <AppText 
                              fontSize={11} 
                              style={{ color: '#FFFFFF', fontWeight: '700' }}
                              numberOfLines={1}
                              adjustsFontSizeToFit
                            >
                              -{formatPrice(savingsAmount, currentCurrency, exchangeRateIQD)}
                            </AppText>
                          </View>
                        )}
                      </>
                    )}
                  </View>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Login Required Modal */}
      <Modal
        visible={loginModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setLoginModalVisible(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 32,
        }}>
          <View style={{
            backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
            borderRadius: 24,
            padding: 28,
            width: '100%',
            maxWidth: 340,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.25,
            shadowRadius: 24,
            elevation: 20,
          }}>
            {/* Icon Circle */}
            <View style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: theme.colors.primary + '15',
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: 20,
            }}>
              <Ionicons name="chatbubble-ellipses" size={32} color={theme.colors.primary} />
            </View>

            {/* Title */}
            <Text allowFontScaling={false} style={{
              fontSize: 20,
              fontWeight: '700',
              color: theme.colors.text,
              marginBottom: 8,
              textAlign: 'center',
            }}>
              {t('auth.loginRequired', 'Login Required')}
            </Text>

            {/* Subtitle */}
            <Text allowFontScaling={false} style={{
              fontSize: 14,
              color: theme.colors.textSecondary,
              textAlign: 'center',
              lineHeight: 20,
              marginBottom: 24,
              paddingHorizontal: 8,
            }}>
              {t('chat.loginToChat', 'Please login to chat with the seller')}
            </Text>

            {/* Login Button */}
            <TouchableOpacity
              style={{
                backgroundColor: theme.colors.primary,
                borderRadius: 14,
                paddingVertical: 14,
                paddingHorizontal: 32,
                width: '100%',
                alignItems: 'center',
                marginBottom: 12,
              }}
              onPress={() => {
                setLoginModalVisible(false);
                navigation.navigate('SignIn');
              }}
              activeOpacity={0.85}
            >
              <Text allowFontScaling={false} style={{
                color: '#FFFFFF',
                fontSize: 16,
                fontWeight: '600',
              }}>
                {t('auth.login', 'Login')}
              </Text>
            </TouchableOpacity>

            {/* Cancel */}
            <TouchableOpacity
              onPress={() => setLoginModalVisible(false)}
              style={{ paddingVertical: 10 }}
              activeOpacity={0.6}
            >
              <Text allowFontScaling={false} style={{
                color: theme.colors.textSecondary,
                fontSize: 14,
                fontWeight: '500',
              }}>
                {t('common.cancel', 'Cancel')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Image Modal */}
      <Modal
        visible={imageModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setImageModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <SafeAreaView style={styles.modalContent}>
            <TouchableOpacity
              onPress={() => setImageModalVisible(false)}
              style={[styles.modalCloseButton, { top: insets.top + SPACING.sm }]}
            >
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>

            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.modalScrollView}>
              {galleryImages.map((imageUrl: string, index: number) => (
                <View key={index} style={styles.modalImageWrapper}>
                  <Image
                    source={{ uri: imageUrl }}
                    style={styles.modalImage}
                    contentFit="contain"
                    transition={0}
                    cachePolicy="memory-disk"
                    priority="high"
                  />
                </View>
              ))}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* ==================== START ORDER BOTTOM SHEET ==================== */}
      <StartOrderBottomSheet
        visible={startOrderVisible}
        onClose={() => setStartOrderVisible(false)}
        onConfirmOrder={handleConfirmOrder}
        product={product}
        // Pass variation selections from the screen
        variationSelections={
          product.variations?.filter(v => (variationQuantities[v.variationId] || 0) > 0).map(v => ({
            variationId: v.variationId,
            name: v.sizeValue,
            quantity: variationQuantities[v.variationId] || 0,
            price: v.priceUSD ?? product.priceUSD,
            stock: v.stockQuantity,
          })) || []
        }
        colorSelections={
          product.colorVariations?.filter(v => (colorVariationQuantities[v.variationId] || 0) > 0).map(v => ({
            variationId: v.variationId,
            name: v.colorValue,
            quantity: colorVariationQuantities[v.variationId] || 0,
            price: v.priceUSD ?? product.priceUSD,
            stock: v.stockQuantity,
          })) || []
        }
        // Use the calculated values from ProductDetailsScreen
        totalQuantity={activeQtyForPricing}
        calculatedTotalPrice={totalPriceNumber}
        activeUnitPrice={tieredUnitPrice}
        wholesaleSavings={originalPriceNumber > totalPriceNumber ? originalPriceNumber - totalPriceNumber : 0}
        activeTierRange={
          product.priceTiers && product.priceTiers.length > 0
            ? (() => {
                const sortedTiers = [...product.priceTiers].sort((a, b) => a.minQty - b.minQty);
                const currentTier = sortedTiers.filter(t => pricingQty >= t.minQty).pop();
                return currentTier ? `${currentTier.minQty}+` : undefined;
              })()
            : undefined
        }
      />

      {/* ==================== ADD TO CART BOTTOM SHEET ==================== */}
      <StartOrderBottomSheet
        visible={addToCartSheetVisible}
        onClose={() => setAddToCartSheetVisible(false)}
        onConfirmOrder={handleAddToCartFromSheet}
        product={product}
        mode="cart"
        variationSelections={
          product.variations?.filter(v => (variationQuantities[v.variationId] || 0) > 0).map(v => ({
            variationId: v.variationId,
            name: v.sizeValue,
            quantity: variationQuantities[v.variationId] || 0,
            price: v.priceUSD ?? product.priceUSD,
            stock: v.stockQuantity,
          })) || []
        }
        colorSelections={
          product.colorVariations?.filter(v => (colorVariationQuantities[v.variationId] || 0) > 0).map(v => ({
            variationId: v.variationId,
            name: v.colorValue,
            quantity: colorVariationQuantities[v.variationId] || 0,
            price: v.priceUSD ?? product.priceUSD,
            stock: v.stockQuantity,
          })) || []
        }
        totalQuantity={activeQtyForPricing}
        calculatedTotalPrice={totalPriceNumber}
        activeUnitPrice={tieredUnitPrice}
        wholesaleSavings={originalPriceNumber > totalPriceNumber ? originalPriceNumber - totalPriceNumber : 0}
        activeTierRange={
          product.priceTiers && product.priceTiers.length > 0
            ? (() => {
                const sortedTiers = [...product.priceTiers].sort((a, b) => a.minQty - b.minQty);
                const currentTier = sortedTiers.filter(t => pricingQty >= t.minQty).pop();
                return currentTier ? `${currentTier.minQty}+` : undefined;
              })()
            : undefined
        }
      />
    </SafeAreaView>
  );
};

// Specification Row Component - Uses AppText for Arabic-safe rendering
const SpecRow: React.FC<{
  label: string;
  value: string;
  valueColor?: string;
}> = ({ label, value, valueColor }) => {
  const { theme } = useTheme();
  const { i18n } = useTranslation();
  const isRTL = i18n?.language ? getDirection(i18n.language) === 'rtl' : false;

  return (
    <View
      style={[
        styles.specRow,
        { flexDirection: isRTL ? 'row-reverse' : 'row', borderBottomColor: theme.colors.border + '30' },
      ]}
    >
      <AppText
        fontSize={14}
        style={[styles.specLabel, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}
      >
        {label}
      </AppText>
      <AppText
        fontSize={14}
        style={[styles.specValue, { color: valueColor || theme.colors.text, textAlign: isRTL ? 'left' : 'right' }]}
      >
        {value}
      </AppText>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 18,
    marginTop: SPACING.md,
  },
  // Image Gallery
  imageGallery: {
    aspectRatio: 1,
    position: 'relative',
    width: '100%',
  },
  // Video Player container removed (moved to GoldenCarousel)
  imageWrapper: {
    aspectRatio: 1,
    width: SCREEN_WIDTH,
  },
  productImage: {
    height: '100%',
    width: '100%',
  },
  imagePlaceholder: {
    alignItems: 'center',
    aspectRatio: 1,
    justifyContent: 'center',
    width: SCREEN_WIDTH,
  },
  indicatorContainer: {
    bottom: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'center',
    left: 0,
    paddingHorizontal: SPACING.lg,
    position: 'absolute',
    right: 0,
  },
  dot: {
    borderRadius: 4,
    height: 8,
    marginHorizontal: 4,
    width: 8,
  },
  fabContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: SPACING.md,
    position: 'absolute',
    right: SPACING.md,
  },
  fabButton: {
    alignItems: 'center',
    borderRadius: 24,
    elevation: 0,
    height: 48,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    width: 48,
  },
  fabRight: {
    flexDirection: 'row',
  },
  cartBadge: {
    alignItems: 'center',
    backgroundColor: '#FF5A00',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 18,
    minWidth: 18,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -4,
    top: -4,
  },
  cartBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },

  // Product Info
  infoContainer: {
    marginTop: -SHEET_OVERLAP,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: SPACING.lg,
    paddingTop: SHEET_OVERLAP,
    paddingBottom: SPACING.md,
  },
  headerInfo: {
    marginBottom: SPACING.lg,
  },
  brandEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  productName: {
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 34,
    marginBottom: SPACING.xs,
  },
  partNumber: {
    fontSize: 14,
    letterSpacing: 0.3,
    marginBottom: SPACING.sm,
  },
  priceRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  price: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  // Referenced by the related-products strip. It was missing from the sheet, and
  // because this file is @ts-nocheck nothing flagged it — RN silently skips an
  // undefined style entry, so the price rendered at AppNumber's 14px default.
  relatedPrice: {
    fontSize: 15,
    fontWeight: '800',
  },
  stockBadge: {
    alignItems: 'center',
    borderRadius: 20,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: SPACING.md,
    paddingVertical: 3,
    // Hold the pill's intrinsic width: it used to shrink next to a long price
    // (e.g. $1,199.00), which clipped the stock count off "In Stock (40)".
    // The price block beside it wraps instead.
    flexShrink: 0,
  },
  stockDot: {
    borderRadius: 4,
    height: 8,
    marginHorizontal: SPACING.xs,
    width: 8,
  },
  stockText: {
    fontWeight: '600', // Consistent bold
    includeFontPadding: false, // GOLDEN FIX
    textAlignVertical: 'center', // Centers vertically
    paddingTop: Platform.OS === 'android' ? 1 : 0,
    // No flexShrink: the label must never be squeezed into an ellipsis/clip.
  },
  comparePrice: {
    fontSize: 16,
    fontWeight: '600',
    textDecorationLine: 'line-through',
    marginHorizontal: 8,
    marginBottom: 3,
  },
  saveBadge: {
    backgroundColor: '#E53935',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 8,
  },
  saveBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: SPACING.md,
  },
  chipDark: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chipAccent: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '700',
  },
  skuCard: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.md,
  },
  skuCell: {
    flex: 1,
    paddingHorizontal: SPACING.md,
  },
  skuDivider: {
    width: 1,
  },
  skuRowDivider: {
    height: 1,
    marginVertical: SPACING.md,
  },
  skuLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  skuValue: {
    fontSize: 15,
    fontWeight: '500',
  },
  brandCard: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.md,
  },
  brandLogoBox: {
    width: BRAND_LOGO_WIDTH,
    height: BRAND_LOGO_HEIGHT,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  brandLogo: {
    width: '100%',
    height: '100%',
  },
  brandWordmark: {
    fontWeight: '800',
    letterSpacing: 0.3,
    textAlign: 'center',
    // Android clips the last glyph of a bold string flush against its bounds.
    paddingHorizontal: 2,
  },
  brandCardText: {
    flex: 1,
  },
  brandCardName: {
    fontSize: 16,
    fontWeight: '700',
  },
  brandCardHint: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  infoCardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  infoCard: {
    flex: 1,
    borderRadius: 16,
    padding: SPACING.md,
    minHeight: 92,
  },
  infoCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  infoCardValue: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  overviewBar: {
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
  },
  paymentRow: {
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    marginTop: 10,
    gap: 10,
  },
  paymentText: {
    fontSize: 15,
    fontWeight: '600',
  },

  // Option chips
  optionChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChipsScrollContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: SPACING.md,
  },
  optionChip: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  optionChipText: {
    fontSize: 14,
    fontWeight: '500',
  },

  // Sections
  section: {
    marginBottom: SPACING.lg,
  },
  sectionHeader: {
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },

  // Tiers
  tiersContainer: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tierHeaderRow: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  tierHeaderText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  tierRow: {
    borderBottomWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  tierText: {
    flex: 1,
    fontSize: 14,
  },
  /* The MIDDLE COLUMN of the wholesale-tier table. Both of its call sites named a
     style that was never defined — `styles.stockStatusPrice` and `styles.tierPrice`
     — so the price cell resolved to `undefined` and rendered with no `flex: 1` at
     all, while the quantity column on its left and the saving on its right both
     had it. The three columns of that table have never lined up. */
  tierPrice: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  hintContainer: {
    alignItems: 'center',
    borderRadius: 8,
    marginTop: SPACING.sm,
    padding: SPACING.sm,
  },
  hintText: {
    flex: 1,
    fontSize: 13,
    marginLeft: SPACING.xs,
  },

  // ALIBABA TABLE
  alibabaTableHeader: {
    borderRadius: 8,
    flexDirection: 'row',
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  alibabaHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  alibabaTableRow: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  alibabaModelText: {
    fontSize: 14,
    fontWeight: '500',
  },
  alibabaStockCell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  alibabaStockText: {
    fontSize: 14,
    fontWeight: '600',
  },
  alibabaQtyCell: {
    alignItems: 'center',
    flexDirection: 'row',
    // Keeps the steppers off the STOCK number even when the row is tight.
    gap: 6,
    justifyContent: 'flex-end',
  },
  alibabaQtyButton: {
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  alibabaQtyText: {
    fontSize: 14,
    fontWeight: '600',
    marginHorizontal: SPACING.sm,
    minWidth: 24,
    textAlign: 'center',
  },
  alibabaTotalRow: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  alibabaTotalText: {
    fontSize: 14,
    fontWeight: '600',
  },
  alibabaTotalCount: {
    fontSize: 16,
    fontWeight: '700',
    marginHorizontal: SPACING.xs,
  },

  // Quantity
  quantityContainer: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 24,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderWidth: 1,
  },
  quantityButton: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  quantityText: {
    fontSize: 18,
    fontWeight: '600',
    marginHorizontal: SPACING.xs,
    minWidth: 40,
    textAlign: 'center',
    height: 40,
    paddingVertical: 0,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },

  // Description
  descriptionText: {
    fontSize: 15,
    letterSpacing: 0.1,
    lineHeight: 24,
  },

  // Specs
  specsContainer: {
    borderRadius: 16,
    padding: SPACING.md,
  },
  specRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
  },
  specLabel: {
    flex: 1,
    fontSize: 14,
  },
  specValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },

  // Related
  relatedContainer: {
    paddingHorizontal: SPACING.md,
  },
  relatedProductWrapper: {
    marginRight: SPACING.md,
    width: SCREEN_WIDTH * 0.4,
  },

  // ===============================
  // Alibaba-style bottom bar
  // ===============================
  alibabaBar: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  alibabaBarRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  alibabaIconAction: {
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 70,
    minWidth: 55,
    paddingVertical: 4,
  },
  alibabaIconLabel: {
    fontWeight: '500',
    includeFontPadding: false,
    marginTop: 2,
    textAlign: 'center',
  },
  alibabaChatPill: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    height: 46,
    justifyContent: 'center',
    marginHorizontal: 12,
    paddingHorizontal: 16,
  },
  alibabaChatText: {
    fontWeight: '600',
    includeFontPadding: false,
    marginLeft: 8,
  },
  alibabaTotalButton: {
    alignItems: 'center',
    backgroundColor: '#FF5A00',
    borderRadius: 999,
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    minHeight: 46,
    minWidth: 160,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  alibabaTotalLabel: {
    color: '#FFFFFF',
    includeFontPadding: false,
  },
  alibabaTotalValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },

  // Modal
  modalContainer: {
    backgroundColor: 'rgba(0,0,0,0.9)',
    flex: 1,
  },
  modalContent: {
    flex: 1,
  },
  modalCloseButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    position: 'absolute',
    right: SPACING.md,
    width: 44,
    zIndex: 1,
  },
  modalScrollView: {
    flex: 1,
  },
  modalImageWrapper: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    width: SCREEN_WIDTH,
  },
  modalImage: {
    aspectRatio: 1,
    width: SCREEN_WIDTH,
  },

  // Skeleton
  skeletonText: {
    borderRadius: 4,
  },
  skeletonCircle: {
    borderRadius: 18,
    height: 36,
    width: 36,
  },
  skeletonSpec: {
    borderRadius: 8,
    height: 40,
    marginTop: 8,
    width: '100%',
  },
  skeletonRelatedCard: {
    marginRight: SPACING.md,
    width: 140,
  },
  skeletonRelatedImage: {
    aspectRatio: 1,
    borderRadius: 8,
    width: '100%',
  },


  // Store Info Styles
  storeCard: {
    borderRadius: 18,
    borderWidth: 1,
    marginTop: SPACING.xs,
    padding: SPACING.md,
  },
  storeHeader: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  storeIconContainer: {
    alignItems: 'center',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    marginHorizontal: SPACING.sm,
    width: 48,
  },
  storeHeaderText: {
    flex: 1,
  },
  storeName: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  storeLocation: {
    fontSize: 13,
    marginHorizontal: 4,
  },
  storeActions: {
    gap: SPACING.sm,
    justifyContent: 'space-between',
  },
  storeActionButton: {
    alignItems: 'center',
    borderRadius: 12,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingVertical: 10,
  },
  storeActionText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  // Alibaba-style Store Card additions
  storeLogo: {
    borderRadius: 28,
    height: 56,
    marginHorizontal: SPACING.sm,
    width: 56,
  },
  verifiedBadge: {
    alignItems: 'center',
    borderRadius: 8,
    height: 16,
    justifyContent: 'center',
    // marginHorizontal, not marginLeft: the badge sits on the other side of the name in RTL.
    marginHorizontal: 6,
    width: 16,
  },
  viewStoreButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  viewStoreButtonInner: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  viewStoreButtonText: {
    fontSize: 12,
    fontWeight: Platform.OS === 'android' ? 'normal' : '600',
    textAlign: 'center',
  },
});

export default ProductDetailsScreen;