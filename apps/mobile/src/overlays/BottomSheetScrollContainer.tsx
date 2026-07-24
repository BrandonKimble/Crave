import React from 'react';
import type { ScrollViewProps } from 'react-native';
import { ScrollView, StyleSheet } from 'react-native';
import type { GestureType } from 'react-native-gesture-handler';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { useSceneFrostCutoutContentLayoutSignal } from './SceneBodyFoundationSurface';
import { SHEET_BODY_NO_OVERSCROLL } from './sheetBodyScrollDefaults';

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);
const AnimatedNativeScrollView = AnimatedScrollView as unknown as React.ComponentType<
  ScrollViewProps & {
    ref?: React.Ref<ScrollView>;
    animatedProps?: Partial<ScrollViewProps>;
  }
>;

type BottomSheetScrollContainerProps = ScrollViewProps & {
  // The two shared sheet pans (expand = the universal arbiter the native scroll waits on;
  // collapse = the simultaneous down-handoff pan). The container mints its OWN Gesture.Native
  // per instance — RNGH binds a gesture to exactly one detector, and relation declarations are
  // OR'd across the pair (verified: GestureHandlerOrchestrator.kt:740 + the iOS delegate), so
  // native-side declarations suffice and any number of container instances can coexist.
  expandPanGesture: GestureType;
  collapsePanGesture: GestureType;
  /** Boundary-physics law §3: the bottom-boundary pan (simultaneous, like collapse). */
  overscrollPanGesture: GestureType;
  /** Boundary-physics law §1: runtime-owned overscroll — translates the content. */
  contentOverscroll: SharedValue<number>;
  /** Boundary-physics: the live surface's max interior offset — published from
   *  layout/content-size HERE (before any scroll event exists; the probe-caught bug:
   *  an unpublished 0 made a fresh long list read as at-bottom). */
  maxScrollOffset: SharedValue<number>;
  /** Native-baseline rubber: the live surface's viewport height — the curve's `d`. */
  scrollViewportHeight: SharedValue<number>;
  // UI-thread scrollEnabled authority (plans/sheet-scroll-primitive.md §3.1): the authority-synced
  // SharedValue mirror of visible && listScrollEnabled && interactionEnabled. Driven via
  // useAnimatedProps on THIS real ScrollView, so a child leg that first commits mid page-switch
  // (transient false) heals the moment the runtime config syncs — no React re-render required.
  shouldEnableScrollShared: SharedValue<boolean>;
  transparent?: boolean;
};

const BottomSheetScrollContainer = React.forwardRef<ScrollView, BottomSheetScrollContainerProps>(
  (
    {
      expandPanGesture,
      collapsePanGesture,
      overscrollPanGesture,
      contentOverscroll,
      maxScrollOffset,
      scrollViewportHeight,
      shouldEnableScrollShared,
      transparent = false,
      style,
      contentContainerStyle,
      onContentSizeChange,
      onLayout,
      // STRUCTURAL: strip any per-scene scrollEnabled/animatedProps so nothing can shadow the
      // container's authorities (same law as SHEET_BODY_NO_OVERSCROLL below). scrollEnabled is
      // owned by shouldEnableScrollShared — one writer per factor.
      scrollEnabled: _ignoredScrollEnabled,
      ...props
    },
    ref
  ) => {
    // Per-instance native scroll gesture. Always enabled: transition gating is scrollEnabled's
    // job (the SV authority), not the gesture's — a baked .enabled(false) on a mount-stable
    // component was one of the two frozen-scroll kill switches (plans/sheet-scroll-primitive.md §2).
    const nativeScrollGesture = React.useMemo(
      () =>
        Gesture.Native()
          .requireExternalGestureToFail(expandPanGesture)
          .simultaneousWithExternalGesture(collapsePanGesture)
          .simultaneousWithExternalGesture(overscrollPanGesture),
      [collapsePanGesture, expandPanGesture, overscrollPanGesture]
    );

    // The visual rubber-band (law §4): the runtime-owned overscroll translates the whole
    // scroll viewport; the scene plate applies the same term, so FrostCutout holes track.
    const overscrollTranslateStyle = useAnimatedStyle(
      () => ({ transform: [{ translateY: -contentOverscroll.value }] }),
      [contentOverscroll]
    );

    const scrollEnabledAnimatedProps = useAnimatedProps(() => {
      'worklet';
      return { scrollEnabled: shouldEnableScrollShared.value };
    }, [shouldEnableScrollShared]);

    // THE SHORT-PAGE FLOOR IS DEAD (boundary-physics law §5): a short page's interior
    // range is genuinely 0 and the runtime-owned overscroll supplies the feel — no fake
    // minHeight padding. The old floor existed so the up-drag had a real scroll to fail
    // into; boundary ownership (the overscroll pan) replaced that need.
    //
    // maxScrollOffset publication: content height − viewport height, from the layout
    // callbacks (NOT only onScroll — a never-scrolled list must still be known-long).
    // Gated on being the live surface so a hidden leg's layout can't clobber the fact.
    const viewportHeightRef = React.useRef(0);
    const contentHeightRef = React.useRef(0);
    const publishMaxScrollOffset = React.useCallback(() => {
      if (!shouldEnableScrollShared.value) {
        return;
      }
      maxScrollOffset.value = Math.max(0, contentHeightRef.current - viewportHeightRef.current);
      scrollViewportHeight.value = viewportHeightRef.current;
    }, [maxScrollOffset, scrollViewportHeight, shouldEnableScrollShared]);
    const handleLayout = React.useCallback(
      (event: Parameters<NonNullable<ScrollViewProps['onLayout']>>[0]) => {
        viewportHeightRef.current = event.nativeEvent.layout.height;
        publishMaxScrollOffset();
        onLayout?.(event);
      },
      [onLayout, publishMaxScrollOffset]
    );

    // FrostCutout re-measure signal: content re-flow (a row above a cutout growing) changes the
    // content size without firing the cutout's own onLayout — this pings the scene's foundation
    // surface to sweep-re-measure its registered holes. No-op outside a foundation surface.
    const notifyCutoutContentLayout = useSceneFrostCutoutContentLayoutSignal();
    const handleContentSizeChange = React.useCallback(
      (width: number, height: number) => {
        contentHeightRef.current = height;
        publishMaxScrollOffset();
        notifyCutoutContentLayout();
        onContentSizeChange?.(width, height);
      },
      [notifyCutoutContentLayout, onContentSizeChange, publishMaxScrollOffset]
    );

    return (
      <GestureDetector gesture={nativeScrollGesture}>
        <AnimatedNativeScrollView
          {...props}
          ref={ref}
          // STRUCTURAL: the bottom-sheet scroll container NEVER over-scrolls. Every sheet body's
          // native scroll renders through here, and the scroll↔sheet handoff (both directions)
          // requires the list to PIN at its boundaries — if it rubber-bands at the top, a
          // continuous down-swipe makes the list slide past the header instead of the sheet
          // grabbing (see SHEET_BODY_NO_OVERSCROLL). No-bounce also keeps the FrostCutout plate
          // in lock-step with the content: the plate translates by -scrollOffset, which can never
          // go negative when the top is pinned, so the holes track their boxes exactly. Applied
          // AFTER the spread so no per-scene prop can silently re-enable bounce and break either.
          // This is THE single source of truth for it.
          bounces={SHEET_BODY_NO_OVERSCROLL.bounces}
          alwaysBounceVertical={SHEET_BODY_NO_OVERSCROLL.alwaysBounceVertical}
          overScrollMode={SHEET_BODY_NO_OVERSCROLL.overScrollMode}
          animatedProps={scrollEnabledAnimatedProps}
          onLayout={handleLayout}
          onContentSizeChange={handleContentSizeChange}
          style={[style, overscrollTranslateStyle, transparent ? styles.transparentScrollView : null]}
          contentContainerStyle={[
            contentContainerStyle,
            transparent ? styles.transparentScrollContent : null,
          ]}
        />
      </GestureDetector>
    );
  }
);

BottomSheetScrollContainer.displayName = 'BottomSheetScrollContainer';

const styles = StyleSheet.create({
  transparentScrollView: {
    backgroundColor: 'transparent',
  },
  transparentScrollContent: {
    backgroundColor: 'transparent',
  },
});

export default BottomSheetScrollContainer;
