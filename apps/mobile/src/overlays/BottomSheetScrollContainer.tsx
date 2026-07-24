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

import { useBottomSheetSceneStackBodyIsActive } from './BottomSheetSceneStackBodyActivityContext';
import { useSceneFrostCutoutContentLayoutSignal } from './SceneBodyFoundationSurface';
import { useShellLiveness } from './ShellVisibilityBoundary';
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
  /** THE SHORT-PAGE FACT (law §5 addendum): boundary facts published from layout by
   *  THE LIVE LEG'S container only — gated per-leg (shell liveness + body isActive),
   *  never by the host-level flag that let hidden legs clobber (red-team round). */
  maxScrollOffset: SharedValue<number>;
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
    // THE SHORT-PAGE FACT (law §5 addendum): layout-time boundary publication returns,
    // but gated PER-LEG — this container publishes only while its leg is the live one
    // (shell liveness bit + the stack body's isActive primitive; both false for hidden
    // co-mounted legs, which is exactly what the clobbered round lacked). A short page
    // thereby gets a TRUSTED max=0 (viewport known, content known) and the bottom band
    // covers it; a long unscrolled list gets its real max before any scroll event.
    // Bespoke non-stack bodies (isActive defaults false) never publish — their band is
    // a recorded deferral, never a guess.
    const shellLive = useShellLiveness();
    const bodyIsActive = useBottomSheetSceneStackBodyIsActive();
    const isLiveLegSurface = shellLive && bodyIsActive;
    const isLiveLegSurfaceRef = React.useRef(isLiveLegSurface);
    isLiveLegSurfaceRef.current = isLiveLegSurface;
    const viewportHeightRef = React.useRef(0);
    const contentHeightRef = React.useRef(0);
    const publishBoundaryFacts = React.useCallback(() => {
      if (
        !isLiveLegSurfaceRef.current ||
        viewportHeightRef.current <= 0 ||
        contentHeightRef.current <= 0
      ) {
        return;
      }
      maxScrollOffset.value = Math.max(0, contentHeightRef.current - viewportHeightRef.current);
      scrollViewportHeight.value = viewportHeightRef.current;
    }, [maxScrollOffset, scrollViewportHeight]);
    const handleLayout = React.useCallback(
      (event: Parameters<NonNullable<ScrollViewProps['onLayout']>>[0]) => {
        viewportHeightRef.current = event.nativeEvent.layout.height;
        publishBoundaryFacts();
        onLayout?.(event);
      },
      [onLayout, publishBoundaryFacts]
    );
    React.useEffect(() => {
      // Become-live edge (leg presented after mounting hidden): publish the held facts.
      if (isLiveLegSurface) {
        publishBoundaryFacts();
      }
    }, [isLiveLegSurface, publishBoundaryFacts]);

    // FrostCutout re-measure signal: content re-flow (a row above a cutout growing) changes the
    // content size without firing the cutout's own onLayout — this pings the scene's foundation
    // surface to sweep-re-measure its registered holes. No-op outside a foundation surface.
    const notifyCutoutContentLayout = useSceneFrostCutoutContentLayoutSignal();
    const handleContentSizeChange = React.useCallback(
      (width: number, height: number) => {
        contentHeightRef.current = height;
        publishBoundaryFacts();
        notifyCutoutContentLayout();
        onContentSizeChange?.(width, height);
      },
      [notifyCutoutContentLayout, onContentSizeChange, publishBoundaryFacts]
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
