import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  /** Rendered once per visible copy, so this is called many times per item. */
  renderItem: (item: T, index: number) => React.ReactElement;
  keyExtractor: (item: T, index: number) => string;
  /** Width of one item in dp. Required: the loop maths cannot measure asynchronously. */
  itemWidth: number;
  /** Gap between items in dp. */
  gap?: number;
  /** Left padding inside the content container, in dp. Keeps the loop aligned to copy boundaries. */
  leadingInset?: number;
  /** Drift speed in dp per second. Slow on purpose — this is ambient, not a carousel. */
  speed?: number;
  /** Idle time after the rail comes to rest before drifting resumes. */
  resumeDelayMs?: number;
  contentContainerStyle?: object;
}

/**
 * Scroll runway kept on each side of the user, in dp. It only has to outlast a
 * single fling, because the position is folded back the moment one ends.
 */
const HEADROOM_DP = 2500;

/**
 * Minimum gap between scroll writes, in ms. The drift is driven from JS, so every
 * write costs a command out and a scroll event back. Thirty per second is
 * indistinguishable from sixty at this speed and halves that traffic — which is
 * what a cheap Android phone notices.
 */
const MIN_STEP_MS = 33;

/** Extra grace after a fling before the fallback resume fires, in ms. */
const MOMENTUM_GRACE_MS = 3000;

/**
 * An endlessly looping horizontal rail that drifts slowly and can be dragged.
 *
 * The list repeats `data` many times and the scroll position is continuously
 * folded back into one middle copy. Because the content is periodic, folding is
 * invisible: position X and position X + oneCopy show exactly the same pixels.
 * The user can therefore drag forever in either direction and never reach an
 * end, which is the point — the rail reads as a revolving showroom rather than
 * a list that runs out.
 *
 * The repeats are what make that possible; they are never meant to be seen as
 * duplicates. That only happens if a shop has so few brands that one copy is
 * narrower than the screen, which would put the same brand on screen twice at
 * once. Below that width the rail deliberately stops looping and shows a single
 * plain copy.
 *
 * Folding NEVER happens while a fling is still travelling — a non-animated
 * scrollToOffset aborts native deceleration, which would make every fling die
 * on release. It happens on the drift's own frames and once momentum has come
 * to rest, which is why the runway above only has to cover one fling.
 *
 * Motion is suspended whenever it would be wasted or unwelcome: while the user
 * is touching it, while a fling is in flight, while the screen is not focused,
 * and entirely when the OS reports Reduce Motion. The last one matters — a
 * permanently moving element is a real problem for people with vestibular
 * disorders. Looping still works under Reduce Motion; only the drift stops.
 */
function AutoScrollRail<T>({
  data,
  renderItem,
  keyExtractor,
  itemWidth,
  gap = 12,
  leadingInset = 0,
  speed = 18,
  resumeDelayMs = 2500,
  contentContainerStyle,
}: AutoScrollRailProps<T>) {
  const listRef = useRef<FlatList>(null);
  const offset = useRef(0);
  const centered = useRef(false);
  const momentum = useRef(false);
  const touching = useRef(false);
  const frame = useRef<number | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focused = useRef(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [railWidth, setRailWidth] = useState(0);

  const stride = itemWidth + gap;
  const loopWidth = data.length * stride;

  // Looping requires one copy to be at least as wide as the rail. Below that the
  // same brand would appear twice on screen at once, which looks like a bug
  // rather than a loop — and there is nothing to scroll anyway.
  const canLoop = railWidth > 0 && loopWidth >= railWidth;
  const canDrift = canLoop && !reduceMotion;

  const sideCopies = canLoop ? Math.max(2, Math.ceil(HEADROOM_DP / loopWidth)) : 0;
  const repeats = canLoop ? sideCopies * 2 + 1 : 1;

  const looped = useMemo(
    () => (repeats === 1 ? data : Array.from({ length: repeats }, () => data).flat()),
    [data, repeats],
  );

  // Start of the middle copy — the band the scroll position is folded into.
  const bandStart = leadingInset + sideCopies * loopWidth;

  /** Fold any position into the middle copy. Same pixels, safe distance from both ends. */
  const fold = useCallback(
    (x: number) => {
      if (!canLoop || !Number.isFinite(x)) return x;
      return bandStart + ((((x - bandStart) % loopWidth) + loopWidth) % loopWidth);
    },
    [canLoop, bandStart, loopWidth],
  );

  const scrollTo = useCallback((x: number) => {
    offset.current = x;
    listRef.current?.scrollToOffset({ offset: x, animated: false });
  }, []);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => { if (alive) setReduceMotion(on); })
      .catch(() => { /* assume motion is fine */ });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { alive = false; sub?.remove?.(); };
  }, []);

  // ---------------------------------------------------------------------------
  // The drift loop. Started and stopped explicitly rather than left ticking with
  // its body skipped — an idle requestAnimationFrame chain still wakes the JS
  // thread sixty times a second on every screen the shopper opens afterwards.
  // ---------------------------------------------------------------------------
  const driftRef = useRef(false);
  driftRef.current = canDrift;

  const stopLoop = useCallback(() => {
    if (frame.current != null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
  }, []);

  const startLoop = useCallback(() => {
    if (frame.current != null || !driftRef.current || touching.current || momentum.current) return;
    let last = Date.now();
    let acc = 0;
    const step = () => {
      const now = Date.now();
      // Delta-time rather than a fixed increment per frame, so the drift is the
      // same speed on a 60Hz and a 120Hz screen.
      acc += Math.min(now - last, 64);
      last = now;
      if (acc >= MIN_STEP_MS) {
        if (centered.current) scrollTo(fold(offset.current + (speed * acc) / 1000));
        acc = 0;
      }
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }, [fold, scrollTo, speed]);

  const pause = useCallback(() => {
    stopLoop();
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = null;
  }, [stopLoop]);

  const scheduleResume = useCallback((delay: number) => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => {
      resumeTimer.current = null;
      // Never take the wheel back while a fling is still travelling.
      if (momentum.current || touching.current) { scheduleResume(delay); return; }
      if (focused.current) startLoop();
    }, delay);
  }, [startLoop]);

  useEffect(() => {
    if (canDrift) startLoop(); else stopLoop();
    return stopLoop;
  }, [canDrift, startLoop, stopLoop]);

  // Pause off-screen: a rail scrolling on an unfocused tab burns frames for nobody.
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      startLoop();
      return () => { focused.current = false; pause(); };
    }, [startLoop, pause]),
  );

  useEffect(() => () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  }, []);

  // The brand list can grow while the shopper pages through the feed. Fold the
  // current position into the resized band instead of re-centring, so the rail
  // shifts by less than one copy rather than snapping back to the first brand.
  useEffect(() => {
    if (canLoop && centered.current) scrollTo(fold(offset.current));
  }, [canLoop, fold, scrollTo]);

  // ---------------------------------------------------------------------------
  // Touch handling
  // ---------------------------------------------------------------------------
  const onTouchStart = useCallback(() => {
    touching.current = true;
    momentum.current = false;
    pause();
  }, [pause]);

  // A tap that never became a drag still has to restart the drift.
  const onTouchEnd = useCallback(() => { touching.current = false; scheduleResume(resumeDelayMs); }, [scheduleResume, resumeDelayMs]);

  // Deliberately does NOT fold: deceleration is usually still to come, and a
  // programmatic scroll here would kill it. The longer delay covers the case
  // where no momentum phase starts at all, so the rail can never stay frozen.
  const onScrollEndDrag = useCallback(() => {
    touching.current = false;
    scheduleResume(resumeDelayMs + MOMENTUM_GRACE_MS);
  }, [scheduleResume, resumeDelayMs]);

  const onMomentumScrollBegin = useCallback(() => {
    momentum.current = true;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = null;
  }, []);

  // Everything has come to rest, so folding here is free and invisible.
  const onMomentumScrollEnd = useCallback(() => {
    momentum.current = false;
    if (canLoop && centered.current) {
      const folded = fold(offset.current);
      if (folded !== offset.current) scrollTo(folded);
    }
    scheduleResume(resumeDelayMs);
  }, [canLoop, fold, scrollTo, scheduleResume, resumeDelayMs]);

  // Track where the user left it, so drifting continues from there rather than
  // snapping back to wherever the animation had got to.
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (frame.current == null) offset.current = e.nativeEvent.contentOffset.x;
  }, []);

  // Jump to the middle copy as soon as the repeated content exists. Keyed on
  // content size rather than layout because the offset is only reachable once
  // the list is actually that wide.
  const onContentSizeChange = useCallback(
    (contentWidth: number) => {
      if (!canLoop || centered.current) return;
      if (contentWidth < bandStart + railWidth) return;
      scrollTo(bandStart);
      centered.current = true;
    },
    [canLoop, bandStart, railWidth, scrollTo],
  );

  // Uniform widths make this exact, so virtualization knows what to render at
  // the middle copy immediately instead of blanking after the jump.
  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({ length: itemWidth, offset: leadingInset + index * stride, index }),
    [itemWidth, leadingInset, stride],
  );

  // Stable element type: an inline arrow would unmount and remount every
  // separator on each render.
  const Separator = useMemo(
    () => function RailSeparator() { return <View style={{ width: gap }} />; },
    [gap],
  );

  if (data.length === 0) return null;

  return (
    // FlatList swallows onLayout — VirtualizedList keeps it for its own
    // bookkeeping — so the visible width is measured from a wrapper.
    <View onLayout={(e) => setRailWidth(e.nativeEvent.layout.width)}>
      <FlatList
        ref={listRef}
        data={looped}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item, i) => `${keyExtractor(item, i % data.length)}-${i}`}
        renderItem={({ item, index }) => renderItem(item, index % data.length)}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={contentContainerStyle}
        getItemLayout={getItemLayout}
        onContentSizeChange={onContentSizeChange}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onTouchStart={onTouchStart}
        onScrollBeginDrag={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onScrollEndDrag={onScrollEndDrag}
        onMomentumScrollBegin={onMomentumScrollBegin}
        onMomentumScrollEnd={onMomentumScrollEnd}
        // The repeated list is long; without windowing every copy would stay
        // mounted. getItemLayout above makes this exact, so nothing blanks.
        windowSize={5}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        removeClippedSubviews={false}
        decelerationRate="normal"
      />
    </View>
  );
}

export default AutoScrollRail;
