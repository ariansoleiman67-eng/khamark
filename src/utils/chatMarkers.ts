/**
 * The assistant ends product recommendations with a machine-readable marker:
 *
 *     <<products:uuid,uuid,uuid>>
 *
 * The customer must never see it. Three cases matter, and the third is the one
 * that bites: while streaming, the marker arrives a few characters at a time, so
 * a naive strip leaves "<<produ" on screen for a frame or two before the rest of
 * it lands.
 */

/** A finished marker at the end of the answer, with any whitespace before it. */
const COMPLETE = /\s*<<products:([^>]*)>>\s*$/;

/**
 * A marker that is still arriving: any trailing prefix of the opening sequence,
 * from `<<` onward.
 *
 * Deliberately requires two brackets. A single trailing `<` is far more likely to
 * be real text a shopper asked about ("cables under <2m") than the first
 * character of a marker, so it is left visible. The cost of that choice is one
 * character showing for a single frame; the cost of the other choice is eating a
 * character out of a real answer.
 *
 * The `>?` at the end matters: the marker closes with TWO brackets, so there is a
 * real intermediate state where only the first has arrived (`<<products:uuid>`).
 * Without it that state renders the raw marker on screen for a frame.
 */
const PARTIAL = /\s*<<(?:p(?:r(?:o(?:d(?:u(?:c(?:t(?:s(?::[^>]*>?)?)?)?)?)?)?)?)?)?$/;

export function extractProductIds(text: string): string[] {
  const match = text.match(COMPLETE);
  if (!match) return [];

  const seen = new Set<string>();
  return match[1]
    .split(',')
    .map(id => id.trim())
    .filter(id => {
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

export function stripProductMarker(text: string): string {
  return text.replace(COMPLETE, '').trimEnd();
}

/**
 * What to show while the answer is still arriving: the complete marker removed if
 * it has landed, and any partial one that has not.
 */
export function visibleDuringStream(text: string): string {
  return stripProductMarker(text).replace(PARTIAL, '').trimEnd();
}
