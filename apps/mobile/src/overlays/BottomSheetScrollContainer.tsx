import React from 'react';
import type { ScrollViewProps } from 'react-native';
import { ScrollView, StyleSheet } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

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
  ({ gesture, transparent = false, style, contentContainerStyle, ...props }, ref) => (
    <GestureDetector gesture={gesture}>
      <AnimatedNativeScrollView
        {...props}
        ref={ref}
        // STRUCTURAL: the bottom-sheet scroll container NEVER over-scrolls. Every sheet body's
        // native scroll renders through here, and the scroll↔sheet handoff (both directions)
        // requires the list to PIN at its boundaries — if it rubber-bands at the top, a continuous
        // down-swipe makes the list slide past the header instead of the sheet grabbing (see
        // SHEET_BODY_NO_OVERSCROLL). Applied AFTER the spread so no per-scene prop can silently
        // re-enable bounce and break the handoff. This is THE single source of truth for it.
        bounces={SHEET_BODY_NO_OVERSCROLL.bounces}
        alwaysBounceVertical={SHEET_BODY_NO_OVERSCROLL.alwaysBounceVertical}
        overScrollMode={SHEET_BODY_NO_OVERSCROLL.overScrollMode}
        style={[style, transparent ? styles.transparentScrollView : null]}
        contentContainerStyle={[
          contentContainerStyle,
          transparent ? styles.transparentScrollContent : null,
        ]}
      />
    </GestureDetector>
  )
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
