import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { SPACING } from '../../constants/theme';
import TypingDots from './TypingDots';
import MarkdownBody from './MarkdownBody';
import { useRevealedText } from './useRevealedText';

interface Props {
  text: string;
  streaming: boolean;
  isRTL: boolean;
  theme: any;
  time?: string;
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
const AssistantMessage: React.FC<Props> = ({ text, streaming, isRTL, theme, time }) => {
  const revealed = useRevealedText(text, streaming);

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
        source={require('../../../assets/images/asankarylogo.png')}
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
            text={text}
            isRTL={isRTL}
            color={theme.colors.text}
            secondaryColor={theme.colors.textSecondary}
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
