/**
 * Bottom padding for the assistant's message list.
 *
 * The list runs under the composer bar and, while the keyboard is open, under
 * the keyboard too. Padding only for the composer scrolled the newest rows —
 * the question just sent and the answer streaming in — to a spot BEHIND the
 * keyboard, so the chat looked like it vanished mid-answer.
 *
 * `listBottom` and `barTop` are in the coordinates of the parent both are laid
 * out in. Never returns less than the old composer-only padding, so the screen
 * with the keyboard closed looks exactly as it did.
 */
export function chatListBottomPadding(args: {
  barHeight: number;
  tabBarHeight: number;
  barTop: number;
  listBottom: number | null;
}): number {
  const previous = args.barHeight + args.tabBarHeight + 16;
  if (args.listBottom === null) return previous;
  const covered = args.listBottom - args.barTop;
  return Math.max(previous, covered + 16);
}
