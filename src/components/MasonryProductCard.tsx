import React, { useState, useMemo, useRef, useCallback } from "react";
import {
  View,
  Pressable,
  StyleSheet,
  Dimensions,
  I18nManager,
  Platform,
  ViewStyle,
  StyleProp,
  ActivityIndicator,
  Alert,
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
import { useCartSafe } from "../contexts/CartContext";
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
// brand (14) + title (34) + variant/placeholder (14) + priceBlock (34) + stepper (36) + padding (16) + gaps (18) = 166
export const TEXT_CONTAINER_HEIGHT = 166;

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
  const cartContext = useCartSafe();
  const cart = cartContext?.cart ?? null;
  const cartAddToCart = cartContext?.addToCart;
  const cartUpdateQuantity = cartContext?.updateQuantity;
  const cartRemoveFromCart = cartContext?.removeFromCart;

  const [imageError, setImageError] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const isUpdatingRef = useRef(false);

  // FlashList / recycled list state reset
  const [lastProductId, setLastProductId] = useState(product.id);
  if (lastProductId !== product.id) {
    setLastProductId(product.id);
    setImageError(false);
    setThumbFailed(false);
    setIsPending(false);
    isUpdatingRef.current = false;
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

  const handleFavoritePress = (e?: any) => {
    e?.stopPropagation?.();
    favoriteScale.value = withSpring(0.8, {}, () => {
      favoriteScale.value = withSpring(1);
    });
    onToggleFavorite?.(product.id);
  };

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

  // Cart item synchronization
  const matchingLines = useMemo(() => {
    if (!cart?.items) return [];
    return cart.items.filter((item) => item.productId === product.id);
  }, [cart?.items, product.id]);

  const currentQuantity = useMemo(() => {
    return matchingLines.reduce((sum, item) => sum + (item.quantity || 0), 0);
  }, [matchingLines]);

  const effectiveStock = getEffectiveStock(product);
  const hasValidPrice =
    (product.priceUSD || 0) > 0 ||
    (product.priceTiers?.some((tier) => (tier.priceUSD || 0) > 0) ?? false);

  const isComingSoon = product.status === "coming_soon";
  const isOnTheWay = product.status === "on_the_way";
  const inStock = effectiveStock > 0 && (!product.status || product.status === "available");
  const purchasable = inStock && hasValidPrice;

  // Quantity Stepper Handlers
  const handleIncrement = async (e?: any) => {
    e?.stopPropagation?.();
    if (!purchasable || isPending || isUpdatingRef.current) return;

    // At 0 items in cart:
    if (currentQuantity === 0) {
      if (hasOptions) {
        if (onSelectOptions) onSelectOptions(product.id, product);
        else onPress(product.id, product);
        return;
      }

      if (effectiveStock <= 0) return;

      try {
        isUpdatingRef.current = true;
        setIsPending(true);
        if (onAddToCart) {
          await onAddToCart(product.id, product);
        } else if (cartAddToCart) {
          await cartAddToCart(product.id, 1, product);
        }
      } catch (err) {
        console.warn("Cart increment error:", err);
      } finally {
        isUpdatingRef.current = false;
        setIsPending(false);
      }
      return;
    }

    // When product has multiple variant lines in cart:
    if (matchingLines.length > 1) {
      if (onSelectOptions) onSelectOptions(product.id, product);
      else onPress(product.id, product);
      return;
    }

    // Single line in cart:
    if (matchingLines.length === 1) {
      const line = matchingLines[0];
      if (line.quantity >= effectiveStock) {
        Alert.alert(
          t("common.notice", { defaultValue: "Stock Limit" }),
          t("cart.maxStockReached", { defaultValue: "Maximum available stock reached" })
        );
        return;
      }

      try {
        isUpdatingRef.current = true;
        setIsPending(true);
        if (cartUpdateQuantity) {
          await cartUpdateQuantity(product.id, line.quantity + 1, line.selectedOptions);
        }
      } catch (err) {
        console.warn("Cart updateQuantity error:", err);
      } finally {
        isUpdatingRef.current = false;
        setIsPending(false);
      }
    }
  };

  const handleDecrement = async (e?: any) => {
    e?.stopPropagation?.();
    if (currentQuantity <= 0 || isPending || isUpdatingRef.current) return;

    // When product has multiple variant lines in cart:
    if (matchingLines.length > 1) {
      if (onSelectOptions) onSelectOptions(product.id, product);
      else onPress(product.id, product);
      return;
    }

    // Single line in cart:
    if (matchingLines.length === 1) {
      const line = matchingLines[0];
      try {
        isUpdatingRef.current = true;
        setIsPending(true);
        if (line.quantity > 1) {
          if (cartUpdateQuantity) {
            await cartUpdateQuantity(product.id, line.quantity - 1, line.selectedOptions);
          }
        } else {
          if (cartRemoveFromCart) {
            await cartRemoveFromCart(product.id, line.selectedOptions);
          }
        }
      } catch (err) {
        console.warn("Cart decrement error:", err);
      } finally {
        isUpdatingRef.current = false;
        setIsPending(false);
      }
    }
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

  let ctaLabel = t("product.addToCart", { defaultValue: "Add to Cart" });
  if (isComingSoon) ctaLabel = t("products.status.comingSoon", { defaultValue: "Coming Soon" });
  else if (isOnTheWay) ctaLabel = t("products.status.onTheWay", { defaultValue: "On the Way" });
  else if (!inStock) ctaLabel = t("product.outOfStock", { defaultValue: "Out of Stock" });

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
    productId: product.id,
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
          minHeight: finalCardHeight,
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
        {/* Upper Card Area: Consistent Square Product Image Stage */}
        <View
          style={[
            styles.imageContainer,
            {
              backgroundColor: isDark ? '#18181B' : '#FFFFFF',
            },
          ]}
        >
          {imageError || !displayUri ? (
            <View style={styles.imagePlaceholder}>
              <Ionicons
                name="cube-outline"
                size={34}
                color={isDark ? '#52525B' : '#9CA3AF'}
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

          {/* Wishlist action: Top-trailing, clean without heavy circle */}
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

          {/* Restrained single badge at top-leading (respects RTL) */}
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

        {/* Text Container + Balanced Two-Row Footer */}
        <View style={styles.textContainer}>
          {/* Top section: Brand, Title, Variant tags */}
          <View>
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
          </View>

          {/* Bottom Section: Balanced Two Rows */}
          <View style={styles.footerSection}>
            {/* ROW 1: Price block (Full available width) */}
            <View style={styles.priceBlock}>
              {/* VIP Badge */}
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

              {/* Primary Price */}
              <View style={[styles.priceHeaderRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
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

              {/* Compare-at discount or status underneath */}
              {!purchasable ? (
                <AppText
                  fontSize={10}
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

            {/* ROW 2: Always-visible Stepper [ - ] 0 [ + ] spanning available inner width */}
            <View
              style={[
                styles.stepperContainer,
                {
                  backgroundColor: isDark ? '#26262A' : '#F4F4F6',
                  flexDirection: isRTL ? 'row-reverse' : 'row',
                },
              ]}
            >
              {/* Minus Button: Leading side, disabled at 0 */}
              <Pressable
                disabled={currentQuantity <= 0 || !purchasable || isPending}
                onPress={handleDecrement}
                hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t("cart.decrease", { defaultValue: "Decrease quantity" })}
                accessibilityState={{ disabled: currentQuantity <= 0 || !purchasable }}
                style={({ pressed }) => [
                  styles.stepperBtn,
                  {
                    opacity: currentQuantity <= 0 || !purchasable ? 0.35 : pressed ? 0.6 : 1,
                  },
                ]}
              >
                <Ionicons
                  name="remove"
                  size={16}
                  color={currentQuantity <= 0 ? (isDark ? '#52525B' : '#9CA3AF') : (isDark ? '#E4E4E7' : '#27272A')}
                />
              </Pressable>

              {/* Quantity Counter: Centered */}
              <View style={styles.stepperCountWrap}>
                {isPending ? (
                  <ActivityIndicator size="small" color={SALE_RED} style={{ transform: [{ scale: 0.7 }] }} />
                ) : (
                  <AppNumber
                    value={String(currentQuantity)}
                    style={[
                      styles.stepperCountText,
                      {
                        color: currentQuantity > 0 ? (isDark ? '#FFFFFF' : '#111827') : (isDark ? '#71717A' : '#9CA3AF'),
                      },
                    ]}
                  />
                )}
              </View>

              {/* Plus Button: Trailing side, Khamark crimson */}
              <Pressable
                disabled={!purchasable || isPending}
                onPress={handleIncrement}
                hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t("cart.increase", { defaultValue: "Increase quantity" })}
                accessibilityState={{ disabled: !purchasable }}
                style={({ pressed }) => [
                  styles.stepperBtn,
                  styles.plusStepperBtn,
                  {
                    backgroundColor: purchasable ? SALE_RED : (isDark ? '#3F3F46' : '#E5E7EB'),
                    opacity: !purchasable ? 0.5 : pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Ionicons
                  name="add"
                  size={16}
                  color={purchasable ? '#FFFFFF' : (isDark ? '#71717A' : '#9CA3AF')}
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
    width: "100%",
    aspectRatio: 1,
    position: "relative",
    padding: 6,
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
    backgroundColor: "rgba(255, 255, 255, 0.85)",
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
    paddingBottom: 10,
    minHeight: TEXT_CONTAINER_HEIGHT,
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
  footerSection: {
    marginTop: 6,
  },
  priceBlock: {
    minHeight: 32,
    justifyContent: "center",
  },
  priceHeaderRow: {
    alignItems: "center",
  },
  priceText: {
    fontWeight: "700",
    fontSize: 14.5,
  },
  compareAtText: {
    textDecorationLine: "line-through",
    fontSize: 10,
    marginTop: 1,
  },
  unavailableText: {
    fontSize: 10,
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
  stepperContainer: {
    height: 36,
    borderRadius: 10,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  stepperBtn: {
    width: 32,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  plusStepperBtn: {
    // solid red plus
  },
  stepperCountWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperCountText: {
    fontSize: 13,
    fontWeight: "700",
    includeFontPadding: false,
    textAlign: "center",
  },
});

export default React.memo(MasonryProductCard, arePropsEqual);
