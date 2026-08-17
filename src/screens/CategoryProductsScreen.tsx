import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  I18nManager,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../components/ThemeProvider';
import AppText from '../components/AppText';
import AppNumber from '../components/AppNumber';
import MasonryProductCard from '../components/MasonryProductCard';
import { ProductService } from '../services/productService';
import { useCart } from '../contexts/CartContext';
import { useFavorites } from '../contexts/FavoritesContext';
import { useTenant } from '../contexts/TenantContext';
import { Product } from '../types';

// 'recommended' = the order the service already returned (parts.sort_order ascending,
// previous ordering as tiebreaker) — i.e. the order the admin set by dragging.
type SortMode = 'recommended' | 'priceAsc' | 'priceDesc';

// Dedicated screen for one category: tap a category tile -> all its products.
const CategoryProductsScreen: React.FC = () => {
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { addToCart } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { tenantId } = useTenant();

  const category: string | undefined = route.params?.category;
  const brand: string | undefined = route.params?.brand;
  const title: string = route.params?.title ?? brand ?? category ?? '';

  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('recommended');
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(false);
      let items: Product[];
      if (brand) {
        const res = await ProductService.getProducts(
          { brand },
          { page: 1, limit: 500, total: 0, hasMore: true },
          tenantId || undefined
        );
        items = res.products;
      } else {
        items = await ProductService.getProductsByCategory(category || 'All', tenantId || undefined);
      }
      setProducts(items);
    } catch {
      setProducts([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [category, brand, tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await ProductService.clearCache().catch(() => {});
    await load();
    setRefreshing(false);
  }, [load]);

  /**
   * Brands present in THIS category, with a count each, ordered by count so the
   * brands the shop actually stocks come first.
   *
   * Hidden when the screen is already showing a single brand (opened from a brand
   * card), and when there is only one brand to choose from — a filter with one
   * option is noise.
   */
  const brandFacets = useMemo(() => {
    if (brand) return [];
    const counts = new Map<string, number>();
    products.forEach((p) => {
      const b = (p.brand || '').trim();
      if (b) counts.set(b, (counts.get(b) || 0) + 1);
    });
    if (counts.size < 2) return [];
    return [...counts.entries()]
      .sort((a, b2) => b2[1] - a[1] || a[0].localeCompare(b2[0]))
      .map(([name, count]) => ({ name, count }));
  }, [products, brand]);

  // A brand that disappears after a refresh (last unit sold, product hidden) would
  // otherwise leave the list filtered to nothing with no way back.
  useEffect(() => {
    if (selectedBrand && !brandFacets.some((f) => f.name === selectedBrand)) {
      setSelectedBrand(null);
    }
  }, [brandFacets, selectedBrand]);

  const sorted = useMemo(() => {
    const base = selectedBrand
      ? products.filter((p) => (p.brand || '').trim() === selectedBrand)
      : products;
    // Re-sorting by price here was unconditional, which threw away the admin's
    // sort_order the service had already applied — return the list untouched instead.
    if (sortMode === 'recommended') return base;
    const list = base.slice();
    list.sort((a, b) => (sortMode === 'priceDesc' ? b.priceUSD - a.priceUSD : a.priceUSD - b.priceUSD));
    return list;
  }, [products, sortMode, selectedBrand]);

  const handleProductPress = useCallback(
    (productId: string) => navigation.navigate('ProductDetails', { productId }),
    [navigation]
  );
  const handleAddToCart = useCallback(
    (productId: string, product: Product) => addToCart(productId, 1, product),
    [addToCart]
  );

  const renderItem = useCallback(
    ({ item }: { item: Product }) => (
      <View style={styles.cardWrap}>
        <MasonryProductCard
          product={item}
          onPress={handleProductPress}
          onAddToCart={handleAddToCart}
          isFavorite={isFavorite(item.id)}
          onToggleFavorite={toggleFavorite}
        />
      </View>
    ),
    [handleProductPress, handleAddToCart, isFavorite, toggleFavorite]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: theme.colors.surface }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <AppText fontSize={20} numberOfLines={1} style={[styles.title, { color: theme.colors.text }]}>
          {title}
        </AppText>
        <TouchableOpacity onPress={() => navigation.navigate('Cart')} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="cart-outline" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Brand filter. Horizontal only — the screen's single vertical scroll owner
          is the FlatList below (GOLDEN_RULES §1), so this must never scroll down. */}
      {brandFacets.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          // flexGrow/flexShrink 0: a horizontal ScrollView inside this column
          // otherwise expands to fill the leftover vertical space, and with the
          // content container's default alignItems:'stretch' every chip stretched
          // to that full height. alignItems:'center' sizes each chip to its text.
          style={{ flexGrow: 0, flexShrink: 0 }}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 4,
            gap: 8,
            alignItems: 'center',
            flexDirection: isRTL ? 'row-reverse' : 'row',
          }}
        >
          {[{ name: null as string | null, count: products.length }, ...brandFacets].map((f) => {
            const active = selectedBrand === f.name;
            const label = f.name ?? t('common.all', { defaultValue: 'All' });
            return (
              <TouchableOpacity
                key={f.name ?? '__all__'}
                onPress={() => setSelectedBrand(f.name)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 20,
                  borderWidth: active ? 0 : 1,
                  borderColor: theme.colors.border,
                  backgroundColor: active ? theme.colors.primary : theme.colors.card,
                }}
              >
                <AppText
                  fontSize={13}
                  style={{
                    color: active ? theme.colors.textOnPrimary : theme.colors.text,
                    fontWeight: active ? '700' : '500',
                  }}
                >
                  {label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Count + sort row */}
      <View style={[styles.countRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }}>
          <AppNumber value={String(sorted.length)} style={[styles.count, { color: theme.colors.text }]} />
          <AppText fontSize={22} style={[styles.count, { color: theme.colors.text }]}> {t('common.products')}</AppText>
        </View>
        <TouchableOpacity
          onPress={() =>
            setSortMode(m => (m === 'recommended' ? 'priceAsc' : m === 'priceAsc' ? 'priceDesc' : 'recommended'))
          }
          hitSlop={8}
          style={[styles.sortBtn, { borderColor: theme.colors.border }]}
        >
          <MaterialCommunityIcons name="sort" size={18} color={theme.colors.text} />
          <AppText fontSize={13} style={{ color: theme.colors.textSecondary, marginHorizontal: 6 }}>
            {sortMode === 'recommended'
              ? t('sort.recommended', { defaultValue: 'Recommended' })
              : sortMode === 'priceAsc'
                ? t('sort.priceLow', { defaultValue: 'Price ↑' })
                : t('sort.priceHigh', { defaultValue: 'Price ↓' })}
          </AppText>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={sorted}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          // Windowing guardrails (mirrors HomeScreen): this list can hold hundreds
          // of products, and the defaults mount ~10 rows synchronously before the
          // first paint, which showed as a white gap when opening a category.
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
          ListEmptyComponent={
            error ? (
              <View style={styles.center}>
                <MaterialCommunityIcons name="cloud-off-outline" size={48} color={theme.colors.textSecondary} />
                <AppText fontSize={16} style={{ color: theme.colors.textSecondary, marginTop: 12, textAlign: 'center' }}>
                  {t('common.loadError', { defaultValue: 'Could not load products. Check your connection.' })}
                </AppText>
                <TouchableOpacity
                  onPress={load}
                  style={[styles.retryBtn, { backgroundColor: theme.colors.primary }]}
                >
                  <AppText fontSize={15} style={styles.retryText}>
                    {t('common.retry', { defaultValue: 'Retry' })}
                  </AppText>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.center}>
                <MaterialCommunityIcons name="package-variant" size={48} color={theme.colors.textSecondary} />
                <AppText fontSize={16} style={{ color: theme.colors.textSecondary, marginTop: 12 }}>
                  {t('home.noProducts', { defaultValue: 'No products available' })}
                </AppText>
              </View>
            )
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontWeight: '800', textAlign: 'center' },
  countRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  count: { fontWeight: '800', fontSize: 22 },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  listContent: { paddingHorizontal: 6, paddingBottom: 24 },
  column: { justifyContent: 'space-between' },
  cardWrap: {},
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 999,
  },
  retryText: { color: '#fff', fontWeight: '700' },
});

export default CategoryProductsScreen;
