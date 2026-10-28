import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { SPACING } from '../../constants/theme';
import TypingDots from './TypingDots';
import MarkdownBody from './MarkdownBody';
import { useRevealedText } from './useRevealedText';
import ProductCardStrip from './ProductCardStrip';
import { stripProductMarker, visibleDuringStream, extractProductIds } from '../../utils/chatMarkers';

interface Props {
  text: string;
  streaming: boolean;
  isRTL: boolean;
  theme: any;
  time?: string;
  onOpenProduct?: (id: string) => void;
}

/**
 * Full width, no bubble, a small avatar at the leading edge.
 *
 * A bubble capped at 75% broke a line every few words in Kurdish and Arabic,
 * whose words run longer than the English the old layout was tuned against.
 * Running the text to the edge is also what leaves room for the product card
 * strip that Phase 3 hangs underneath it.
 *
 * While streaming the text renders PLAIN and character-smoothed. Parsing
 * markdown on every delta would rebuild the whole tree several times a second;
 * the swap to formatted text on completion is invisible because the words do not
 * move.
 */
const AssistantMessage: React.FC<Props> = ({
  text,
  streaming,
  isRTL,
  theme,
  time,
  onOpenProduct,
}) => {
  // The marker is stripped BEFORE the reveal animation sees the text, so the
  // smoothing never counts characters the customer will not be shown.
  const visible = streaming ? visibleDuringStream(text) : stripProductMarker(text);
  const revealed = useRevealedText(visible, streaming);
  // Only once the text stops moving: mid-stream the id list is usually truncated.
  //
  // Memoised because this array is ProductCardStrip's effect dependency. A fresh
  // array on every render would re-run that effect on every render, which for a
  // streaming message is dozens of times a second.
  const productIds = useMemo(
    () => (streaming ? [] : extractProductIds(text)),
    [streaming, text],
  );

  return (
    <View
      style={{
        flexDirection: isRTL ? 'row-reverse' : 'row',
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm,
        alignItems: 'flex-start',
      }}
    >
      <Image
        source={require('../../../assets/images/khamark_logo.png')}
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          ...(isRTL ? { marginLeft: SPACING.sm } : { marginRight: SPACING.sm }),
        }}
        contentFit="cover"
      />

      <View style={{ flex: 1, minWidth: 0 }}>
        {streaming && !revealed ? (
          <TypingDots color={theme.colors.textSecondary} />
        ) : streaming ? (
          <Text
            allowFontScaling={false}
            style={{
              fontSize: 15,
              lineHeight: 22,
              color: theme.colors.text,
              textAlign: isRTL ? 'right' : 'left',
              includeFontPadding: false,
            }}
          >
            {revealed}
          </Text>
        ) : (
          <MarkdownBody
            text={visible}
            isRTL={isRTL}
            color={theme.colors.text}
            secondaryColor={theme.colors.textSecondary}
          />
        )}

        {productIds.length > 0 && onOpenProduct && (
          <ProductCardStrip
            ids={productIds}
            isRTL={isRTL}
            theme={theme}
            onOpen={onOpenProduct}
          />
        )}

        {!!time && !streaming && (
          <Text
            allowFontScaling={false}
            style={{
              fontSize: 11,
              color: theme.colors.textSecondary,
              marginTop: 2,
              textAlign: isRTL ? 'right' : 'left',
            }}
          >
            {time}
          </Text>
        )}
      </View>
    </View>
  );
};

export default React.memo(AssistantMessage);
