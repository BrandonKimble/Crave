import React from 'react';
import type { ScrollViewProps } from 'react-native';
import { ScrollView, StyleSheet } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { useSceneFrostCutoutContentLayoutSignal } from './SceneBodyFoundationSurface';
import { SHEET_BODY_NO_OVERSCROLL } from './sheetBodyScrollDefaults';

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);
const AnimatedNativeScrollView = AnimatedScrollView as unknown as React.ComponentType<
  ScrollViewProps & {
    ref?: React.Ref<ScrollView>;
  }
>;

type BottomSheetScrollContainerProps = ScrollViewProps & {
  gesture: React.ComponentProps<typeof GestureDetector>['gesture'];
  transparent?: boolean;
};

const BottomSheetScrollContainer = React.forwardRef<ScrollView, BottomSheetScrollContainerProps>(
  (
    { gesture, transparent = false, style, contentContainerStyle, onContentSizeChange, ...props },
    ref
  ) => {
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
      <GestureDetector gesture={gesture}>
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
          // This is THE single source of truth for it. scrollEnabled stays whatever the caller
          // passes (always-scrollable is decided upstream via shouldEnableScroll) — the pin is
          // about over-scroll, not about whether the list scrolls.
          bounces={SHEET_BODY_NO_OVERSCROLL.bounces}
          alwaysBounceVertical={SHEET_BODY_NO_OVERSCROLL.alwaysBounceVertical}
          overScrollMode={SHEET_BODY_NO_OVERSCROLL.overScrollMode}
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
