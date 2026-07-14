// @ts-nocheck
import { supabase } from '../services/supabase';
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
import { useFavorites } from '../contexts/FavoritesContext';
import { COLLECTIONS } from '../constants/config';
import Button from '../components/Button';
import { Chip, Surface, Divider, Badge } from 'react-native-paper';
import AppNumber from '../components/AppNumber';
import AppText from '../components/AppText';

import { formatPrice } from '../utils/currency';
import { getProductImageUrls } from '../utils/imageUtils';
import { ProductService } from '../services/productService';
import { getDirection } from '../locales';
import { SPACING } from '../constants/theme';
import GoldenCarousel from '../components/GoldenCarousel';
import { getOrCreateConversation, findConversationByTenant } from '../services/chatService';
import StartOrderBottomSheet from '../components/StartOrderBottomSheet';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Alibaba-style bottom bar is shorter than the old CTA.
// Keep this close to the real bar height (excluding safe-area inset).
const CTA_BAR_HEIGHT = 80;

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
  const { user } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites(); // FIXED: Add missing hook
  const { currency: currentCurrency, exchangeRateIQD } = useCurrency();

  const scrollViewRef = useRef<ScrollView>(null); // FIXED: Add missing ref
  const imageRef = useRef<View>(null); // FIXED: Add missing ref

  const { productId } = route.params;

  // State
  const [product, setProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingToCart, setAddingToCart] = useState(false);
  const [quantity, setQuantity] = useState(1);
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

  // Load product data
  useEffect(() => {
    loadProductData();
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
   * Load store profile from tenants/{tenantId}/public/storeProfile
   * Falls back to legacy tenant doc + locations query if profile doesn't exist
   */
  const loadStoreInfo = async (tid: string) => {
    try {
      setStoreInfoLoading(true);
      
      // STEP 1: Try public store profile first (new approach)
      const { data: profile } = await supabase
        .from('store_profiles')
        .select('*')
        .eq('tenant_id', tid)
        .single();
      
      if (profile) {
        // Map profile to display info - Alibaba-style Store Card
        const displayInfo: StoreDisplayInfo = {
          storeName: profile.store_name,
          storeNameAr: profile.store_name_ar,
          storeNameKu: profile.store_name_ku,
          logoUrl: profile.logo_url,
          isVerified: profile.is_verified,
          phone: profile.phone,
          whatsapp: profile.whatsapp || profile.phone,
          city: profile.city,
          addressText: profile.address_text,
          addressTextAr: profile.address_text_ar,
          addressTextKu: profile.address_text_ku,
          location: profile.latitude && profile.longitude ? {
            lat: profile.latitude,
            lng: profile.longitude,
          } : undefined,
          tenantId: tid,
        };
        
        setStoreInfo(displayInfo);
        return;
      }
      
      // STEP 2: Fallback to legacy approach (tenant doc + locations query)
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', tid)
        .single();
      
      if (!tenantData) {
        setStoreInfo(null);
        return;
      }
      
      // Query locations by ownerUid
      let storeLocation: StoreLocation | null = null;
      
      if (tenantData.owner_uid) {
        const { data: locations } = await supabase
          .from('store_locations')
          .select('*')
          .eq('created_by_admin_id', tenantData.owner_uid)
          .eq('is_active', true);
        
        if (locations && locations.length > 0) {
          storeLocation = locations.find(loc => loc.type === 'main') as any 
            || locations[0] as any;
        }
      }
      
      // Build display info from legacy data
      const displayInfo: StoreDisplayInfo = {
        storeName: tenantData.store_name,
        storeNameAr: tenantData.store_name_ar,
        storeNameKu: tenantData.store_name_ku,
        phone: storeLocation?.phone || tenantData.phone,
        whatsapp: tenantData.whatsapp || storeLocation?.phone || tenantData.phone,
        city: storeLocation?.city,
        addressText: storeLocation?.address || storeLocation?.name,
        addressTextAr: storeLocation?.addressAr || storeLocation?.nameAr,
        addressTextKu: storeLocation?.addressKu || storeLocation?.nameKu,
        location: (storeLocation?.lat && storeLocation?.lng) 
          ? { lat: storeLocation.lat, lng: storeLocation.lng } 
          : undefined,
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

  const loadProductData = async () => {
    try {
      setLoading(true);

      // Fetch product directly by ID from the `parts` table (mapped snake_case→camelCase).
      const product = await ProductService.getProduct(productId);

      if (!product) {
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
      const tid = product.tenantId;
      setTenantId(tid);
      setStoreExpanded(true); // Start expanded

      if (tid) {
        loadStoreInfo(tid);
      } else {
        setStoreInfo(null);
      }

      // Fetch related products in background (same category)
      try {
        if (product.category) {
          const relatedAll = await ProductService.getProductsByCategory(product.category);
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
        setRelatedProducts([]);
      }
      } catch (error: any) {
        console.error('Error loading product:', error);
        Alert.alert(t('errors.error'), t('errors.failedToLoadProduct') + ': ' + error.message);
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
      const selectedOptions: { color?: string; size?: string } | undefined =
        selectedColor || selectedSize
          ? {
              ...(selectedColor && { color: selectedColor }),
              ...(selectedSize && { size: selectedSize }),
            }
          : undefined;

      await addToCart(product.id, quantity, product, selectedOptions);

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
      const shareUrl = `https://www.haryadautoparts.com/product/${product.id}`;

      await Share.share({
        message: `${product.name} - ${product.partNumber}\n${formatPrice(
          product.priceUSD,
          currentCurrency as any,
          exchangeRateIQD
        )}\n\nCheck out this Volvo spare part on Haryad Auto Part app!\n${shareUrl}`,
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
    const newQuantity = Math.max(1, Math.min(quantity + delta, product?.stockQty || 1));
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
        style={[styles.container, { backgroundColor: isDark ? theme.colors.background : '#FFF3E0' }]}
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

  // Gallery images from product
  const galleryImages = product.imageUrls || [];

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
  const hasSizeVariations = !!(product.variations && product.variations.length > 0);
  const hasColorVariations = !!(product.colorVariations && product.colorVariations.length > 0);
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

  // Calculate the tiered unit price based on the total quantity (for wholesale pricing)
  const isVip = user?.role === 'vip';
  const tieredUnitPrice = LocalCartService.getTieredPrice(product, pricingQty, isVip);

  // Calculate total price:
  // - For simple products: tieredUnitPrice × quantity
  // - For variation products: sum of (variation price × qty) for each selected variation,
  //   but apply the tiered discount if total qty reaches a wholesale tier
  // Calculate total price:
  // - For simple products: tieredUnitPrice × quantity
  // - For variation products: sum of (variation price × qty) for each selected variation,
  //   but apply the tiered discount if total qty reaches a wholesale tier
  let totalPriceNumber = 0;
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
    // Simple product
    const qty = activeQtyForPricing > 0 ? activeQtyForPricing : 0;
    totalPriceNumber = tieredUnitPrice * qty;
    originalPriceNumber = product.priceUSD * qty;
  }
  
  const totalPriceText = formatPrice(totalPriceNumber, currentCurrency as any, exchangeRateIQD);
  const savingsAmount = Math.max(0, originalPriceNumber - totalPriceNumber);
  const showSavings = savingsAmount > 0;

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
    // ALIBABA: Open the Start Order bottom sheet instead of going to cart directly
    setStartOrderVisible(true);
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
        await addToCart(product.id, orderData.quantity, product);
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
        // Simple product without variations
        await addToCart(product.id, orderData.quantity, product);
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
      style={[styles.container, { backgroundColor: isDark ? theme.colors.background : '#FFF3E0' }]}
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
              <View style={[styles.fabContainer, { top: SPACING.md }]}>
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
                    bottom: SPACING.md,
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
            <View style={styles.infoContainer}>
              {/* Header Info */}
              <View style={styles.headerInfo}>
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

                <Text allowFontScaling={false}
                  style={[
                    styles.partNumber,
                    { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' },
                  ]}
                >
                  {t('product.partNumber')}: {product.partNumber}
                </Text>

                <View style={[styles.priceRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <AppNumber
                    value={formatPrice(product.priceUSD, currentCurrency as any, exchangeRateIQD)}
                    style={[styles.price, { color: theme.colors.primary }]}
                  />

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
                      adjustsFontSizeToFit
                      minimumFontScale={0.5}
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
                        ? t('product.inStock', { count: effectiveStock })
                        : t('product.outOfStock').replace(/ /g, '\u00A0')}
                    </AppText>
                  </View>
                </View>
              </View>

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
                        value={formatPrice(product.priceUSD, currentCurrency as any, exchangeRateIQD)}
                        style={[
                          styles.stockStatusPrice, 
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
                    <View style={{ backgroundColor: theme.colors.success, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 }}>
                      <Text allowFontScaling={false} style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>
                        {t('product.total', { defaultValue: 'Total' })}: {sizeStock}
                      </Text>
                    </View>
                  </View>

                  {/* Table Header */}
                  <View style={[styles.alibabaTableHeader, { backgroundColor: theme.colors.surface, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <Text allowFontScaling={false} style={[styles.alibabaHeaderText, { color: theme.colors.textSecondary, flex: 2, textAlign: isRTL ? 'right' : 'left' }]}>
                      {t('product.modelNumber', { defaultValue: 'Model' })}
                    </Text>
                    <Text allowFontScaling={false} style={[styles.alibabaHeaderText, { color: theme.colors.textSecondary, flex: 1, textAlign: 'center' }]}>
                      {t('product.stock', { defaultValue: 'Stock' })}
                    </Text>
                    <Text allowFontScaling={false} style={[styles.alibabaHeaderText, { color: theme.colors.textSecondary, flex: 1.5, textAlign: isRTL ? 'left' : 'right' }]}>
                      {t('product.quantity', { defaultValue: 'Qty' })}
                    </Text>
                  </View>

                  {/* Rows */}
                  {product.variations.map((variation, index) => {
                    const isOutOfStock = variation.stockQuantity <= 0;
                    const currentQty = variationQuantities[variation.variationId] || 0;
                    const sizeDisplay = `${variation.sizeValue} ${variation.sizeUnit}`.trim();

                    return (
                      <View
                        key={variation.variationId}
                        style={[
                          styles.alibabaTableRow,
                          {
                            backgroundColor: currentQty > 0 ? theme.colors.primary + '08' : 'transparent',
                            borderBottomColor: theme.colors.border,
                            borderBottomWidth: index < product.variations!.length - 1 ? 1 : 0,
                            flexDirection: isRTL ? 'row-reverse' : 'row',
                          },
                        ]}
                      >
                        <Text allowFontScaling={false}
                          style={[
                            styles.alibabaModelText,
                            {
                              color: isOutOfStock ? theme.colors.textSecondary : theme.colors.text,
                              textDecorationLine: isOutOfStock ? 'line-through' : 'none',
                              flex: 2,
                              textAlign: isRTL ? 'right' : 'left',
                            },
                          ]}
                          numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}
                        >
                          {sizeDisplay}
                        </Text>

                        <View style={[styles.alibabaStockCell, { flex: 1 }]}>
                          <AppNumber
                            value={variation.stockQuantity}
                            style={[
                              styles.alibabaStockText,
                              { color: isOutOfStock ? theme.colors.error : theme.colors.success },
                            ]}
                          />
                        </View>

                        <View style={[styles.alibabaQtyCell, { flex: 1.5, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                          <TouchableOpacity
                            onPress={() => updateVariationQuantity(variation.variationId, -1)}
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
                            value={variationQtyTexts[variation.variationId] !== undefined ? variationQtyTexts[variation.variationId] : String(currentQty)}
                            onChangeText={(text) => handleVariationExact(variation.variationId, text, variation.stockQuantity)}
                            onBlur={() => handleVariationBlur(variation.variationId, variation.stockQuantity)}
                            keyboardType="number-pad"
                            selectTextOnFocus
                            style={[styles.alibabaQtyText, { 
                              color: theme.colors.text,
                              backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                              minWidth: 40,
                              height: 40,
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
                            onPress={() => updateVariationQuantity(variation.variationId, 1)}
                            disabled={isOutOfStock || currentQty >= variation.stockQuantity}
                            activeOpacity={0.7}
                            style={[
                              styles.alibabaQtyButton,
                              {
                                borderColor:
                                  isOutOfStock || currentQty >= variation.stockQuantity
                                    ? theme.colors.border
                                    : theme.colors.primary,
                                opacity: isOutOfStock || currentQty >= variation.stockQuantity ? 0.4 : 1,
                              },
                            ]}
                          >
                            <Ionicons
                              name="add"
                              size={16}
                              color={
                                isOutOfStock || currentQty >= variation.stockQuantity
                                  ? theme.colors.textSecondary
                                  : theme.colors.primary
                              }
                            />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}

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

              {/* ALIBABA VARIATION: Table-style color variation selector */}
              {product.colorVariations && product.colorVariations.length > 0 ? (
                <View style={styles.section}>
                  <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text, marginBottom: 0 }]}>
                      🎨 {t('product.selectColor', { defaultValue: 'Select Color' })}
                    </Text>
                    <View style={{ backgroundColor: theme.colors.success, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 }}>
                      <Text allowFontScaling={false} style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>
                        {t('product.total', { defaultValue: 'Total' })}: {colorStock}
                      </Text>
                    </View>
                  </View>

                  {/* Table Header */}
                  <View style={[styles.alibabaTableHeader, { backgroundColor: theme.colors.surface, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <Text allowFontScaling={false} style={[styles.alibabaHeaderText, { color: theme.colors.textSecondary, flex: 2, textAlign: isRTL ? 'right' : 'left' }]}>
                      {t('product.color', { defaultValue: 'Color' })}
                    </Text>
                    <Text allowFontScaling={false} style={[styles.alibabaHeaderText, { color: theme.colors.textSecondary, flex: 1, textAlign: 'center' }]}>
                      {t('product.stock', { defaultValue: 'Stock' })}
                    </Text>
                    <Text allowFontScaling={false} style={[styles.alibabaHeaderText, { color: theme.colors.textSecondary, flex: 1.5, textAlign: isRTL ? 'left' : 'right' }]}>
                      {t('product.quantity', { defaultValue: 'Qty' })}
                    </Text>
                  </View>

                  {/* Rows */}
                  {product.colorVariations.map((colorVar, index) => {
                    const isOutOfStock = colorVar.stockQuantity <= 0;
                    const currentQty = colorVariationQuantities[colorVar.variationId] || 0;

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
                        <View style={{ flex: 2, flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }}>
                          {/* Color swatch */}
                          <View
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: 10,
                              backgroundColor: colorVar.colorHex || colorVar.colorValue.toLowerCase(),
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
                            {t(`product.colors.${colorVar.colorValue.toLowerCase()}`, colorVar.colorValue)}
                          </Text>
                        </View>

                        <View style={[styles.alibabaStockCell, { flex: 1 }]}>
                          <AppNumber
                            value={colorVar.stockQuantity}
                            style={[
                              styles.alibabaStockText,
                              { color: isOutOfStock ? theme.colors.error : theme.colors.success },
                            ]}
                          />
                        </View>

                        <View style={[styles.alibabaQtyCell, { flex: 1.5, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
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
                              minWidth: 40,
                              height: 40,
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
                      {product.options.colors.map(color => {
                        const isLightColor = ['white', 'yellow', 'cream', 'ivory', 'beige', 'lightgray', 'silver'].includes(color.toLowerCase());
                        const textColor = isLightColor ? '#000000' : '#FFFFFF';
                        const isSelected = selectedColor === color;

                        return (
                          <TouchableOpacity
                            key={color}
                            style={[
                              styles.optionChip,
                              {
                                borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                                backgroundColor: color.toLowerCase(),
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
              {product.description && (
                <View style={styles.section}>
                  <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                    {t('product.description')}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.descriptionText, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
                    {product.description}
                  </Text>
                </View>
              )}

              <Divider style={{ marginVertical: 4 }} />

              {/* Specifications */}
              <View style={styles.section}>
                <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('product.specifications')}
                </Text>

                <Surface style={[styles.specsContainer, { backgroundColor: theme.colors.surface }]} elevation={1}>
                  <SpecRow label={t('product.partNumber')} value={product.partNumber} />
                  <SpecRow label={t('product.category')} value={translateCategory(product)} />
                  <SpecRow label={t('product.brand')} value={product.brand} />
                  {product.condition && <SpecRow label={t('product.condition')} value={product.condition} />}
                  {product.warranty && <SpecRow label={t('product.warranty')} value={product.warranty} />}
                  <SpecRow
                    label={t('product.availability')}
                    value={
                      product.status === 'on_the_way'
                        ? t('products.status.onTheWay', { defaultValue: 'On The Way' })
                        : product.status === 'coming_soon'
                        ? t('products.status.comingSoon', { defaultValue: 'Coming Soon' })
                        : inStock
                        ? t('product.available')
                        : t('product.unavailable')
                    }
                    valueColor={
                      product.status === 'on_the_way'
                        ? '#2196F3'
                        : product.status === 'coming_soon'
                        ? '#FF9800'
                        : inStock
                        ? theme.colors.success
                        : theme.colors.error
                    }
                  />
                </Surface>
              </View>



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
                              value={formatPrice(item.priceUSD, currentCurrency as any, exchangeRateIQD)}
                              style={[
                                styles.relatedPrice, 
                                { color: theme.colors.primary }
                              ]}
                              numberOfLines={1}
                              adjustsFontSizeToFit
                              minimumFontScale={0.85}
                            />
                          </View>
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
                          {t('product.startOrder', { defaultValue: 'Start Order' })}
                        </AppText>
                    
                        <AppNumber value={totalPriceText} style={styles.alibabaTotalValue} />
                       
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
    padding: SPACING.md,
  },
  headerInfo: {
    marginBottom: SPACING.lg,
  },
  productName: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.3,
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
  },
  price: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  stockBadge: {
    alignItems: 'center',
    borderRadius: 20,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: SPACING.md,
    paddingVertical: 3,
    flexShrink: 1,
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
    flexShrink: 1,
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
    marginLeft: 6,
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