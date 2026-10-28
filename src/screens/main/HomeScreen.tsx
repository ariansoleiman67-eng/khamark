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
  useWindowDimensions,
} from 'react-native';

import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../../locales';
import { getThumbnailUrl } from '../../utils/imageUtils';
import { useTheme } from '../../components/ThemeProvider';
import { useTenant } from '../../contexts/TenantContext';
import MasonryProductCard, { TEXT_CONTAINER_HEIGHT } from '../../components/MasonryProductCard';
import SectionHeader from '../../components/home/SectionHeader';
import ShopByBrandSection from '../../components/home/ShopByBrandSection';
import SearchAiBar from '../../components/SearchAiBar';
import { getDiscountPercent, hasCompareAtDiscount } from '../../utils/pricingUtils';
import AutoScrollRail, { type AutoScrollRailHandle } from '../../components/home/AutoScrollRail';
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
import { iosTapFix } from '../../ui/iosTapFix';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// GOLDEN TEMPLATE: Bottom nav height for padding calculation
const BOTTOM_NAV_HEIGHT = 80;
const PAGE_SIZE = 20;

// How many reduced products the Home rail shows before "See All".
const MAX_OFFER_CARDS = 10;

// How many brand-spotlight carousels to surface at the top of the feed.
const MAX_SPOTLIGHTS = 4;
// Products per spotlight rail. The rail is a taster with a "See All" beside it —
// a "Featured Samsung" row holding sixty phones is not a feature, it is sixty
// mounted cards sitting permanently off-screen, because ListHeaderComponent is
// never virtualized away.
const MAX_SPOTLIGHT_CARDS = 10;
// The header is built from the FIRST PAGE ONLY, never from the growing feed.
//
// It used to derive from `newArrivals`, which grows by PAGE_SIZE every time the
// shopper paginates. Each page could push a brand from one product to two, which
// QUALIFIES IT for a spotlight rail, and the rails also re-sort by product count.
// So the header gained a row, or reshuffled, while the shopper was scrolled far
// below it — and content changing height above the viewport makes the list jump
// under your thumb. That is the "it glitches after scrolling a while" report: it
// only happens once you have scrolled far enough to trigger pagination.
const HEADER_SOURCE_LIMIT = PAGE_SIZE;

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
  const { width: windowWidth } = useWindowDimensions();
  const navigation = useNavigation<any>();
  const { addToCart } = useCart();
  const { favoritesCount, isFavorite: isFavorites, toggleFavorite } = useFavorites();
  const { tenantId } = useTenant();
  const { user, isVip } = useAuth();
  // ALIBABA-STYLE: Real-time badge from NotificationContext (no polling)
  const badgeCount = useBadgeCount();

  // Responsive grid parameters: 16px horizontal container padding on each side, 12px column gap
  const gridPadding = 16;
  const gridGap = 12;
  const cardWidth = Math.floor((windowWidth - (gridPadding * 2) - gridGap) / 2);
  const cardHeight = cardWidth + TEXT_CONTAINER_HEIGHT;

  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const textAlign: 'left' | 'right' = isRTL ? 'right' : 'left';

  // The brands rail must stand still while a finger is down ANYWHERE on this
  // screen — see the note on AutoScrollRailHandle. A ref rather than state, so
  // holding and releasing it costs no render.
  const brandRailRef = useRef<AutoScrollRailHandle>(null);

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
  // True when the product fetch itself failed, so the empty list can show a retry
  // instead of the "no products" state (a dead network must not look like empty stock).
  const [loadError, setLoadError] = useState(false);

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
      setLoadError(false);

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
      setLoadError(true);
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
    // First page only — see HEADER_SOURCE_LIMIT. Everything below this line is
    // header content, and the header must stop changing once the shopper scrolls
    // past it.
    const headerSource = newArrivals.slice(0, HEADER_SOURCE_LIMIT);
    for (const p of headerSource) {
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
      .slice(0, MAX_SPOTLIGHTS)
      // Capped like `offers` already is. Without this each rail inherits the
      // default windowSize of 21 and mounts far more cards than anyone will swipe.
      .map((g) => ({ ...g, products: g.products.slice(0, MAX_SPOTLIGHT_CARDS) }));
    return { brands: brandList, brandSpotlights: spots, hasArrivals: newArrivals.length > 0 };
    // Still keyed on newArrivals, so this recomputes on pagination — but it now
    // recomputes to the SAME VALUES, because the slice above ignores everything
    // after the first page. Cheap, and the header's height stops moving, which is
    // the whole point. A pull-to-refresh replaces newArrivals and correctly
    // rebuilds it.
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

  // Single-row horizontal brand strip. Preserves official brand order and visibility.
  const brandTiles = useMemo(() => {
    if (managedBrands.length > 0) {
      return managedBrands.map((b: any) => ({
        key: b.id,
        label: b.name,
        logoUrl: b.logoUrl || (b as any).logo_url,
      }));
    }
    return brands.map((b: string) => ({
      key: b,
      label: b,
      logoUrl: undefined as string | undefined,
    }));
  }, [managedBrands, brands]);

  // Reduced items, biggest saving first. Derived from the products already on
  // screen — no extra fetch — and measured against what THIS shopper pays, so a
  // VIP's own price counts as the price the "was" figure has to beat.
  const offers = useMemo(
    () =>
      newArrivals
        .filter((p) => hasCompareAtDiscount(p as any, isVip))
        .map((p) => ({ product: p, percent: getDiscountPercent(p as any, isVip) }))
        .sort((a2, b2) => b2.percent - a2.percent)
        .slice(0, MAX_OFFER_CARDS)
        .map((entry) => entry.product),
    [newArrivals, isVip],
  );

  const headerDataRef = useRef({ brands, brandSpotlights, hasArrivals, managedBrands, featuredProducts, brandTiles, offers });
  headerDataRef.current = { brands, brandSpotlights, hasArrivals, managedBrands, featuredProducts, brandTiles, offers };

  const renderSpotlightCard = useCallback(({ item }: { item: Product }) => (
    <MasonryProductCard
      product={item}
      cardWidth={cardWidth}
      onPress={handleProductPress}
      onAddToCart={handleAddToCartPress}
      onSelectOptions={handleAddToCartPress}
      isFavorite={stableIsFavorite(item.id)}
      onToggleFavorite={stableToggleFavorite}
    />
  ), [cardWidth, handleProductPress, handleAddToCartPress, stableIsFavorite, stableToggleFavorite]);

  const renderListHeader = useCallback(() => {
    const { brandSpotlights: spotlights, hasArrivals: hasItems, featuredProducts: featured, brandTiles: brandItems, offers: offerCards } = headerDataRef.current;
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

        {/* b. Shop by brand — floating circles row directly BELOW banner and BEFORE Featured Products */}
        {brandItems.length > 0 && (
          <ShopByBrandSection
            brands={brandItems}
            onSelectBrand={(brand) =>
              (navigation as any).navigate('CategoryProducts', { brand, title: brand })
            }
          />
        )}

        {/* c. Featured — products the admin starred, in the admin's manual
            sort_order. Rendered only when something is actually starred so a shop
            that has never used the star never sees an empty row. No "See All":
            there is no featured-only screen to link to. */}
        {featured.length > 0 && (
          <View>
            <SectionHeader title={t('home.featuredProducts')} />
            <FlatList {...iosTapFix}
              data={featured}
              renderItem={renderSpotlightCard}
              keyExtractor={(item) => `featured-${item.id}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ minHeight: cardHeight + 8 }}
              contentContainerStyle={styles.spotlightList}
            />
          </View>
        )}

        {/* d. Offers — everything the shop has reduced, biggest saving first, with
            a See All into the dedicated screen. Hidden entirely when nothing is
            reduced, so a shop that never sets a was-price never sees an empty
            row promising a sale. */}
        {offerCards.length > 0 && (
          <View>
            <SectionHeader
              title={t('offers.title', { defaultValue: 'Offers' })}
              onSeeAll={() => (navigation as any).navigate('Offers')}
            />
            <FlatList {...iosTapFix}
              data={offerCards}
              renderItem={renderSpotlightCard}
              keyExtractor={(item) => `offer-${item.id}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ minHeight: cardHeight + 8 }}
              contentContainerStyle={styles.spotlightList}
            />
          </View>
        )}

        {/* e. Brand-spotlight carousels ("Featured <Brand>") */}
        {spotlights.map((group) => (
          <View key={group.brand}>
            {/* "See All" on a "Featured <Brand>" row means that brand's products —
                the same destination a brand tile opens. It used to land on
                Categories, which showed nothing to do with the brand. */}
            <SectionHeader
              title={group.brand}
              onSeeAll={() => (navigation as any).navigate('CategoryProducts', { brand: group.brand, title: group.brand })}
            />
            <FlatList {...iosTapFix}
              data={group.products}
              renderItem={renderSpotlightCard}
              keyExtractor={(item) => `${group.brand}-${item.id}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ minHeight: cardHeight + 8 }}
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
    <View style={{ width: cardWidth }}>
      <MasonryProductCard
        product={item}
        cardWidth={cardWidth}
        onPress={handleProductPress}
        onAddToCart={handleAddToCartPress}
        onSelectOptions={handleAddToCartPress}
        // GOLDEN ESTIMATION: Pass pure props to avoid internal context hooks in list items
        isFavorite={isFavorites(item.id)}
        onToggleFavorite={toggleFavorite}
      />
    </View>
  ), [cardWidth, handleProductPress, handleAddToCartPress, isFavorites, toggleFavorite]);

  // Empty list component — doubles as the error state (with retry) when the fetch failed.
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
        <Ionicons name={loadError ? 'cloud-offline-outline' : 'cube-outline'} size={28} color={theme.colors.primary} />
      </View>
      <Text allowFontScaling={false} style={{ fontSize: 17, fontWeight: '600', color: theme.colors.text, textAlign: 'center' }}>
        {loadError ? t('common.somethingWentWrong') : t('home.noProducts', { defaultValue: 'No products available' })}
      </Text>
      <Text allowFontScaling={false} style={{ fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 6 }}>
        {loadError ? t('common.loadError') : t('common.pullToRefresh', { defaultValue: 'Pull down to refresh' })}
      </Text>
      {loadError && (
        <TouchableOpacity
          onPress={() => loadDataRef.current()}
          accessibilityRole="button"
          style={{
            marginTop: 16, paddingHorizontal: 22, paddingVertical: 10,
            borderRadius: 12, backgroundColor: theme.colors.primary,
          }}
        >
          <Text allowFontScaling={false} style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF', textAlign: 'center' }}>
            {t('common.retry')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // =================================================================
  // ALIBABA: Skeleton Loading (static, no shimmer)
  // Matches real layout with aspectRatio - prevents layout shift
  // =================================================================
  if (loading) {
    const skBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['left', 'right']}>
        <StatusBar style={isDark ? 'light' : 'dark'} translucent backgroundColor="transparent" />

        {/* Skeleton Header */}
        <View style={[
          styles.headerContainer,
          {
            paddingTop: Math.max(insets.top, 12) + 6,
            backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          },
        ]}>
          <View style={[styles.headerRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <View style={[styles.headerLeft, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: skBg }} />
              <View style={{ marginHorizontal: 10 }}>
                <View style={{ width: 90, height: 14, borderRadius: 7, backgroundColor: skBg }} />
                <View style={{ width: 60, height: 10, borderRadius: 5, backgroundColor: skBg, marginTop: 4 }} />
              </View>
            </View>
            <View style={[styles.headerRight, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={{ width: 44, height: 24, borderRadius: 12, backgroundColor: skBg }} />
              {[1, 2, 3].map((i) => (
                <View key={i} style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: skBg }} />
              ))}
            </View>
          </View>
          {/* Skeleton Search Bar */}
          <View style={{ paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, height: 48, borderRadius: 14, backgroundColor: skBg }} />
            <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: skBg }} />
          </View>
        </View>

        {/* Skeleton Banner */}
        <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
          <View style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 16, backgroundColor: skBg }} />
        </View>

        {/* Skeleton Section Label */}
        <View style={{ paddingHorizontal: 16, marginTop: 24, flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={{ width: 120, height: 18, borderRadius: 6, backgroundColor: skBg }} />
          <View style={{ width: 60, height: 16, borderRadius: 8, backgroundColor: skBg }} />
        </View>

        {/* Skeleton Products */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 12, marginTop: 12 }}>
          {[1, 2, 3, 4].map((i) => (
            <View key={i} style={{ width: cardWidth, marginBottom: 12 }}>
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
    // Single safe-area top inset applied on header; edges left and right for landscape
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['left', 'right']}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} translucent backgroundColor="transparent" />

      {/* ---- Fixed header with Khamark Brand Identity, Actions & Search ---- */}
      <View style={[
        styles.headerContainer,
        {
          paddingTop: Math.max(insets.top, 12) + 6,
          backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        },
      ]}>
        {/* Brand row: Left logo/title, Right actions */}
        <View style={[styles.headerRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {/* Left: Khamark Official Logo Wordmark */}
          <View style={[styles.headerLeft, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Image
              source={isDark ? require('../../../assets/images/khamark_logo_white.png') : require('../../../assets/images/khamark_logo_crimson.png')}
              style={styles.brandWordmark}
              contentFit="contain"
            />
            {user?.name ? (
              <View style={[styles.brandTextWrapper, { alignItems: isRTL ? 'flex-end' : 'flex-start', marginStart: 8 }]}>
                <Text allowFontScaling={false} numberOfLines={1} style={[styles.brandSubtitle, { color: theme.colors.textSecondary }]}>
                  {`${t('home.hello')}, ${user.name}`}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Right: Language Pill + Favorites + Notifications + Cart */}
          <View style={[styles.headerRight, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <TouchableOpacity
              onPress={() => setLanguagePickerVisible(true)}
              hitSlop={6}
              style={[styles.langPill, { borderColor: theme.colors.border, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F7F7F8' }]}
              accessibilityRole="button"
            >
              <Ionicons name="globe-outline" size={13} color={theme.colors.textSecondary} />
              <Text allowFontScaling={false} style={[styles.langText, { color: theme.colors.text }]}>
                {i18n.language === 'ar' ? 'عربي' : i18n.language === 'ku' ? 'کوردی' : 'EN'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleFavoritesPress} hitSlop={8} style={styles.iconBtn} accessibilityRole="button">
              <Ionicons name="heart-outline" size={22} color={theme.colors.text} />
              {favoritesCount > 0 && (
                <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
                  <AppNumber value={favoritesCount > 99 ? 99 : favoritesCount} style={styles.badgeText} />
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={handleNotificationPress} hitSlop={8} style={styles.iconBtn} accessibilityRole="button">
              <Ionicons name="notifications-outline" size={22} color={theme.colors.text} />
              {badgeCount > 0 && (
                <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
                  <AppNumber value={badgeCount > 99 ? 99 : badgeCount} style={styles.badgeText} />
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={handleCartPress} hitSlop={8} style={styles.iconBtn} accessibilityRole="button">
              <Ionicons name="cart-outline" size={23} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search + AI bar: Fixed inside header, fully visible and tappable */}
        <SearchAiBar style={styles.searchBar} />
      </View>

      {/* GOLDEN TEMPLATE: KeyboardAvoidingView same as Login */}
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* GOLDEN TEMPLATE: SINGLE FlatList as vertical scroll owner */}
        {/* ALIBABA: Performance guardrails for low-end devices */}
        {/* THE BRANDS RAIL HOLDS STILL WHILE A FINGER IS DOWN.
            Touch events bubble in React Native, so this View sees every touch on
            anything inside the list — a product card, a "See All", a swatch — and
            not only touches on the rail itself, which the rail already handled.
            It has to: the rail's drift calls scrollToOffset every frame, and on
            iOS that cancels presses in progress elsewhere in the same list. The
            tap registered (onPressIn) and then died (no onPress), which is why
            products opened "with luck" and the heart did nothing.
            Refs and imperative calls, so a touch costs no re-render. */}
        <View
          style={{ flex: 1 }}
          onTouchStart={() => brandRailRef.current?.hold()}
          onTouchEnd={() => brandRailRef.current?.release()}
          onTouchCancel={() => brandRailRef.current?.release()}
        >
        <FlatList {...iosTapFix}
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
            // Clean bottom spacing that respects safe area and tab bar without giant empty gap
            paddingBottom: Math.max(insets.bottom, 16) + 90,
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
        </View>
      </KeyboardAvoidingView>

      {/* Scroll-to-top FAB */}
      {showScrollHint && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => flatListRef.current?.scrollToOffset?.({ offset: 0, animated: true })}
          style={{
            position: 'absolute',
            bottom: Math.max(insets.bottom, 16) + 84,
            right: 16,
            backgroundColor: theme.colors.primary,
            width: 42,
            height: 42,
            borderRadius: 21,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: isDark ? 0 : 0.18,
            shadowRadius: 6,
            elevation: 5,
            zIndex: 99,
          }}
        >
          <Ionicons name="chevron-up" size={22} color="#fff" />
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
  // Fixed header container with clean opaque boundary
  headerContainer: {
    zIndex: 10,
  },
  headerRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  searchBar: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 0,
  },
  headerLeft: {
    alignItems: 'center',
    flex: 1,
  },
  brandWordmark: {
    width: 116,
    height: 34,
  },
  brandTextWrapper: {
    flexShrink: 1,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  brandSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  greeting: {
    marginEnd: 10,
    flexShrink: 1,
  },
  headerRight: {
    alignItems: 'center',
    flexShrink: 0,
    gap: 12,
  },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  langText: {
    fontSize: 11,
    fontWeight: '600',
  },
  iconBtn: {
    position: 'relative',
    padding: 2,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: '#A61920',
    borderRadius: 9,
    flexShrink: 0,
    justifyContent: 'center',
    minHeight: 16,
    minWidth: 16,
    paddingHorizontal: 3,
    position: 'absolute',
    right: -6,
    top: -5,
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
  // Brand-spotlight horizontal carousel padding (aligns first card to the grid).
  spotlightList: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 12,
  },
  // Product grid styles
  columnWrapper: {
    paddingHorizontal: 16,
    gap: 12,
    justifyContent: 'flex-start',
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
