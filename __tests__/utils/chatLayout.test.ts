import { chatListBottomPadding } from '../../src/utils/chatLayout';

// iPhone-ish numbers: list bottom at 852, composer 150 tall, keyboard top at 516.
const base = { barHeight: 150, tabBarHeight: 0, listBottom: 852 };

describe('chatListBottomPadding', () => {
  it('keyboard closed: unchanged from before (composer + 16)', () => {
    expect(chatListBottomPadding({ ...base, barTop: 852 - 150 })).toBe(166);
  });

  it('keyboard open: clears the keyboard too, so the newest message is above the bar', () => {
    const barTop = 516 - 150; // bar sits on the keyboard
    // The old padding (166) left 852 - 366 - 166 = 320pt of the newest rows
    // behind the keyboard.
    expect(chatListBottomPadding({ ...base, barTop })).toBe(852 - barTop + 16);
  });

  it('Android resize: the window already shrank, so no extra gap is added', () => {
    // List bottom moved up with the window; the bar covers only itself.
    expect(chatListBottomPadding({ ...base, listBottom: 516, barTop: 516 - 150 })).toBe(166);
  });

  it('before the list is measured, falls back to the old padding', () => {
    expect(chatListBottomPadding({ ...base, listBottom: null, barTop: 100 })).toBe(166);
  });
});
