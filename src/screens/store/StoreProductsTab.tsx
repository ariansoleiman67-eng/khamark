import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  TextInput, 
  Keyboard, 
  FlatList,
  Pressable 
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring,
  withTiming
} from 'react-native-reanimated';

import { StoreProfile } from '../../services/storeProfileService';
import { Product, RootStackParamList } from '../../types';
import MasonryProductCard from '../../components/MasonryProductCard';
import { useTheme } from '../../components/ThemeProvider';
import { SPACING, FONT_SIZE } from '../../constants/theme';
import { useFavorites } from '../../contexts/FavoritesContext';

interface StoreProductsTabProps {
  tenantId: string;
  profile: StoreProfile;
  products: Product[];
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Modern filter chip configurations with icons and gradients
const FILTER_CHIPS: Array<{
  id: string;
  labelKey: string;
  defaultLabel: string;
  icon: string;
  gradient: [string, string];
}> = [
  { id: 'All', labelKey: 'store.filters.all', defaultLabel: 'All', icon: 'grid', gradient: ['#667eea', '#764ba2'] },
  { id: 'New', labelKey: 'store.filters.new', defaultLabel: 'New', icon: 'sparkles', gradient: ['#f093fb', '#f5576c'] },
  { id: 'Best', labelKey: 'store.filters.best', defaultLabel: 'Best', icon: 'star', gradient: ['#FFC107', '#FF9800'] },
  { id: 'Low $', labelKey: 'store.filters.lowPrice', defaultLabel: 'Low $', icon: 'arrow-down', gradient: ['#11998e', '#38ef7d'] },
  { id: 'High $', labelKey: 'store.filters.highPrice', defaultLabel: 'High $', icon: 'arrow-up', gradient: ['#ee0979', '#ff6a00'] },
];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Animated Filter Chip Component
const FilterChip = ({ 
  item, 
  isActive, 
  onPress, 
  theme,
  isDark 
}: { 
  item: typeof FILTER_CHIPS[0]; 
  isActive: boolean; 
  onPress: () => void;
  theme: any;
  isDark: boolean;
}) => {
  const { t } = useTranslation();
  const scale = useSharedValue(1);
  const label = t(item.labelKey, { defaultValue: item.defaultLabel });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      style={[styles.chip, animatedStyle]}
      onPressIn={() => { scale.value = withSpring(0.9, { damping: 15 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 15 }); }}
      onPress={onPress}
    >
      {isActive ? (
        <LinearGradient
          colors={item.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.chipGradient}
        >
          <Ionicons name={item.icon as any} size={14} color="#fff" style={styles.chipIcon} />
          <Text allowFontScaling={false} style={styles.chipTextActive} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{label}</Text>
        </LinearGradient>
      ) : (
        <View style={[
          styles.chipInactive, 
          { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#fff' }
        ]}>
          <Ionicons 
            name={item.icon as any} 
            size={14} 
            color={theme.colors.textSecondary} 
            style={styles.chipIcon} 
          />
          <Text allowFontScaling={false} style={[styles.chipTextInactive, { color: theme.colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
            {label}
          </Text>
        </View>
      )}
    </AnimatedPressable>
  );
};

const StoreProductsTab: React.FC<StoreProductsTabProps> = ({ products }) => {
  const { theme, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const { isFavorite, toggleFavorite } = useFavorites();
  const isRTL = i18n.language === 'ar' || i18n.language === 'ku';

  const [displayProducts, setDisplayProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');

  // Filter and Sort Locally
  useEffect(() => {
    let filtered = products.filter(p => p.isActive !== false);

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        (p.name || '').toLowerCase().includes(q) || 
        (p.nameAr && p.nameAr.includes(q)) ||
        (p.nameKu && p.nameKu.includes(q))
      );
    }

    if (activeFilter === 'Low $') {
      filtered = [...filtered].sort((a, b) => (a.priceUSD ?? 0) - (b.priceUSD ?? 0));
    } else if (activeFilter === 'High $') {
      filtered = [...filtered].sort((a, b) => (b.priceUSD ?? 0) - (a.priceUSD ?? 0));
    } else if (activeFilter === 'New') {
       // Products arrive newest-first from the service, so sort explicitly by
       // creation date (descending) instead of reversing (which would surface
       // the OLDEST items). Note: createdAt is a raw ISO string from Supabase
       // despite the Timestamp type, so use new Date(...) not .toMillis().
       filtered = [...filtered].sort(
         (a, b) =>
           new Date((b.createdAt as any) || 0).getTime() -
           new Date((a.createdAt as any) || 0).getTime()
       );
    }

    setDisplayProducts(filtered);
  }, [products, searchQuery, activeFilter]);

  const handleProductPress = useCallback((productId: string) => {
    navigation.navigate('ProductDetails', { productId });
  }, [navigation]);

  // Memoized renderItem
  const renderItem = useCallback(({ item }: { item: Product }) => (
    <View style={styles.productWrapper}>
      <MasonryProductCard 
        product={item} 
        onPress={handleProductPress}
        isFavorite={isFavorite(item.id)}
        onToggleFavorite={toggleFavorite}
      />
    </View>
  ), [handleProductPress, isFavorite, toggleFavorite]);

  // Filter chips header (inside FlatList)
  const renderHeader = useCallback(() => (
    <View style={[styles.filterHeaderContainer, { backgroundColor: isDark ? theme.colors.background : '#F8FAFC' }]}>
      {/* Modern Filter Chips with animations */}
      <FlatList
        data={FILTER_CHIPS}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.chipsList, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
        renderItem={({ item }) => (
          <FilterChip 
            item={item}
            isActive={activeFilter === item.id}
            onPress={() => setActiveFilter(item.id)}
            theme={theme}
            isDark={isDark}
          />
        )}
      />

      {/* Results count badge */}
      <View style={[styles.resultsRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={[styles.resultsBadge, { backgroundColor: isDark ? 'rgba(102,126,234,0.15)' : 'rgba(102,126,234,0.1)' }]}>
          <Ionicons name="cube" size={14} color="#667eea" />
          <Text allowFontScaling={false} style={[styles.resultsText, { color: theme.colors.textSecondary }]}>
            {displayProducts.length} {t('common.products', 'products')}
          </Text>
        </View>
      </View>
    </View>
  ), [activeFilter, isDark, theme, isRTL, t, displayProducts.length]);

  const renderEmpty = useCallback(() => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconWrapper}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.emptyIconGradient}
        >
          <Ionicons name="cube-outline" size={48} color="#fff" />
        </LinearGradient>
      </View>
      <Text allowFontScaling={false} style={[styles.emptyTitle, { color: theme.colors.text }]}>
        {searchQuery ? t('common.noResults', 'No products found') : t('store.noProducts', 'No products yet')}
      </Text>
      <Text allowFontScaling={false} style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
        {searchQuery 
          ? t('common.tryDifferentSearch', 'Try a different search term')
          : t('store.checkBackLater', 'Check back later for new arrivals')
        }
      </Text>
    </View>
  ), [theme, searchQuery, t]);

  const flatListRef = React.useRef<FlatList>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);

  return (
    <View style={[styles.container, { backgroundColor: isDark ? theme.colors.background : '#F8FAFC' }]}>
      {/* Search Bar - OUTSIDE FlatList to prevent keyboard dismissal */}
      <View style={[styles.searchSection, { backgroundColor: isDark ? theme.colors.background : '#F8FAFC' }]}>
        <View style={styles.searchWrapper}>
          <View style={[
            styles.searchContainer, 
            { 
              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#fff',
              borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
              flexDirection: isRTL ? 'row-reverse' : 'row' 
            }
          ]}>
            <View style={[styles.searchIconWrapper, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(102,126,234,0.1)' }]}>
              <Ionicons name="search" size={18} color={isDark ? '#fff' : '#667eea'} />
            </View>
            <TextInput allowFontScaling={false}
              style={[styles.searchInput, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}
              placeholder={t('common.search', 'Search products...')}
              placeholderTextColor={theme.colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity 
                style={styles.clearButton}
                onPress={() => { setSearchQuery(''); Keyboard.dismiss(); }}
              >
                <Ionicons name="close-circle" size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={displayProducts}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        numColumns={2}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmpty}

        initialNumToRender={6}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews={true}
        updateCellsBatchingPeriod={50}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          setShowScrollHint(y > 300);
        }}
        scrollEventThrottle={16}
      />
      
      {/* Modern Scroll to Top Button */}
      {showScrollHint && (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => {
            flatListRef.current?.scrollToOffset?.({ offset: 0, animated: true });
          }}
          style={styles.scrollTopButton}
        >
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            style={styles.scrollTopGradient}
          >
            <Ionicons name="chevron-up" size={24} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 80,
  },
  productWrapper: { 
    marginBottom: 2,
    width: '50%',
  },
  
  // Search Section (outside FlatList)
  searchSection: {
    paddingBottom: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },
  // Filter Header (inside FlatList)
  filterHeaderContainer: {
    paddingBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  headerContainer: {
    padding: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  searchWrapper: {
    marginBottom: 14,
    position: 'relative',
  },
  searchGradientBorder: {
    borderRadius: 16,
    bottom: -2,
    left: -2,
    position: 'absolute',
    right: -2,
    top: -2,
  },
  searchContainer: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    flexDirection: 'row',
    height: 52,
    paddingHorizontal: 6,
  },
  searchIconWrapper: {
    alignItems: 'center',
    borderRadius: 10,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    height: '100%',
    marginHorizontal: 10,
    paddingVertical: 0,
  },
  clearButton: {
    padding: 8,
  },

  // Chip Styles
  chipsList: {
    marginBottom: 12,
    paddingVertical: 4,
  },
  chip: {
    marginRight: 10,
  },
  chipGradient: {
    alignItems: 'center',
    borderRadius: 20,
    elevation: 3,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  chipInactive: {
    alignItems: 'center',
    borderRadius: 20,
    elevation: 1,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  chipIcon: {
    marginRight: 6,
  },
  chipTextActive: {
    color: '#fff',
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
  },
  chipTextInactive: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },

  // Results Row
  resultsRow: {
    marginBottom: 8,
  },
  resultsBadge: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  resultsText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Empty State
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    paddingTop: 80,
  },
  emptyIconWrapper: {
    marginBottom: 20,
  },
  emptyIconGradient: {
    alignItems: 'center',
    borderRadius: 40,
    height: 80,
    justifyContent: 'center',
    width: 80,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: FONT_SIZE.md,
    textAlign: 'center',
  },

  // Scroll Top Button
  scrollTopButton: {
    bottom: 20,
    elevation: 6,
    position: 'absolute',
    right: 20,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  scrollTopGradient: {
    alignItems: 'center',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
});

export default StoreProductsTab;
