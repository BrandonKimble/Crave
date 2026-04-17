import React from 'react';
import type { ScrollViewProps } from 'react-native';
import { ScrollView, StyleSheet } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

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
