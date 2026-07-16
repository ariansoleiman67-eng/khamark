import React, { useState } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  Dimensions,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { useTheme } from "./ThemeProvider";
import { useFavorites } from "../contexts/FavoritesContext";
import { useCurrency } from "../contexts/CurrencyContext";
import { useAuth } from "../contexts/AuthContext";
import { formatPrice } from "../utils/currency";
import { getDisplayUnitPrice, hasVipPrice } from "../utils/pricingUtils";
import { Product } from "../types";
import { SHADOW_STYLES } from "../constants/theme";
import { getProductImageUrl, logImageDebug } from "../utils/imageUtils";
import {
  adjustFontSize,
  getPlatformTextProps,
  getOptimizedCardDimensions,
} from "../utils/platform";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import AppText from "./AppText";
import AppNumber from "./AppNumber";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
// ALIBABA: BlurView removed - GPU heavy, causes jank

const { width: screenWidth } = Dimensions.get("window");
const cardDimensions = getOptimizedCardDimensions();
const {
  cardWidth: CARD_WIDTH,
  cardHeight: CARD_HEIGHT,
  cardMargin: CARD_MARGIN,
  imageHeight: IMAGE_HEIGHT,
} = cardDimensions;

interface ProductCardProps {
  product: Product;
  onPress: () => void;
  onAddToCart?: () => void;
  variant?: "default" | "compact" | "featured";
  showAddToCart?: boolean;
  style?: ViewStyle;
}

const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onPress,
  onAddToCart,
  variant = "default",
  showAddToCart = true,
  style,
}) => {
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { currency, exchangeRateIQD } = useCurrency();
  const { isVip } = useAuth();
  const [imageLoading, setImageLoading] = useState(true);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const isProductFavorite = isFavorite(product.id);

  // Animations
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const favoriteScale = useSharedValue(1);

  const scaleAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const opacityAnimatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const favoriteAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: favoriteScale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  const handleFavoritePress = () => {
    favoriteScale.value = withSpring(0.8, {}, () => {
      favoriteScale.value = withSpring(1);
    });
    toggleFavorite(product.id);
  };

  // Ref for add-to-cart button (fly animation)
  const addToCartRef = React.useRef<View>(null);

  const handleAddToCart = () => {
    // Trigger fly-to-cart animation. Signature is flyToCart(imageUri, startX, startY);
    // offset by -20 to center the 40px fly element (matches MasonryProductCard).
    addToCartRef.current?.measureInWindow((x, y, width, height) => {
      const { flyToCart } = require("../ui/FlyToCartLayer");
      flyToCart(product.imageUrls?.[0] || (product as any).image, x + width / 2 - 20, y + height / 2 - 20);
    });

    // Quick animation feedback
    scale.value = withSpring(1.05, {}, () => {
      scale.value = withSpring(1);
    });

    // Call add to cart immediately
    onAddToCart?.();
  };



  // Compute effective stock - SUM all potential stock sources
  // This addresses "Out of Stock" issue when Main/Size/Color stocks exist independently
  const sizeStock =
    product.variations?.reduce((sum, v) => sum + (v.stockQuantity || 0), 0) ||
    0;
  const colorStock =
    product.colorVariations?.reduce(
      (sum, v) => sum + (v.stockQuantity || 0),
      0,
    ) || 0;
  const effectiveStock = (product.stockQty || 0) + sizeStock + colorStock;

  // Get price display (supports tiered + VIP pricing)
  const getPriceDisplay = () => {
    if (product.priceTiers && product.priceTiers.length > 0) {
      const minPrice = Math.min(...product.priceTiers.map((t) => t.priceUSD));
      const minFormatted = formatPrice(minPrice, currency, exchangeRateIQD);
      const maxFormatted = formatPrice(product.priceUSD, currency, exchangeRateIQD, { symbol: false });
      return `${minFormatted} - ${maxFormatted}`;
    }
    return formatPrice(getDisplayUnitPrice(product, isVip), currency, exchangeRateIQD);
  };
  // VIP messaging: badge when a VIP is seeing their price; a locked hint for
  // normal users when the product has a VIP-only price.
  const vipActive = isVip && typeof product.vipPriceUSD === "number" && product.vipPriceUSD > 0;
  const vipLocked = !isVip && hasVipPrice(product) && typeof product.vipPriceUSD === "number";
  // Item discount: "was" price + Save% when compareAtPriceUSD beats the shown price.
  const shownPrice = getDisplayUnitPrice(product, isVip);
  const hasDiscount = typeof product.compareAtPriceUSD === "number" && product.compareAtPriceUSD > shownPrice;
  const savePct = hasDiscount ? Math.round((1 - shownPrice / (product.compareAtPriceUSD as number)) * 100) : 0;

  const getVariantStyles = () => {
    // Use minHeight instead of fixed height to allow content to grow
    const variants = {
      default: {
        width: CARD_WIDTH,
        minHeight: CARD_HEIGHT,
      },
      compact: {
        width: CARD_WIDTH * 0.85,
        minHeight: CARD_HEIGHT * 0.9,
      },
      featured: {
        width: CARD_WIDTH * 1.1,
        minHeight: CARD_HEIGHT * 1.1,
      },
    };
    return variants[variant];
  };

  const variantStyles = getVariantStyles();

  const cardStyles: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    ...SHADOW_STYLES.medium,
    margin: CARD_MARGIN / 2,
    overflow: "hidden",
    ...variantStyles,
    ...style,
  };

  const imageStyles = {
    width: "100%" as const,
    height: IMAGE_HEIGHT,
    backgroundColor: theme.colors.surface,
  };

  const contentStyles: ViewStyle = {
    padding: theme.spacing.md,
    flexGrow: 1,
    flexShrink: 0,
    justifyContent: "space-between",
  };

  // Removed: Using centralized imageUtils instead

  const renderImage = () => {
    const imageUri = getProductImageUrl({
      imageUrls: product.imageUrls,
      images: product.images || product.imageUrls,
      category: product.category,
    });

    // Debug logging - remove in production
    if (__DEV__) {
      logImageDebug(
        {
          imageUrls: product.imageUrls,
          images: product.images || product.imageUrls,
          category: product.category,
        },
        `ProductCard - ${product.name}`,
      );
    }

    return (
      <View style={styles.imageContainer}>
        {/**
         * ALIBABA INSTANT IMAGE LOADING (LOCKED):
         * - Skeleton placeholder shown until loaded
         * - transition: 0 - no animation delay
         * - cachePolicy: memory-disk - fast reload
         * - priority: normal - balanced loading
         */}
        {!imageLoaded && (
          <View
            style={[
              StyleSheet.absoluteFillObject,
              styles.skeletonPlaceholder,
              { backgroundColor: theme.colors.background },
            ]}
          >
            <Ionicons
              name="image-outline"
              size={32}
              color={theme.colors.textSecondary}
            />
          </View>
        )}

        <Image
          source={{ uri: imageUri }}
          style={[imageStyles, { opacity: imageLoaded ? 1 : 0 }]}
          contentFit="cover"
          transition={0}
          cachePolicy="memory-disk"
          priority="normal"
          recyclingKey={product.id}
          onLoadEnd={() => {
            setImageLoaded(true);
            setImageLoading(false);
          }}
          onError={() => {
            setImageError(true);
            setImageLoading(false);
          }}
        />

        {imageError && (
          <View
            style={[
              StyleSheet.absoluteFillObject,
              styles.errorOverlay,
              { backgroundColor: theme.colors.background },
            ]}
          >
            <MaterialCommunityIcons
              name="truck-outline"
              size={40}
              color={theme.colors.textSecondary}
            />
            <AppText
              fontSize={12}
              style={[styles.errorText, { color: theme.colors.textSecondary }]}
            >
              {product.category}
            </AppText>
          </View>
        )}

        {/* Low Stock badge - only show if no special status */}
        {effectiveStock <= 5 &&
          effectiveStock > 0 &&
          (!product.status || product.status === "available") && (
            <View
              style={[
                styles.stockBadge,
                { backgroundColor: theme.colors.warning },
              ]}
            >
              <AppNumber
                value={`${effectiveStock} left`}
                style={[
                  styles.stockBadgeText,
                  { color: "#ffffff", fontSize: 12 },
                ]}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
              />
            </View>
          )}

        {/* Out of Stock badge - only show if no special status */}
        {effectiveStock === 0 &&
          (!product.status || product.status === "available") && (
            <View
              style={[
                styles.stockBadge,
                { backgroundColor: theme.colors.error },
              ]}
            >
              <AppText
                fontSize={12}
                style={[styles.stockBadgeText, { color: "#ffffff" }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
              >
                {t("product.outOfStock", { defaultValue: "Out of Stock" }).replace(/ /g, '\u00A0')}
              </AppText>
            </View>
          )}

        {/* Product Status Badges (Coming Soon / On The Way) - takes priority over stock badges */}
        {product.status === "coming_soon" && (
          <View style={[styles.stockBadge, { backgroundColor: "#FF9800" }]}>
            <Ionicons
              name="time-outline"
              size={10}
              color="#ffffff"
              style={{ marginRight: 3 }}
            />
            <AppText
              fontSize={12}
              style={[styles.stockBadgeText, { color: "#ffffff" }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
            >
              {t("products.status.comingSoon").replace(/ /g, '\u00A0')}
            </AppText>
          </View>
        )}

        {product.status === "on_the_way" && (
          <View style={[styles.stockBadge, { backgroundColor: "#2196F3" }]}>
            <MaterialCommunityIcons
              name="truck-outline"
              size={11}
              color="#ffffff"
              style={{ marginRight: 3 }}
            />
            <AppText
              fontSize={12}
              style={[styles.stockBadgeText, { color: "#ffffff" }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
            >
              {t("products.status.onTheWay").replace(/ /g, '\u00A0')}
            </AppText>
          </View>
        )}

        {/* Available badge - show when in stock with no special status */}
        {effectiveStock > 0 &&
          (!product.status || product.status === "available") && (
            <View style={[styles.stockBadge, { backgroundColor: "#4CAF50" }]}>
              <Ionicons
                name="checkmark-circle-outline"
                size={10}
                color="#ffffff"
                style={{ marginRight: 3 }}
              />
              <AppText
                fontSize={12}
                style={[styles.stockBadgeText, { color: "#ffffff" }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
              >
                {t("products.status.available", { defaultValue: "Available" }).replace(/ /g, '\u00A0')}
              </AppText>
            </View>
          )}

        {/* Featured badge */}
        {product.isFeatured && (
          <View
            style={[
              styles.featuredBadge,
              { backgroundColor: theme.colors.accent },
            ]}
          >
            <Ionicons name="star" size={12} color="#ffffff" />
          </View>
        )}

        {/* Favorite button */}
        <Animated.View style={[styles.favoriteButton, favoriteAnimatedStyle]}>
          <TouchableOpacity onPress={handleFavoritePress}>
            <Ionicons
              name={isProductFavorite ? "heart" : "heart-outline"}
              size={20}
              color={
                isProductFavorite
                  ? theme.colors.error
                  : theme.colors.textSecondary
              }
            />
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  };

  const isRTL = i18n.language === "ar" || i18n.language === "ku";

  const renderContent = () => (
    <View style={contentStyles}>
      <View>
        <AppText
          fontSize={adjustFontSize(14)}
          style={[styles.productName, { color: theme.colors.text }]}
          numberOfLines={2}
        >
          {i18n.language === "ar" && product.nameAr
            ? product.nameAr
            : i18n.language === "ku" && product.nameKu
              ? product.nameKu
              : product.name}
        </AppText>

        <AppText
          fontSize={adjustFontSize(12)}
          style={[
            styles.category,
            { color: theme.colors.textSecondary, marginBottom: 4 },
          ]}
          numberOfLines={1}
        >
          {product.partNumber && (
            <AppText
              style={styles.partNumberBold}
            >{`(${product.partNumber})`}</AppText>
          )}
        </AppText>
      </View>

      <View style={styles.footer}>
        <View style={styles.priceContainer}>
          <AppNumber
            value={getPriceDisplay()}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            style={[
              styles.price,
              { color: vipActive ? "#7C3AED" : theme.colors.primary, fontSize: adjustFontSize(15) },
            ]}
          />
          {vipActive && (
            <View style={[styles.vipTag, { backgroundColor: "#7C3AED" }]}>
              <AppText fontSize={9} style={styles.vipTagText}>VIP</AppText>
            </View>
          )}
          {vipLocked && (
            <View style={styles.vipLockRow}>
              <Ionicons name="lock-closed" size={10} color={theme.colors.textSecondary} />
              <AppText fontSize={10} style={[styles.vipLockText, { color: theme.colors.textSecondary }]}>
                {formatPrice(product.vipPriceUSD as number, currency, exchangeRateIQD, { symbol: true })} VIP
              </AppText>
            </View>
          )}
          {hasDiscount && !vipActive && (
            <View style={styles.saveRow}>
              <AppNumber
                value={formatPrice(product.compareAtPriceUSD as number, currency, exchangeRateIQD)}
                style={[styles.wasPrice, { color: theme.colors.textSecondary }]}
              />
              <View style={styles.saveBadge}>
                <AppText fontSize={9} style={styles.saveBadgeText}>-{savePct}%</AppText>
              </View>
            </View>
          )}
        </View>

        {showAddToCart &&
          effectiveStock > 0 &&
          (!product.status || product.status === "available") && (
            <View ref={addToCartRef} collapsable={false}>
              <TouchableOpacity
                style={[
                  styles.addToCartButton,
                  { backgroundColor: theme.colors.primary },
                ]}
                onPress={handleAddToCart}
              >
                <Ionicons name="add" size={16} color="#ffffff" />
              </TouchableOpacity>
            </View>
          )}
      </View>
    </View>
  );
  return (
    <Animated.View style={opacityAnimatedStyle}>
      <Animated.View style={scaleAnimatedStyle}>
        <TouchableOpacity
          style={cardStyles}
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          activeOpacity={0.9}
        >
          {renderImage()}
          {renderContent()}
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  imageContainer: {
    position: "relative",
  },
  /**
   * ALIBABA INSTANT IMAGE LOADING:
   * - Skeleton placeholder shown until image loads
   */
  skeletonPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  errorOverlay: {
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 8,
    textAlign: "center",
  },
  /**
   * SAMSUNG BOLD FIX (Arabic-safe):
   * - minHeight: 28 for Arabic text room
   * - paddingVertical: 4 for extra space
   * - flexShrink: 0 prevents truncation
   */
  stockBadge: {
    alignItems: "center",
    borderRadius: 4,
    flexDirection: "row",
    flexShrink: 0,
    justifyContent: "center",
    left: 8,
    minHeight: 28,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: "absolute",
    top: 8,
  },
  /**
   * SAMSUNG BOLD FIX (Arabic-safe):
   * - includeFontPadding: true on Android prevents glyph clipping
   * - lineHeight: 20 on Android for Arabic glyph height
   * - fontWeight: normal on Android avoids double-bold
   * - paddingVertical helps text not clip
   */
  stockBadgeText: {
    flexShrink: 0,
    fontSize: 10,
    fontWeight: Platform.OS === "android" ? "normal" : "600",
    includeFontPadding: Platform.OS === "android",
    lineHeight: Platform.OS === "android" ? 20 : 14,
    paddingVertical: Platform.OS === "android" ? 1 : 0,
  },
  statusBadge: {
    alignItems: "center",
    borderRadius: 4,
    flexDirection: "row",
    left: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    position: "absolute",
    top: 32,
  },
  featuredBadge: {
    alignItems: "center",
    borderRadius: 12,
    height: 24,
    justifyContent: "center",
    position: "absolute",
    right: 32,
    top: 8,
    width: 24,
  },
  favoriteButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    position: "absolute",
    right: 8,
    top: 8,
    width: 32,
    ...SHADOW_STYLES.small,
    elevation: 0,
    zIndex: 10,
  },
  productName: {
    fontWeight: "bold",
    marginBottom: 2,
  },
  partNumber: {
    fontWeight: "400",
    marginBottom: 4,
    opacity: 0.7,
  },
  partNumberBold: {
    fontWeight: "bold",
  },
  category: {
    marginBottom: 8,
  },
  footer: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  priceContainer: {
    flex: 1,
    marginRight: 8,
    minWidth: 0, // Allow text to shrink
  },
  price: {
    fontWeight: "bold",
  },
  vipTag: {
    alignSelf: "flex-start",
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginTop: 2,
  },
  vipTagText: {
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  vipLockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  vipLockText: {
    fontWeight: "700",
  },
  saveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  wasPrice: {
    fontSize: 12,
    textDecorationLine: "line-through",
    fontWeight: "500",
  },
  saveBadge: {
    backgroundColor: "#E53935",
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  saveBadgeText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  addToCartButton: {
    alignItems: "center",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
});

export default React.memo(ProductCard);
