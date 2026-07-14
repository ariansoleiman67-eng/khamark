import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  I18nManager,
  ActivityIndicator,
  RefreshControl,
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
  const [sortDesc, setSortDesc] = useState(false);

  const load = useCallback(async () => {
    try {
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

  const sorted = useMemo(() => {
    const list = products.slice();
    list.sort((a, b) => (sortDesc ? b.priceUSD - a.priceUSD : a.priceUSD - b.priceUSD));
    return list;
  }, [products, sortDesc]);

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

      {/* Count + sort row */}
      <View style={[styles.countRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }}>
          <AppNumber value={String(sorted.length)} style={[styles.count, { color: theme.colors.text }]} />
          <AppText fontSize={22} style={[styles.count, { color: theme.colors.text }]}> {t('common.products')}</AppText>
        </View>
        <TouchableOpacity
          onPress={() => setSortDesc(v => !v)}
          hitSlop={8}
          style={[styles.sortBtn, { borderColor: theme.colors.border }]}
        >
          <MaterialCommunityIcons name="sort" size={18} color={theme.colors.text} />
          <AppText fontSize={13} style={{ color: theme.colors.textSecondary, marginHorizontal: 6 }}>
            {sortDesc ? t('sort.priceHigh', { defaultValue: 'Price ↓' }) : t('sort.priceLow', { defaultValue: 'Price ↑' })}
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialCommunityIcons name="package-variant" size={48} color={theme.colors.textSecondary} />
              <AppText fontSize={16} style={{ color: theme.colors.textSecondary, marginTop: 12 }}>
                {t('home.noProducts', { defaultValue: 'No products available' })}
              </AppText>
            </View>
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
});

export default CategoryProductsScreen;
