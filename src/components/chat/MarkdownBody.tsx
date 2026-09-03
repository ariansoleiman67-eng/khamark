import React, { useMemo } from 'react';
import Markdown from 'react-native-markdown-display';

interface Props {
  text: string;
  isRTL: boolean;
  color: string;
  secondaryColor: string;
}

/**
 * The one place react-native-markdown-display is configured.
 *
 * It exists because of a defect found in the Phase 0 spike: the library
 * hardcodes `flexDirection: 'row'` on list_item, so in Kurdish and Arabic the
 * bullet or the number renders on the LEFT while its text sits on the right.
 * Mirroring the row fixes it, and every use of the renderer needs that override
 * — so there is exactly one use, here.
 *
 * Claude writes bold, ordered lists and nested bullets in all three languages;
 * before this the shop's customers saw literal asterisks.
 */
const MarkdownBody: React.FC<Props> = ({ text, isRTL, color, secondaryColor }) => {
  const styles = useMemo(
    () => ({
      body: {
        color,
        fontSize: 15,
        lineHeight: 22,
        textAlign: isRTL ? ('right' as const) : ('left' as const),
      },
      paragraph: { marginTop: 0, marginBottom: 8, flexWrap: 'wrap' as const },
      strong: { fontWeight: '700' as const, color },
      em: { fontStyle: 'italic' as const, color },
      // The mirror. Without it the marker lands on the wrong side in ku and ar.
      list_item: {
        flexDirection: isRTL ? ('row-reverse' as const) : ('row' as const),
        justifyContent: 'flex-start' as const,
        marginBottom: 2,
      },
      bullet_list: { marginTop: 2, marginBottom: 6 },
      ordered_list: { marginTop: 2, marginBottom: 6 },
      bullet_list_icon: { marginLeft: 8, marginRight: 8, color },
      ordered_list_icon: { marginLeft: 8, marginRight: 8, color },
      heading1: { fontSize: 18, fontWeight: '700' as const, color, marginBottom: 4 },
      heading2: { fontSize: 16, fontWeight: '700' as const, color, marginBottom: 4 },
      heading3: { fontSize: 15, fontWeight: '700' as const, color, marginBottom: 4 },
      code_inline: {
        backgroundColor: 'transparent',
        borderWidth: 0,
        color: secondaryColor,
        fontFamily: undefined,
      },
      // Product photos never come through markdown — cards render them — and a
      // hotlinked image in an answer would be an unbounded network request the
      // shop did not authorise.
      image: { width: 0, height: 0 },
      link: { color, textDecorationLine: 'underline' as const },
      hr: { backgroundColor: secondaryColor, height: 1, marginVertical: 8 },
    }),
    [color, secondaryColor, isRTL],
  );

  return <Markdown style={styles}>{text}</Markdown>;
};

export default React.memo(MarkdownBody);
