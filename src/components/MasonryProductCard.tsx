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
import {
  getDisplayUnitPrice,
  getDiscountPercent,
  getEffectiveStock,
  hasCompareAtDiscount,
} from "../utils/pricingUtils";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

const { width: screenWidth } = Dimensions.get("window");

// Fixed card size for the 2-column masonry grid + horizontal carousels.
const CARD_MARGIN = 10;
const NUM_COLUMNS = 2;
const AVAILABLE_WIDTH = screenWidth - CARD_MARGIN * (NUM_COLUMNS + 1);
const CARD_WIDTH = Math.floor(AVAILABLE_WIDTH / NUM_COLUMNS);
const IMAGE_SIZE = CARD_WIDTH;

// Budget for the text block, derived rather than guessed, so the worst-case card
// (2-line title + brand + price row + VIP hint + CTA) provably fits:
//   paddingTop 10 + title 40 + brand 20 + variant row 20 + price row 24
//   + VIP hint 16 + CTA 44 + CTA gap 10 + paddingBottom 12  =  196
// 210 leaves ~14px of slack for font-scale and Android line-height variance.
// The CTA is a flex child now, so if a future row is added the CTA gets pushed and
// the overflow is visible in review instead of hiding under it.
const TEXT_CONTAINER_HEIGHT = 210;
const CARD_HEIGHT = IMAGE_SIZE + TEXT_CONTAINER_HEIGHT;

// Fixed brand accents: these read as "VIP" and "sale" regardless of theme, and both
// carry white text, so they must not follow the theme's surface colours.
const MAX_SWATCHES = 4;
const VIP_PURPLE = "#7C3AED";
const SALE_RED = "#E53935";
// Neutral slate, fixed like VIP_PURPLE and SALE_RED above and for the same reason:
// this badge carries white text, so it cannot follow a theme colour. Against
// theme.colors.textSecondary it measured 3.44:1 on the default preset and 1.48:1 on
// Royal Purple — below AA, and near-illegible on the latter. #4B5563 gives 7.56:1
// against white (computed, not assumed) and reads as informational rather than a warning.
const USED_SLATE = "#4B5563";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface MasonryProductCardProps {
  product: Product;
  onPress: (productId: string, product: Product) => void;
  onAddToCart?: (productId: string, product: Product) => void;
  /**
   * Called instead of onAddToCart when the product has colour / storage / size
   * options, so the customer picks them before anything reaches the cart. If a
   * screen does not supply this, the card falls back to onPress (the detail screen,
   * which always has the full pickers) rather than silently adding an unspecified
   * variant.
   */
  onSelectOptions?: (productId: string, product: Product) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (productId: string) => void;
  style?: StyleProp<ViewStyle>;
}

const MasonryProductCard: React.FC<MasonryProductCardProps> = ({
  product,
  onPress,
  onAddToCart,
  onSelectOptions,
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

  // FlashList (SearchScreen) recycles this component instance across products,
  // so transient per-image failure state must be reset when the card lands on a
  // new product. `recyclingKey` only resets expo-image's loader, not these flags.
  // Render-phase reset (vs. useEffect) avoids a one-frame flash of the stale
  // broken-image placeholder on the new product.
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

  // Products with colour / storage / size go through a picker first. Without this the
  // behaviour was whatever each screen's handler happened to do — HomeScreen opened
  // the sheet, Favorites routed to the detail screen, and CategoryProducts added the
  // base product outright, so ordering an iPhone from that grid produced an order
  // with no colour and no storage selected.
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
      const maxFormatted = formatPrice(product.priceUSD, currency, exchangeRateIQD, { symbol: false });
      return `${minFormatted} - ${maxFormatted}`;
    }
    return formatPrice(getDisplayUnitPrice(product, isVip), currency, exchangeRateIQD);
  };
  const vipActive = isVip && typeof product.vipPriceUSD === "number" && product.vipPriceUSD > 0;
  // VIP price shown only to VIP users — no locked/teaser hint for normal users.
  // Saving is measured against what THIS shopper pays, so a VIP sees the badge (they
  // used to see no discount cue at all) and the figure matches the product page.
  const hasDiscount = hasCompareAtDiscount(product, isVip);
  const savePct = getDiscountPercent(product, isVip);

  // Main + per-size + per-colour stock. The old form ignored colorVariations entirely
  // and dropped the main stock whenever sizes existed, so a product stocked only in
  // colours rendered a dead "Out of Stock" CTA the product page contradicted.
  const effectiveStock = getEffectiveStock(product);

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

  // ── Variant meta ────────────────────────────────────────────────────────────
  const colorOptions = (product.colorVariations || []).filter(Boolean);
  // colorHex is optional in the schema; only swatch the ones that actually carry a
  // colour, and fall back to a count when none do.
  const swatchable = colorOptions.filter((c) => !!c.colorHex);
  const extraColors = colorOptions.length - Math.min(swatchable.length, MAX_SWATCHES);

  // Sorted by priceDelta rather than array order: priceDelta 0 is the base tier, so
  // this yields smallest→largest without trusting how the row was authored.
  const storageLabels = [...(product.storageOptions || [])]
    .sort((a, b) => (Number(a?.priceDelta) || 0) - (Number(b?.priceDelta) || 0))
    .map((o) => o?.label)
    .filter(Boolean) as string[];
  const storageRange =
    storageLabels.length > 1
      ? `${storageLabels[0]}–${storageLabels[storageLabels.length - 1]}`
      : storageLabels[0] || "";

  const hasVariantMeta = colorOptions.length > 0 || !!storageRange;

  // Anything that must be chosen before this can go in a cart.
  const hasOptions =
    colorOptions.length > 0 ||
    storageLabels.length > 0 ||
    (product.variations?.length ?? 0) > 0;

  // Brandless products fall back to the category — which has to follow the UI language
  // the same way the title above it does, or the card reads "هاتف" over "Smartphones".
  // Admin-entered translation wins; otherwise fall back to the app's own
  // categories.* strings before showing raw English, so a stock category still
  // reads Arabic on a card even when nobody typed an Arabic name for it. Same
  // order of preference as translateCategory on the product page.
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

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      // One spoken label for the whole card: name, brand and price as a single
      // phrase, so a screen reader announces the product rather than reading four
      // disconnected fragments as the user swipes through a grid.
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

        {/* The scarcity cue ("Only N left") was removed: exact quantities are
            business data and are no longer shown to customers anywhere. The
            status badges above still cover coming soon / on the way. */}

        {/* Condition cue. Bottom-left of the image — the opposite edge from the
            top-left status slot above (coming soon / on the way / low stock) and
            the top-right favorite button — so it never shares a corner with
            either. Refurbished intentionally gets no card badge: it reads as an
            inspected/restored unit rather than a buyer-beware cue the way "used"
            does, it is already disclosed on the product page's condition row, and
            a third image badge would crowd the two corner slots this card has. */}
        {product.condition === "used" && (
          <View style={[styles.conditionBadge, { backgroundColor: USED_SLATE }]}>
            <AppText fontSize={10} style={styles.conditionBadgeText} numberOfLines={1}>
              {t("product.conditionUsed")}
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

        {/* Colour swatches + storage span. Sits above the price so the eye lands on
            what varies before what it costs. Decorative to a screen reader — the same
            information is already in the card's single spoken label. */}
        {hasVariantMeta && (
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
                        // A hairline ring so white and near-white finishes stay visible
                        // on the card surface in both themes.
                        borderColor: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.18)",
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
              // Guarded on the count, not just on swatchable: this branch also runs
              // for a storage-only product, which rendered a literal "0 colors".
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
        )}

        {/* Price. At most TWO rows: the hero price (with its comparison inline) and
            an optional VIP hint. Previously the strikethrough and the discount badge
            occupied a third row, which is what pushed this block into the CTA — and
            three competing numbers made it genuinely unclear what the customer pays. */}
        <View style={styles.priceBlock}>
          <View style={[styles.priceRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            {/* containerStyle, not style: AppNumber wraps its Text in a View, and THAT
                View is the flex item here. Shrink rules passed via `style` land on the
                inner Text and do nothing, so a long price (a big USD figure, or any
                IQD amount) took its full intrinsic width and shoved the strikethrough
                and the badge sideways. React Native defaults flex items to
                flexShrink: 0, so this has to be explicit. */}
            <AppNumber
              value={getPriceDisplay()}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.9}
              containerStyle={styles.priceShrink}
              style={[styles.price, { color: vipActive ? VIP_PURPLE : theme.colors.text, textAlign }]}
            />
            {vipActive && (
              <View style={[styles.tag, { backgroundColor: VIP_PURPLE }]}>
                <AppText fontSize={9} style={styles.tagText}>VIP</AppText>
              </View>
            )}
          </View>

          {/* Second line: a long price (e.g. $1,199.00) used to share one row with the
              strikethrough + badge, which forced it to auto-shrink and read smaller
              than cheap products' prices. Giving the comparison its own row keeps the
              paid price at full size on every card. */}
          {hasDiscount && (
            <View style={[styles.compareRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <AppText
                fontSize={11}
                numberOfLines={1}
                style={[styles.compareAt, { color: theme.colors.textSecondary }]}
              >
                {formatPrice(product.compareAtPriceUSD as number, currency, exchangeRateIQD)}
              </AppText>
              <View style={[styles.tag, { backgroundColor: SALE_RED }]}>
                <AppText fontSize={9} style={styles.tagText}>-{savePct}%</AppText>
              </View>
            </View>
          )}
        </View>

        {/* CTA sits in normal flow, pinned to the bottom by marginTop:auto. It used to
            be position:absolute over a paddingBottom reservation, so any content that
            ran past that reservation was silently covered by it — which is exactly what
            happened to the discount row. In flow, the CTA can be pushed but never
            overlapped. */}
        <View ref={addToCartRef} collapsable={false} style={styles.ctaWrapper}>
          <Pressable
            disabled={!purchasable}
            style={({ pressed }) => [
              styles.cta,
              {
                backgroundColor: purchasable ? theme.colors.primary : theme.colors.disabled,
                opacity: pressed && purchasable ? 0.85 : 1,
              },
            ]}
            onPress={handleCtaPress}
            accessibilityRole="button"
            // The visible label already says why it is disabled (Out of Stock /
            // Coming Soon), so it doubles as the accessible name.
            accessibilityLabel={ctaLabel}
            accessibilityState={{ disabled: !purchasable }}
          >
            <AppText
              fontSize={13}
              style={[
                styles.ctaText,
                { color: purchasable ? theme.colors.textOnPrimary : theme.colors.textSecondary },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {ctaLabel}
            </AppText>
          </Pressable>
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
  prevProps.onSelectOptions === nextProps.onSelectOptions &&
  // Without these a recycled FlashList row would keep the previous product's
  // swatches and storage span.
  prevProps.product.colorVariations === nextProps.product.colorVariations &&
  prevProps.product.storageOptions === nextProps.product.storageOptions &&
  prevProps.product.variations === nextProps.product.variations &&
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
  // Bottom-left of the image, mirroring statusBadge's top-left slot but pinned to
  // the opposite edge so a used cue never stacks with coming-soon / on-the-way /
  // low-stock badges, which all occupy top-left.
  conditionBadge: {
    alignItems: "center",
    borderRadius: 8,
    bottom: 8,
    justifyContent: "center",
    left: 8,
    maxWidth: "70%",
    minHeight: 22,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: "absolute",
    zIndex: 1,
  },
  conditionBadgeText: {
    color: "#FFFFFF",
    fontWeight: "700",
    includeFontPadding: false,
    paddingTop: Platform.OS === "android" ? 1 : 0,
    textAlign: "center",
  },
  textContainer: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    // No paddingBottom reservation for the CTA any more — the CTA is a flex child
    // and reserves its own space, so the two can no longer collide.
    paddingBottom: 12,
  },
  title: {
    fontWeight: "700",
    // Fixed 2-line reservation, not minHeight: it keeps the price rows and CTAs on
    // the same baseline across a row of cards whether a title wraps to one line or
    // two. numberOfLines={2} means it can never exceed this.
    height: 40,
    lineHeight: 20,
  },
  brand: {
    fontWeight: "500",
    marginTop: 4,
  },
  variantRow: {
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    minHeight: 14,
  },
  swatchRow: {
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  swatch: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 1,
  },
  variantText: {
    fontWeight: "600",
    includeFontPadding: false,
  },
  storageText: {
    fontWeight: "600",
    includeFontPadding: false,
    // Yields to the swatches: colour is the visual differentiator, storage is a spec.
    flexShrink: 1,
    minWidth: 0,
  },
  priceBlock: {
    marginTop: "auto",
  },
  priceRow: {
    alignItems: "center",
    gap: 5,
  },
  // Applied to AppNumber's OUTER View (via containerStyle) — that is the flex item.
  // minWidth: 0 is required alongside flexShrink: a flex item will not shrink below
  // its intrinsic text width without it, which is how an IQD price like
  // "١٬٧٤٩٬٠٠٠ د.ع" would otherwise push everything else out of the row.
  priceShrink: {
    flexShrink: 1,
    minWidth: 0,
  },
  price: {
    fontWeight: "800",
    fontSize: 16,
  },
  compareRow: {
    alignItems: "center",
    gap: 5,
    marginTop: 3,
  },
  compareAt: {
    textDecorationLine: "line-through",
    // On its own row now, so it only needs to yield to the badge.
    flexShrink: 1,
    minWidth: 0,
  },
  tag: {
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    // Never let a badge be the thing that gets squeezed — it is the smallest and
    // least legible element, so it holds its size and the prices shrink instead.
    flexShrink: 0,
  },
  tagText: {
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: 0.3,
    includeFontPadding: false,
  },
  vipHintRow: {
    alignItems: "center",
    gap: 3,
    marginTop: 3,
  },
  vipHintText: {
    fontWeight: "700",
    flexShrink: 1,
    minWidth: 0,
  },
  ctaWrapper: {
    // Pinned to the bottom by auto margin rather than absolute positioning.
    marginTop: 10,
  },
  cta: {
    alignItems: "center",
    borderRadius: 999,
    // minHeight, not height: at large system font scales the label grows and a
    // fixed height would clip it.
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
    width: "100%",
  },
  ctaText: {
    fontWeight: "700",
    includeFontPadding: false,
  },
});

export default React.memo(MasonryProductCard, arePropsEqual);
