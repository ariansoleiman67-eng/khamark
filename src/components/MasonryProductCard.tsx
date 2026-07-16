import React, { useState } from "react";
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
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import AppText from "./AppText";
import AppNumber from "./AppNumber";
import { useCurrency } from "../contexts/CurrencyContext";
import { useAuth } from "../contexts/AuthContext";
import { formatPrice } from "../utils/currency";
import { getDisplayUnitPrice, hasVipPrice } from "../utils/pricingUtils";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

const { width: screenWidth } = Dimensions.get("window");

// Fixed card size for the 2-column masonry grid + horizontal carousels.
const CARD_MARGIN = 6;
const NUM_COLUMNS = 2;
const AVAILABLE_WIDTH = screenWidth - CARD_MARGIN * (NUM_COLUMNS + 1);
const CARD_WIDTH = Math.floor(AVAILABLE_WIDTH / NUM_COLUMNS);
const IMAGE_SIZE = CARD_WIDTH;
// title(2 lines) + brand + price + pill CTA + padding
const TEXT_CONTAINER_HEIGHT = 168;
const CARD_HEIGHT = IMAGE_SIZE + TEXT_CONTAINER_HEIGHT;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface MasonryProductCardProps {
  product: Product;
  onPress: (productId: string, product: Product) => void;
  onAddToCart?: (productId: string, product: Product) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (productId: string) => void;
  style?: StyleProp<ViewStyle>;
}

const MasonryProductCard: React.FC<MasonryProductCardProps> = ({
  product,
  onPress,
  onAddToCart,
  isFavorite = false,
  onToggleFavorite,
  style,
}) => {
  const { theme, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const { currency, exchangeRateIQD } = useCurrency();
  const { isVip } = useAuth();
  const [imageError, setImageError] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);

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

  const getDisplayTitle = () => {
    if (i18n.language === "ar" && product.nameAr) return product.nameAr;
    if (i18n.language === "ku" && product.nameKu) return product.nameKu;
    return product.name;
  };

  const getPriceDisplay = () => {
    if (product.priceTiers && product.priceTiers.length > 0) {
      const minPrice = Math.min(...product.priceTiers.map((tier) => tier.priceUSD));
      const minFormatted = formatPrice(minPrice, currency, exchangeRateIQD);
      const maxFormatted = formatPrice(product.priceUSD, currency, exchangeRateIQD, { symbol: false });
      return `${minFormatted} - ${maxFormatted}`;
    }
    return formatPrice(getDisplayUnitPrice(product, isVip), currency, exchangeRateIQD);
  };
  const vipActive = isVip && typeof product.vipPriceUSD === "number" && product.vipPriceUSD > 0;
  const vipLocked = !isVip && typeof product.vipPriceUSD === "number" && hasVipPrice(product);
  const shownPrice = getDisplayUnitPrice(product, isVip);
  const hasDiscount = typeof product.compareAtPriceUSD === "number" && product.compareAtPriceUSD > shownPrice;
  const savePct = hasDiscount ? Math.round((1 - shownPrice / (product.compareAtPriceUSD as number)) * 100) : 0;

  const effectiveStock =
    product.variations && product.variations.length > 0
      ? product.variations.reduce((sum, v) => sum + (v.stockQuantity || 0), 0)
      : product.stockQty;

  const hasValidPrice =
    (product.priceUSD || 0) > 0 ||
    (product.priceTiers?.some((tier) => (tier.priceUSD || 0) > 0) ?? false);

  const isComingSoon = product.status === "coming_soon";
  const isOnTheWay = product.status === "on_the_way";
  const inStock = effectiveStock > 0 && (!product.status || product.status === "available");
  const purchasable = inStock && hasValidPrice && !!onAddToCart;

  // Bottom CTA label + enabled state
  let ctaLabel = t("product.addToCart", { defaultValue: "Add to Cart" });
  if (isComingSoon) ctaLabel = t("products.status.comingSoon", { defaultValue: "Coming Soon" });
  else if (isOnTheWay) ctaLabel = t("products.status.onTheWay", { defaultValue: "On the Way" });
  else if (!inStock) ctaLabel = t("product.outOfStock", { defaultValue: "Out of Stock" });

  const brandLine = product.brand || product.category || "";

  const imageUri = getProductImageUrl({
    imageUrls: product.imageUrls,
    images: product.images || product.imageUrls,
    category: product.category,
  });
  const displayUri = thumbFailed ? imageUri : getThumbnailUrl(imageUri, 400);

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.cardWrapper,
        style,
        scaleAnimatedStyle,
        styles.card,
        {
          backgroundColor: theme.colors.card,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          shadowColor: isDark ? "transparent" : "#000",
          shadowOpacity: isDark ? 0 : 0.08,
          shadowOffset: { width: 0, height: 8 },
          shadowRadius: 16,
          elevation: isDark ? 0 : 4,
        },
      ]}
    >
      {/* Image */}
      <View style={[styles.imageContainer, { backgroundColor: "#FFFFFF" }]}>
        {imageError ? (
          <View style={[styles.imagePlaceholder, { backgroundColor: theme.colors.background }]}>
            <MaterialCommunityIcons
              name="image-off-outline"
              size={40}
              color={theme.colors.textSecondary}
            />
          </View>
        ) : (
          <Image
            source={{ uri: displayUri }}
            style={styles.image}
            contentFit="cover"
            transition={0}
            cachePolicy="memory-disk"
            priority="normal"
            recyclingKey={product.id}
            onError={() => {
              if (!thumbFailed) setThumbFailed(true);
              else setImageError(true);
            }}
          />
        )}

        {/* Favorite */}
        <Pressable
          style={({ pressed }) => [styles.favoriteButton, { opacity: pressed ? 0.85 : 1 }]}
          onPress={handleFavoritePress}
          hitSlop={8}
        >
          <Animated.View style={favoriteAnimatedStyle}>
            <Ionicons
              name={isFavorite ? "heart" : "heart-outline"}
              size={18}
              color={theme.colors.primary}
            />
          </Animated.View>
        </Pressable>

        {/* Status badges (coming soon / on the way) */}
        {isComingSoon && (
          <View style={[styles.statusBadge, { backgroundColor: "#FF9800" }]}>
            <Ionicons name="time-outline" size={10} color="#fff" />
            <AppText fontSize={11} style={styles.statusText} numberOfLines={1}>
              {t("products.status.comingSoon").replace(/ /g, " ")}
            </AppText>
          </View>
        )}
        {isOnTheWay && (
          <View style={[styles.statusBadge, { backgroundColor: "#2196F3" }]}>
            <MaterialCommunityIcons name="truck-fast-outline" size={12} color="#fff" style={{ marginRight: 2 }} />
            <AppText fontSize={11} style={styles.statusText} numberOfLines={1}>
              {t("products.status.onTheWay").replace(/ /g, " ")}
            </AppText>
          </View>
        )}
      </View>

      {/* Text + CTA */}
      <View style={styles.textContainer}>
        <AppText
          fontSize={14}
          style={[styles.title, { color: theme.colors.text, textAlign }]}
          numberOfLines={2}
        >
          {getDisplayTitle()}
        </AppText>

        {!!brandLine && (
          <AppText
            fontSize={12}
            style={[styles.brand, { color: theme.colors.textSecondary, textAlign }]}
            numberOfLines={1}
          >
            {brandLine}
          </AppText>
        )}

        <View style={styles.bottom}>
          <View style={{ width: "100%" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <AppNumber
                value={getPriceDisplay()}
                numberOfLines={1}
                style={[styles.price, { color: vipActive ? "#7C3AED" : theme.colors.text, textAlign }]}
              />
              {vipActive && (
                <View style={{ backgroundColor: "#7C3AED", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}>
                  <AppText fontSize={9} style={{ color: "#FFFFFF", fontWeight: "800", letterSpacing: 0.5 }}>VIP</AppText>
                </View>
              )}
            </View>
            {vipLocked && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 1 }}>
                <Ionicons name="lock-closed" size={9} color={theme.colors.textSecondary} />
                <AppText fontSize={9} style={{ color: theme.colors.textSecondary, fontWeight: "700" }}>
                  {formatPrice(product.vipPriceUSD as number, currency, exchangeRateIQD, { symbol: true })} VIP
                </AppText>
              </View>
            )}
            {hasDiscount && !vipActive && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 }}>
                <AppText fontSize={11} style={{ color: theme.colors.textSecondary, textDecorationLine: "line-through" }}>
                  {formatPrice(product.compareAtPriceUSD as number, currency, exchangeRateIQD)}
                </AppText>
                <View style={{ backgroundColor: "#E53935", borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 }}>
                  <AppText fontSize={9} style={{ color: "#FFFFFF", fontWeight: "800" }}>-{savePct}%</AppText>
                </View>
              </View>
            )}
          </View>

          <View ref={addToCartRef} collapsable={false}>
            <Pressable
              disabled={!purchasable}
              style={({ pressed }) => [
                styles.cta,
                {
                  backgroundColor: purchasable ? theme.colors.primary : theme.colors.disabled,
                  opacity: pressed && purchasable ? 0.85 : 1,
                },
              ]}
              onPress={handleAddToCart}
            >
              <AppText
                fontSize={14}
                style={[
                  styles.ctaText,
                  { color: purchasable ? theme.colors.textOnPrimary : theme.colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {ctaLabel}
              </AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </AnimatedPressable>
  );
};

const arePropsEqual = (
  prevProps: MasonryProductCardProps,
  nextProps: MasonryProductCardProps,
) =>
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
  prevProps.onToggleFavorite === nextProps.onToggleFavorite;

const styles = StyleSheet.create({
  cardWrapper: {
    margin: CARD_MARGIN / 2,
  },
  card: {
    borderRadius: 20,
    overflow: "hidden",
  },
  imageContainer: {
    alignSelf: "center",
    height: IMAGE_SIZE,
    position: "relative",
    width: "100%",
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
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    position: "absolute",
    right: 8,
    top: 8,
    width: 32,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  statusBadge: {
    alignItems: "center",
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "center",
    left: 8,
    minHeight: 26,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: "absolute",
    top: 8,
    zIndex: 1,
    maxWidth: "85%",
  },
  statusText: {
    color: "#FFFFFF",
    fontWeight: "600",
    includeFontPadding: false,
    marginStart: 4,
    paddingTop: Platform.OS === "android" ? 1 : 0,
    textAlign: "center",
  },
  textContainer: {
    flex: 1,
    justifyContent: "flex-start",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  title: {
    fontWeight: "700",
    height: 40,
    lineHeight: 20,
  },
  brand: {
    fontWeight: "500",
    marginTop: 4,
  },
  bottom: {
    marginTop: "auto",
  },
  price: {
    fontWeight: "800",
    fontSize: 17,
    marginBottom: 10,
  },
  cta: {
    alignItems: "center",
    borderRadius: 999,
    height: 44,
    justifyContent: "center",
    width: "100%",
  },
  ctaText: {
    fontWeight: "700",
  },
});

export default React.memo(MasonryProductCard, arePropsEqual);
