import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

interface AutoScrollRailProps<T> {
  data: T[];
  /** Rendered once per item. The rail duplicates `data`, so this may be called twice per item. */
  renderItem: (item: T, index: number) => React.ReactElement;
  keyExtractor: (item: T, index: number) => string;
  /** Width of one item in dp. Required: the loop maths cannot measure asynchronously. */
  itemWidth: number;
  /** Gap between items in dp. */
  gap?: number;
  /** Drift speed in dp per second. Slow on purpose — this is ambient, not a carousel. */
  speed?: number;
  /** Idle time after the user lets go before drifting resumes. */
  resumeDelayMs?: number;
  contentContainerStyle?: object;
}

/**
 * A horizontal rail that drifts slowly on its own and can still be dragged.
 *
 * The list renders `data` twice and wraps the offset at the width of one copy, so
 * the seam is never visible and there is no jump at the end. With a handful of
 * brand tiles the duplication is cheaper than the bookkeeping a truly infinite
 * list would need.
 *
 * Motion is suspended whenever it would be wasted or unwelcome: while the user is
 * touching it, while the screen is not focused, and entirely when the OS reports
 * Reduce Motion. The last one matters — a permanently moving element is a real
 * problem for people with vestibular disorders, and it is the kind of thing that
 * is never noticed until someone complains.
 */
function AutoScrollRail<T>({
  data,
  renderItem,
  keyExtractor,
  itemWidth,
  gap = 12,
  speed = 18,
  resumeDelayMs = 2500,
  contentContainerStyle,
}: AutoScrollRailProps<T>) {
  const listRef = useRef<FlatList>(null);
  const offset = useRef(0);
  const paused = useRef(false);
  const frame = useRef<number | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focused = useRef(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [railWidth, setRailWidth] = useState(0);

  const loopWidth = data.length * (itemWidth + gap);
  const doubled = React.useMemo(() => [...data, ...data], [data]);

  // Two copies only hide the seam while one copy is at least as wide as the
  // visible rail — otherwise the wrap happens with empty space on screen and
  // reads as a jump. Below that width the content already fits, so there is
  // nothing to scroll and standing still is the correct behaviour.
  const canDrift = railWidth > 0 && loopWidth >= railWidth;

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => { if (alive) setReduceMotion(on); })
      .catch(() => { /* assume motion is fine */ });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { alive = false; sub?.remove?.(); };
  }, []);

  // Pause off-screen: a rail scrolling on an unfocused tab burns frames for nobody.
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => { focused.current = false; };
    }, []),
  );

  useEffect(() => {
    if (reduceMotion || !canDrift || data.length === 0) return;

    let last = Date.now();
    const step = () => {
      const now = Date.now();
      // Delta-time rather than a fixed increment per frame, so the drift is the
      // same speed on a 60Hz and a 120Hz screen.
      const dt = Math.min(now - last, 64) / 1000;
      last = now;

      if (!paused.current && focused.current) {
        offset.current += speed * dt;
        // Wrap within the first copy; the second copy is what the user sees during
        // the wrap, so nothing appears to jump.
        if (offset.current >= loopWidth) offset.current -= loopWidth;
        listRef.current?.scrollToOffset({ offset: offset.current, animated: false });
      }
      frame.current = requestAnimationFrame(step);
    };

    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, [reduceMotion, canDrift, loopWidth, speed, data.length]);

  const onTouchStart = useCallback(() => {
    paused.current = true;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  }, []);

  const scheduleResume = useCallback(() => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => { paused.current = false; }, resumeDelayMs);
  }, [resumeDelayMs]);

  // Track where the user left it, so drifting continues from there rather than
  // snapping back to wherever the animation had got to.
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (paused.current) offset.current = e.nativeEvent.contentOffset.x;
    },
    [],
  );

  if (data.length === 0) return null;

  return (
    // FlatList swallows onLayout — VirtualizedList keeps it for its own
    // bookkeeping — so the visible width is measured from a wrapper.
    <View onLayout={(e) => setRailWidth(e.nativeEvent.layout.width)}>
    <FlatList
      ref={listRef}
      data={canDrift || railWidth === 0 ? doubled : data}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyExtractor={(item, i) => `${keyExtractor(item, i % data.length)}-${i}`}
      renderItem={({ item, index }) => renderItem(item, index % data.length)}
      ItemSeparatorComponent={() => <View style={{ width: gap }} />}
      contentContainerStyle={contentContainerStyle}
      onScroll={onScroll}
      scrollEventThrottle={16}
      onTouchStart={onTouchStart}
      onScrollBeginDrag={onTouchStart}
      onScrollEndDrag={scheduleResume}
      onMomentumScrollEnd={scheduleResume}
      onTouchEnd={scheduleResume}
      onTouchCancel={scheduleResume}
      // The offset is driven every frame; recycling would fight it on long rails.
      removeClippedSubviews={false}
      decelerationRate="normal"
    />
    </View>
  );
}

export default AutoScrollRail;
