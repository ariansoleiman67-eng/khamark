// Firestore imports kept for store modal queries if needed in the future
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  FlatList,
  Alert,
  Platform,
  ScrollView,
  AccessibilityInfo,
  KeyboardAvoidingView,
  InteractionManager,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../components/ThemeProvider';
import { useCart } from '../contexts/CartContext';
import { useFavorites } from '../contexts/FavoritesContext';
import { LinearGradient } from 'expo-linear-gradient';
import { Product } from '../types';
import MasonryProductCard from '../components/MasonryProductCard';
import AppNumber from '../components/AppNumber';
import ProductService from '../services/productService';

import { useTenant } from '../contexts/TenantContext';
import { getCategoryIconName } from '../utils/categoryIcons';
import { categoryService } from '../services/categoryService';
import { storeProfileService, StoreProfile } from '../services/storeProfileService';
import BannerCarousel from '../components/BannerCarousel';



// GOLDEN TEMPLATE: Bottom nav height for padding calculation
const BOTTOM_NAV_HEIGHT = 80;

// Placeholder banner for stores without images
const DEFAULT_BANNER = require('../../assets/banner-1.jpg'); // Fallback

// ALIBABA: Last filter storage key
const LAST_FILTER_KEY = 'lastAppliedFilter';

interface Category {
  id: string;
  name: string;
  nameAr: string;
  nameKu: string;
  icon: string | keyof typeof Ionicons.glyphMap;
  count: number;
  description: string;
  descriptionAr: string;
  descriptionKu: string;
  imageUrl?: string;
  gradientColors?: string[];
  isActive: boolean;
}

/**
 * CATEGORIES/PRODUCT LIST SCREEN - GOLDEN TEMPLATE
 * 
 * Architecture:
 * SafeAreaView (edges: ['top','left','right'])
 *  └── KeyboardAvoidingView
 *      └── FlatList (SINGLE vertical scroll owner)
 *          ├── ListHeaderComponent (hero, search, filters)
 *          ├── Product Cards (numColumns={2})
 *          └── contentContainerStyle.paddingBottom for bottom nav
 * 
 * Rules enforced:
 * - ONE vertical scroll owner
 * - NO fixed heights (aspectRatio only)
 * - NO layout animations
 * - Header INSIDE the scroll
 * - Guest can browse AND add to cart freely
 */
const CategoriesScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { theme, isDark } = useTheme();
  const navigation = useNavigation();
  const { addToCart } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { tenantId } = useTenant();
  const insets = useSafeAreaInsets();
  
  // State
  const [categories, setCategories] = useState<Category[]>([]);
  // Uploaded category icons (name -> imageUrl) from the shop's managed categories.
  // When present, they replace the guessed MaterialCommunityIcons glyph.
  const [iconByName, setIconByName] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!tenantId) return;
    categoryService.getActiveCategories(tenantId).then(list => {
      const map: Record<string, string> = {};
      for (const c of list) { if (c.imageUrl) map[c.name] = c.imageUrl; }
      setIconByName(map);
    }).catch(() => {});
  }, [tenantId]);
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Helper to get translated name for headers
  const translatedSelectedCategory = useMemo(() => {
    if (selectedCategory === 'All') return t('categories.all');
    
    // Create a safe translation key: lowercase and remove spaces
    const translationKey = selectedCategory.toLowerCase().replace(/\s+/g, '');
    const fallback = t(`categories.${translationKey}`);
    
    // If we have a successful translation from our JSON files
    if (fallback !== `categories.${translationKey}`) {
      return fallback;
    } 
    
    // Otherwise try the database fields if populated
    const cat = categories.find(c => c.name === selectedCategory);
    if (cat) {
      if (i18n.language === 'ar' && cat.nameAr && cat.nameAr.trim() !== '') return cat.nameAr;
      if (i18n.language === 'ku' && cat.nameKu && cat.nameKu.trim() !== '') return cat.nameKu;
    }
    
    return selectedCategory;
  }, [selectedCategory, categories, i18n.language, t]);
  const [error, setError] = useState<string | null>(null);

  // ALIBABA: Scroll-aware perception states
  const [lastAppliedFilter, setLastAppliedFilter] = useState<string | null>(null);
  const [highlightCleared, setHighlightCleared] = useState(false);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const [showScrollHint, setShowScrollHint] = useState(false);
  
  // Stores modal state
  const [storesModalVisible, setStoresModalVisible] = useState(false);
  const [stores, setStores] = useState<Array<{ tenantId: string; profile: StoreProfile }>>([]);
  const [loadingStores, setLoadingStores] = useState(false);
  const [storesLoaded, setStoresLoaded] = useState(false);
  
  // Refs for list control
  const productListRef = useRef<FlatList>(null);

  // =================================================================
  // ALIBABA: Check Reduce Motion on mount
  // =================================================================
  useEffect(() => {
    const checkReduceMotion = async () => {
      try {
        const isEnabled = await AccessibilityInfo.isReduceMotionEnabled();
        setReduceMotionEnabled(isEnabled);
      } catch {
        // Default to false
      }
    };
    checkReduceMotion();
  }, []);

  // =================================================================
  // ALIBABA: Load last applied filter from storage
  // =================================================================
  useEffect(() => {
    const loadLastFilter = async () => {
      try {
        const stored = await AsyncStorage.getItem(LAST_FILTER_KEY);
        if (stored && stored !== 'All') {
          setLastAppliedFilter(stored);
        }
      } catch {
        // Silent fail
      }
    };
    loadLastFilter();
  }, []);

  // PERFORMANCE: Use ProductService with built-in L1/L2 caching
  // instead of raw getDocs() which fetches ALL 200 products uncached
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch products via ProductService (has memory + AsyncStorage cache)
      const { products: fetchedProducts } = await ProductService.getProducts(
        {}, // no filters — show all
        { page: 1, limit: 2000, total: 0, hasMore: true }, // cover the whole catalog (was capped at 200)
        tenantId ?? undefined
      );
      
      setProducts(fetchedProducts);
      
      // Extract unique categories from products
      const uniqueCategories = Array.from(new Set(fetchedProducts.map(p => p.category)));
      const categoriesWithCounts = uniqueCategories.map((categoryName, index) => {
        const categoryProducts = fetchedProducts.filter(p => p.category === categoryName);
        return {
          id: (index + 1).toString(),
          name: categoryName,
          nameAr: categoryName,
          nameKu: categoryName,
          icon: getCategoryIcon(categoryName),
          count: categoryProducts.length,
          description: `${categoryName} parts and components`,
          descriptionAr: `قطع ومكونات ${categoryName}`,
          descriptionKu: `پارچەکانی ${categoryName}`,
          gradientColors: getCategoryGradient(categoryName),
          isActive: true,
        } as Category;
      });
      
      setCategories(categoriesWithCounts);
      
    } catch (err: any) {
      setError(err.message || t('errors.unknown'));
    } finally {
      setLoading(false);
    }
  }, [tenantId, t]); // Added tenantId and t to dependencies
  
  // Helper function to get category icon
  const getCategoryIcon = (categoryName: string): keyof typeof Ionicons.glyphMap => {
    const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
      'Engine Parts': 'cog',
      'Brake System': 'disc',
      'Transmission': 'settings',
      'Electrical': 'flash',
      'Suspension': 'trending-up',
      'Body Parts': 'car',
      'Cabin & Interior': 'home',
      'Cooling System': 'snow',
    };
    return iconMap[categoryName] || 'cube';
  };
  
  // Helper function to get category gradient colors
  const getCategoryGradient = (categoryName: string): string[] => {
    const gradientMap: Record<string, string[]> = {
      'Engine Parts': ['#FF6B6B', '#FF8E53'],
      'Brake System': ['#4ECDC4', '#44A08D'],
      'Transmission': ['#667eea', '#764ba2'],
      'Electrical': ['#f093fb', '#f5576c'],
      'Suspension': ['#4facfe', '#00f2fe'],
      'Body Parts': ['#a8edea', '#fed6e3'],
      'Cabin & Interior': ['#ffecd2', '#fcb69f'],
      'Cooling System': ['#d299c2', '#fef9d7'],
      'Steering': ['#89f7fe', '#66a6ff'],
      'Ignition': ['#f83600', '#f9d423'],
      'Fuel System': ['#00c6fb', '#005bea'],
      'Exterior': ['#13547a', '#80d0c7'],
      'Lighting': ['#f6d365', '#fda085'],
      'Wipers & Washers': ['#4facfe', '#00f2fe'],
      'Filters': ['#96fbc4', '#f9f586'],
      'Belts': ['#2af598', '#009efd'],
      'Sensors': ['#fa709a', '#fee140'],
      'Turbo': ['#f77062', '#fe5196'],
      'Wheels & Tires': ['#30cfd0', '#330867'],
      'Oil': ['#09203f', '#537895'],
      'Accessories': ['#ff0844', '#ffb199'],
      'General': ['#859398', '#283048'],  // Cool industrial truck tone
      'Other': ['#BDBBBE', '#9D9EA3'],    // Neutral metallic tone
    };
    // Force reload for final heavy machine truck components
    return gradientMap[categoryName] || ['#e0c3fc', '#8ec5fc'];
  };
  
  // Load data on component mount
  // PERFORMANCE: Load products first, then defer store loading
  useEffect(() => {
    loadData();
    // Defer store loading until after products are rendered
    const task = InteractionManager.runAfterInteractions(() => {
      loadStores();
    });
    return () => task.cancel();
  }, [loadData]);

  // Load stores specifically for banner (cached via storeProfileService)
  const loadStores = async () => {
    try {
      setLoadingStores(true);
      const allStores = await storeProfileService.getAllStoreProfiles();
      setStores(allStores);
      setStoresLoaded(true);
    } catch (err) {
      console.log('Failed to load stores for banner');
    } finally {
      setLoadingStores(false);
    }
  };

  // Filter products based on search and category
  useEffect(() => {
    let filtered = products;
    
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(product => product.category === selectedCategory);
    }
    
    if (searchQuery.trim() !== '') {
      const searchTerms = searchQuery.toLowerCase().split(' ').filter(term => term.length > 0);
      
      // Helper to normalize text (remove special chars) for flexible number matching
      const normalize = (text: string | null | undefined) => {
        if (!text) return '';
        return text.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
      };
      
      const normalizedTerms = searchTerms.map(t => normalize(t));
      
      filtered = filtered.filter(product => {
        // Helper to check if a term exists in any product field
        const matchesTerm = (term: string, index: number) => {
          const normalizedTerm = normalizedTerms[index];
          const hasNormalizedTerm = normalizedTerm.length > 0;

          // 1. Basic Fields
          if (
            (product.name && product.name.toLowerCase().includes(term)) ||
            (product.nameAr && product.nameAr.toLowerCase().includes(term)) ||
            (product.nameKu && product.nameKu.toLowerCase().includes(term)) ||
            (product.description && product.description.toLowerCase().includes(term)) ||
            (product.category && product.category.toLowerCase().includes(term))
          ) {
            return true;
          }

           // 2. Part Number / Serial (Flexible Match)
           if (product.partNumber) {
            const rawPart = product.partNumber.toLowerCase();
            const normPart = normalize(product.partNumber);
            if (rawPart.includes(term) || (hasNormalizedTerm && normPart.includes(normalizedTerm))) {
              return true;
            }
          }

          // 3. Compatible Models
          if (product.compatibleModels && product.compatibleModels.some(model => 
            model.toLowerCase().includes(term) || 
            (hasNormalizedTerm && normalize(model).includes(normalizedTerm))
          )) {
            return true;
          }

          // 4. Variations (Size)
          if (product.variations && product.variations.some(v => {
            const size = v.sizeValue ? v.sizeValue.toLowerCase() : '';
            return size.includes(term);
          })) {
            return true;
          }

          // 5. Color Variations (Color Name)
          if (product.colorVariations && product.colorVariations.some(v => {
            const color = v.colorValue ? v.colorValue.toLowerCase() : '';
            return color.includes(term);
          })) {
            return true;
          }

          // 6. Legacy Options
          if (product.options) {
            if (product.options.colors && product.options.colors.some(c => c.toLowerCase().includes(term))) return true;
            if (product.options.sizes && product.options.sizes.some(s => s.toLowerCase().includes(term))) return true;
          }

          return false;
        };

        // AND LOGIC: Every typed term must match *somewhere* in the product
        return searchTerms.every((term, index) => matchesTerm(term, index));
      });
    }
    
    setFilteredProducts(filtered);
  }, [searchQuery, selectedCategory, products]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // Clear product cache so pull-to-refresh gets fresh data
      await ProductService.clearCache();
      await loadData();
    } finally {
      setRefreshing(false);
    }
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
        Alert.alert(t('common.error'), error.message || t('cart.failedToAddItem'));
      }
    }
  }, [navigation, addToCart, t]);
  
  // ALIBABA: Filter handler with AsyncStorage save
  const handleCategoryFilter = async (categoryName: string) => {
    setSelectedCategory(categoryName);
    
    // Save as last applied filter
    try {
      await AsyncStorage.setItem(LAST_FILTER_KEY, categoryName);
    } catch {
      // Silent fail
    }
    
    // Clear highlight on first interaction
    if (!highlightCleared) {
      setHighlightCleared(true);
    }
  };

  const handleSearchPress = () => {
    (navigation as any).navigate('Search');
  };
  
  // ALIBABA: Tap header to scroll to top instantly
  const scrollToTop = () => {
    productListRef.current?.scrollToOffset({ offset: 0, animated: false });
  };

  // Load all store profiles for the Browse Stores modal
  const handleBrowseStores = async () => {
    setStoresModalVisible(true);
    if (storesLoaded) return; // Already loaded
    
    setLoadingStores(true);
    try {
      const allStores = await storeProfileService.getAllStoreProfiles();
      setStores(allStores);
      setStoresLoaded(true);
    } catch (err) {
      Alert.alert(t('common.error'), t('errors.unknown'));
    } finally {
      setLoadingStores(false);
    }
  };

  // Navigate to a store's products page
  const handleStorePress = (storeTenantId: string) => {
    setStoresModalVisible(false);
    (navigation as any).navigate('StoreProducts', { tenantId: storeTenantId });
  };

  // Render a store card in the modal (compact 2-col grid — modern design)
  const renderStoreCard = ({ item }: { item: { tenantId: string; profile: StoreProfile } }) => {
    const { profile } = item;
    const localizedName = 
      i18n.language === 'ar' && profile.storeNameAr ? profile.storeNameAr :
      i18n.language === 'ku' && profile.storeNameKu ? profile.storeNameKu :
      profile.storeName;
    
    return (
      <TouchableOpacity
        style={[
          styles.storeCard,
          { backgroundColor: isDark ? theme.colors.surface : '#FFFFFF' },
        ]}
        onPress={() => handleStorePress(item.tenantId)}
        activeOpacity={0.75}
      >
        {/* Gradient ring around logo */}
        <LinearGradient
          colors={['#FF6A00', '#FF9F43', '#FFCD56']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.storeLogoRing}
        >
          <View style={[
            styles.storeLogoWrap,
            { backgroundColor: isDark ? theme.colors.background : '#FFFFFF' },
          ]}>
            {profile.logoUrl ? (
              <Image
                source={{ uri: profile.logoUrl }}
                style={styles.storeLogo}
                contentFit="cover"
              />
            ) : (
              <Ionicons name="storefront" size={28} color="#FF6A00" />
            )}
          </View>
        </LinearGradient>

        {/* Store Name */}
        <Text allowFontScaling={false}
          style={[styles.storeNameText, { color: theme.colors.text }]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {localizedName}
        </Text>

        {/* Verified badge or subtle tag */}
        {profile.isVerified ? (
          <View style={styles.storeVerifiedTag}>
            <Ionicons name="checkmark-circle" size={12} color="#FFFFFF" />
            <Text allowFontScaling={false} style={styles.storeVerifiedText}>Verified</Text>
          </View>
        ) : (
          <View style={styles.storeVisitTag}>
            <Text allowFontScaling={false} style={[styles.storeVisitText, { color: '#FF6A00' }]}>Visit →</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // Render the stores modal
  const renderStoresModal = () => (
    <Modal
      visible={storesModalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setStoresModalVisible(false)}
    >
      <View style={[styles.storesModalContainer, { backgroundColor: isDark ? theme.colors.background : '#F8F4EF' }]}>
        {/* Header */}
        <View style={[styles.storesModalHeader, { borderBottomColor: isDark ? theme.colors.border : '#F0E6DC' }]}>
          <LinearGradient
            colors={isDark ? ['#1a1a2e', '#16213e'] : ['#FFFFFF', '#FFF8F0']}
            style={styles.storesModalHeaderGradient}
          >
            <TouchableOpacity
              onPress={() => setStoresModalVisible(false)}
              style={[styles.storesModalCloseBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#F5F0EB' }]}
            >
              <Ionicons name="close" size={20} color={isDark ? '#FFFFFF' : '#333'} />
            </TouchableOpacity>

            <View style={styles.storesModalTitleWrap}>
              <Text allowFontScaling={false}
                style={[styles.storesModalTitle, { color: theme.colors.text }]}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {t('stores.browseStores', { defaultValue: 'All Stores' })}
              </Text>
              {stores.length > 0 && (
                <View style={styles.storesCountBadge}>
                  <Text allowFontScaling={false} style={styles.storesCountText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{stores.length}</Text>
                </View>
              )}
            </View>

            <Text allowFontScaling={false}
              style={[styles.storesModalSubtitle, { color: theme.colors.textSecondary }]}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {t('stores.discoverStores', { defaultValue: 'Discover trusted sellers' })}
            </Text>
          </LinearGradient>
        </View>

        {/* Content */}
        {loadingStores ? (
          <View style={styles.storesLoadingContainer}>
            <ActivityIndicator size="large" color="#FF6A00" />
            <Text allowFontScaling={false}
              style={[styles.storesLoadingText, { color: theme.colors.textSecondary }]}
              adjustsFontSizeToFit
            >
              {t('common.loading', { defaultValue: 'Loading...' })}
            </Text>
          </View>
        ) : stores.length === 0 ? (
          <View style={styles.storesEmptyContainer}>
            <Ionicons name="storefront-outline" size={64} color={theme.colors.textSecondary} />
            <Text allowFontScaling={false}
              style={[styles.storesEmptyText, { color: theme.colors.textSecondary }]}
              adjustsFontSizeToFit
            >
              {t('stores.noStores', { defaultValue: 'No stores available yet' })}
            </Text>
          </View>
        ) : (
          <FlatList
            data={stores}
            renderItem={renderStoreCard}
            keyExtractor={(item) => item.tenantId}
            numColumns={2}
            columnWrapperStyle={styles.storesColumnWrapper}
            contentContainerStyle={styles.storesListContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </Modal>
  );
  
  const handleProductPress = useCallback((productId: string) => {
    (navigation as any).navigate('ProductDetails', { productId });
  }, [navigation]);

  const renderProductCard = useCallback(({ item }: { item: Product }) => (
    <View style={styles.productCardWrapper}>
      <MasonryProductCard
        product={item}
        onPress={handleProductPress}
        onAddToCart={handleAddToCart}
        isFavorite={isFavorite(item.id)}
        onToggleFavorite={toggleFavorite}
      />
    </View>
  ), [handleProductPress, handleAddToCart, isFavorite, toggleFavorite]);

  // Category filter renderer - ALIBABA-STYLE GRID with Icons
  const renderCategoryFilter = () => {
    // We need both the original name (for logic) and the translated name (for display)
    const categoryOptions = [
      { id: 'All', originalName: 'All', displayName: t('categories.all'), gradientColors: ['#FF6A00', '#FF8E53'] },
      ...categories.map(cat => {
        let displayName = cat.name;

        // Create a safe translation key: lowercase and remove spaces
        const translationKey = cat.name.toLowerCase().replace(/\s+/g, '');
        const fallback = t(`categories.${translationKey}`);
        
        // If we have a successful translation from our JSON files (it didn't return the raw key)
        if (fallback !== `categories.${translationKey}`) {
          displayName = fallback;
        } 
        // Otherwise try the database fields
        else if (i18n.language === 'ar' && cat.nameAr && cat.nameAr.trim() !== '') {
          displayName = cat.nameAr;
        } else if (i18n.language === 'ku' && cat.nameKu && cat.nameKu.trim() !== '') {
          displayName = cat.nameKu;
        } else {
          displayName = cat.name;
        }
        
        return {
          id: cat.id,
          originalName: cat.name,
          displayName,
          gradientColors: cat.gradientColors,
        };
      })
    ];
    
    // Calculate item width for responsive grid
    const H_PADDING = 14;
    const GAP = 10;
    const COLUMNS = 3; // 3 columns for category cards
    
    // Get screen width (approximate, won't change during render)
    const screenWidth = 360; // Safe default, cards will stretch
    const totalGaps = GAP * (COLUMNS - 1);
    const available = screenWidth - H_PADDING * 2 - totalGaps;
    const itemWidth = Math.floor(available / COLUMNS);
    
    return (
      <View style={styles.categoryFilterContainer}>
        <View style={styles.categoryGridAlt}>
          {categoryOptions.map((cat) => {
            const isSelected = selectedCategory === cat.originalName;
            const iconName = getCategoryIconName(cat.originalName === 'All' ? 'all' : cat.originalName);
            const uploadedIcon = iconByName[cat.originalName];
            
            // ALIBABA ORANGE styling for selected state
            const ORANGE_COLOR = '#FF6A00';
            
            const borderColor = isSelected ? ORANGE_COLOR + '55' : theme.colors.border + '35';
            const bg = isSelected ? ORANGE_COLOR + '12' : theme.colors.surface;
            const iconColor = isSelected ? ORANGE_COLOR : theme.colors.textSecondary;
            const iconBg = isSelected ? ORANGE_COLOR + '18' : theme.colors.background;
            
            return (
              <TouchableOpacity
                key={cat.originalName}
                onPress={() => handleCategoryFilter(cat.originalName)}
                activeOpacity={0.88}
                style={[
                  styles.alibabaGridCard,
                  {
                    backgroundColor: bg,
                    borderColor,
                  },
                ]}
              >
                <View style={styles.alibabaIconWrap}>
                  {uploadedIcon ? (
                    <Image
                      source={{ uri: uploadedIcon }}
                      style={StyleSheet.absoluteFillObject}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <>
                      <LinearGradient
                        colors={(cat.gradientColors as any) || ['#FF6A00', '#FF8E53']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFillObject}
                      />
                      <MaterialCommunityIcons name={iconName as any} size={28} color="#FFFFFF" />
                    </>
                  )}
                </View>
                <Text allowFontScaling={false}
                  style={[styles.alibabaGridTitle, { color: isSelected ? ORANGE_COLOR : theme.colors.text }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {cat.displayName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  // Featured category renderer - REMOVED as requested

  // Helper to get banner source from store profile
  const getStoreBannerSource = (profile: StoreProfile) => {
    if (profile.coverUrl) return { uri: profile.coverUrl };
    if (profile.logoUrl) return { uri: profile.logoUrl };
    return DEFAULT_BANNER;
  };

  // Convert stores to banner items
  const storeBanners = stores.map(store => ({
    ...getStoreBannerSource(store.profile),
    tenantId: store.tenantId, // Custom prop for navigation
    title: i18n.language === 'ar' ? store.profile.storeNameAr : 
           i18n.language === 'ku' ? store.profile.storeNameKu : 
           store.profile.storeName
  }));

  const handleStoreBannerPress = (item: any) => {
    if (item.tenantId) {
      handleStorePress(item.tenantId);
    } else {
       // Fallback to "Browse All" if no specific tenant
       handleBrowseStores();
    }
  };
  
  // GOLDEN TEMPLATE: ListHeaderComponent contains ALL header content
  const renderHeader = () => (
    <View style={styles.header}>
      {/* Store Banners Carousel (Replaces Browse Stores Button) */}
      <View style={styles.bannerContainer}>
         {loadingStores && stores.length === 0 ? (
            // Skeleton for banner
            <View style={[styles.skeletonBanner, { 
              backgroundColor: isDark ? theme.colors.surface : '#E0E0E0',
              opacity: 0.5 
            }]} />
         ) : stores.length > 0 ? (
            <BannerCarousel 
              images={storeBanners} 
              onItemPress={handleStoreBannerPress}
              overlayLabel={t('common.storeLabel')}
            />
         ) : (
            // Fallback button if no stores loaded yet
            <TouchableOpacity
              onPress={handleBrowseStores}
              activeOpacity={0.85}
              style={styles.browseStoresBtn}
            >
              <LinearGradient
                colors={['#FF6A00', '#FF8F00']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.browseStoresGradient}
              >
                <Ionicons name="storefront-outline" size={20} color="#FFFFFF" />
                <Text allowFontScaling={false} style={styles.browseStoresText} adjustsFontSizeToFit minimumFontScale={0.8}>
                  {t('stores.browseStores', { defaultValue: 'Browse Stores' })}
                </Text>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.8)" />
              </LinearGradient>
            </TouchableOpacity>
         )}
      </View>



      {/* Search Bar - NO animations */}
      <View style={[styles.searchContainer, { backgroundColor: theme.colors.surface }]}>
        <LinearGradient
          colors={['#FF6A00', '#FF8F00']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.searchGradient}
        >
          <TouchableOpacity
            onPress={handleSearchPress}
            style={styles.searchTouchable}
          >
            <Ionicons name="search" size={20} color="#ffffff" />
            <Text allowFontScaling={false} style={styles.searchPlaceholder}>{t('search.placeholder')}</Text>
            <Ionicons name="filter" size={16} color="rgba(255, 255, 255, 0.8)" />
          </TouchableOpacity>
        </LinearGradient>
      </View>

    {renderCategoryFilter()}
      
      {/* Results Count - NO animations */}
      <View style={styles.resultsHeader}>
        <Text allowFontScaling={false} style={[styles.resultsCount, { color: theme.colors.text }]} adjustsFontSizeToFit>
          {selectedCategory !== 'All' && (
            <Text allowFontScaling={false} style={[styles.categoryFilterLabel, { color: theme.colors.primary }]} adjustsFontSizeToFit>
              {t('common.in')} {translatedSelectedCategory}
            </Text>
          )}
        </Text>
      </View>
    </View>
  );

  // Empty state renderer
  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="cube-outline" size={64} color={theme.colors.textSecondary} />
      <Text allowFontScaling={false} style={[styles.emptyTitle, { color: theme.colors.text }]} adjustsFontSizeToFit>
        {selectedCategory === 'All' ? t('products.noProducts') : t('search.noResultsFor', { query: translatedSelectedCategory })}
      </Text>
      <Text allowFontScaling={false} style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]} adjustsFontSizeToFit>
        {selectedCategory === 'All' 
          ? t('products.noProducts')
          : t('search.noResults')
        }
      </Text>
      {selectedCategory !== 'All' && (
        <TouchableOpacity
          onPress={() => setSelectedCategory('All')}
          style={[styles.showAllButton, { backgroundColor: theme.colors.primary }]}
        >
          <Text allowFontScaling={false} style={styles.showAllButtonText}>{t('categories.all')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // =================================================================
  // ALIBABA: Skeleton Loading (static, no shimmer)
  // Matches real layout to prevent layout shift
  // =================================================================
  if (loading) {
    const skeletonOpacity = isDark ? 0.2 : 0.12;
    const skeletonColor = theme.colors.text;
    
    return (
      <SafeAreaView 
        style={[styles.container, { backgroundColor: isDark ? theme.colors.background : '#FAFAF5' }]}
        edges={['left', 'right']}
      >
        <View style={styles.header}>
          {/* Skeleton Hero */}
          <View style={styles.heroSection}>
            <View style={[styles.skeletonText, { width: 200, height: 24, backgroundColor: skeletonColor, opacity: skeletonOpacity }]} />
            <View style={[styles.skeletonText, { width: 160, height: 16, marginTop: 8, backgroundColor: skeletonColor, opacity: skeletonOpacity }]} />
          </View>
          
          {/* Skeleton Search */}
          <View style={[styles.skeletonSearch, { backgroundColor: skeletonColor, opacity: skeletonOpacity }]} />
          
          {/* Skeleton Stats */}
          <View style={styles.statsRow}>
            {[1, 2, 3].map((i) => (
              <View key={i} style={[styles.skeletonStatCard, { backgroundColor: skeletonColor, opacity: skeletonOpacity }]} />
            ))}
          </View>
          
          {/* Skeleton Filter Chips */}
          <View style={styles.skeletonFilterRow}>
            {[1, 2, 3, 4].map((i) => (
              <View key={i} style={[styles.skeletonChip, { backgroundColor: skeletonColor, opacity: skeletonOpacity }]} />
            ))}
          </View>
          
          {/* Skeleton Results Header */}
          <View style={styles.resultsHeader}>
            <View style={[styles.skeletonText, { width: 140, height: 18, backgroundColor: skeletonColor, opacity: skeletonOpacity }]} />
          </View>
        </View>
        
        {/* Skeleton Product Grid */}
        <View style={styles.skeletonProductsGrid}>
          {[1, 2, 3, 4].map((i) => (
            <View key={i} style={styles.skeletonProductCard}>
              <View style={[styles.skeletonProductImage, { backgroundColor: skeletonColor, opacity: skeletonOpacity }]} />
              <View style={[styles.skeletonText, { width: '70%', height: 14, marginTop: 8, backgroundColor: skeletonColor, opacity: skeletonOpacity }]} />
              <View style={[styles.skeletonText, { width: '30%', height: 12, marginTop: 4, backgroundColor: skeletonColor, opacity: skeletonOpacity }]} />
            </View>
          ))}
        </View>
      </SafeAreaView>
    );
  }
  
  // Show error state
  if (error) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: isDark ? theme.colors.background : '#FAFAF5' }]}>
        <Ionicons name="alert-circle-outline" size={64} color={theme.colors.error} />
        <Text allowFontScaling={false} style={[styles.errorTitle, { color: theme.colors.text, marginTop: 16 }]}>
          {t('common.error')}
        </Text>
        <Text allowFontScaling={false} style={[styles.errorText, { color: theme.colors.textSecondary, marginTop: 8 }]}>
          {error}
        </Text>
        <TouchableOpacity
          onPress={loadData}
          style={[styles.retryButton, { backgroundColor: theme.colors.primary, marginTop: 20 }]}
        >
          <Text allowFontScaling={false} style={styles.retryButtonText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView 
      style={[styles.container, { backgroundColor: isDark ? theme.colors.background : '#FAFAF5' }]}
      edges={Platform.OS === 'android' ? ['top', 'left', 'right'] : ['left', 'right']}
    >
      {/* GOLDEN TEMPLATE: KeyboardAvoidingView same as Login/Home */}
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* GOLDEN TEMPLATE: SINGLE FlatList as vertical scroll owner */}
        {/* ALIBABA: Performance guardrails */}
        <FlatList
          ref={productListRef}
          data={filteredProducts}
          renderItem={renderProductCard}
          keyExtractor={(item) => `${tenantId}-${item.id}`}
          numColumns={2}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS === 'android'}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          scrollEventThrottle={16}
          onScroll={(e) => {
            const y = e.nativeEvent.contentOffset.y;
            setShowScrollHint(y > 200);
          }}
          onScrollBeginDrag={() => {
            // ALIBABA: Clear highlight on first scroll
            if (!highlightCleared) {
              setHighlightCleared(true);
            }
          }}
          contentContainerStyle={{
            // Push content below the transparent blur header
            // Android: SafeAreaView handles top inset, just add small padding
            // iOS: Manual top inset needed for transparent blur header
            paddingTop: Platform.OS === 'android' ? 60 : (insets.top + 44),
            // GOLDEN TEMPLATE: Bottom padding for nav bar using insets
            paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
        />

        {/* ALIBABA: Floating scroll-to-top button - appears after scrolling down */}
        {showScrollHint && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              productListRef.current?.scrollToOffset?.({ offset: 0, animated: true });
            }}
            style={{
              position: 'absolute',
              bottom: BOTTOM_NAV_HEIGHT + insets.bottom + 20,
              right: 20,
              backgroundColor: theme.colors.primary,
              width: 48,
              height: 48,
              borderRadius: 24, // PERFECT CIRCLE
              alignItems: 'center',
              justifyContent: 'center',
              elevation: 5,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 10,
            }}
          >
            <Ionicons name="chevron-up" size={24} color="#fff" />
          </TouchableOpacity>
        )}
      </KeyboardAvoidingView>

      {/* Stores Modal */}
      {renderStoresModal()}
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
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  // Header styles
  header: {
    marginBottom: 2,
    paddingHorizontal: 12,
  },
  // Hero Section - NO fixed heights
  heroSection: {
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 20,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 36,
    marginBottom: 8,
    textAlign: 'center',
  },
  heroHighlight: {
    fontSize: 28,
    fontWeight: '800',
  },
  heroSubtitle: {
    fontSize: 16,
    lineHeight: 24,
    paddingHorizontal: 20,
    textAlign: 'center',
  },
  // Search
  searchContainer: {
    borderRadius: 20,
    marginBottom: 28,
    overflow: 'hidden',
  },
  searchGradient: {
    borderRadius: 20,
    padding: 3,
  },
  searchTouchable: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 17,
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  searchPlaceholder: {
    color: '#ffffff',
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.3,
    marginLeft: 12,
  },
  // Stats Row
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statCard: {
    alignItems: 'center',
    borderRadius: 12,
    flex: 1,
    marginHorizontal: 4,
    paddingVertical: 16,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  // Section Header
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
  },
  // Category Filter - Grid Layout
  categoryFilterContainer: {
    marginBottom: 2,
    paddingHorizontal: 8,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  // ALIBABA-STYLE GRID
  categoryGridAlt: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-start',
    paddingHorizontal: 2,
  },
  alibabaGridCard: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 18,
    width: '31%',
    minHeight: 110, 
    // Subtle shadow (iOS only — Android elevation creates harsh box shadow)
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: {
        elevation: 0,
      },
    }),
  },
  alibabaIconWrap: {
    alignItems: 'center',
    borderRadius: 24, // perfect circle
    height: 48,
    justifyContent: 'center',
    marginBottom: 12,
    width: 48,
    overflow: 'hidden', // Forces the LinearGradient to respect borderRadius on Android
  },
  alibabaGridTitle: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    includeFontPadding: false,
    letterSpacing: 0.2,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  categoryGridItemWrapper: {
    width: '25%', // 4 columns
    padding: 4,
    marginBottom: 8,
  },
  categoryFilterChip: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    padding: 2,
    width: '100%',
  },
  /**
   * SAMSUNG ARABIC FIX (LOCKED):
   * - includeFontPadding: false removes fake ascent/descent (Samsung)
   * - textAlignVertical: 'center' centers within minHeight
   * - textAlign: 'right' for RTL safety
   * - NO numberOfLines, NO ellipsizeMode, NO writingDirection
   */
  categoryFilterText: {
    fontSize: 14,
    fontWeight: '600',
    includeFontPadding: false,
    marginRight: 4,
    textAlign: 'right', // RTL-safe (Samsung fix)
    textAlignVertical: 'center',
  },
  /**
   * SAMSUNG ARABIC FIX (LOCKED):
   * - includeFontPadding: false for count text
   * - textAlign: 'right' for RTL safety
   */
  categoryFilterCount: {
    fontSize: 12,
    fontWeight: '500',
    includeFontPadding: false,
    textAlign: 'right', // RTL-safe (Samsung fix)
    textAlignVertical: 'center',
  },
  // Results Header
  resultsHeader: {
    marginBottom: 0,
    paddingHorizontal: 4,
  },
  resultsCount: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 0,
  },
  categoryFilterLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  // Product cards wrapper
  productCardWrapper: {
    marginBottom: 2,
    width: '50%',
  },
  // Empty State
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 20,
    textAlign: 'center',
  },
  showAllButton: {
    borderRadius: 25,
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  showAllButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Error States
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  retryButton: {
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  // =================================================================
  // ALIBABA: Skeleton Loading Styles (static, no shimmer)
  // =================================================================
  skeletonText: {
    borderRadius: 4,
  },
  skeletonSearch: {
    borderRadius: 16,
    height: 56,
    marginBottom: 24,
    width: '100%',
  },
  skeletonStatCard: {
    borderRadius: 12,
    flex: 1,
    height: 60,
    marginHorizontal: 4,
  },
  skeletonFilterRow: {
    flexDirection: 'row',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  skeletonChip: {
    borderRadius: 20,
    height: 36,
    marginHorizontal: 4,
    width: 80,
  },
  skeletonProductsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
  },
  skeletonProductCard: {
    marginBottom: 8,
    paddingHorizontal: 4,
    width: '50%',
  },
  skeletonProductImage: {
    aspectRatio: 1, // Same as MasonryProductCard
    borderRadius: 12,
    width: '100%',
  },
  // Browse Stores Button
  browseStoresBtn: {
    borderRadius: 14,
    marginBottom: 16,
    overflow: 'hidden',
  },
  browseStoresGradient: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  browseStoresText: {
    color: '#FFFFFF',
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 10,
  },
  // Stores Modal
  storesModalContainer: {
    flex: 1,
  },
  storesModalHeader: {
    borderBottomWidth: 1,
  },
  storesModalHeaderGradient: {
    alignItems: 'center',
    paddingBottom: 20,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 20,
  },
  storesModalTitleWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
  },
  storesModalTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  storesCountBadge: {
    backgroundColor: '#FF6A00',
    borderRadius: 10,
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  storesCountText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  storesModalSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  storesModalCloseBtn: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  storesLoadingContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  storesLoadingText: {
    fontSize: 15,
    marginTop: 12,
  },
  storesEmptyContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  storesEmptyText: {
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  storesListContent: {
    padding: 14,
    paddingBottom: 30,
  },
  storesColumnWrapper: {
    justifyContent: 'space-between' as const,
    marginBottom: 14,
  },
  storeCard: {
    alignItems: 'center',
    borderRadius: 20,
    elevation: 4,
    paddingBottom: 14,
    paddingHorizontal: 10,
    paddingTop: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    width: '47.5%',
  },
  storeLogoRing: {
    alignItems: 'center',
    borderRadius: 28,
    height: 72,
    justifyContent: 'center',
    padding: 3,
    width: 72,
  },
  storeLogoWrap: {
    alignItems: 'center',
    borderRadius: 25,
    height: 66,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 66,
  },
  storeLogo: {
    borderRadius: 25,
    height: 66,
    width: 66,
  },
  storeNameText: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 10,
    textAlign: 'center',
  },
  storeVerifiedTag: {
    alignItems: 'center',
    backgroundColor: '#FF6A00',
    borderRadius: 10,
    flexDirection: 'row',
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  storeVerifiedText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 3,
  },
  storeVisitTag: {
    marginTop: 8,
  },
  storeVisitText: {
    fontSize: 12,
    fontWeight: '700',
  },
  bannerContainer: {
    marginBottom: 16,
    marginHorizontal: -8, // Full width (counteract header padding)
  },
  skeletonBanner: {
    borderRadius: 16,
    height: 150,
    marginTop: 8,
    width: '100%',
  },
});

export default CategoriesScreen;
