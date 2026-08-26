/**
 * GOLDEN TEMPLATE: Related Product Card
 *
 * Alibaba-style card for horizontal product carousels.
 *
 * Rules (LOCKED):
 * - Fixed width (140px) for predictable snapping
 * - aspectRatio 1 for square image
 * - NO fixed heights, NO minHeight
 * - NO justifyContent: space-between
 * - NO absolute positioning
 * - NO shadows
 * - RTL safe (textAlign, NOT writingDirection)
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useTheme } from "../components/ThemeProvider";
import { Product } from "../types";
import { formatPrice } from "../utils/currency";
import { useCurrency } from "../contexts/CurrencyContext";
import { useAuth } from "../contexts/AuthContext";
import {
  getDisplayUnitPrice,
  getDiscountPercent,
  getEffectiveStock,
  hasCompareAtDiscount,
  LOW_STOCK_THRESHOLD, formatUnitPrice,
  isVipPriceActive,
} from "../utils/pricingUtils";
import { getDirection } from "../locales";
import { getThumbnailUrl } from "../utils/imageUtils";
import { SPACING } from "../constants/theme";
import AppNumber from "./AppNumber";

// GOLDEN: Fixed width for predictable snapping - NOT screenWidth-based
const CARD_WIDTH = 140;

// Same fixed brand accents as the grid cards: these read as "VIP" and "sale"
// regardless of theme and both carry white text.
const VIP_PURPLE = "#7C3AED";
const SALE_RED = "#E53935";

interface RelatedProductCardProps {
  product: Product;
  onPress: () => void;
  containerStyle?: any;
}

const RelatedProductCard: React.FC<RelatedProductCardProps> = ({
  product,
  onPress,
  containerStyle,
}) => {
  const { theme, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const { currency, exchangeRateIQD } = useCurrency();
  const { isVip } = useAuth();
  const isRTL = i18n?.language ? getDirection(i18n.language) === "rtl" : false;
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Get localized name
  const displayName =
    i18n.language === "ar" && product.nameAr
      ? product.nameAr
      : i18n.language === "ku" && product.nameKu
        ? product.nameKu
        : product.name;

  // Brandless sub-line falls back to the category, which has to follow the UI language
  // the same way the name above it does — it used to always render the English one.
  const displayCategory =
    i18n.language === "ar" && product.categoryAr
      ? product.categoryAr
      : i18n.language === "ku" && product.categoryKu
        ? product.categoryKu
        : product.category;

  // Image URL — thumbnail, not the full-size original: this is a small carousel tile.
  const imageUrl = getThumbnailUrl(product.imageUrls?.[0], 400);
  const hasValidImage = imageUrl && !imageError;

  // Stock status. Main + per-size + per-colour, same source as the product page: a
  // product stocked only through colour variations was advertised here as out of stock
  // while the page it links to sold it.
  const effectiveStock = getEffectiveStock(product);
  const isComingSoon = product.status === "coming_soon";
  const isOnTheWay = product.status === "on_the_way";
  // Mutually exclusive stock badges, ordered exactly as on the grid cards.
  const isPlainStatus = !product.status || product.status === "available";
  const outOfStock = isPlainStatus && effectiveStock === 0;
  const lowStock =
    isPlainStatus && effectiveStock > 0 && effectiveStock <= LOW_STOCK_THRESHOLD;
  const inStock = isPlainStatus && effectiveStock > LOW_STOCK_THRESHOLD;

  // Price. Same path as the grid cards (VIP flat price, wholesale tiers, compare-at),
  // so a VIP is not shown their price on the card and the page and then the higher
  // non-VIP price for the same product down here.
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

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          width: CARD_WIDTH,
        },
        containerStyle,
      ]}
    >
      {/* Image Container */}
      <View
        style={[
          styles.imageContainer,
          { backgroundColor: theme.colors.border },
        ]}
      >
        {/* ALIBABA: Skeleton placeholder until image loads */}
        {!imageLoaded && hasValidImage && (
          <View
            style={[
              styles.imagePlaceholder,
              {
                backgroundColor: theme.colors.border,
                position: "absolute",
                zIndex: 1,
              },
            ]}
          >
            <Ionicons
              name="image-outline"
              size={32}
              color={theme.colors.textSecondary}
            />
          </View>
        )}

        {hasValidImage ? (
          /**
           * ALIBABA INSTANT IMAGE LOADING (LOCKED):
           * - transition: 0 - no animation delay
           * - cachePolicy: memory-disk - fast reload
           * - priority: low - carousel items are lower priority
           */
          <Image
            source={{ uri: imageUrl }}
            style={[styles.image, { opacity: imageLoaded ? 1 : 0 }]}
            contentFit="cover"
            transition={0}
            cachePolicy="memory-disk"
            priority="low"
            recyclingKey={product.id}
            onLoadEnd={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        ) : (
          <View
            style={[
              styles.imagePlaceholder,
              { backgroundColor: theme.colors.border },
            ]}
          >
            <Ionicons
              name="image-outline"
              size={40}
              color={theme.colors.textSecondary}
            />
          </View>
        )}
      </View>

      {/* Status / stock badge — one badge, in normal flow directly under the image.
          These used to live INSIDE the image container, where the aspectRatio-1 image
          consumed the container's whole height and `overflow: hidden` clipped them
          away, so none of them ever reached the screen. */}
      {isComingSoon && (
        <View style={[styles.statusBadge, { backgroundColor: "#FF9800" }]}>
          <Ionicons
            name="time-outline"
            size={10}
            color="#ffffff"
            style={styles.statusBadgeIcon}
          />
          <Text allowFontScaling={false} style={styles.statusBadgeText} numberOfLines={1}>
            {t("products.status.comingSoon", { defaultValue: "Coming Soon" })}
          </Text>
        </View>
      )}

      {isOnTheWay && (
        <View style={[styles.statusBadge, { backgroundColor: "#2196F3" }]}>
          <MaterialCommunityIcons
            name="truck-outline"
            size={11}
            color="#ffffff"
            style={styles.statusBadgeIcon}
          />
          <Text allowFontScaling={false} style={styles.statusBadgeText} numberOfLines={1}>
            {t("products.status.onTheWay", { defaultValue: "On The Way" })}
          </Text>
        </View>
      )}

      {outOfStock && (
        <View style={[styles.statusBadge, { backgroundColor: theme.colors.error }]}>
          <Text allowFontScaling={false} style={styles.statusBadgeText} numberOfLines={1}>
            {t("product.outOfStock", { defaultValue: "Out of Stock" })}
          </Text>
        </View>
      )}

      {/* The "Only N left" badge was removed: customers are not shown stock
          quantities anywhere. The in-stock badge below still conveys availability. */}

      {inStock && (
        <View style={[styles.statusBadge, { backgroundColor: "#4CAF50" }]}>
          <Ionicons
            name="checkmark-circle-outline"
            size={10}
            color="#ffffff"
            style={styles.statusBadgeIcon}
          />
          <Text allowFontScaling={false} style={styles.statusBadgeText} numberOfLines={1}>
            {t("products.status.available", { defaultValue: "Available" })}
          </Text>
        </View>
      )}

      {/* Content Container - flexGrow for proper layout */}
      <View style={styles.content}>
        {/* Product Name */}
        <Text allowFontScaling={false}
          style={[
            styles.name,
            { color: theme.colors.text, textAlign: isRTL ? "right" : "left" },
          ]}
          numberOfLines={2}
        >
          {displayName}
        </Text>

        {/* Category + Part Number */}
        <Text allowFontScaling={false}
          style={[
            styles.partNumber,
            {
              color: theme.colors.textSecondary,
              textAlign: isRTL ? "right" : "left",
            },
          ]}
          numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}
        >
          {displayCategory}
          {product.partNumber ? ` ` : ""}
          {product.partNumber && (
            <Text allowFontScaling={false}
              style={styles.partNumberBold}
            >{`(${product.partNumber})`}</Text>
          )}
        </Text>

        {/* Price - at bottom via flex. Stacked, not inline: this tile is only 140pt
            wide, so the VIP tag and the "was" price get their own rows rather than
            squeezing the price the customer actually pays. */}
        <View style={styles.priceContainer}>
          <AppNumber
            value={getPriceDisplay()}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            style={[
              styles.price,
              {
                color: vipActive ? VIP_PURPLE : theme.colors.primary,
                textAlign: isRTL ? "right" : "left",
              },
            ]}
          />

          {vipActive && (
            <View style={[styles.vipTag, { backgroundColor: VIP_PURPLE }]}>
              <Text allowFontScaling={false} style={styles.tagText}>
                VIP
              </Text>
            </View>
          )}

          {hasDiscount && (
            <View style={styles.saveRow}>
              <AppNumber
                value={formatPrice(
                  product.compareAtPriceUSD as number,
                  currency,
                  exchangeRateIQD,
                )}
                numberOfLines={1}
                containerStyle={styles.shrinkable}
                style={[styles.wasPrice, { color: theme.colors.textSecondary }]}
              />
              <View style={[styles.saveBadge, { backgroundColor: SALE_RED }]}>
                <AppNumber value={`-${savePct}%`} style={styles.tagText} />
              </View>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    marginRight: SPACING.md,
    overflow: "hidden",
    padding: SPACING.sm,
    width: CARD_WIDTH,
  },
  content: {
    paddingTop: SPACING.xs,
  },
  image: {
    aspectRatio: 1,
    width: "100%",
  },
  imageContainer: {
    aspectRatio: 1, // GOLDEN: Square image
    borderRadius: 8,
    overflow: "hidden",
    width: "100%",
  },
  imagePlaceholder: {
    alignItems: "center",
    height: "100%",
    justifyContent: "center",
    width: "100%",
  },
  name: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  /**
   * SAMSUNG BOLD FIX (Arabic-safe):
   * - minHeight: 28 for Arabic text room
   * - paddingVertical: 4 for extra space
   */
  statusBadge: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 4,
    flexDirection: "row",
    marginTop: SPACING.xs,
    maxWidth: "100%",
    minHeight: 28,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 4,
  },
  statusBadgeIcon: {
    marginRight: 2,
  },
  /**
   * SAMSUNG BOLD FIX (Arabic-safe):
   * - includeFontPadding: true on Android
   * - lineHeight for Arabic glyph height
   */
  statusBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: Platform.OS === "android" ? "normal" : "600",
    includeFontPadding: Platform.OS === "android",
    lineHeight: Platform.OS === "android" ? 18 : 14,
  },
  // AppNumber's outer View is the flex item, so shrink rules have to land there or a
  // long price / RTL label takes its full intrinsic width and pushes the badge out.
  shrinkable: {
    flexShrink: 1,
    minWidth: 0,
  },
  vipTag: {
    alignSelf: "flex-start",
    borderRadius: 5,
    marginTop: 2,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  tagText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  saveRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    marginTop: 2,
  },
  wasPrice: {
    fontSize: 11,
    fontWeight: "500",
    textDecorationLine: "line-through",
  },
  saveBadge: {
    borderRadius: 5,
    flexShrink: 0,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  partNumber: {
    fontSize: 12,
    marginTop: 4,
  },
  partNumberBold: {
    fontWeight: "bold",
  },
  price: {
    fontSize: 16,
    fontWeight: "bold",
  },
  priceContainer: {
    marginTop: SPACING.sm,
  },
});

// Export card width for FlatList snapToInterval calculation
export const RELATED_CARD_WIDTH = CARD_WIDTH;

// Memoized like the other product cards — it renders in a carousel on the detail
// screen, which re-renders often (quantity, variant selection, etc.).
export default React.memo(RelatedProductCard);
