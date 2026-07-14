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
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useTheme } from "../components/ThemeProvider";
import { Product } from "../types";
import { formatPrice } from "../utils/currency";
import { useCurrency } from "../contexts/CurrencyContext";
import { getDirection } from "../locales";
import { SPACING } from "../constants/theme";

// GOLDEN: Fixed width for predictable snapping - NOT screenWidth-based
const CARD_WIDTH = 140;

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

  // Image URL - get first from imageUrls array
  const imageUrl = product.imageUrls?.[0];
  const hasValidImage = imageUrl && !imageError;

  // Stock status
  const inStock = product.stockQty > 0;

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

        {/* Out of Stock Badge - Inline, NOT absolute */}
        {!inStock && (
          <View
            style={[
              styles.outOfStockBadge,
              { backgroundColor: theme.colors.error },
            ]}
          >
            <Text allowFontScaling={false} style={styles.outOfStockText}>
              {t("product.outOfStock", { defaultValue: "Out of Stock" })}
            </Text>
          </View>
        )}

        {/* Available Badge - show when in stock */}
        {inStock && (
          <View
            style={[styles.outOfStockBadge, { backgroundColor: "#4CAF50" }]}
          >
            <Ionicons
              name="checkmark-circle-outline"
              size={10}
              color="#ffffff"
              style={{ marginRight: 2 }}
            />
            <Text allowFontScaling={false} style={styles.outOfStockText}>
              {t("products.status.available", { defaultValue: "Available" })}
            </Text>
          </View>
        )}
      </View>

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
          {product.category}
          {product.partNumber ? ` ` : ""}
          {product.partNumber && (
            <Text allowFontScaling={false}
              style={styles.partNumberBold}
            >{`(${product.partNumber})`}</Text>
          )}
        </Text>

        {/* Price - at bottom via flex */}
        <View style={styles.priceContainer}>
          <Text allowFontScaling={false}
            style={[
              styles.price,
              {
                color: theme.colors.primary,
                textAlign: isRTL ? "right" : "left",
              },
            ]}
           numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
            {formatPrice(product.priceUSD, currency, exchangeRateIQD)}
          </Text>
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
  outOfStockBadge: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 4,
    flexDirection: "row",
    marginLeft: SPACING.sm,
    marginTop: SPACING.xs,
    minHeight: 28,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 4,
  },
  /**
   * SAMSUNG BOLD FIX (Arabic-safe):
   * - includeFontPadding: true on Android
   * - lineHeight for Arabic glyph height
   */
  outOfStockText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: Platform.OS === "android" ? "normal" : "600",
    includeFontPadding: Platform.OS === "android",
    lineHeight: Platform.OS === "android" ? 18 : 14,
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

export default RelatedProductCard;
