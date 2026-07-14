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
import { SHADOW_STYLES } from "../constants/theme";
import { getProductImageUrl, getThumbnailUrl } from "../utils/imageUtils";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import AppText from "./AppText";
import AppNumber from "./AppNumber";
import { useCurrency } from "../contexts/CurrencyContext";
import { formatPrice } from "../utils/currency";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

const { width: screenWidth } = Dimensions.get("window");

// Fixed dimensions for masonry layout - NEVER CHANGE THESE
const CARD_MARGIN = 1;
const NUM_COLUMNS = 2;
const AVAILABLE_WIDTH = screenWidth - CARD_MARGIN * (NUM_COLUMNS + 1);
const CARD_WIDTH = Math.floor(AVAILABLE_WIDTH / NUM_COLUMNS);
const IMAGE_SIZE = CARD_WIDTH;
const TEXT_CONTAINER_HEIGHT = 119;
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

// Static formatter removed - using global formatPrice

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
  const [imageError, setImageError] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);

  const isRTL =
    I18nManager.isRTL || i18n.language === "ar" || i18n.language === "ku";

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
    scale.value = withSpring(0.95, { damping: 12, stiffness: 200 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 12, stiffness: 200 });
  };

  const handlePress = () => {
    onPress(product.id, product);
  };

  const handleFavoritePress = () => {
    favoriteScale.value = withSpring(0.8, {}, () => {
      favoriteScale.value = withSpring(1);
    });
    if (onToggleFavorite) {
      onToggleFavorite(product.id);
    }
  };

  // Ref for add-to-cart button (fly animation)
  const addToCartRef = React.useRef<View>(null);

  const handleAddToCart = () => {
    // Trigger fly-to-cart animation with product image
    const imageUrl = product.imageUrls?.[0];

    if (imageUrl) {
      addToCartRef.current?.measureInWindow((x, y, width, height) => {
        // Dynamic require to avoid circular dependencies if any, though likely safe here
        // Using try-catch just in case the module location changes or implicit dependency issues
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

    if (onAddToCart && hasValidPrice) {
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
      const minPrice = Math.min(...product.priceTiers.map((t) => t.priceUSD));
      const minFormatted = formatPrice(minPrice, currency, exchangeRateIQD);
      const maxFormatted = formatPrice(product.priceUSD, currency, exchangeRateIQD, { symbol: false });
      return `${minFormatted} - ${maxFormatted}`;
    }
    return formatPrice(product.priceUSD, currency, exchangeRateIQD);
  };

  const effectiveStock =
    product.variations && product.variations.length > 0
      ? product.variations.reduce((sum, v) => sum + (v.stockQuantity || 0), 0)
      : product.stockQty;

  // A product is purchasable only if it has a real positive price. Hard guard so
  // a $0 product (bad/missing price) can never be added to cart or bought for free.
  const hasValidPrice =
    (product.priceUSD || 0) > 0 ||
    (product.priceTiers?.some((t) => (t.priceUSD || 0) > 0) ?? false);

  const imageUri = getProductImageUrl({
    imageUrls: product.imageUrls,
    images: product.images || product.imageUrls,
    category: product.category,
  });
  // Lightweight WebP thumbnail for the grid; fall back to the original if the
  // resizing CDN ever fails, then to the placeholder.
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
          backgroundColor: theme.colors.surface,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          borderWidth: 0,
          elevation: 6,
          shadowColor: isDark ? 'transparent' : theme.colors.primary,
          shadowOpacity: 0.25,
          shadowOffset: { width: 0, height: 6 },
          shadowRadius: 14,
        },
      ]}
    >
      {/* Image Container */}
      <View style={styles.imageContainer}>
        {imageError ? (
          <View
            style={[
              styles.imagePlaceholder,
              { backgroundColor: theme.colors.background },
            ]}
          >
            <MaterialCommunityIcons
              name="truck-outline"
              size={36}
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
            onError={() => { if (!thumbFailed) setThumbFailed(true); else setImageError(true); }}
          />
        )}

        {/* Favorite Button */}
        <Pressable
          style={({ pressed }) => [
            styles.favoriteButton,
            {
              backgroundColor: isFavorite
                ? "#fff"
                : "rgba(255, 255, 255, 0.85)",
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          onPress={handleFavoritePress}
          hitSlop={8}
        >
          <Animated.View style={favoriteAnimatedStyle}>
            <Ionicons
              name={isFavorite ? "heart" : "heart-outline"}
              size={18}
              color={isFavorite ? "#FF5A00" : "#757575"}
            />
          </Animated.View>
        </Pressable>

        {/* Badges */}
        {product.status === "coming_soon" && (
          <View style={[styles.statusBadge, { backgroundColor: "#FF9800" }]}>
            <Ionicons name="time-outline" size={10} color="#ffffff" />
            <AppText
              fontSize={11}
              style={styles.statusText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
            >
              {t("products.status.comingSoon").replace(/ /g, '\u00A0')}
            </AppText>
          </View>
        )}

        {product.status === "on_the_way" && (
          <View style={[styles.statusBadge, { backgroundColor: "#2196F3" }]}>
            <MaterialCommunityIcons name="truck-fast-outline" size={12} color="#ffffff" style={{ marginRight: 2 }} />
            <AppText
              fontSize={11}
              style={styles.statusText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
            >
              {t("products.status.onTheWay").replace(/ /g, '\u00A0')}
            </AppText>
          </View>
        )}

        {effectiveStock === 0 &&
          (!product.status || product.status === "available") && (
            <View style={[styles.statusBadge, { backgroundColor: "#F44336" }]}>
              <Ionicons name="close-circle-outline" size={12} color="#ffffff" />
              <AppText
                fontSize={11}
                style={styles.statusText}
              numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
              >
                {t("product.outOfStock", { defaultValue: "Out of Stock" }).replace(/ /g, '\u00A0')}
              </AppText>
            </View>
          )}
      </View>

      {/* Text Container */}
      <View style={[styles.textContainer, { height: TEXT_CONTAINER_HEIGHT }]}>
        <AppText
          fontSize={13}
          style={[
            styles.title,
            {
              color: theme.colors.text,
              textAlign: isRTL ? "right" : "left",
            },
          ]}
          numberOfLines={2}
        >
          {getDisplayTitle()}
        </AppText>

        <AppText
          fontSize={11}
          style={[
            styles.category,
            {
              color: theme.colors.textSecondary,
              textAlign: isRTL ? "right" : "left",
            },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {product.partNumber && (
            <AppText
              style={[styles.partNumberBold, { color: theme.colors.text }]}
            >{`(${product.partNumber})`}</AppText>
          )}
        </AppText>

        <View
          style={[
            styles.footer,
            { flexDirection: isRTL ? "row-reverse" : "row" },
          ]}
        >
          <View style={styles.priceContainer}>
            <AppNumber
              value={getPriceDisplay()}
              numberOfLines={1}
              style={[styles.price, { color: theme.colors.primary }]}
            />
          </View>

          {effectiveStock > 0 &&
            onAddToCart &&
            hasValidPrice &&
            (!product.status || product.status === "available") && (
              <View ref={addToCartRef} collapsable={false}>
                <Pressable
                  style={({ pressed }) => [
                    styles.addButton,
                    {
                      backgroundColor: theme.colors.primary,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                  onPress={handleAddToCart}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="cart-outline" size={18} color="#ffffff" />
                </Pressable>
              </View>
            )}
        </View>
      </View>
    </AnimatedPressable>
  );
};

const arePropsEqual = (
  prevProps: MasonryProductCardProps,
  nextProps: MasonryProductCardProps,
) => {
  return (
    prevProps.isFavorite === nextProps.isFavorite &&
    prevProps.product.id === nextProps.product.id &&
    prevProps.product.name === nextProps.product.name &&
    prevProps.product.priceUSD === nextProps.product.priceUSD &&
    prevProps.product.imageUrls?.[0] === nextProps.product.imageUrls?.[0] &&
    prevProps.product.stockQty === nextProps.product.stockQty &&
    prevProps.product.status === nextProps.product.status &&
    prevProps.product.partNumber === nextProps.product.partNumber &&
    prevProps.onPress === nextProps.onPress &&
    prevProps.onAddToCart === nextProps.onAddToCart &&
    prevProps.onToggleFavorite === nextProps.onToggleFavorite
  );
};

const styles = StyleSheet.create({
  addButton: {
    alignItems: "center",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    marginHorizontal: 8,
    width: 32,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 0,
    elevation: 2,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardWrapper: {
    borderRadius: 8,
    margin: CARD_MARGIN / 2, // Moved logic to wrapper for better shadow
  },
  category: {
    fontSize: 14,
    fontWeight: "900",
    height: 26,
    lineHeight: 22,
    marginBottom: 2,
  },
  favoriteButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    position: "absolute",
    right: 6,
    top: 6,
    width: 32,
    ...SHADOW_STYLES.small,
    elevation: 0,
  },
  footer: {
    alignItems: "center",
    flexDirection: "row",
    height: 32,
    justifyContent: "space-between",
  },
  image: {
    height: "100%",
    width: "100%",
  },
  imageContainer: {
    alignSelf: "center",
    height: IMAGE_SIZE,
    padding: 0,
    position: "relative",
    width: IMAGE_SIZE,
  },
  imagePlaceholder: {
    alignItems: "center",
    height: "100%",
    justifyContent: "center",
    width: "100%",
  },
  partNumberBold: {
    fontSize: 14,
    fontWeight: "900",
  },
  price: {
    fontSize: 16,
    fontWeight: "800",
  },
  priceContainer: {
    flex: 1,
    marginRight: 6,
    minWidth: 0,
  },
  statusBadge: {
    alignItems: "center",
    borderRadius: 6,
    flexDirection: "row",
    justifyContent: "center",
    left: 6,
    minHeight: 28,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: "absolute",
    top: 6,
    zIndex: 1,
    maxWidth: '85%',
    flexShrink: 1,
  },
  statusText: {
    color: "#ffffff",
    fontWeight: "600",
    includeFontPadding: false,
    marginStart: 4,
    paddingTop: Platform.OS === "android" ? 1 : 0,
    textAlign: "center",
    textAlignVertical: "center",
    flexShrink: 1,
  },
  textContainer: {
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: "900",
    height: 40,
    lineHeight: 20,
  },
});

export default React.memo(MasonryProductCard, arePropsEqual);
