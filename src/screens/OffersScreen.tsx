import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  I18nManager,
  ActivityIndicator,
  RefreshControl,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../components/ThemeProvider';
import AppText from '../components/AppText';
import AppNumber from '../components/AppNumber';
import MasonryProductCard from '../components/MasonryProductCard';
import SearchAiBar from '../components/SearchAiBar';
import { ProductService } from '../services/productService';
import { useCart } from '../contexts/CartContext';
import { useFavorites } from '../contexts/FavoritesContext';
import { useTenant } from '../contexts/TenantContext';
import { useAuth } from '../contexts/AuthContext';
import { Product } from '../types';
import { getDiscountPercent, hasCompareAtDiscount } from '../utils/pricingUtils';
import { iosTapFix } from '../ui/iosTapFix';

/**
 * Everything the shop has reduced, in one place.
 *
 * The shop asked for this because a discount had nowhere to live: a "was" price
 * showed as a struck-through number on whichever card the shopper happened to
 * scroll past, and a shopper who wanted to see what was ON OFFER had to hunt for
 * it. Nothing here is new pricing — it is the same reduction the product card
 * already shows, collected and ranked by how big it is.
 *
 * "Discounted" means the price this shopper actually pays is below the "was"
 * price the shop set, which is exactly what puts the badge on the card. It is
 * measured per shopper, so a VIP's own price counts: hasCompareAtDiscount
 * compares against the displayed price, not the list price.
 */
const GRID_PADDING = 16;
const GRID_GAP = 12;

const OffersScreen: React.FC = () => {
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const { addToCart } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { tenantId } = useTenant();
  const { user } = useAuth();
  const { width: windowWidth } = useWindowDimensions();

  const cardWidth = Math.floor((windowWidth - (GRID_PADDING * 2) - GRID_GAP) / 2);
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const isVip = user?.role === 'vip';

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      // Enumerate catalog pages so offers outside the first slice are discovered (KHM-021)
      let allProducts: Product[] = [];
      let page = 1;
      let hasMore = true;
      while (hasMore && page <= 5) {
        const res = await ProductService.getProducts(
          {},
          { page, limit: 100, total: 0, hasMore: true },
          tenantId || undefined,
        );
        if (res.products?.length > 0) {
          allProducts = [...allProducts, ...res.products];
        }
        hasMore = Boolean(res.pagination?.hasMore && res.products?.length >= 100);
        page++;
      }
      setProducts(allProducts);
    } catch {
      setProducts([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await ProductService.clearCache().catch(() => {});
    await load();
    setRefreshing(false);
  }, [load]);

  // Biggest saving first — the reason to open this screen is to find the best
  // one, not to browse the catalogue again in its usual order.
  const offers = useMemo(() => {
    return products
      .filter((p) => hasCompareAtDiscount(p as any, isVip))
      .map((p) => ({ product: p, percent: getDiscountPercent(p as any, isVip) }))
      .sort((a, b) => b.percent - a.percent)
      .map((entry) => entry.product);
  }, [products, isVip]);

  const handleProductPress = useCallback(
    (productId: string) => navigation.navigate('ProductDetails', { productId }),
    [navigation],
  );
  const handleAddToCart = useCallback(
    (productId: string, product: Product) => addToCart(productId, 1, product),
    [addToCart],
  );

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Main');
    }
  }, [navigation]);

  const renderItem = useCallback(
    ({ item }: { item: Product }) => (
      <View style={{ width: cardWidth, marginBottom: 12 }}>
        <MasonryProductCard
          product={item}
          cardWidth={cardWidth}
          onPress={handleProductPress}
          onAddToCart={handleAddToCart}
          isFavorite={isFavorite(item.id)}
          onToggleFavorite={toggleFavorite}
        />
      </View>
    ),
    [cardWidth, handleProductPress, handleAddToCart, isFavorite, toggleFavorite],
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: theme.colors.surface }]}>
        <TouchableOpacity onPress={handleBack} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <AppText fontSize={20} numberOfLines={1} style={[styles.title, { color: theme.colors.text }]}>
          {t('offers.title', { defaultValue: 'Offers' })}
        </AppText>
        <TouchableOpacity onPress={() => navigation.navigate('Cart')} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="cart-outline" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <SearchAiBar style={styles.searchBar} />

      {!loading && offers.length > 0 && (
        <View style={[styles.countRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <AppNumber value={String(offers.length)} style={[styles.count, { color: theme.colors.text }]} />
          <AppText fontSize={20} style={[styles.count, { color: theme.colors.text }]}>
            {' '}{t('offers.onOffer', { defaultValue: 'on offer' })}
          </AppText>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList {...iosTapFix}
          data={offers}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
          }
          ListEmptyComponent={
            error ? (
              <View style={styles.center}>
                <MaterialCommunityIcons name="cloud-off-outline" size={48} color={theme.colors.textSecondary} />
                <AppText fontSize={16} style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
                  {t('common.loadError', { defaultValue: 'Could not load products. Check your connection.' })}
                </AppText>
                <TouchableOpacity onPress={load} style={[styles.retryBtn, { backgroundColor: theme.colors.primary }]}>
                  <AppText fontSize={15} style={styles.retryText}>
                    {t('common.retry', { defaultValue: 'Retry' })}
                  </AppText>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.center}>
                <MaterialCommunityIcons name="tag-outline" size={48} color={theme.colors.textSecondary} />
                <AppText fontSize={16} style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
                  {t('offers.empty', { defaultValue: 'No offers right now' })}
                </AppText>
                <AppText fontSize={13} style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
                  {t('offers.emptyHint', { defaultValue: 'Reduced items appear here as soon as the shop sets a was-price.' })}
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
  searchBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2 },
  countRow: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  count: { fontWeight: '800' },
  listContent: { paddingHorizontal: 16, paddingBottom: 120, paddingTop: 6 },
  column: { justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyText: { marginTop: 12, textAlign: 'center' },
  retryBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
});

export default OffersScreen;
