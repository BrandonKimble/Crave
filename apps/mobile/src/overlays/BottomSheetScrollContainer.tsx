import React from 'react';
import type { ScrollViewProps } from 'react-native';
import { ScrollView, StyleSheet } from 'react-native';
import type { GestureType } from 'react-native-gesture-handler';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';

import { useSceneFrostCutoutContentLayoutSignal } from './SceneBodyFoundationSurface';
import { SHEET_BODY_NO_OVERSCROLL, SHORT_PAGE_SCROLL_ROOM_PX } from './sheetBodyScrollDefaults';

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
          .simultaneousWithExternalGesture(collapsePanGesture),
      [collapsePanGesture, expandPanGesture]
    );

    const scrollEnabledAnimatedProps = useAnimatedProps(() => {
      'worklet';
      return { scrollEnabled: shouldEnableScrollShared.value };
    }, [shouldEnableScrollShared]);

    // MINIMUM SCROLL ROOM (the "make every page a list anyway" law — owner, 2026-07-11):
    // content pads to viewport + SHORT_PAGE_SCROLL_ROOM_PX, so a short page GENUINELY scrolls a
    // little instead of being an immovable brick. That makes the one proven result-sheet handoff
    // cover every page with zero special cases: the up-drag fails the pan into a REAL native
    // scroll mid-finger, the divider fades on a REAL offset, and scroll-to-top hands back to the
    // collapse pan. (This replaced the bespoke "tug" gesture mode, which fought the real
    // machinery and caused the jitter/dead-handoff class — see plans/sheet-scroll-primitive.md.)
    // A no-op for long content (minHeight loses to taller content).
    const [viewportHeight, setViewportHeight] = React.useState(0);
    const handleLayout = React.useCallback(
      (event: Parameters<NonNullable<ScrollViewProps['onLayout']>>[0]) => {
        const nextHeight = Math.round(event.nativeEvent.layout.height);
        setViewportHeight((prev) => (prev === nextHeight ? prev : nextHeight));
        onLayout?.(event);
      },
      [onLayout]
    );
    const minScrollRoomStyle = React.useMemo(
      () => (viewportHeight > 0 ? { minHeight: viewportHeight + SHORT_PAGE_SCROLL_ROOM_PX } : null),
      [viewportHeight]
    );

    // FrostCutout re-measure signal: content re-flow (a row above a cutout growing) changes the
    // content size without firing the cutout's own onLayout — this pings the scene's foundation
    // surface to sweep-re-measure its registered holes. No-op outside a foundation surface.
    const notifyCutoutContentLayout = useSceneFrostCutoutContentLayoutSignal();
    const handleContentSizeChange = React.useCallback(
      (width: number, height: number) => {
        notifyCutoutContentLayout();
        onContentSizeChange?.(width, height);
      },
      [notifyCutoutContentLayout, onContentSizeChange]
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
          style={[style, transparent ? styles.transparentScrollView : null]}
          contentContainerStyle={[
            contentContainerStyle,
            minScrollRoomStyle,
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
