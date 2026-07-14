import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  FlatList,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';

import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../../locales';
import { getThumbnailUrl } from '../../utils/imageUtils';
import { useTheme } from '../../components/ThemeProvider';
import { useTenant } from '../../contexts/TenantContext';
import MasonryProductCard from '../../components/MasonryProductCard';
import AppNumber from '../../components/AppNumber';
import Logo from '../../components/Logo';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Product } from '../../types';
import ProductService from '../../services/productService';
import { useAuth } from '../../contexts/AuthContext';
import { storeProfileService, StoreProfile } from '../../services/storeProfileService';
import settingsService from '../../services/settingsService';
import bannerService from '../../services/bannerService';
import { useNavigation } from '@react-navigation/native';
import { useCart } from '../../contexts/CartContext';
import { useFavorites } from '../../contexts/FavoritesContext';
import { useBadgeCount } from '../../contexts/NotificationContext';
import LanguagePicker from '../../components/LanguagePicker';
import BannerCarousel from '../../components/BannerCarousel';
import StartOrderBottomSheet from '../../components/StartOrderBottomSheet';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// GOLDEN TEMPLATE: Bottom nav height for padding calculation
const BOTTOM_NAV_HEIGHT = 80;
const PAGE_SIZE = 20;

// Banner carousel configuration — loaded from Firestore
const BANNER_AUTO_SCROLL_INTERVAL = 4000; // 4 seconds



interface Banner {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  backgroundColor: string;
  isActive: boolean;
}

interface Category {
  id: string;
  name: string;
  icon: string;
  count: number;
}

/**
 * HOME SCREEN - GOLDEN TEMPLATE
 * 
 * Architecture:
 * SafeAreaView (edges: ['top','left','right'])
 *  └── KeyboardAvoidingView
 *      └── FlatList (SINGLE vertical scroll owner)
 *          ├── ListHeaderComponent (header, banner, categories)
 *          ├── Product Cards (infinite feed)
 *          └── contentContainerStyle.paddingBottom for bottom nav
 * 
 * Rules enforced:
 * - ONE vertical scroll owner
 * - NO fixed heights (aspectRatio only)
 * - NO layout animations
 * - Header INSIDE the scroll
 * - Guest can browse freely
 */
const HomeScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { addToCart } = useCart();
  const { favoritesCount, isFavorite: isFavorites, toggleFavorite } = useFavorites(); // Renamed to isFavorites to avoid conflict if needed, or just use isFavorite
  const { tenantId } = useTenant();
  const { user, isVip } = useAuth(); // Import isVip and user from AuthContext
  // ALIBABA-STYLE: Real-time badge from NotificationContext (no polling)
  const badgeCount = useBadgeCount();

  // Ref for scroll-to-top functionality
  const flatListRef = useRef<FlatList>(null);
  const paginationRef = useRef({ page: 1, hasMore: true });

  // State
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
  const [showScrollHint, setShowScrollHint] = useState(false); // For scroll-to-top button
  const [cartSheetProduct, setCartSheetProduct] = useState<Product | null>(null);
  const [cartSheetVisible, setCartSheetVisible] = useState(false);

  // Data states
  const [banners, setBanners] = useState<Banner[]>([]);
  const [newArrivals, setNewArrivals] = useState<Product[]>([]);
  const [storeProfile, setStoreProfile] = useState<StoreProfile | null>(null);

  // Banner images — loaded from Firestore
  const [bannerImages, setBannerImages] = useState<any[]>([]);

  // Load data on mount and whenever tenantId changes (single effect avoids a double load).
  useEffect(() => {
    loadData();
  }, [tenantId]);



  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadBanners(),
        loadNewArrivals(),
      ]);
    } catch (error) {
      Alert.alert(t('common.error'), t('errors.loadingData'));
    } finally {
      setLoading(false);
    }
  };



  const loadBanners = async () => {
    try {
      const firestoreBanners = await bannerService.getBanners(true);
      const next = firestoreBanners.length > 0 ? firestoreBanners.map(b => ({ uri: b.imageUrl })) : [];
      // Keep the SAME array reference when the banners haven't changed, so repeat
      // loads on mount (tenantId resolving in stages) don't re-render the memoized
      // carousel and re-trigger the image fade — that's what made it flash ~3×.
      setBannerImages((prev) => {
        const same = prev.length === next.length && prev.every((p, i) => p.uri === next[i].uri);
        return same ? prev : next;
      });
    } catch (error) {
      setBannerImages((prev) => (prev.length === 0 ? prev : []));
    }
  };



  const loadNewArrivals = async () => {
    try {
      const { products, pagination } = await ProductService.getProducts(
        {}, // Use default sort (sortOrder first, then createdAt desc)
        { page: 1, limit: PAGE_SIZE, total: 0, hasMore: true }, // RESTORED PAGINATION
        tenantId ?? undefined
      );

      // Update pagination ref
      if (pagination) {
        paginationRef.current = {
          page: 1,
          hasMore: pagination.hasMore
        };
      }
      setNewArrivals(products || []);

      // Prefetch first 6 images for instant display
      if (products && products.length > 0) {
        const imagesToPrefetch = products
          .slice(0, 6)
          .map(p => p.imageUrls?.[0])
          .filter((url): url is string => !!url);

        if (imagesToPrefetch.length > 0) {
          imagesToPrefetch.forEach(url => Image.prefetch(getThumbnailUrl(url, 400)));
        }
      }
    } catch (error) {
      setNewArrivals([]);
    }
  };

  const loadMoreProducts = async () => {
    if (!paginationRef.current.hasMore || loading) return;

    try {
      const nextPage = paginationRef.current.page + 1;
      const { products, pagination } = await ProductService.getProducts(
        {}, // Use default sort (sortOrder first, then createdAt desc)
        { page: nextPage, limit: PAGE_SIZE, total: 0, hasMore: true },
        tenantId ?? undefined
      );

      if (products && products.length > 0) {
        setNewArrivals(prev => {
          // Filter out duplicates based on ID
          const newProducts = products.filter(
            p => !prev.some(existing => existing.id === p.id)
          );
          return [...prev, ...newProducts];
        });

        // Prefetch next batch images
        const imagesToPrefetch = products
          .slice(0, 4)
          .map(p => p.imageUrls?.[0])
          .filter((url): url is string => !!url);
        if (imagesToPrefetch.length > 0) {
          imagesToPrefetch.forEach(url => Image.prefetch(getThumbnailUrl(url, 400)));
        }

        if (pagination) {
          paginationRef.current = {
            page: nextPage,
            hasMore: pagination.hasMore
          };
        }
      } else {
        paginationRef.current.hasMore = false;
      }
    } catch (error) {
      // Silent fail for pagination
    }
  };



  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await ProductService.clearCache();
    } catch (error) {
      // Ignore cache clearing errors
    }
    await loadData();
    setRefreshing(false);
  }, []);

  const handleProductPress = useCallback((productId: string) => {
    navigation.navigate('ProductDetails', { productId });
  }, [navigation]);

  const handleAddToCartPress = useCallback((productId: string, product: Product) => {
    if (!product) return;
    setCartSheetProduct(product);
    setCartSheetVisible(true);
  }, []);

  // Confirm handler for the Add to Cart bottom sheet
  const handleCartSheetConfirm = useCallback(async (orderData: {
    quantity: number;
    paymentMethod: string;
    notes?: string;
    addressId?: string;
    variationSelections?: any[];
    colorSelections?: any[];
  }) => {
    if (!cartSheetProduct) return;
    try {
      // Check for variation selections
      const hasVarSelections = (orderData.variationSelections && orderData.variationSelections.length > 0) ||
        (orderData.colorSelections && orderData.colorSelections.length > 0);

      if (hasVarSelections) {
        // Navigate to product details for variant products
        setCartSheetVisible(false);
        navigation.navigate('ProductDetails', { productId: cartSheetProduct.id });
        return;
      }

      await addToCart(cartSheetProduct.id, orderData.quantity, cartSheetProduct);
      setCartSheetVisible(false);
    } catch (error: any) {
      if (error.message !== 'DIFFERENT_TENANT') {
        Alert.alert(t('common.error'), t('errors.addToCart'));
      }
    }
  }, [cartSheetProduct, addToCart, navigation, t]);



  const handleSearchPress = useCallback(() => {
    navigation.navigate('Search');
  }, [navigation]);

  const handleNotificationPress = useCallback(() => {
    navigation.navigate('Notifications');
  }, [navigation]);

  const handleFavoritesPress = useCallback(() => {
    navigation.navigate('Favorites');
  }, [navigation]);

  const handleLanguageSelect = (languageCode: string) => {
    changeLanguage(languageCode);
  };

  // GOLDEN TEMPLATE: ListHeaderComponent contains content that scrolls WITH the list.
  // It MUST be a stable reference: an inline `() => ...` gives ListHeaderComponent a
  // brand-new component type every render, so FlatList remounts the whole header
  // (including the BannerCarousel) on each pagination/scroll re-render. That reset the
  // banner's measured aspect ratio to null → it jumped to the fallback height ("banner
  // gets big") and, because the image is cached, onLoad didn't re-fire to fix it.
  // Depend on the BOOLEAN hasArrivals (NOT the newArrivals array) so loading more
  // products never changes this callback's identity.
  const hasArrivals = newArrivals.length > 0;
  const renderListHeader = useCallback(() => {
    return (
      <View>
        {/* Banner Section - Only show if banners exist */}
        {bannerImages.length > 0 && (
          <BannerCarousel images={bannerImages} />
        )}

        {/* New Arrivals — Luxury Section Header */}
        {hasArrivals && (
          <View style={[styles.sectionHeader, { marginTop: 16, marginBottom: 12 }]}>
            <Text allowFontScaling={false} style={{
              fontSize: 13, fontWeight: '600',
              color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.38)',
              letterSpacing: 0.5, textTransform: 'uppercase',
            }}>
              {t('home.newArrivals')}
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Categories')}
              activeOpacity={0.7}
              style={{
                backgroundColor: theme.colors.primary + '12',
                paddingHorizontal: 14, paddingVertical: 6,
                borderRadius: 12,
              }}
            >
              <Text allowFontScaling={false} style={{ fontSize: 13, fontWeight: '600', color: theme.colors.primary }}>
                {t('common.seeAll')}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }, [bannerImages, hasArrivals, isDark, t, navigation, theme.colors.primary]);



  // Product card renderer - 2 column grid (memoized to prevent re-renders)
  const renderProduct = useCallback(({ item, index }: { item: Product; index: number }) => {
    return (
      <View style={[
        styles.productCardWrapper,
        {
          paddingLeft: 0,
          paddingRight: 0,
        }
      ]}>
        <MasonryProductCard
          product={item}
          onPress={handleProductPress}
          onAddToCart={handleAddToCartPress}
          // GOLDEN ESTIMATION: Pass pure props to avoid internal context hooks in list items
          isFavorite={isFavorites(item.id)}
          onToggleFavorite={toggleFavorite}
        />
      </View>
    );
  }, [handleProductPress, handleAddToCartPress, isFavorites, toggleFavorite]);



  // Empty list component
  const renderEmptyProducts = () => (
    <View style={[
      styles.emptyState,
      {
        backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
        marginHorizontal: 20, borderRadius: 16,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: isDark ? 0 : 0.06, shadowRadius: 8, elevation: 2,
      }
    ]}>
      <View style={{
        width: 64, height: 64, borderRadius: 20,
        backgroundColor: theme.colors.primary + '12',
        justifyContent: 'center', alignItems: 'center', marginBottom: 16,
      }}>
        <Ionicons name="cube-outline" size={28} color={theme.colors.primary} />
      </View>
      <Text allowFontScaling={false} style={{ fontSize: 17, fontWeight: '600', color: theme.colors.text, textAlign: 'center' }}>
        {t('home.noProducts', { defaultValue: 'No products available' })}
      </Text>
      <Text allowFontScaling={false} style={{ fontSize: 14, color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)', textAlign: 'center', marginTop: 6 }}>
        Pull down to refresh
      </Text>
    </View>
  );

  // =================================================================
  // ALIBABA: Skeleton Loading (static, no shimmer)
  // Matches real layout with aspectRatio - prevents layout shift
  // =================================================================
  if (loading) {
    const skBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
    const pageBg = isDark ? theme.colors.background : '#F5F5F7';

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: pageBg }]} edges={['top', 'left', 'right']}>
        <StatusBar style={isDark ? 'light' : 'dark'} translucent backgroundColor="transparent" />

        {/* Skeleton Header */}
        <View style={[styles.header, { backgroundColor: isDark ? theme.colors.surface : '#FFFFFF' }]}>
          <View style={styles.headerLeft}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: skBg }} />
            <View style={{ marginLeft: 10 }}>
              <View style={{ width: 100, height: 14, borderRadius: 7, backgroundColor: skBg }} />
              <View style={{ width: 60, height: 10, borderRadius: 5, backgroundColor: skBg, marginTop: 6 }} />
            </View>
          </View>
          <View style={styles.headerRight}>
            {[1, 2, 3, 4].map((i) => (
              <View key={i} style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: skBg, marginLeft: 8 }} />
            ))}
          </View>
        </View>

        {/* Skeleton Banner */}
        <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
          <View style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 16, backgroundColor: skBg }} />
        </View>

        {/* Skeleton Section Label */}
        <View style={{ paddingHorizontal: 20, marginTop: 20, flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={{ width: 100, height: 12, borderRadius: 6, backgroundColor: skBg }} />
          <View style={{ width: 60, height: 24, borderRadius: 12, backgroundColor: skBg }} />
        </View>

        {/* Skeleton Products */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, marginTop: 12 }}>
          {[1, 2, 3, 4].map((i) => (
            <View key={i} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 12 }}>
              <View style={{
                backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
                borderRadius: 16, overflow: 'hidden',
                shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                shadowOpacity: isDark ? 0 : 0.04, shadowRadius: 6, elevation: 1,
              }}>
                <View style={{ width: '100%', aspectRatio: 1, backgroundColor: skBg }} />
                <View style={{ padding: 12 }}>
                  <View style={{ width: '80%', height: 12, borderRadius: 6, backgroundColor: skBg }} />
                  <View style={{ width: '50%', height: 12, borderRadius: 6, backgroundColor: skBg, marginTop: 8 }} />
                </View>
              </View>
            </View>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    // GOLDEN TEMPLATE: SafeAreaView with edges (NO bottom - handled by padding)
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? theme.colors.background : '#FAFAF5' }]}
      edges={['top', 'left', 'right']}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} translucent backgroundColor="transparent" />

      {/* ---- Luxury Header ---- */}
      <View style={[
        styles.header,
        {
          backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
          shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isDark ? 0 : 0.05, shadowRadius: 12,
          elevation: 3, zIndex: 10,
        },
      ]}>
        <View style={styles.headerLeft}>
          <View style={{ position: 'relative', marginRight: 8 }}>
            {isVip && (
              <MaterialCommunityIcons
                name="crown"
                size={18}
                color="#FFD700"
                style={{
                  position: 'absolute',
                  top: -9,
                  left: 1,
                  transform: [{ rotate: '-20deg' }],
                  shadowColor: '#FFD700',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.8,
                  shadowRadius: 4,
                  elevation: 5,
                  zIndex: -1,
                }}
              />
            )}
            <Logo size={32} />
          </View>
          <View style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Image
                source={require('../../../assets/header-logo-dark.png')}
                style={styles.headerTextLogo}
                contentFit="contain"
                tintColor={isVip ? '#FFD700' : (isDark ? '#ffffff' : undefined)}
              />
            </View>
          </View>
        </View>
        <View style={styles.headerRight}>
          {/* Search */}
          <TouchableOpacity
            style={[styles.headerButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderRadius: 12, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: 6 }]}
            onPress={handleSearchPress}
          >
            <Ionicons name="search-outline" size={18} color={theme.colors.text} />
          </TouchableOpacity>
          {/* Language */}
          <TouchableOpacity
            style={[styles.headerButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderRadius: 12, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: 6 }]}
            onPress={() => setLanguagePickerVisible(true)}
          >
            <Ionicons name="language-outline" size={18} color={theme.colors.text} />
          </TouchableOpacity>
          {/* Favorites */}
          <TouchableOpacity
            style={[styles.headerButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderRadius: 12, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: 6 }]}
            onPress={handleFavoritesPress}
          >
            <Ionicons name="heart-outline" size={18} color={theme.colors.text} />
            {favoritesCount > 0 && (
              <View style={styles.badge}>
                <AppNumber value={favoritesCount > 99 ? 99 : favoritesCount} style={styles.badgeText} />
              </View>
            )}
          </TouchableOpacity>
          {/* Notifications */}
          <TouchableOpacity
            style={[styles.headerButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderRadius: 12, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: 6 }]}
            onPress={handleNotificationPress}
          >
            <Ionicons name="notifications-outline" size={18} color={theme.colors.text} />
            {badgeCount > 0 && (
              <View style={styles.badge}>
                <AppNumber value={badgeCount > 99 ? 99 : badgeCount} style={styles.badgeText} />
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* GOLDEN TEMPLATE: KeyboardAvoidingView same as Login */}
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* GOLDEN TEMPLATE: SINGLE FlatList as vertical scroll owner */}
        {/* ALIBABA: Performance guardrails for low-end devices */}
        <FlatList
          ref={flatListRef}
          data={newArrivals}
          renderItem={renderProduct}
          keyExtractor={(item) => item.id}
          numColumns={2}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={renderEmptyProducts}
          showsVerticalScrollIndicator={false}
          // removeClippedSubviews detaches/re-attaches the ListHeaderComponent
          // (the banner) on Android when scrolling back to top, which re-fades the
          // banner image (the "flashes ~3×" bug). Windowing below already caps
          // mounted cells, so keep this off.
          removeClippedSubviews={false}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          contentContainerStyle={{
            // GOLDEN TEMPLATE: Bottom padding for nav bar
            paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom,
          }}
          onEndReached={loadMoreProducts}
          onEndReachedThreshold={0.5}
          scrollEventThrottle={16}
          onScroll={(e) => {
            const y = e.nativeEvent.contentOffset.y;
            setShowScrollHint(y > 200);
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      </KeyboardAvoidingView>

      {/* Luxury scroll-to-top FAB */}
      {showScrollHint && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => flatListRef.current?.scrollToOffset?.({ offset: 0, animated: true })}
          style={{
            position: 'absolute',
            bottom: BOTTOM_NAV_HEIGHT + insets.bottom + 20,
            right: 20,
            backgroundColor: theme.colors.primary,
            width: 48, height: 48, borderRadius: 24, // PERFECT CIRCLE
            alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
            shadowOpacity: isDark ? 0 : 0.15, shadowRadius: 10,
            elevation: 5,
          }}
        >
          <Ionicons name="chevron-up" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Add to Cart Bottom Sheet */}
      <StartOrderBottomSheet
        visible={cartSheetVisible}
        onClose={() => setCartSheetVisible(false)}
        onConfirmOrder={handleCartSheetConfirm}
        product={cartSheetProduct}
        mode="cart"
        variationSelections={[]}
        colorSelections={[]}
        totalQuantity={1}
        calculatedTotalPrice={cartSheetProduct?.priceUSD || 0}
        activeUnitPrice={cartSheetProduct?.priceUSD || 0}
      />

      {/* Language Picker Modal */}
      <LanguagePicker
        visible={languagePickerVisible}
        onClose={() => setLanguagePickerVisible(false)}
        onSelectLanguage={handleLanguageSelect}
        currentLanguage={i18n.language}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  // Header styles - NO fixed heights
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerLeft: {
    alignItems: 'center',
    flexShrink: 1,
    flexDirection: 'row',
  },
  headerLogoImage: {
    maxHeight: 35,
    width: 120,
    // GOLDEN TEMPLATE: No fixed height, use maxHeight
  },
  locationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  locationText: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 4,
  },

  headerTextLogo: {
    height: 20,
    marginTop: 4,
    maxWidth: 80,
    width: 80,
    flexShrink: 1,
  },
  headerRight: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
  },
  headerButton: {
    marginLeft: 16,
    position: 'relative',
  },
  /**
   * SAMSUNG ARABIC FIX (LOCKED - ALIBABA/AMAZON PATTERN):
   * - minHeight + alignItems + justifyContent for proper centering
   * - flexShrink: 0 prevents Samsung from shrinking
   */
  badge: {
    alignItems: 'center',
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    flexShrink: 0, // SAMSUNG FIX: never shrink
    justifyContent: 'center',
    minHeight: 18,
    minWidth: 18,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -6,
    top: -6,
  },
  /**
   * SAMSUNG ARABIC FIX (LOCKED):
   * - includeFontPadding: false removes fake ascent/descent (Samsung)
   * - textAlign: 'right' for RTL safety
   */
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
    includeFontPadding: false,
    textAlign: 'right', // RTL-safe (Samsung fix)
    textAlignVertical: 'center',
  },
  // Banner styles - Alibaba style full-width carousel
  bannerSection: {
    marginTop: 8,
  },
  bannerWrapper: {
    aspectRatio: 16 / 9, // GOLDEN TEMPLATE: aspectRatio for responsive sizing
    overflow: 'hidden',
    position: 'relative',
    width: SCREEN_WIDTH, // Full screen width for smooth paging
  },
  paginationContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
  },
  paginationDot: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 4,
    height: 8,
    marginHorizontal: 4,
    width: 8,
  },
  paginationDotActive: {
    backgroundColor: '#1a365d',
    width: 24,
  },
  bannerImage: {
    ...StyleSheet.absoluteFillObject,
  },
  bannerContent: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  bannerTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  bannerButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  bannerButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Section styles - ALIBABA: Visual rhythm with asymmetric spacing
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    marginTop: 12, // ALIBABA: Visual rhythm - tighter for categories
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Product grid styles
  productCardWrapper: {
    marginBottom: 2,
    width: '50%',
  },
  loadingFooter: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 12,
    textAlign: 'center',
  },
  // =================================================================
  // ALIBABA: Skeleton Loading Styles (static, no shimmer)
  // All use aspectRatio to match real components
  // =================================================================
  skeletonCircle: {
    borderRadius: 16,
    height: 32,
    width: 32,
  },
  skeletonText: {
    borderRadius: 4,
    height: 12,
  },
  skeletonIconButton: {
    borderRadius: 12,
    height: 24,
    marginLeft: 16,
    width: 24,
  },
  skeletonBanner: {
    aspectRatio: 16 / 9, // Same as real banner
    borderRadius: 16,
    width: '100%',
  },
  skeletonCategoriesRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
  },
  skeletonCategoryCard: {
    alignItems: 'center',
    marginRight: 12,
    width: 88,
  },
  skeletonCategoryIcon: {
    aspectRatio: 1, // Same as real category icon
    borderRadius: 24,
    width: 48,
  },
  skeletonProductsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
  },
  skeletonProductCard: {
    marginBottom: 8,
    paddingHorizontal: 4,
    width: '50%',
  },
  skeletonProductImage: {
    aspectRatio: 1, // Same as product card image
    borderRadius: 12,
    width: '100%',
  },
  vipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  vipText: {
    fontSize: 10,
    fontWeight: 'bold',
    marginLeft: 2,
    color: '#000',
    letterSpacing: 0.5,
  },
});

export default HomeScreen;
