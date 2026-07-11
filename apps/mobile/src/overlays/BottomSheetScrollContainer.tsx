import React from 'react';
import type { LayoutChangeEvent, ScrollViewProps } from 'react-native';
import { ScrollView, StyleSheet } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { useSceneFrostCutoutContentLayoutSignal } from './SceneBodyFoundationSurface';
import { BOTTOM_OVERSCROLL_EPSILON_PX, SHEET_BODY_NO_OVERSCROLL } from './sheetBodyScrollDefaults';

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);
const AnimatedNativeScrollView = AnimatedScrollView as unknown as React.ComponentType<
  ScrollViewProps & {
    ref?: React.Ref<ScrollView>;
    animatedProps?: Partial<ScrollViewProps>;
  }
>;

type BottomSheetScrollContainerProps = ScrollViewProps & {
  gesture: React.ComponentProps<typeof GestureDetector>['gesture'];
  transparent?: boolean;
  /**
   * ALWAYS-SCROLLABLE (owner decree 2026-07-11): every sheet page scrolls/bounces even when its
   * content fits the viewport. iOS has no one-sided bounce prop, and the scroll↔sheet DOWN-handoff
   * requires the list to PIN at its top (see SHEET_BODY_NO_OVERSCROLL), so bounce is gated on the
   * UI thread instead of enabled statically:
   *
   *   bounces = alwaysBounceVertical = (finger dragging UP) || (already bottom-overscrolled)
   *
   * - `touchDirection` (+1 up / -1 down / 0 rest, written by the sheet pans' onTouchesMove) is
   *   known from the FIRST touch moves — before any boundary is reached — so a down-drag arriving
   *   at the top always finds bounce OFF and pins there for the sheet handoff. Race-free by
   *   construction: no offset-crossing flip is involved on the down path.
   * - The bottom-overscroll term (offset beyond the content's max legit offset) keeps the rubber
   *   band engaged through release/momentum spring-back and mid-gesture reversals, so flipping
   *   direction while overscrolled never hard-jumps the content.
   * - At rest and on fresh touches direction is 0 → bounce OFF → identical to the legacy
   *   no-overscroll behavior until an up-drag proves itself.
   *
   * When these shared values are absent the container falls back to the static no-overscroll
   * literals (non-sheet/test usage).
   */
  touchDirection?: SharedValue<number>;
  scrollOffset?: SharedValue<number>;
  /** The list's top offset in contentOffset space (= -contentInset.top; 0 for most sheets). */
  scrollTopOffset?: SharedValue<number>;
};

const BottomSheetScrollContainer = React.forwardRef<ScrollView, BottomSheetScrollContainerProps>(
  (
    {
      gesture,
      transparent = false,
      touchDirection,
      scrollOffset,
      scrollTopOffset,
      style,
      contentContainerStyle,
      onLayout,
      onContentSizeChange,
      ...props
    },
    ref
  ) => {
    // Content/frame geometry mirrors for the bounce worklet (bottom-overscroll detection).
    const frameHeightValue = useSharedValue(0);
    const contentHeightValue = useSharedValue(0);
    // FrostCutout re-measure signal: content re-flow (a row above a cutout growing) changes the
    // content size without firing the cutout's own onLayout — this pings the scene's foundation
    // surface to sweep-re-measure its registered holes. No-op outside a foundation surface.
    const notifyCutoutContentLayout = useSceneFrostCutoutContentLayoutSignal();

    const handleLayout = React.useCallback(
      (event: LayoutChangeEvent) => {
        frameHeightValue.value = event.nativeEvent.layout.height;
        onLayout?.(event);
      },
      [frameHeightValue, onLayout]
    );
    const handleContentSizeChange = React.useCallback(
      (width: number, height: number) => {
        contentHeightValue.value = height;
        notifyCutoutContentLayout();
        onContentSizeChange?.(width, height);
      },
      [contentHeightValue, notifyCutoutContentLayout, onContentSizeChange]
    );

    const gatedBounce = touchDirection != null && scrollOffset != null;
    const bounceAnimatedProps = useAnimatedProps(() => {
      if (!gatedBounce) {
        return {
          bounces: SHEET_BODY_NO_OVERSCROLL.bounces,
          alwaysBounceVertical: SHEET_BODY_NO_OVERSCROLL.alwaysBounceVertical,
        };
      }
      const topOffset = scrollTopOffset?.value ?? 0;
      const maxLegitOffset = Math.max(
        topOffset,
        topOffset + contentHeightValue.value - frameHeightValue.value
      );
      const bottomOverscrolled =
        (scrollOffset?.value ?? 0) > maxLegitOffset + BOTTOM_OVERSCROLL_EPSILON_PX;
      const bounce = touchDirection?.value === 1 || bottomOverscrolled;
      return { bounces: bounce, alwaysBounceVertical: bounce };
    }, [gatedBounce, scrollOffset, scrollTopOffset, touchDirection]);

    return (
      <GestureDetector gesture={gesture}>
        <AnimatedNativeScrollView
          {...props}
          ref={ref}
          // STRUCTURAL: the scroll↔sheet handoff (both directions) requires the list to PIN at its
          // TOP boundary — if it rubber-bands there, a continuous down-swipe makes the list slide
          // past the header instead of the sheet grabbing (see SHEET_BODY_NO_OVERSCROLL). Bounce is
          // therefore direction-gated on the UI thread (see `touchDirection` prop doc): OFF at rest
          // and for down-drags (top pin preserved), ON for up-drags / while bottom-overscrolled
          // (always-scrollable feel on short content). Applied AFTER the spread so no per-scene
          // prop can silently re-enable a top bounce and break the handoff. This is THE single
          // source of truth for it. bounces/alwaysBounceVertical are owned EXCLUSIVELY by
          // animatedProps (no static prop shadow — a React commit re-applying a static literal
          // mid-gesture would fight the UI-thread gate).
          overScrollMode={SHEET_BODY_NO_OVERSCROLL.overScrollMode}
          animatedProps={bounceAnimatedProps}
          onLayout={handleLayout}
          onContentSizeChange={handleContentSizeChange}
          style={[style, transparent ? styles.transparentScrollView : null]}
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
