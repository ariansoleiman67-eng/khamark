import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  Dimensions,
  Platform,
  StatusBar as RNStatusBar,
  Alert,
  Animated,
  AccessibilityInfo,
  KeyboardAvoidingView,
  I18nManager,
} from 'react-native';
import { FlashList as FlashListBase } from '@shopify/flash-list';
// Cast to any: this FlashList version's types don't model the `masonry` prop, though it works at runtime.
const FlashList: any = FlashListBase;
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useTheme } from '../components/ThemeProvider';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { useFavorites } from '../contexts/FavoritesContext';
import { useTranslation } from 'react-i18next';
import { SHADOW_STYLES, LAYOUT } from '../constants/theme';
import { Product, SearchFilters } from '../types';
import MasonryProductCard from '../components/MasonryProductCard';
import AppText from '../components/AppText';
import Button from '../components/Button';
import { ProductService } from '../services/productService';
import { useTenant } from '../contexts/TenantContext';
import { LinearGradient } from 'expo-linear-gradient';
import { getTimeFromTimestamp } from '../utils/timestampUtils';

// Visual search analysis type from the AI backend
interface VisualAnalysis {
  primaryQuery: string;
  category: string;
  keywords: string[];
  brand: string;
  partNumber: string;
  compatibleModels: string[];
  description: string;
  alternativeNames: string[];
}

const { width: screenWidth } = Dimensions.get('window');
const statusBarHeight = Platform.OS === 'android' ? RNStatusBar.currentHeight || 24 : 44;
const numColumns = 2;

const SearchScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const route = useRoute();
  const navigation = useNavigation();
  const { addToCart } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { user } = useAuth();
  const { i18n, t } = useTranslation();
  const isRTL = I18nManager.isRTL || i18n?.language === 'ar' || i18n?.language === 'ku';
  const { tenantId } = useTenant();
  const inputRef = useRef<TextInput>(null);
  
  // Get parameters from navigation
  const { preSelectedCategory, query: initialQuery, isVisualSearch: isVisualSearchParam, visualAnalysis: visualAnalysisParam } = route.params as {
    preSelectedCategory?: string;
    query?: string;
    isVisualSearch?: boolean;
    visualAnalysis?: VisualAnalysis | null;
  } || {};
  
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [visualAnalysis, setVisualAnalysis] = useState<VisualAnalysis | null>(visualAnalysisParam || null);
  const [isVisualSearch, setIsVisualSearch] = useState(!!isVisualSearchParam);
  const aiBannerAnim = useRef(new Animated.Value(0)).current;

  // Animate AI banner in
  useEffect(() => {
    if (isVisualSearch && visualAnalysis) {
      Animated.spring(aiBannerAnim, {
        toValue: 1,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }).start();
    }
  }, [isVisualSearch, visualAnalysis]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Helper to get translated category name
  const translateCategory = useCallback((categoryName: string) => {
    if (!categoryName) return '';
    if (categoryName === t('categories.all')) return categoryName;

    // Remove spaces and lowercase to build the key
    const translationKey = categoryName.toLowerCase().replace(/\s+/g, '');
    const fallback = t(`categories.${translationKey}`);

    // If i18next successfully resolved the translation
    if (fallback !== `categories.${translationKey}`) {
      return fallback;
    }

    // Otherwise return original
    return categoryName;
  }, [t]);

  const [filters, setFilters] = useState<SearchFilters>({
    query: '',
    category: preSelectedCategory || undefined,
    minPrice: undefined,
    maxPrice: undefined,
    inStock: false,
    sortBy: 'name',
    sortOrder: 'asc',
  });

  // Load real products from Supabase
  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const productsList = tenantId
        ? await ProductService.getProductsByTenantId(tenantId)
        : (await ProductService.getProducts({}, { page: 1, limit: 1000, total: 0, hasMore: true })).products;

      const categoriesSet = new Set<string>();
      productsList.forEach((product) => {
        if (product.category) categoriesSet.add(product.category);
      });

      setProducts(productsList);
      setCategories([t('categories.all'), ...Array.from(categoriesSet)]);

    } catch (error) {
      console.error('Error loading products:', error);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  // Initialize with pre-selected category
  useEffect(() => {
    if (preSelectedCategory) {
      setSearchQuery(preSelectedCategory);
      setDebouncedQuery(preSelectedCategory);
    }
  }, [preSelectedCategory]);

  // Initialize with query from barcode scanner
  useEffect(() => {
    if (initialQuery) {
      setSearchQuery(initialQuery);
      setDebouncedQuery(initialQuery);
    }
  }, [initialQuery]);

  // Load products on mount
  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ─── Smart Visual Search Scoring ─────────────────────────────────
  const scoreProductForVisualSearch = useCallback((product: Product, analysis: VisualAnalysis): number => {
    let score = 0;
    const normalize = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const pName = (product.name || '').toLowerCase();
    const pNameAr = (product.nameAr || '').toLowerCase();
    const pNameKu = (product.nameKu || '').toLowerCase();
    const pDesc = (product.description || '').toLowerCase();
    const pCategory = (product.category || '').toLowerCase();
    const pBrand = (product.brand || '').toLowerCase();
    const pPartNum = normalize(product.partNumber || '');
    const pModels = (product.compatibleModels || []).map(m => m.toLowerCase());
    const allProductText = `${pName} ${pNameAr} ${pNameKu} ${pDesc} ${pCategory} ${pBrand}`;

    // 1. Part Number match (highest signal) — +10
    if (analysis.partNumber && pPartNum) {
      const aiPartNum = normalize(analysis.partNumber);
      if (aiPartNum && (pPartNum === aiPartNum || pPartNum.includes(aiPartNum) || aiPartNum.includes(pPartNum))) {
        score += 10;
      }
    }

    // 2. Primary query words — +3 each
    const primaryWords = (analysis.primaryQuery || '').toLowerCase().split(/\s+/).filter(w => w.length > 1);
    for (const word of primaryWords) {
      if (allProductText.includes(word)) score += 3;
    }

    // 3. Category match — +4
    if (analysis.category && pCategory) {
      const aiCat = analysis.category.toLowerCase();
      if (pCategory === aiCat || pCategory.includes(aiCat) || aiCat.includes(pCategory)) {
        score += 4;
      }
    }

    // 4. Brand match — +4
    if (analysis.brand && pBrand) {
      const aiBrand = analysis.brand.toLowerCase();
      if (pBrand.includes(aiBrand) || aiBrand.includes(pBrand)) {
        score += 4;
      }
    }

    // 5. Keywords — +1 each
    for (const keyword of (analysis.keywords || [])) {
      if (allProductText.includes(keyword.toLowerCase())) score += 1;
    }

    // 6. Compatible models — +3 each match
    for (const model of (analysis.compatibleModels || [])) {
      const modelLower = model.toLowerCase();
      if (pModels.some(m => m.includes(modelLower) || modelLower.includes(m))) {
        score += 3;
      }
      // Also check product name/description for model mention
      if (allProductText.includes(modelLower)) score += 1;
    }

    // 7. Alternative names — +2 each
    for (const altName of (analysis.alternativeNames || [])) {
      if (allProductText.includes(altName.toLowerCase())) score += 2;
    }

    return score;
  }, []);

  // Apply filters and search
  useEffect(() => {
    let filtered = [...products];

    // ─── Visual Search: Multi-Strategy Fuzzy Scoring ───────────
    if (isVisualSearch && visualAnalysis && debouncedQuery.trim()) {
      // Score every product against the AI analysis
      const scored = products.map(product => ({
        product,
        score: scoreProductForVisualSearch(product, visualAnalysis),
      }));

      // Filter by minimum score threshold and sort by score descending
      filtered = scored
        .filter(s => s.score >= 2)
        .sort((a, b) => b.score - a.score)
        .map(s => s.product);

    } else if (debouncedQuery.trim()) {
      // ─── Normal Text Search (existing logic) ─────────────────
      const searchTerms = debouncedQuery.toLowerCase().split(' ').filter(term => term.length > 0);
      
      const normalize = (text: string | null | undefined) => {
        if (!text) return '';
        return text.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
      };
      
      const normalizedTerms = searchTerms.map(t => normalize(t));

      filtered = filtered.filter(product => {
        const matchesTerm = (term: string, index: number) => {
          const normalizedTerm = normalizedTerms[index];
          const hasNormalizedTerm = normalizedTerm.length > 0;

          if (
            (product.name && product.name.toLowerCase().includes(term)) ||
            (product.nameAr && product.nameAr.toLowerCase().includes(term)) ||
            (product.nameKu && product.nameKu.toLowerCase().includes(term)) ||
            (product.description && product.description.toLowerCase().includes(term)) ||
            (product.category && product.category.toLowerCase().includes(term)) ||
            (product.brand && product.brand.toLowerCase().includes(term))
          ) {
            return true;
          }

          if (product.partNumber) {
            const rawPart = product.partNumber.toLowerCase();
            const normPart = normalize(product.partNumber);
            if (rawPart.includes(term) || (hasNormalizedTerm && normPart.includes(normalizedTerm))) {
              return true;
            }
          }

          if (product.compatibleModels && product.compatibleModels.some(model => 
            model.toLowerCase().includes(term) || 
            (hasNormalizedTerm && normalize(model).includes(normalizedTerm))
          )) {
            return true;
          }

          if (product.variations && product.variations.some(v => {
            const size = v.sizeValue ? v.sizeValue.toLowerCase() : '';
            return size.includes(term);
          })) {
            return true;
          }

          if (product.colorVariations && product.colorVariations.some(v => {
            const color = v.colorValue ? v.colorValue.toLowerCase() : '';
            return color.includes(term);
          })) {
            return true;
          }

          if (product.options) {
            if (product.options.colors && product.options.colors.some(c => c.toLowerCase().includes(term))) return true;
            if (product.options.sizes && product.options.sizes.some(s => s.toLowerCase().includes(term))) return true;
          }

          return false;
        };

        return searchTerms.every((term, index) => matchesTerm(term, index));
      });
    }

    // Category filter
    if (filters.category && filters.category !== t('categories.all')) {
      filtered = filtered.filter(product => product.category === filters.category);
    }

    // Price range filter
    if (filters.minPrice) {
      filtered = filtered.filter(product => product.priceUSD >= filters.minPrice!);
    }
    if (filters.maxPrice) {
      filtered = filtered.filter(product => product.priceUSD <= filters.maxPrice!);
    }

    // In stock filter — use computed inStock (variation-aware), not raw stockQty.
    if (filters.inStock) {
      filtered = filtered.filter(product => product.inStock);
    }

    // Sort (skip for visual search — already sorted by relevance)
    if (!isVisualSearch) {
      switch (filters.sortBy) {
        case 'name':
          filtered.sort((a, b) =>
            filters.sortOrder === 'asc'
              ? (a.name || '').localeCompare(b.name || '')
              : (b.name || '').localeCompare(a.name || '')
          );
          break;
        case 'price':
          filtered.sort((a, b) => 
            filters.sortOrder === 'asc' 
              ? a.priceUSD - b.priceUSD
              : b.priceUSD - a.priceUSD
          );
          break;
        case 'date':
          filtered.sort((a, b) => 
            filters.sortOrder === 'asc'
              ? getTimeFromTimestamp(a.createdAt) - getTimeFromTimestamp(b.createdAt)
              : getTimeFromTimestamp(b.createdAt) - getTimeFromTimestamp(a.createdAt)
          );
          break;
      }
    }

    setFilteredProducts(filtered);
  }, [debouncedQuery, filters, products, isVisualSearch, visualAnalysis, scoreProductForVisualSearch]);

  const handleProductPress = (productId: string) => {
    (navigation as any).navigate('ProductDetails', { productId });
  };

  // GOLDEN TEMPLATE: Guest CAN add to cart - no auth blocking
  // ALIBABA PATTERN: Silent add-to-cart, no confirmation dialog
  const handleAddToCart = useCallback(async (productId: string, product: Product) => {
    
    try {
      if (!product) {
        Alert.alert(t('common.error'), t('errors.productNotFound'));
        return;
      }
      
      // VARIANT ENFORCEMENT: Products with variants must go to ProductDetails for selection
      const hasVariants = (product.variations?.length || 0) > 0 || (product.colorVariations?.length || 0) > 0;
      if (hasVariants) {
        (navigation as any).navigate('ProductDetails', { productId });
        return;
      }
      
      await addToCart(productId, 1, product);
      
      // ALIBABA: Silent success - no confirmation dialog
      // Cart badge update provides sufficient feedback
    } catch (error: any) {
      if (error.message !== 'DIFFERENT_TENANT') {
        Alert.alert(t('common.error'), error.message || t('cart.addToCartError'));
      }
    }
  }, [navigation, addToCart, t]);

  const resetFilters = () => {
    setFilters({
      query: '',
      category: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      inStock: false,
      sortBy: 'name',
      sortOrder: 'asc',
    });
    setSearchQuery('');
  };

  const dismissVisualSearch = () => {
    setIsVisualSearch(false);
    setVisualAnalysis(null);
    setSearchQuery('');
    setDebouncedQuery('');
  };

  // ─── AI Identification Banner ─────────────────────────────────
  const renderAIBanner = () => {
    if (!isVisualSearch || !visualAnalysis) return null;

    const badges: { icon: string; label: string }[] = [];
    if (visualAnalysis.brand) badges.push({ icon: 'pricetag', label: visualAnalysis.brand });
    if (visualAnalysis.category) badges.push({ icon: 'grid', label: visualAnalysis.category });
    if (visualAnalysis.partNumber) badges.push({ icon: 'barcode', label: visualAnalysis.partNumber });
    if ((visualAnalysis.compatibleModels?.length || 0) > 0) badges.push({ icon: 'car-sport', label: (visualAnalysis.compatibleModels || []).slice(0, 3).join(', ') });

    return (
      <Animated.View style={[{
        opacity: aiBannerAnim,
        transform: [{ 
          translateY: aiBannerAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [-20, 0],
          })
        }],
      }]}>
        <LinearGradient
          colors={isDark ? ['#1a1a2e', '#16213e', '#0f3460'] : ['#667eea', '#764ba2']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={vsStyles.aiBanner}
        >
          {/* Header Row */}
          <View style={vsStyles.aiBannerHeader}>
            <View style={vsStyles.aiBadge}>
              <Ionicons name="sparkles" size={12} color="#fff" />
              <Text allowFontScaling={false} style={vsStyles.aiBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{t('scanner.aiPowered', 'AI Powered')}</Text>
            </View>
            <TouchableOpacity onPress={dismissVisualSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={22} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>

          {/* AI Description */}
          <View style={vsStyles.aiContentRow}>
            <View style={vsStyles.aiIconContainer}>
              <Ionicons name="camera" size={24} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text allowFontScaling={false} style={vsStyles.aiTitle}>{visualAnalysis.primaryQuery}</Text>
              {visualAnalysis.description ? (
                <Text allowFontScaling={false} style={vsStyles.aiDescription} numberOfLines={2}>{visualAnalysis.description}</Text>
              ) : null}
            </View>
          </View>

          {/* Confidence Badges */}
          {badges.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={vsStyles.aiBadgesRow}>
              {badges.map((badge, idx) => (
                <View key={idx} style={vsStyles.aiConfidenceBadge}>
                  <Ionicons name={badge.icon as any} size={12} color="rgba(255,255,255,0.9)" />
                  <Text allowFontScaling={false} style={vsStyles.aiConfidenceText}>{badge.label}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Results count */}
          <Text allowFontScaling={false} style={vsStyles.aiResultCount}>
            {filteredProducts.length > 0 
              ? t('scanner.matchesFound', { count: filteredProducts.length, defaultValue: '{{count}} matching products found' })
              : t('scanner.noMatches', 'No matching products found')}
          </Text>
        </LinearGradient>
      </Animated.View>
    );
  };

  const renderProduct = useCallback(({ item }: { item: Product }) => (
    <MasonryProductCard
      product={item}
      onPress={() => handleProductPress(item.id)}
      onAddToCart={handleAddToCart}
      isFavorite={isFavorite(item.id)}
      onToggleFavorite={toggleFavorite}
    />
  ), [handleProductPress, handleAddToCart, isFavorite, toggleFavorite]);

  const renderFiltersModal = () => (
    <Modal
      visible={showFilters}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowFilters(false)}
    >
      <SafeAreaView style={[styles.filtersModal, { backgroundColor: theme.colors.background }]}>
        {/* Modal Header */}
        <View style={[styles.modalHeader, { borderBottomColor: theme.colors.border }]}>
          <TouchableOpacity onPress={() => setShowFilters(false)}>
            <Ionicons name="close" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text allowFontScaling={false} style={[styles.modalTitle, { color: theme.colors.text }]}>{t('search.filters')}</Text>
          <TouchableOpacity onPress={resetFilters}>
            <Text allowFontScaling={false} style={[styles.resetText, { color: theme.colors.primary }]}>{t('search.reset')}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.filtersContent}>
          {/* Category Filter */}
          <View style={styles.filterSection}>
            <Text allowFontScaling={false} style={[styles.filterSectionTitle, { color: theme.colors.text }]}>{t('search.category')}</Text>
            <View style={styles.filterOptions}>
              {categories.map((category) => (
                <TouchableOpacity
                  key={category}
                  style={[
                    styles.filterOption,
                    {
                      backgroundColor: filters.category === category ? theme.colors.primary : theme.colors.surface,
                      borderColor: theme.colors.border,
                    }
                  ]}
                  onPress={() => setFilters(prev => ({ ...prev, category: category === t('categories.all') ? undefined : category }))}
                >
                  <Text allowFontScaling={false} style={[
                    styles.filterOptionText,
                    { color: filters.category === category ? '#ffffff' : theme.colors.text }
                  ]}>
                    {translateCategory(category)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Price Range */}
          <View style={styles.filterSection}>
            <Text allowFontScaling={false} style={[styles.filterSectionTitle, { color: theme.colors.text }]}>{t('search.priceRange')}</Text>
            <View style={styles.priceInputs}>
              <View style={[styles.priceInputContainer, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <Text allowFontScaling={false} style={[styles.priceLabel, { color: theme.colors.textSecondary }]}>{t('search.minPrice')}</Text>
                <TextInput allowFontScaling={false}
                  style={[styles.priceInput, { color: theme.colors.text }]}
                  placeholder="0"
                  placeholderTextColor={theme.colors.placeholder}
                  value={filters.minPrice?.toString() || ''}
                  onChangeText={(text) => setFilters(prev => ({ ...prev, minPrice: text ? parseInt(text) : undefined }))}
                  keyboardType="numeric"
                />
              </View>
              <Text allowFontScaling={false} style={[styles.priceSeparator, { color: theme.colors.textSecondary }]}>-</Text>
              <View style={[styles.priceInputContainer, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <Text allowFontScaling={false} style={[styles.priceLabel, { color: theme.colors.textSecondary }]}>{t('search.maxPrice')}</Text>
                <TextInput allowFontScaling={false}
                  style={[styles.priceInput, { color: theme.colors.text }]}
                  placeholder="∞"
                  placeholderTextColor={theme.colors.placeholder}
                  value={filters.maxPrice?.toString() || ''}
                  onChangeText={(text) => setFilters(prev => ({ ...prev, maxPrice: text ? parseInt(text) : undefined }))}
                  keyboardType="numeric"
                />
              </View>
            </View>
          </View>

          {/* Stock Filter */}
          <View style={styles.filterSection}>
            <TouchableOpacity
              style={styles.stockFilter}
              onPress={() => setFilters(prev => ({ ...prev, inStock: !prev.inStock }))}
            >
              <View style={[
                styles.checkbox,
                {
                  backgroundColor: filters.inStock ? theme.colors.primary : 'transparent',
                  borderColor: theme.colors.border,
                }
              ]}>
                {filters.inStock && <Ionicons name="checkmark" size={16} color="#ffffff" />}
              </View>
              <Text allowFontScaling={false} style={[styles.stockFilterText, { color: theme.colors.text }]}>
                {t('search.showInStockOnly')}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Apply Button */}
        <View style={[styles.modalFooter, { borderTopColor: theme.colors.border }]}>
          <Button
            title={t('search.applyFilters', { count: filteredProducts.length })}
            onPress={() => setShowFilters(false)}
            fullWidth
          />
        </View>
      </SafeAreaView>
    </Modal>
  );

  // =================================================================
  // ALIBABA: Skeleton Loading - Static, matches final layout
  // =================================================================
  if (isLoading && products.length === 0) {
    const skeletonOpacity = isDark ? 0.2 : 0.12;
    const skeletonColor = theme.colors.text;
    
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? theme.colors.background : '#FFF3E0' }]}>
        {/* Header skeleton */}
        <View style={[styles.header, { backgroundColor: isDark ? theme.colors.background : '#FFF3E0' }]}>
          <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: skeletonColor, opacity: skeletonOpacity }} />
          <View style={{ width: 100, height: 20, borderRadius: 4, backgroundColor: skeletonColor, opacity: skeletonOpacity, marginLeft: 12 }} />
        </View>
        {/* Search bar skeleton */}
        <View style={{ marginHorizontal: 16, height: 48, borderRadius: 12, backgroundColor: skeletonColor, opacity: skeletonOpacity, marginBottom: 12 }} />
        {/* Filter bar skeleton */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 }}>
          <View style={{ width: 80, height: 36, borderRadius: 8, backgroundColor: skeletonColor, opacity: skeletonOpacity }} />
          <View style={{ width: 60, height: 20, borderRadius: 4, backgroundColor: skeletonColor, opacity: skeletonOpacity }} />
        </View>
        {/* Product grid skeleton */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 }}>
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
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: isDark ? theme.colors.background : '#FFF3E0' }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="auto" translucent backgroundColor="transparent" />
      {renderFiltersModal()}
      
      {/* Header - ALIBABA: activeOpacity for feedback */}
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: isDark ? theme.colors.background : '#FFF3E0' }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backButton, isRTL && { marginRight: 0, marginLeft: 8 }]}
          activeOpacity={0.7}
        >
          <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color={theme.colors.text} />
        </TouchableOpacity>
        
        <Text allowFontScaling={false} style={[styles.headerTitle, { color: theme.colors.text }]}>
          {preSelectedCategory ? preSelectedCategory : t('search.title')}
        </Text>
      </View>

      {/* Search Input */}
      <View
        style={[
          styles.searchInputContainer,
          {
            flexDirection: isRTL ? 'row-reverse' : 'row',
            backgroundColor: isDark ? theme.colors.background : '#f0f2f5',
            // Keep the border ALWAYS present and only change its COLOR on focus. Toggling
            // borderWidth 0→1.5 grew the row by 3px when the field focused, shoving the layout
            // up/down (the "bounce"). A constant width reserves the space so nothing moves.
            borderColor: isSearchFocused ? theme.colors.primary : 'transparent',
            borderWidth: 1.5,
          }
        ]}
      >
        <Ionicons 
          name="search" 
          size={20} 
          color={isSearchFocused ? theme.colors.primary : theme.colors.textSecondary} 
        />
        <TextInput allowFontScaling={false}
          style={[styles.searchInput, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }, isRTL && { marginLeft: 0, marginRight: 12 }]}
          placeholder={t('search.placeholder')}
          placeholderTextColor={theme.colors.placeholder}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          autoFocus={!preSelectedCategory}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => setIsSearchFocused(false)}
          scrollEnabled={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => {
            if (isVisualSearch) {
              dismissVisualSearch();
            } else {
              setSearchQuery('');
            }
          }} activeOpacity={0.7}>
            <Ionicons name="close-circle" size={18} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => (navigation as any).navigate('BarcodeScanner')}
          activeOpacity={0.7}
          style={{ marginLeft: 8, padding: 4 }}
        >
          <Ionicons name="barcode-outline" size={22} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Filter Bar */}
      <View style={styles.filterBar}>
        <TouchableOpacity
          style={[styles.filterButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          onPress={() => setShowFilters(true)}
        >
          <Ionicons name="filter" size={16} color={theme.colors.primary} />
          <Text allowFontScaling={false} style={[styles.filterButtonText, { color: theme.colors.primary }]}>{t('search.filters')}</Text>
        </TouchableOpacity>


      </View>

      {/* AI Visual Search Banner */}
      {renderAIBanner()}

      {/* Products List - Masonry Grid */}
      <FlashList
        data={filteredProducts}
        renderItem={renderProduct}
        keyExtractor={(item: Product) => item.id}
        numColumns={numColumns}
        masonry
        estimatedItemSize={250}
        contentContainerStyle={[styles.listContainer, { backgroundColor: isDark ? theme.colors.background : '#FFF3E0' }]}
        showsVerticalScrollIndicator={false}
        // Kill the rubber-band overscroll so dragging with a finger doesn't make the results
        // (or a short/empty list) bounce up and down. bounces→iOS, overScrollMode→Android.
        bounces={false}
        overScrollMode="never"
        // Recovery affordance: a failed load leaves the list empty; let the user pull to retry.
        refreshing={isLoading}
        onRefresh={loadProducts}
        ListEmptyComponent={
          // ALIBABA: No animations on empty state
          hasError && products.length === 0 ? (
            // Distinct load-error state so a failed fetch isn't mistaken for a genuine zero-result set.
            <View style={[styles.emptyContainer, { backgroundColor: isDark ? theme.colors.background : '#FFF3E0' }]}>
              <Ionicons name="cloud-offline-outline" size={64} color={theme.colors.textSecondary} />
              <Text allowFontScaling={false} style={[styles.emptyTitle, { color: theme.colors.text }]}>
                {t('common.somethingWentWrong')}
              </Text>
              <Text allowFontScaling={false} style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
                {t('search.loadErrorSubtitle', { defaultValue: 'Please check your connection and try again.' })}
              </Text>
              <Button
                title={t('common.retry')}
                onPress={loadProducts}
                variant="outline"
                style={{ marginTop: 16 }}
              />
            </View>
          ) : (
            <View style={[styles.emptyContainer, { backgroundColor: isDark ? theme.colors.background : '#FFF3E0' }]}>
              <Ionicons name="search-outline" size={64} color={theme.colors.textSecondary} />
              <Text allowFontScaling={false} style={[styles.emptyTitle, { color: theme.colors.text }]}>
                {t('search.noResults')}
              </Text>
              <Text allowFontScaling={false} style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
                {t('search.noResultsSubtitle')}
              </Text>
              <Button
                title={t('search.clearFilters')}
                onPress={resetFilters}
                variant="outline"
                style={{ marginTop: 16 }}
              />
            </View>
          )
        }
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  backButton: {
    marginRight: 8,
    padding: 8,
  },
  checkbox: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  container: {
    flex: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 0, // Reduced from 12 to 0 to sit flush with list
    zIndex: 1,
  },
  filterButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 6,
  },

  filterOption: {
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterOptionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterSection: {
    marginVertical: 20,
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  filtersContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  filtersModal: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: statusBarHeight - 8, // Account for status bar
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  listContainer: {
    paddingBottom: LAYOUT.SCREEN_PADDING,
    paddingTop: 4,
  },
  loadingText: {
    fontSize: 16,
    marginTop: 16,
  },
  modalFooter: {
    borderTopWidth: 1,
    padding: 20,
  },
  modalHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  priceInput: {
    fontSize: 16,
    height: 40,
    includeFontPadding: false,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  priceInputContainer: {
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  priceInputs: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  priceLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  priceSeparator: {
    fontSize: 16,
    marginHorizontal: 16,
  },
  resetText: {
    fontSize: 16,
    fontWeight: '500',
  },
  row: {
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    height: 38,
    includeFontPadding: false,
    marginLeft: 12,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  searchInputContainer: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 8,
    marginHorizontal: 16,
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    ...SHADOW_STYLES.small,
  },
  stockFilter: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  stockFilterText: {
    fontSize: 14,
    marginLeft: 12,
  },
});

// Visual Search Banner Styles
const vsStyles = StyleSheet.create({
  aiBanner: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    padding: 16,
    overflow: 'hidden',
  },
  aiBannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  aiBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  aiContentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  aiIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  aiDescription: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    lineHeight: 18,
  },
  aiBadgesRow: {
    marginBottom: 10,
  },
  aiConfidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginRight: 8,
    gap: 5,
  },
  aiConfidenceText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '500',
  },
  aiResultCount: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
  },
});

export default SearchScreen;
