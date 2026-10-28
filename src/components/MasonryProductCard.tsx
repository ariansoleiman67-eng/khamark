import React, { useState, useMemo } from "react";
import {
  View,
  Pressable,
  StyleSheet,
  Dimensions,
  I18nManager,
  Platform,
  ViewStyle,
  StyleProp,
} from "react-native";
import { Image } from "expo-image";
import { useTheme } from "./ThemeProvider";
import { Product } from "../types";
import { getProductImageUrl, getThumbnailUrl } from "../utils/imageUtils";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import AppText from "./AppText";
import AppNumber from "./AppNumber";
import { useCurrency } from "../contexts/CurrencyContext";
import { useAuth } from "../contexts/AuthContext";
import { formatCompareAtPrice, formatPrice } from "../utils/currency";
import {
  getEffectiveStock,
  hasCompareAtDiscount,
  getDiscountPercent,
  formatUnitPrice,
  isVipPriceActive,
} from "../utils/pricingUtils";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

const { width: screenWidth } = Dimensions.get("window");

// Grid geometry: 16px horizontal screen padding on each side, 12px gap between cards
const GRID_PADDING = 16;
const GRID_GAP = 12;
const DEFAULT_CARD_WIDTH = Math.floor((screenWidth - (GRID_PADDING * 2) - GRID_GAP) / 2);

// Predictable text container budget:
// paddingTop (8) + brand (14) + title (34) + variant/placeholder (14) + bottomStrip (48) + paddingBottom (8) = 138
export const TEXT_CONTAINER_HEIGHT = 138;

// Fixed brand accents
const MAX_SWATCHES = 4;
const VIP_BG_LIGHT = "#FFF1F2";
const VIP_BG_DARK = "rgba(166, 25, 32, 0.22)";
const VIP_TEXT = "#A61920";
const SALE_RED = "#A61920";
const USED_SLATE = "#4B5563";

export interface MasonryProductCardProps {
  product: Product;
  onPress: (productId: string, product: Product) => void;
  onAddToCart?: (productId: string, product: Product) => void;
  /**
   * Called instead of onAddToCart when the product has colour / storage / size
   * options, so the customer picks them before anything reaches the cart.
   */
  onSelectOptions?: (productId: string, product: Product) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (productId: string) => void;
  style?: StyleProp<ViewStyle>;
  cardWidth?: number;
}

const MasonryProductCard: React.FC<MasonryProductCardProps> = ({
  product,
  onPress,
  onAddToCart,
  onSelectOptions,
  isFavorite = false,
  onToggleFavorite,
  style,
  cardWidth,
}) => {
  const { theme, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const { currency, exchangeRateIQD } = useCurrency();
  const { isVip } = useAuth();
  const [imageError, setImageError] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);

  // FlashList / recycled list state reset
  const [lastProductId, setLastProductId] = useState(product.id);
  if (lastProductId !== product.id) {
    setLastProductId(product.id);
    setImageError(false);
    setThumbFailed(false);
  }

  const isRTL =
    I18nManager.isRTL || i18n.language === "ar" || i18n.language === "ku";
  const textAlign = isRTL ? "right" : "left";

  // Animation
  const scale = useSharedValue(1);
  const favoriteScale = useSharedValue(1);

  const scaleAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const favoriteAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: favoriteScale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.97, { damping: 12, stiffness: 200 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 12, stiffness: 200 });
  };
  const handlePress = () => onPress(product.id, product);

  const handleFavoritePress = () => {
    favoriteScale.value = withSpring(0.8, {}, () => {
      favoriteScale.value = withSpring(1);
    });
    onToggleFavorite?.(product.id);
  };

  const addToCartRef = React.useRef<View>(null);

  const handleAddToCart = () => {
    const imageUrl = product.imageUrls?.[0];
    if (imageUrl) {
      addToCartRef.current?.measureInWindow((x, y, width, height) => {
        try {
          const { flyToCart } = require("../ui/FlyToCartLayer");
          flyToCart(imageUrl, x + width / 2 - 20, y + height / 2 - 20);
        } catch (e) {
          console.warn("FlyToCartLayer not found or error", e);
        }
      });
    }
    scale.value = withSpring(1.02, {}, () => {
      scale.value = withSpring(1, { damping: 12, stiffness: 200 });
    });
    if (onAddToCart && purchasable) {
      onAddToCart(product.id, product);
    }
  };

  // Products with options go to picker/details first
  const handleCtaPress = () => {
    if (!purchasable) return;
    if (hasOptions) {
      if (onSelectOptions) onSelectOptions(product.id, product);
      else onPress(product.id, product);
      return;
    }
    handleAddToCart();
  };

  const getDisplayTitle = () => {
    if (i18n.language === "ar" && product.nameAr) return product.nameAr;
    if (i18n.language === "ku" && product.nameKu) return product.nameKu;
    return product.name;
  };

  const getPriceDisplay = () => {
    if (product.priceTiers && product.priceTiers.length > 0) {
      const minPrice = Math.min(...product.priceTiers.map((tier) => tier.priceUSD));
      const minFormatted = formatPrice(minPrice, currency, exchangeRateIQD);
      const maxFormatted = formatUnitPrice(product, isVip, currency, exchangeRateIQD, { symbol: false });
      return `${minFormatted} - ${maxFormatted}`;
    }
    return formatUnitPrice(product, isVip, currency, exchangeRateIQD);
  };

  const vipActive = isVipPriceActive(product, isVip);
  const hasDiscount = hasCompareAtDiscount(product, isVip);
  const savePct = getDiscountPercent(product, isVip);
  const effectiveStock = getEffectiveStock(product);

  const hasValidPrice =
    (product.priceUSD || 0) > 0 ||
    (product.priceTiers?.some((tier) => (tier.priceUSD || 0) > 0) ?? false);

  const isComingSoon = product.status === "coming_soon";
  const isOnTheWay = product.status === "on_the_way";
  const inStock = effectiveStock > 0 && (!product.status || product.status === "available");
  const purchasable = inStock && hasValidPrice && !!onAddToCart;

  let ctaLabel = t("product.addToCart", { defaultValue: "Add to Cart" });
  if (isComingSoon) ctaLabel = t("products.status.comingSoon", { defaultValue: "Coming Soon" });
  else if (isOnTheWay) ctaLabel = t("products.status.onTheWay", { defaultValue: "On the Way" });
  else if (!inStock) ctaLabel = t("product.outOfStock", { defaultValue: "Out of Stock" });

  // Variant metadata
  const colorOptions = (product.colorVariations || []).filter(Boolean);
  const swatchable = colorOptions.filter((c) => !!c.colorHex);
  const extraColors = colorOptions.length - Math.min(swatchable.length, MAX_SWATCHES);

  const storageLabels = [...(product.storageOptions || [])]
    .sort((a, b) => (Number(a?.priceDelta) || 0) - (Number(b?.priceDelta) || 0))
    .map((o) => o?.label)
    .filter(Boolean) as string[];
  const storageRange =
    storageLabels.length > 1
      ? `${storageLabels[0]}–${storageLabels[storageLabels.length - 1]}`
      : storageLabels[0] || "";

  const hasVariantMeta = colorOptions.length > 0 || !!storageRange;
  const hasOptions =
    colorOptions.length > 0 ||
    storageLabels.length > 0 ||
    (product.variations?.length ?? 0) > 0;

  const localizedCategory = (() => {
    if (i18n.language === "ar" && product.categoryAr?.trim()) return product.categoryAr;
    if (i18n.language === "ku" && product.categoryKu?.trim()) return product.categoryKu;
    if (!product.category) return "";
    const key = `categories.${product.category.toLowerCase().replace(/\s+/g, "")}`;
    const translated = t(key);
    return translated !== key ? translated : product.category;
  })();

  const brandLine = product.brand || localizedCategory || "";

  const imageUri = getProductImageUrl({
    imageUrls: product.imageUrls,
    images: product.images || product.imageUrls,
    category: product.category,
  });
  const displayUri = thumbFailed ? imageUri : getThumbnailUrl(imageUri, 400);

  const finalCardWidth = cardWidth || DEFAULT_CARD_WIDTH;
  const finalCardHeight = finalCardWidth + TEXT_CONTAINER_HEIGHT;

  // Single restrained badge configuration
  const badgeConfig = useMemo(() => {
    if (isComingSoon) {
      return { text: t("products.status.comingSoon", { defaultValue: "Coming Soon" }), bgColor: "#D97706", icon: "time-outline" };
    }
    if (isOnTheWay) {
      return { text: t("products.status.onTheWay", { defaultValue: "On the Way" }), bgColor: "#2563EB", icon: "car-outline" };
    }
    if (!inStock) {
      return { text: t("product.outOfStock", { defaultValue: "Out of Stock" }), bgColor: "#6B7280" };
    }
    if (hasDiscount && savePct > 0) {
      return { text: `-${savePct}%`, bgColor: SALE_RED };
    }
    if (product.condition === "used") {
      return { text: t("product.conditionUsed", { defaultValue: "Used" }), bgColor: USED_SLATE };
    }
    return null;
  }, [isComingSoon, isOnTheWay, inStock, hasDiscount, savePct, product.condition, t]);

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityLabel={[
        getDisplayTitle(),
        brandLine,
        getPriceDisplay(),
        colorOptions.length > 0
          ? t("product.colorCount", { count: colorOptions.length, defaultValue: `${colorOptions.length} colors` })
          : "",
        storageRange,
      ]
        .filter(Boolean)
        .join(", ")}
      style={[
        styles.cardWrapper,
        {
          width: finalCardWidth,
          height: finalCardHeight,
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          scaleAnimatedStyle,
          styles.card,
          {
            width: "100%",
            height: "100%",
            backgroundColor: isDark ? (theme.colors.card || '#1E1E22') : '#FFFFFF',
            borderWidth: 1,
            borderColor: isDark ? '#2C2C30' : '#EAEAEA',
            shadowColor: "#000",
            shadowOpacity: isDark ? 0 : 0.03,
            shadowOffset: { width: 0, height: 1 },
            shadowRadius: 4,
            elevation: isDark ? 0 : 1,
          },
        ]}
      >
        {/* Upper Card Area: Product Image */}
        <View
          style={[
            styles.imageContainer,
            {
              width: finalCardWidth,
              height: finalCardWidth,
              backgroundColor: isDark ? '#17171A' : '#FAFAFA',
            },
          ]}
        >
          {imageError ? (
            <View style={styles.imagePlaceholder}>
              <Ionicons
                name="image-outline"
                size={36}
                color={theme.colors.textSecondary}
              />
            </View>
          ) : (
            <Image
              source={{ uri: displayUri }}
              style={styles.image}
              contentFit="contain"
              transition={120}
              cachePolicy="memory-disk"
              priority="normal"
              recyclingKey={product.id}
              onError={() => {
                if (!thumbFailed) setThumbFailed(true);
                else setImageError(true);
              }}
            />
          )}

          {/* Wishlist action: Top-right (respects RTL), clean without heavy circle */}
          <Pressable
            style={({ pressed }) => [
              styles.favoriteButton,
              isRTL ? { left: 8 } : { right: 8 },
              { opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={handleFavoritePress}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityState={{ selected: isFavorite }}
            accessibilityLabel={
              isFavorite
                ? t("favorites.remove", { defaultValue: "Remove from favorites" })
                : t("favorites.add", { defaultValue: "Add to favorites" })
            }
          >
            <Animated.View style={favoriteAnimatedStyle}>
              <Ionicons
                name={isFavorite ? "heart" : "heart-outline"}
                size={20}
                color={isFavorite ? SALE_RED : (isDark ? "#A1A1AA" : "#9CA3AF")}
              />
            </Animated.View>
          </Pressable>

          {/* Restrained single badge at top-left (respects RTL) */}
          {badgeConfig && (
            <View
              style={[
                styles.restrainedBadge,
                isRTL ? { right: 8 } : { left: 8 },
                { backgroundColor: badgeConfig.bgColor },
              ]}
            >
              {badgeConfig.icon ? (
                <Ionicons name={badgeConfig.icon as any} size={10} color="#fff" style={{ marginEnd: 3 }} />
              ) : null}
              <AppText fontSize={10} style={styles.badgeText} numberOfLines={1}>
                {badgeConfig.text}
              </AppText>
            </View>
          )}
        </View>

        {/* Text + Compact Price/Add Strip */}
        <View style={[styles.textContainer, { height: TEXT_CONTAINER_HEIGHT }]}>
          {/* 1. Brand in small muted text */}
          {brandLine ? (
            <AppText
              fontSize={11}
              style={[styles.brand, { color: isDark ? '#A1A1AA' : '#8E8E93', textAlign }]}
              numberOfLines={1}
            >
              {brandLine}
            </AppText>
          ) : (
            <View style={styles.brandPlaceholder} />
          )}

          {/* 2. Product name in readable medium weight (up to 2 lines) */}
          <AppText
            fontSize={13}
            style={[styles.title, { color: theme.colors.text, textAlign }]}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {getDisplayTitle()}
          </AppText>

          {/* 3. Optional swatches / storage meta */}
          {hasVariantMeta ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[styles.variantRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}
            >
              {swatchable.length > 0 ? (
                <View style={[styles.swatchRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                  {swatchable.slice(0, MAX_SWATCHES).map((c) => (
                    <View
                      key={c.variationId}
                      style={[
                        styles.swatch,
                        {
                          backgroundColor: c.colorHex,
                          borderColor: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.15)",
                        },
                      ]}
                    />
                  ))}
                  {extraColors > 0 && (
                    <AppText fontSize={10} style={[styles.variantText, { color: theme.colors.textSecondary }]}>
                      +{extraColors}
                    </AppText>
                  )}
                </View>
              ) : colorOptions.length > 0 ? (
                <AppText
                  fontSize={10}
                  numberOfLines={1}
                  style={[styles.variantText, { color: theme.colors.textSecondary }]}
                >
                  {t("product.colorCount", {
                    count: colorOptions.length,
                    defaultValue: `${colorOptions.length} colors`,
                  })}
                </AppText>
              ) : null}

              {!!storageRange && (
                <AppText
                  fontSize={10}
                  numberOfLines={1}
                  style={[styles.storageText, { color: theme.colors.textSecondary }]}
                >
                  {storageRange}
                </AppText>
              )}
            </View>
          ) : (
            <View style={styles.variantPlaceholder} />
          )}

          {/* 4. Compact Bottom Strip: Formatted price on the left, circular red "+" button on the right */}
          <View
            style={[
              styles.bottomStrip,
              {
                backgroundColor: isDark ? '#26262A' : '#F4F4F6',
                flexDirection: isRTL ? "row-reverse" : "row",
              },
            ]}
          >
            {/* Price Details - Flexible Area */}
            <View style={styles.priceContainer}>
              {/* VIP Badge: Above the price instead of squeezed between amount and add button */}
              {vipActive && (
                <View
                  style={[
                    styles.vipTag,
                    {
                      backgroundColor: isDark ? VIP_BG_DARK : VIP_BG_LIGHT,
                      alignSelf: isRTL ? 'flex-end' : 'flex-start',
                    },
                  ]}
                >
                  <AppText fontSize={8} style={[styles.vipTagText, { color: VIP_TEXT }]}>
                    VIP
                  </AppText>
                </View>
              )}

              {/* Price Row: Primary price with clear bold font */}
              <View style={[styles.priceRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <AppNumber
                  value={getPriceDisplay()}
                  numberOfLines={1}
                  adjustsFontSizeToFit={false}
                  style={[
                    styles.priceText,
                    { color: theme.colors.text, textAlign },
                  ]}
                />
              </View>

              {/* Compare-at discount or status below current price */}
              {!purchasable ? (
                <AppText
                  fontSize={9.5}
                  numberOfLines={1}
                  style={[styles.unavailableText, { color: isDark ? '#A1A1AA' : '#6B7280', textAlign }]}
                >
                  {ctaLabel}
                </AppText>
              ) : hasDiscount ? (
                <AppText
                  fontSize={10}
                  numberOfLines={1}
                  style={[styles.compareAtText, { color: theme.colors.textSecondary, textAlign }]}
                >
                  {formatCompareAtPrice(product as any, currency, exchangeRateIQD)}
                </AppText>
              ) : null}
            </View>

            {/* Circular Red "+" Add-to-Cart Button - Dedicated Fixed Width Area */}
            <View ref={addToCartRef} collapsable={false} style={styles.buttonContainer}>
              <Pressable
                disabled={!purchasable}
                onPress={handleCtaPress}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`${t("product.addToCart", { defaultValue: "Add to cart" })}: ${getDisplayTitle()}`}
                accessibilityState={{ disabled: !purchasable }}
                style={({ pressed }) => [
                  styles.plusButton,
                  {
                    backgroundColor: purchasable ? SALE_RED : (isDark ? '#3A3A3E' : '#D1D5DB'),
                    opacity: pressed && purchasable ? 0.82 : 1,
                  },
                ]}
              >
                <Ionicons
                  name={purchasable ? "add" : "close"}
                  size={18}
                  color={purchasable ? "#FFFFFF" : (isDark ? '#71717A' : '#9CA3AF')}
                />
              </Pressable>
            </View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
};

const arePropsEqual = (
  prevProps: MasonryProductCardProps,
  nextProps: MasonryProductCardProps,
) =>
  prevProps.cardWidth === nextProps.cardWidth &&
  prevProps.isFavorite === nextProps.isFavorite &&
  prevProps.product.id === nextProps.product.id &&
  prevProps.product.name === nextProps.product.name &&
  prevProps.product.brand === nextProps.product.brand &&
  prevProps.product.priceUSD === nextProps.product.priceUSD &&
  prevProps.product.imageUrls?.[0] === nextProps.product.imageUrls?.[0] &&
  prevProps.product.stockQty === nextProps.product.stockQty &&
  prevProps.product.status === nextProps.product.status &&
  prevProps.onPress === nextProps.onPress &&
  prevProps.onAddToCart === nextProps.onAddToCart &&
  prevProps.onSelectOptions === nextProps.onSelectOptions &&
  prevProps.product.colorVariations === nextProps.product.colorVariations &&
  prevProps.product.storageOptions === nextProps.product.storageOptions &&
  prevProps.product.variations === nextProps.product.variations &&
  prevProps.onToggleFavorite === nextProps.onToggleFavorite;

const styles = StyleSheet.create({
  cardWrapper: {
    margin: 0,
  },
  card: {
    borderRadius: 18,
    overflow: "hidden",
  },
  imageContainer: {
    alignSelf: "center",
    position: "relative",
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    height: "100%",
    width: "100%",
  },
  imagePlaceholder: {
    alignItems: "center",
    height: "100%",
    justifyContent: "center",
    width: "100%",
  },
  favoriteButton: {
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
    top: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255, 255, 255, 0.82)",
    zIndex: 10,
  },
  restrainedBadge: {
    alignItems: "center",
    borderRadius: 6,
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    position: "absolute",
    top: 8,
    zIndex: 10,
    maxWidth: "70%",
  },
  badgeText: {
    color: "#FFFFFF",
    fontWeight: "700",
    includeFontPadding: false,
    fontSize: 10,
    textAlign: "center",
  },
  textContainer: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
    justifyContent: "space-between",
  },
  brand: {
    fontWeight: "500",
    fontSize: 11,
    height: 14,
    lineHeight: 14,
  },
  brandPlaceholder: {
    height: 14,
  },
  title: {
    fontWeight: "600",
    fontSize: 13,
    height: 34,
    lineHeight: 17,
    marginTop: 2,
  },
  variantRow: {
    alignItems: "center",
    gap: 6,
    marginTop: 2,
    height: 14,
  },
  variantPlaceholder: {
    height: 14,
    marginTop: 2,
  },
  swatchRow: {
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
  },
  variantText: {
    fontWeight: "600",
    fontSize: 10,
    includeFontPadding: false,
  },
  storageText: {
    fontWeight: "600",
    fontSize: 10,
    includeFontPadding: false,
    flexShrink: 1,
    minWidth: 0,
  },
  bottomStrip: {
    borderRadius: 16,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "space-between",
    paddingStart: 10,
    paddingEnd: 5,
    paddingVertical: 5,
    marginTop: 4,
  },
  priceContainer: {
    flex: 1,
    marginEnd: 8,
    justifyContent: "center",
  },
  buttonContainer: {
    flexShrink: 0,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceRow: {
    alignItems: "center",
  },
  priceText: {
    fontWeight: "700",
    fontSize: 14,
  },
  compareAtText: {
    textDecorationLine: "line-through",
    fontSize: 10,
    marginTop: 1,
  },
  unavailableText: {
    fontSize: 9.5,
    fontWeight: "600",
    marginTop: 1,
  },
  vipTag: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    marginBottom: 2,
    flexShrink: 0,
  },
  vipTagText: {
    fontWeight: "800",
    fontSize: 8,
    letterSpacing: 0.4,
    includeFontPadding: false,
  },
  plusButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default React.memo(MasonryProductCard, arePropsEqual);
