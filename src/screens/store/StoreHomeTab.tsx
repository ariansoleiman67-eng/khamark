import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Pressable 
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { StoreProfile } from '../../services/storeProfileService';
import { Product } from '../../types';
import { useTheme } from '../../components/ThemeProvider';
import { useCurrency } from '../../contexts/CurrencyContext';
import { formatUnitPrice } from '../../utils/pricingUtils';
import { useAuth } from '../../contexts/AuthContext';
import { SPACING, FONT_SIZE } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../types';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring 
} from 'react-native-reanimated';
import { iosTapFix } from '../../ui/iosTapFix';

interface StoreHomeTabProps {
  profile: StoreProfile;
  tenantId: string;
  products: Product[];
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Modern accent colors (typed as tuples for LinearGradient)
const ACCENT_GRADIENT: [string, string] = ['#667eea', '#764ba2'];
const WARM_GRADIENT: [string, string] = ['#f093fb', '#f5576c'];
const TEAL_GRADIENT: [string, string] = ['#4facfe', '#00f2fe'];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const StoreHomeTab: React.FC<StoreHomeTabProps & { onSwitchTab?: (tabName: string) => void }> = ({ 
  profile, 
  tenantId: _tenantId, 
  products, 
  onSwitchTab 
}) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const tenantId = _tenantId;
  const { theme, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const isRTL = i18n.language === 'ar' || i18n.language === 'ku';

  // Featured products (first 6 active)
  const featuredProducts = React.useMemo(() => {
    return products.filter(p => p.isActive !== false).slice(0, 6);
  }, [products]);

  const getLocalizedAbout = () => {
    if (i18n.language === 'ar' && profile.aboutAr) return profile.aboutAr;
    if (i18n.language === 'ku' && profile.aboutKu) return profile.aboutKu;
    return profile.about;
  };

  // Animated Product Card with scale press effect
  const ProductCard = ({ product }: { product: Product }) => {
    const scale = useSharedValue(1);
    const { currency, exchangeRateIQD } = useCurrency();
    // Same price the grid cards and the product page show. Quoting priceUSD raw
    // meant a VIP tapped a $1299 card and landed on a $1049 page.
    const { isVip } = useAuth();

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    return (
      <AnimatedPressable
        style={[
          styles.productCard,
          { backgroundColor: theme.colors.surface },
          animatedStyle
        ]}
        onPressIn={() => { scale.value = withSpring(0.95, { damping: 15 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 15 }); }}
        onPress={() => navigation.navigate('ProductDetails', { productId: product.id })}
      >
        {/* Product Image with gradient overlay */}
        <View style={styles.productImageWrapper}>
          <Image
            source={{ uri: product.imageUrls?.[0] || 'https://via.placeholder.com/150' }}
            style={[styles.productImage, { backgroundColor: theme.colors.border }]}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.6)']}
            style={styles.productImageOverlay}
          />
          {/* Price badge */}
          <View style={[styles.priceBadge, isRTL && { left: undefined, right: 8 }]}>
            <Text allowFontScaling={false} 
              style={styles.priceBadgeText}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatUnitPrice(product, isVip, currency, exchangeRateIQD)}
            </Text>
          </View>
        </View>
        {/* Product Info */}
        <View style={styles.productInfo}>
          <Text allowFontScaling={false} 
            numberOfLines={2} 
            style={[styles.productName, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}
          >
            {isRTL ? (product.nameAr || product.nameKu || product.name) : product.name}
          </Text>
        </View>
      </AnimatedPressable>
    );
  };

  // Section Header Component
  const SectionHeader = ({ 
    title, 
    icon, 
    gradient,
    onViewAll 
  }: { 
    title: string; 
    icon: string;
    gradient: [string, string];
    onViewAll?: () => void;
  }) => (
    <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      <View style={[styles.sectionTitleRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <LinearGradient
          colors={gradient}
          style={styles.sectionIconWrapper}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Ionicons name={icon as any} size={16} color="#fff" />
        </LinearGradient>
        <Text allowFontScaling={false} style={[
          styles.sectionTitle, 
          { color: theme.colors.text, marginLeft: isRTL ? 0 : 10, marginRight: isRTL ? 10 : 0 }
        ]}>
          {title}
        </Text>
      </View>
      {onViewAll && (
        <TouchableOpacity
          style={[styles.viewAllButton, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
          onPress={onViewAll}
        >
          <Text allowFontScaling={false} style={[styles.viewAllText, { color: theme.colors.primary, marginRight: isRTL ? 0 : 2, marginLeft: isRTL ? 2 : 0 }]}>
            {t('store.viewAll', 'View All')}
          </Text>
          <Ionicons 
            name={isRTL ? 'chevron-back' : 'chevron-forward'} 
            size={14} 
            color={theme.colors.primary} 
          />
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: isDark ? theme.colors.background : '#F8FAFC' }]}>
      <ScrollView {...iosTapFix} 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        
        {/* Featured Products Section */}
        {featuredProducts.length > 0 && (
          <View style={styles.section}>
            <SectionHeader 
              title={t('store.featuredProducts', 'Featured Products')}
              icon="star"
              gradient={ACCENT_GRADIENT}
              onViewAll={() => onSwitchTab?.('ProductsTab')}
            />
            <ScrollView {...iosTapFix} 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              contentContainerStyle={[
                styles.productsScroll, 
                { flexDirection: isRTL ? 'row-reverse' : 'row' }
              ]}
            >
              {featuredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </ScrollView>
          </View>
        )}
        
        {/* About Store Card - Modern Glassmorphism style */}
        <View style={styles.section}>
          <SectionHeader 
            title={t('store.aboutStore', 'About the Store')}
            icon="storefront"
            gradient={TEAL_GRADIENT}
          />
          <View style={[
            styles.aboutCard, 
            { 
              backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#fff',
              borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
            }
          ]}>
            {/* Decorative accent */}
            <View style={styles.aboutAccent}>
              <LinearGradient
                colors={TEAL_GRADIENT}
                style={styles.aboutAccentGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              />
            </View>
            <Text allowFontScaling={false} style={[
              styles.aboutText, 
              { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }
            ]}>
              {getLocalizedAbout() || t('store.noDescription', 'No description available.')}
            </Text>
          </View>
        </View>

        {/* Quick Stats Row */}
        <View style={styles.section}>
          <View style={[styles.statsRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            {/* Products Count */}
            <View style={[styles.statCard, { backgroundColor: isDark ? 'rgba(102,126,234,0.15)' : 'rgba(102,126,234,0.1)' }]}>
              <LinearGradient
                colors={ACCENT_GRADIENT}
                style={styles.statIconWrapper}
              >
                <Ionicons name="cube" size={18} color="#fff" />
              </LinearGradient>
              <Text allowFontScaling={false} style={[styles.statValue, { color: theme.colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                {products.filter(p => p.isActive !== false).length}
              </Text>
              <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                {t('common.products', 'Products')}
              </Text>
            </View>

            {/* A "4.8 Rating" card used to sit here — the code's own comment called it
                a placeholder. The app has no review or rating system at all, so the
                number was invented. Presenting fabricated social proof is inaccurate
                metadata; restore this only when real ratings exist to average.
                statCard is flex:1, so the remaining cards simply widen. */}

            {/* A "10+ Years" card used to sit here, hardcoded on every store page.
                StoreProfile has no founded/established field, so the decade was
                invented — a shop that signed up yesterday advertised ten years of
                trading. Same fabricated-social-proof defect as the rating card
                above; restore this only when the profile records a founding date. */}
          </View>
        </View>

        {/* Bottom padding */}
        <View style={{ height: 40 }} />

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.md,
  },

  // Section Styles
  section: {
    marginBottom: SPACING.xl,
  },
  sectionHeader: {
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  sectionTitleRow: {
    alignItems: 'center',
  },
  sectionIconWrapper: {
    alignItems: 'center',
    borderRadius: 10,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
  },
  viewAllButton: {
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
    marginRight: 2,
  },

  // Product Cards
  productsScroll: {
    paddingVertical: 4,
  },
  productCard: {
    borderRadius: 16,
    elevation: 4,
    marginRight: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    width: 160,
  },
  productImageWrapper: {
    height: 140,
    position: 'relative',
    width: '100%',
  },
  productImage: {
    backgroundColor: '#f0f0f0',
    height: '100%',
    width: '100%',
  },
  productImageOverlay: {
    bottom: 0,
    height: 50,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  priceBadge: {
    backgroundColor: '#fff',
    borderRadius: 8,
    bottom: 8,
    elevation: 3,
    left: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    position: 'absolute',
    maxWidth: '85%', // Prevent overflow from long formatted prices
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  priceBadgeText: {
    color: '#667eea',
    fontSize: 14,
    fontWeight: '800',
  },
  productInfo: {
    padding: 12,
  },
  productName: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },

  // About Card
  aboutCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 18,
  },
  aboutAccent: {
    height: 4,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  aboutAccentGradient: {
    flex: 1,
  },
  aboutText: {
    fontSize: FONT_SIZE.md,
    lineHeight: 24,
  },

  // Stats Row
  statsRow: {
    gap: 12,
  },
  statCard: {
    alignItems: 'center',
    borderRadius: 16,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  statIconWrapper: {
    alignItems: 'center',
    borderRadius: 12,
    height: 40,
    justifyContent: 'center',
    marginBottom: 10,
    width: 40,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
});

export default StoreHomeTab;
