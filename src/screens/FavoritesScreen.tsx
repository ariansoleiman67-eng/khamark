import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  FlatList,
  I18nManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../components/ThemeProvider';
import { useFavorites } from '../contexts/FavoritesContext';
import { useCart } from '../contexts/CartContext';
import { useTranslation } from 'react-i18next';
import { SHADOW_STYLES as shadows } from '../constants/theme';
import MasonryProductCard from '../components/MasonryProductCard';
import ProductService from '../services/productService';
import { Product, RootStackParamList, Theme } from '../types';

type FavoritesScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Favorites'>;

const FavoritesScreen: React.FC = () => {
  const navigation = useNavigation<FavoritesScreenNavigationProp>();
  const { theme, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';
  const { favorites, clearFavorites, isLoading: favoritesLoading } = useFavorites();
  const { addToCart } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();
  
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const styles = useMemo(() => createStyles(theme), [theme]);

  // Monotonic request id: discards stale/out-of-order fetch results so a slow
  // earlier response can never overwrite a newer one (and avoids setState after unmount).
  const reqIdRef = useRef(0);

  // Fetch products for favorite IDs
  const fetchFavoriteProducts = useCallback(async (force = false) => {
    const reqId = ++reqIdRef.current;

    if (favorites.length === 0) {
      if (reqId === reqIdRef.current) {
        setProducts([]);
        setIsLoading(false);
      }
      return;
    }

    try {
      setIsLoading(true);
      // Single batched query (was one request per favorite — slow with many saves).
      const validProducts = await ProductService.getProductsByIds(favorites, force);
      if (reqId === reqIdRef.current) {
        setProducts(validProducts);
      }
    } catch {
      // Silently handle fetch errors
    } finally {
      if (reqId === reqIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [favorites]);

  useEffect(() => {
    fetchFavoriteProducts();
  }, [fetchFavoriteProducts]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchFavoriteProducts(true);
    setRefreshing(false);
  }, [fetchFavoriteProducts]);

  const handleProductPress = useCallback((productId: string) => {
    navigation.navigate('ProductDetails', { productId });
  }, [navigation]);

  // GOLDEN TEMPLATE: Guest CAN add to cart - no auth blocking
  // ALIBABA PATTERN: Silent add-to-cart, no confirmation dialog
  const handleAddToCart = useCallback(async (productId: string, product: Product) => {
    // Check for variants (size or color)
    const hasVariants = (product.variations && product.variations.length > 0) || 
                        (product.colorVariations && product.colorVariations.length > 0);

    // VARIANT ENFORCEMENT: Products with variants must go to ProductDetails for selection
    if (hasVariants) {
      navigation.navigate('ProductDetails', { productId: product.id });
      return;
    }

    try {
      await addToCart(product.id, 1, product);
      // ALIBABA: Silent success - no confirmation dialog
      // Cart badge update provides sufficient feedback
    } catch (error: any) {
      if (error.message !== 'DIFFERENT_TENANT') {
        const errorMessage = error instanceof Error ? error.message : t('cart.addToCartError');
        Alert.alert(t('common.error'), errorMessage);
      }
    }
  }, [navigation, addToCart, t]);

  const handleClearAll = useCallback(() => {
    if (favorites.length === 0) return;

    Alert.alert(
      t('favorites.clearAll'),
      t('favorites.clearAllConfirmation'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: async () => {
            await clearFavorites();
          },
        },
      ]
    );
  }, [favorites.length, clearFavorites, t]);

  const renderProductItem = ({ item }: { item: Product }) => (
    <View style={styles.cardItem}>
      <MasonryProductCard
        product={item}
        onPress={handleProductPress}
        onAddToCart={handleAddToCart}
        isFavorite={isFavorite(item.id)}
        onToggleFavorite={toggleFavorite}
      />
    </View>
  );

  // =================================================================
  // ALIBABA: Skeleton Loading - Static, matches final layout
  // =================================================================
  if (isLoading || favoritesLoading) {
    const skeletonOpacity = isDark ? 0.2 : 0.12;
    const skeletonColor = theme.colors.text;
    
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Feather name={isRTL ? 'arrow-right' : 'arrow-left'} size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text allowFontScaling={false} style={styles.title}>{t('favorites.title')}</Text>
          <View style={styles.headerSpacer} />
        </View>
        {/* Skeleton grid */}
        <View style={{ padding: 16, flexDirection: 'row', flexWrap: 'wrap' }}>
          {[1, 2, 3, 4].map((i) => (
            <View key={i} style={{ width: '50%', padding: 4 }}>
              <View style={{ aspectRatio: 0.8, borderRadius: 12, backgroundColor: skeletonColor, opacity: skeletonOpacity, marginBottom: 8 }} />
              <View style={{ width: '70%', height: 14, borderRadius: 4, backgroundColor: skeletonColor, opacity: skeletonOpacity, marginBottom: 4 }} />
              <View style={{ width: '40%', height: 12, borderRadius: 4, backgroundColor: skeletonColor, opacity: skeletonOpacity }} />
            </View>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Feather name={isRTL ? 'arrow-right' : 'arrow-left'} size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text allowFontScaling={false} style={styles.title}>{t('favorites.title')}</Text>
        {favorites.length > 0 ? (
          <TouchableOpacity style={styles.clearButton} onPress={handleClearAll}>
            <Feather name="trash-2" size={20} color={theme.colors.error} />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      {/* Empty State — distinguish "no favorites saved" from "favorites exist but failed to load" */}
      {favorites.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Ionicons
              name="heart-outline"
              size={80}
              color={theme.colors.textSecondary}
            />
          </View>
          <Text allowFontScaling={false} style={styles.emptyTitle}>{t('favorites.empty')}</Text>
          <Text allowFontScaling={false} style={styles.emptySubtitle}>
            {t('favorites.emptySubtitle')}
          </Text>
          <TouchableOpacity
            style={styles.shopButton}
            onPress={() => navigation.navigate('Main', { screen: 'Categories' })}>

            <Feather name="shopping-bag" size={18} color="#ffffff" style={styles.shopButtonIcon} />
            <Text allowFontScaling={false} style={styles.shopButtonText}>{t('favorites.startBrowsing')}</Text>
          </TouchableOpacity>
        </View>
      ) : products.length === 0 ? (
        /* Favorites exist but products could not be loaded (offline / cold cache).
           getProductsByIds swallows fetch errors and returns [], so offer an explicit retry
           instead of falsely claiming the wishlist is empty. */
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Ionicons
              name="cloud-offline-outline"
              size={80}
              color={theme.colors.textSecondary}
            />
          </View>
          <Text allowFontScaling={false} style={styles.emptyTitle}>{t('common.somethingWentWrong')}</Text>
          <TouchableOpacity
            style={styles.shopButton}
            onPress={() => fetchFavoriteProducts(true)}>

            <Feather name="refresh-cw" size={18} color="#ffffff" style={styles.shopButtonIcon} />
            <Text allowFontScaling={false} style={styles.shopButtonText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Favorites Count */}
          <View style={[styles.countContainer, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Ionicons name="heart" size={16} color={theme.colors.primary} />
            <Text allowFontScaling={false} style={[styles.countText, isRTL ? { marginLeft: 0, marginRight: theme.spacing.xs } : null]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              {t('favorites.count', { count: products.length })}
            </Text>
          </View>

          {/* Products Grid */}
          <FlatList
            data={products}
            renderItem={renderProductItem}
            keyExtractor={(item) => item.id}
            numColumns={2}
            contentContainerStyle={styles.productsContainer}
            columnWrapperStyle={styles.columnWrapper}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
            }
          />
        </>
      )}
    </SafeAreaView>
  );
};

/* eslint-disable react-native/no-unused-styles, react-native/sort-styles, react-native/no-color-literals */
const createStyles = (theme: Theme) => {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: theme.spacing.lg,
    },
    loadingText: {
      fontSize: 16,
      fontWeight: '400',
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      backgroundColor: theme.colors.background,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    backButton: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: theme.colors.text,
      flex: 1,
      textAlign: 'center',
    },
    headerSpacer: {
      width: 44,
    },
    clearButton: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: theme.spacing.xl,
    },
    emptyIconContainer: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: theme.colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: theme.spacing.lg,
      ...shadows.medium,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: theme.spacing.sm,
    },
    emptySubtitle: {
      fontSize: 16,
      fontWeight: '400',
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginBottom: theme.spacing.xl,
      paddingHorizontal: theme.spacing.lg,
    },
    shopButton: {
      flexDirection: 'row',
      backgroundColor: theme.colors.primary,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.borderRadius.lg,
      alignItems: 'center',
      ...shadows.small,
    },
    shopButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#ffffff',
    },
    shopButtonIcon: {
      marginRight: 8,
    },
    countContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    countText: {
      fontSize: 14,
      fontWeight: '500',
      color: theme.colors.text,
      marginLeft: theme.spacing.xs,
    },
    productsContainer: {
      paddingBottom: 100, // Extra padding for floating tab bar
    },
    columnWrapper: {
      justifyContent: 'space-between',
    },
    cardItem: {
      width: '50%',
      marginBottom: 2,
      margin: 0, 
    },
  });
};

export default FavoritesScreen;
