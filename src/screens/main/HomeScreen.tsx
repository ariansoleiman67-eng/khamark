import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  I18nManager,
  Linking,
} from 'react-native';

import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../../locales';
import { getThumbnailUrl } from '../../utils/imageUtils';
import { useTheme } from '../../components/ThemeProvider';
import { useTenant } from '../../contexts/TenantContext';
import MasonryProductCard from '../../components/MasonryProductCard';
import SectionHeader from '../../components/home/SectionHeader';
import BrandCard from '../../components/home/BrandCard';
import AutoScrollRail from '../../components/home/AutoScrollRail';
import { brandService, Brand } from '../../services/brandService';
import AppNumber from '../../components/AppNumber';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Product } from '../../types';
import ProductService from '../../services/productService';
import { useAuth } from '../../contexts/AuthContext';
import { storeProfileService, StoreProfile } from '../../services/storeProfileService';
import settingsService from '../../services/settingsService';
import bannerService from '../../services/bannerService';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
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

// "Our Brands" is a horizontal 2-row rail: cards sized so ~2 columns fill the
// width, brands chunked into columns of 2 (top + bottom), swipe for more.
const BRAND_GRID_PADDING = 16;
const BRAND_GRID_GAP = 12;
const BRAND_TILE_WIDTH = (SCREEN_WIDTH - BRAND_GRID_PADDING * 2 - BRAND_GRID_GAP) / 2;
// Two stacked cards + the gap. Fixing the column height lets a lone trailing card
// (odd brand count) stretch to fill it instead of leaving an empty half-column.
const BRAND_CARD_HEIGHT = 150;
const BRAND_COL_HEIGHT = BRAND_CARD_HEIGHT * 2 + BRAND_GRID_GAP;
const chunkPairs = (arr: any[]): any[][] => {
  const out: any[][] = [];
  for (let i = 0; i < arr.length; i += 2) out.push(arr.slice(i, i + 2));
  return out;
};
// How many brand-spotlight carousels to surface at the top of the feed.
const MAX_SPOTLIGHTS = 4;

interface Banner {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  backgroundColor: string;
  isActive: boolean;
}

interface BrandGroup {
  brand: string;
  products: Product[];
}

/**
 * HOME SCREEN — aynAlfahad re-skin.
 *
 * Architecture (single vertical scroll owner):
 *  SafeAreaView (edges: top/left/right)
 *   ├── FIXED header row (menu + greeting | cart · favorites · notifications · language)
 *   └── KeyboardAvoidingView
 *       └── FlatList (data = newArrivals, numColumns=2) — the only vertical scroller
 *           ├── ListHeaderComponent: hero banner, "Featured Products" row,
 *           │   "Our Brands" grid, per-brand spotlight carousels,
 *           │   "New Arrivals" header
 *           └── 2-column masonry grid body (infinite feed)
 *
 * Data flow is untouched: loadBanners/loadNewArrivals/loadMoreProducts/onRefresh,
 * the StartOrderBottomSheet add-to-cart flow, favorites, badges.
 */
const HomeScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { addToCart } = useCart();
  const { favoritesCount, isFavorite: isFavorites, toggleFavorite } = useFavorites();
  const { tenantId } = useTenant();
  const { user, isVip } = useAuth();
  // ALIBABA-STYLE: Real-time badge from NotificationContext (no polling)
  const badgeCount = useBadgeCount();

  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const textAlign: 'left' | 'right' = isRTL ? 'right' : 'left';

  // Ref for scroll-to-top functionality
  const flatListRef = useRef<FlatList>(null);
  const paginationRef = useRef({ page: 1, hasMore: true });
  // Monotonic token so an out-of-order (stale-tenant) load never clobbers a newer one.
  const loadSeq = useRef(0);
  // In-flight guard for pagination (onEndReached can fire multiple times per fling).
  const loadingMoreRef = useRef(false);
  // In-flight guard for the add-to-cart bottom-sheet confirm (double-tap protection).
  const submittingRef = useRef(false);
  // Always points at the LATEST loadData so the memoized onRefresh isn't stale.
  const loadDataRef = useRef<() => Promise<void>>(async () => {});

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
  // Products the admin starred with "Featured (pin to top)". Empty => row is hidden.
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [storeProfile, setStoreProfile] = useState<StoreProfile | null>(null);

  // Banner images — loaded from Firestore
  const [bannerImages, setBannerImages] = useState<any[]>([]);

  // Admin-managed brands (name + logo) for the "Our Brands" grid.
  const [managedBrands, setManagedBrands] = useState<Brand[]>([]);

  // Load data on mount and whenever tenantId changes (single effect avoids a double load).
  useEffect(() => {
    loadData();
  }, [tenantId]);

  // Refresh admin-managed brands when Home regains focus (e.g. after an admin edit).
  useFocusEffect(
    React.useCallback(() => {
      brandService.getActiveBrands(tenantId || undefined).then(setManagedBrands).catch(() => {});
    }, [tenantId])
  );

  const loadData = async () => {
    const seq = ++loadSeq.current;
    try {
      setLoading(true);
      // Brands are not loaded here: the focus effect above already fetches them
      // on mount, and doing both fired two identical queries on every cold start.
      await Promise.all([
        loadBanners(seq),
        loadFeatured(seq),
        loadNewArrivals(seq),
      ]);
    } catch (error) {
      // Only surface the error for the latest load — a superseded tenant load must stay quiet.
      if (seq === loadSeq.current) Alert.alert(t('common.error'), t('errors.loadingData'));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  };
  // Keep the ref pointing at the freshest closure (captures the live tenantId) so
  // onRefresh (memoized with []) never runs a stale first-render loadData.
  loadDataRef.current = loadData;

  const loadBanners = async (seq?: number) => {
    try {
      const firestoreBanners = await bannerService.getBanners(true);
      if (seq !== undefined && seq !== loadSeq.current) return;
      const next = firestoreBanners.length > 0 ? firestoreBanners.map(b => ({ uri: b.imageUrl, linkUrl: b.linkUrl })) : [];
      // Keep the SAME array reference when the banners haven't changed, so repeat
      // loads on mount (tenantId resolving in stages) don't re-render the memoized
      // carousel and re-trigger the image fade — that's what made it flash ~3×.
      setBannerImages((prev) => {
        const same = prev.length === next.length && prev.every((p, i) => p.uri === next[i].uri);
        return same ? prev : next;
      });
    } catch (error) {
      if (seq !== undefined && seq !== loadSeq.current) return;
      setBannerImages((prev) => (prev.length === 0 ? prev : []));
    }
  };

  // Admin-starred products. The service query already filters is_active and orders
  // by sort_order, so the manual admin ordering carries through to this row.
  const loadFeatured = async (seq?: number) => {
    try {
      const featured = await ProductService.getFeaturedProducts(tenantId ?? undefined);
      if (seq !== undefined && seq !== loadSeq.current) return;
      setFeaturedProducts(featured || []);
    } catch (error) {
      if (seq !== undefined && seq !== loadSeq.current) return;
      setFeaturedProducts([]);
    }
  };

  const loadNewArrivals = async (seq?: number) => {
    try {
      const { products, pagination } = await ProductService.getProducts(
        {}, // Use default sort (sortOrder first, then createdAt desc)
        { page: 1, limit: PAGE_SIZE, total: 0, hasMore: true }, // RESTORED PAGINATION
        tenantId ?? undefined
      );

      // Drop this response if a newer (tenant-change / refresh) load has since started.
      if (seq !== undefined && seq !== loadSeq.current) return;

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
      if (seq !== undefined && seq !== loadSeq.current) return;
      setNewArrivals([]);
    }
  };

  const loadMoreProducts = async () => {
    if (!paginationRef.current.hasMore || loading || loadingMoreRef.current) return;
    loadingMoreRef.current = true;

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
    } finally {
      loadingMoreRef.current = false;
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await ProductService.clearCache();
    } catch (error) {
      // Ignore cache clearing errors
    }
    await loadDataRef.current();
    setRefreshing(false);
  }, []);

  const handleProductPress = useCallback((productId: string) => {
    navigation.navigate('ProductDetails', { productId });
  }, [navigation]);

  const handleAddToCartPress = useCallback((productId: string, product: Product) => {
    if (!product) return;
    // Variant products (color / size / storage) need the customer to choose an
    // option — send them straight to the detail page instead of a sheet that just
    // bounces there anyway.
    const hasVariants =
      (product.colorVariations && product.colorVariations.length > 0) ||
      (product.variations && product.variations.length > 0) ||
      (product.storageOptions && product.storageOptions.length > 0);
    if (hasVariants) {
      navigation.navigate('ProductDetails', { productId });
      return;
    }
    setCartSheetProduct(product);
    setCartSheetVisible(true);
  }, [navigation]);

  // Confirm handler for the Add to Cart bottom sheet
  const handleCartSheetConfirm = useCallback(async (orderData: {
    quantity: number;
    paymentMethod: string;
    notes?: string;
    addressId?: string;
    variationSelections?: any[];
    colorSelections?: any[];
  }) => {
    if (!cartSheetProduct || submittingRef.current) return;
    submittingRef.current = true;
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
    } finally {
      submittingRef.current = false;
    }
  }, [cartSheetProduct, addToCart, navigation, t]);

  const handleNotificationPress = useCallback(() => {
    navigation.navigate('Notifications');
  }, [navigation]);

  const handleFavoritesPress = useCallback(() => {
    navigation.navigate('Favorites');
  }, [navigation]);

  const handleCartPress = useCallback(() => {
    navigation.navigate('Cart');
  }, [navigation]);

  const handleLanguageSelect = (languageCode: string) => {
    changeLanguage(languageCode);
  };

  // -------------------------------------------------------------------------
  // Client-side derivations from the SAME newArrivals data (no extra fetches):
  //   • brands          — unique, non-empty brand names (for "Our Brands" grid)
  //   • brandSpotlights — brands with >=2 products (for "Featured <Brand>" rows)
  // -------------------------------------------------------------------------
  const { brands, brandSpotlights, hasArrivals } = useMemo(() => {
    const order: string[] = [];
    const groups = new Map<string, BrandGroup>();
    for (const p of newArrivals) {
      const b = (p.brand || '').trim();
      if (!b) continue;
      const key = b.toLowerCase();
      const existing = groups.get(key);
      if (existing) {
        existing.products.push(p);
      } else {
        groups.set(key, { brand: b, products: [p] });
        order.push(key);
      }
    }
    const brandList = order.map((k) => groups.get(k)!.brand);
    const spots = order
      .map((k) => groups.get(k)!)
      .filter((g) => g.products.length >= 2)
      .sort((a, b) => b.products.length - a.products.length)
      .slice(0, MAX_SPOTLIGHTS);
    return { brands: brandList, brandSpotlights: spots, hasArrivals: newArrivals.length > 0 };
  }, [newArrivals]);

  // GOLDEN TEMPLATE: keep ListHeaderComponent a STABLE reference so the
  // BannerCarousel is reconciled (never remounted) as the feed grows / favorites
  // toggle — a remount would reset the carousel to slide 0 and re-flash the image.
  // Volatile inputs (favorites state, the derived brand data) are read through
  // refs so this callback's identity only changes on language/theme/banner change.
  const favActionsRef = useRef({ isFavorite: isFavorites, toggleFavorite });
  favActionsRef.current = { isFavorite: isFavorites, toggleFavorite };
  const stableIsFavorite = useCallback((id: string) => favActionsRef.current.isFavorite(id), []);
  const stableToggleFavorite = useCallback((id: string) => favActionsRef.current.toggleFavorite(id), []);

  // Brand tiles, paired into the rail's two-row columns. Memoised at component
  // level rather than built inside renderListHeader: the rail repeats this array
  // many times over, so a fresh identity on every Home render would rebuild the
  // whole repeated list and re-render every tile.
  const brandColumns = useMemo(() => {
    const tiles = managedBrands.length > 0
      ? managedBrands.map((b: any) => ({ key: b.id, label: b.name, logoUrl: b.logoUrl }))
      // Every brand is shown. This used to drop the last brand on an odd count to
      // avoid a half-empty final column, on the assumption that "See All" listed
      // the rest — but that link went to Categories and no all-brands screen
      // exists, so the dropped brand was simply unreachable.
      : brands.map((b: string) => ({ key: b, label: b, logoUrl: undefined as string | undefined }));
    const cols = chunkPairs(tiles);
    return isRTL ? cols.reverse() : cols;
  }, [managedBrands, brands, isRTL]);

  const headerDataRef = useRef({ brands, brandSpotlights, hasArrivals, managedBrands, featuredProducts, brandColumns });
  headerDataRef.current = { brands, brandSpotlights, hasArrivals, managedBrands, featuredProducts, brandColumns };

  const renderSpotlightCard = useCallback(({ item }: { item: Product }) => (
    <MasonryProductCard
      product={item}
      onPress={handleProductPress}
      onAddToCart={handleAddToCartPress}
      onSelectOptions={handleAddToCartPress}
      isFavorite={stableIsFavorite(item.id)}
      onToggleFavorite={stableToggleFavorite}
    />
  ), [handleProductPress, handleAddToCartPress, stableIsFavorite, stableToggleFavorite]);

  const renderListHeader = useCallback(() => {
    const { brandSpotlights: spotlights, hasArrivals: hasItems, featuredProducts: featured, brandColumns: brandCols } = headerDataRef.current;
    return (
      <View>
        {/* a. Hero banner */}
        {bannerImages.length > 0 && (
          <BannerCarousel
            images={bannerImages}
            activeDotColor={theme.colors.primary}
            onItemPress={(item) => {
              // Open the admin-set tap-through link (http/https only) if present.
              const url = item?.linkUrl;
              if (typeof url === 'string' && /^https?:\/\//i.test(url.trim())) {
                Linking.openURL(url.trim()).catch(() => {});
              }
            }}
          />
        )}

        {/* a2. Featured — products the admin starred, in the admin's manual
            sort_order. Rendered only when something is actually starred so a shop
            that has never used the star never sees an empty row. No "See All":
            there is no featured-only screen to link to. */}
        {featured.length > 0 && (
          <View>
            <SectionHeader title={t('home.featuredProducts')} />
            <FlatList
              data={featured}
              renderItem={renderSpotlightCard}
              keyExtractor={(item) => `featured-${item.id}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.spotlightList}
            />
          </View>
        )}

        {/* b. Our Brands — horizontal 2-row rail (shows admin logo when uploaded) */}
        {brandCols.length > 0 && (
          <View>
            {/* No onSeeAll: the rail already shows every brand, and there is no
                all-brands screen to link to. */}
            <SectionHeader title={t('home.ourBrands')} />
            {/* Revolves endlessly: drifts slowly on its own, and drags forever in
                either direction without hitting an end. Pauses while touched and
                resumes a couple of seconds after release. */}
            <AutoScrollRail
              data={brandCols}
              keyExtractor={(_, i) => `brand-col-${i}`}
              itemWidth={BRAND_TILE_WIDTH}
              gap={BRAND_GRID_GAP}
              leadingInset={BRAND_GRID_PADDING}
              contentContainerStyle={styles.brandRow}
              renderItem={(col: any) => (
                <View style={[styles.brandCol, { width: BRAND_TILE_WIDTH }]}>
                  {col.map((b: any) => (
                    <BrandCard
                      key={b.key}
                      label={b.label}
                      imageUrl={b.logoUrl}
                      width={BRAND_TILE_WIDTH}
                      onPress={() => (navigation as any).navigate('CategoryProducts', { brand: b.label, title: b.label })}
                    />
                  ))}
                </View>
              )}
            />
          </View>
        )}

        {/* c. Brand-spotlight carousels ("Featured <Brand>") */}
        {spotlights.map((group) => (
          <View key={group.brand}>
            {/* "See All" on a "Featured <Brand>" row means that brand's products —
                the same destination a brand tile opens. It used to land on
                Categories, which showed nothing to do with the brand. */}
            <SectionHeader
              title={group.brand}
              onSeeAll={() => (navigation as any).navigate('CategoryProducts', { brand: group.brand, title: group.brand })}
            />
            <FlatList
              data={group.products}
              renderItem={renderSpotlightCard}
              keyExtractor={(item) => `${group.brand}-${item.id}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.spotlightList}
            />
          </View>
        ))}

        {/* d. New Arrivals header above the 2-column grid body */}
        {hasItems && <SectionHeader title={t('home.newArrivals')} />}
      </View>
    );
  }, [bannerImages, isRTL, t, navigation, renderSpotlightCard, theme.colors.primary]);

  // Product card renderer — 2 column grid (memoized to prevent re-renders)
  const renderProduct = useCallback(({ item }: { item: Product }) => (
    <View style={styles.productCardWrapper}>
      <MasonryProductCard
        product={item}
        onPress={handleProductPress}
        onAddToCart={handleAddToCartPress}
      onSelectOptions={handleAddToCartPress}
        // GOLDEN ESTIMATION: Pass pure props to avoid internal context hooks in list items
        isFavorite={isFavorites(item.id)}
        onToggleFavorite={toggleFavorite}
      />
    </View>
  ), [handleProductPress, handleAddToCartPress, isFavorites, toggleFavorite]);

  // Empty list component
  const renderEmptyProducts = () => (
    <View style={[
      styles.emptyState,
      {
        backgroundColor: theme.colors.surface,
        marginHorizontal: 20, borderRadius: 20,
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
      <Text allowFontScaling={false} style={{ fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 6 }}>
        {t('common.pullToRefresh', { defaultValue: 'Pull down to refresh' })}
      </Text>
    </View>
  );

  // =================================================================
  // ALIBABA: Skeleton Loading (static, no shimmer)
  // Matches real layout with aspectRatio - prevents layout shift
  // =================================================================
  if (loading) {
    const skBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
        <StatusBar style={isDark ? 'light' : 'dark'} translucent backgroundColor="transparent" />

        {/* Skeleton Header */}
        <View style={[styles.header, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.headerLeft}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: skBg }} />
            <View style={{ marginHorizontal: 10 }}>
              <View style={{ width: 60, height: 10, borderRadius: 5, backgroundColor: skBg }} />
              <View style={{ width: 100, height: 14, borderRadius: 7, backgroundColor: skBg, marginTop: 6 }} />
            </View>
          </View>
          <View style={styles.headerRight}>
            {[1, 2, 3, 4].map((i) => (
              <View key={i} style={{ width: 30, height: 30, borderRadius: 12, backgroundColor: skBg, marginLeft: 12 }} />
            ))}
          </View>
        </View>

        {/* Skeleton Banner */}
        <View style={{ paddingHorizontal: 12, marginTop: 12 }}>
          <View style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 20, backgroundColor: skBg }} />
        </View>

        {/* Skeleton Section Label */}
        <View style={{ paddingHorizontal: 16, marginTop: 24, flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={{ width: 120, height: 18, borderRadius: 6, backgroundColor: skBg }} />
          <View style={{ width: 60, height: 16, borderRadius: 8, backgroundColor: skBg }} />
        </View>

        {/* Skeleton Products */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 3, marginTop: 12 }}>
          {[1, 2, 3, 4].map((i) => (
            <View key={i} style={{ width: '50%', paddingHorizontal: 3, marginBottom: 12 }}>
              <View style={{
                backgroundColor: theme.colors.surface,
                borderRadius: 20, overflow: 'hidden',
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
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top', 'left', 'right']}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} translucent backgroundColor="transparent" />

      {/* ---- Fixed header (menu + greeting | cart · favorites · notifications · language) ---- */}
      <View style={[
        styles.header,
        { backgroundColor: theme.colors.surface, flexDirection: isRTL ? 'row-reverse' : 'row' },
      ]}>
        {/* Left: two-line greeting */}
        <View style={[styles.headerLeft, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={styles.greeting}>
            <Text allowFontScaling={false} numberOfLines={1} style={{ fontSize: 12, color: theme.colors.textSecondary, textAlign }}>
              {t('home.hello')}
            </Text>
            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }}>
              <Text allowFontScaling={false} numberOfLines={1} style={{ fontSize: 18, fontWeight: '700', color: theme.colors.text, textAlign }}>
                {user?.name || t('home.guest')}
              </Text>
              {isVip && (
                <MaterialCommunityIcons name="crown" size={16} color="#FFD700" style={{ marginHorizontal: 4 }} />
              )}
            </View>
          </View>
        </View>

        {/* Right: cart (orange) + favorites + notifications + language */}
        <View style={[styles.headerRight, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity onPress={handleCartPress} hitSlop={8} style={styles.iconBtn} accessibilityRole="button">
            <Ionicons name="cart-outline" size={26} color={theme.colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleFavoritesPress} hitSlop={8} style={styles.iconBtn} accessibilityRole="button">
            <Ionicons name="heart-outline" size={24} color={theme.colors.text} />
            {favoritesCount > 0 && (
              <View style={styles.badge}>
                <AppNumber value={favoritesCount > 99 ? 99 : favoritesCount} style={styles.badgeText} />
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={handleNotificationPress} hitSlop={8} style={styles.iconBtn} accessibilityRole="button">
            <Ionicons name="notifications-outline" size={24} color={theme.colors.text} />
            {badgeCount > 0 && (
              <View style={styles.badge}>
                <AppNumber value={badgeCount > 99 ? 99 : badgeCount} style={styles.badgeText} />
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setLanguagePickerVisible(true)} hitSlop={8} style={styles.iconBtn} accessibilityRole="button">
            <Ionicons name="language-outline" size={24} color={theme.colors.text} />
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
          columnWrapperStyle={styles.columnWrapper}
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
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
          }
        />
      </KeyboardAvoidingView>

      {/* Scroll-to-top FAB */}
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
  // Fixed header — airy, no elevation (surface tone), tokens only.
  header: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLeft: {
    alignItems: 'center',
    flex: 1,
  },
  greeting: {
    // Only a trailing gap now that the hamburger is gone — the greeting hugs the
    // header's own 16px padding instead of being indented behind an icon.
    marginEnd: 10,
    flexShrink: 1,
  },
  headerRight: {
    alignItems: 'center',
    flexShrink: 0,
    gap: 14,
  },
  iconBtn: {
    position: 'relative',
    padding: 2,
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
  // "Our Brands" horizontal 2-row rail.
  brandRow: {
    paddingHorizontal: BRAND_GRID_PADDING,
  },
  brandCol: {
    gap: BRAND_GRID_GAP,
    justifyContent: 'flex-start',
    height: BRAND_COL_HEIGHT,
  },
  // Brand-spotlight horizontal carousel padding (aligns first card to the grid).
  spotlightList: {
    paddingHorizontal: 16,
    paddingVertical: 2,
  },
  // Product grid styles
  columnWrapper: {
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  productCardWrapper: {
    marginBottom: 6,
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
});

export default HomeScreen;
