import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { SPACING } from '../../constants/theme';
import { chatbotService, ProductRecord } from '../../services/chatbotService';
import AppNumber from '../AppNumber';

interface Props {
  ids: string[];
  isRTL: boolean;
  theme: any;
  onOpen: (id: string) => void;
}

/**
 * Real catalogue rows only.
 *
 * Ids come from a marker the model wrote, so some of them may not exist —
 * getProductsByIds resolves against the catalogue already in memory and drops
 * anything it cannot find. A hallucinated id therefore costs an absent card, not
 * a broken one, and never a request.
 *
 * Horizontal ScrollView rather than a FlatList: the strip holds at most three
 * cards, and a nested list would break the screen's one-vertical-scroll-owner
 * rule for no gain.
 */
const ProductCardStrip: React.FC<Props> = ({ ids, isRTL, theme, onOpen }) => {
  const { t } = useTranslation();
  const [products, setProducts] = useState<ProductRecord[]>([]);

  useEffect(() => {
    let alive = true;
    chatbotService
      .getProductsByIds(ids)
      .then(rows => {
        if (alive) setProducts(rows);
      })
      .catch(() => {
        // A card strip is an enhancement. If the catalogue is unreachable, the
        // answer above it is still the part the customer came for.
        if (alive) setProducts([]);
      });
    return () => {
      alive = false;
    };
    // Keyed on the ids themselves, not the array identity. Belt and braces with
    // the caller's useMemo: a component this cheap should not depend on a parent
    // remembering to memoise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(',')]);

  if (!products.length) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingVertical: SPACING.sm,
        gap: SPACING.sm,
        flexDirection: isRTL ? 'row-reverse' : 'row',
      }}
      style={{ marginTop: SPACING.xs }}
    >
      {products.map(product => {
        const inStock = (product.stockQty ?? 0) > 0;
        const image = product.imageUrls?.[0];

        return (
          <Pressable
            key={product.id}
            onPress={() => onOpen(product.id)}
            accessibilityRole="button"
            accessibilityLabel={product.name}
            style={({ pressed }) => ({
              width: 150,
              borderRadius: 12,
              overflow: 'hidden',
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Image
              source={image ? { uri: image } : undefined}
              style={{
                width: '100%',
                aspectRatio: 1,
                backgroundColor: theme.colors.background,
              }}
              contentFit="cover"
              transition={120}
              cachePolicy="memory-disk"
            />

            <View style={{ padding: SPACING.sm }}>
              <Text
                allowFontScaling={false}
                numberOfLines={2}
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: theme.colors.text,
                  textAlign: isRTL ? 'right' : 'left',
                  minHeight: 34,
                  includeFontPadding: false,
                }}
              >
                {product.name}
              </Text>

              <View
                style={{
                  flexDirection: isRTL ? 'row-reverse' : 'row',
                  alignItems: 'center',
                  marginTop: 4,
                }}
              >
                <AppNumber
                  value={`$${product.priceUSD ?? 0}`}
                  style={{ fontSize: 14, fontWeight: '700', color: theme.colors.primary }}
                />
              </View>

              {/* Only the fact, never the count — inventory levels are the shop's
                  business, and the same rule governs the model's context. */}
              {!inStock && (
                <Text
                  allowFontScaling={false}
                  style={{
                    fontSize: 11,
                    color: theme.colors.error,
                    marginTop: 2,
                    textAlign: isRTL ? 'right' : 'left',
                  }}
                >
                  {t('chatbot.outOfStock')}
                </Text>
              )}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

export default React.memo(ProductCardStrip);
