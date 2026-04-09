import React from 'react';
import { ScrollView, View } from 'react-native';
import type { ScrollViewProps, StyleProp, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

export const OverlaySheetScrollView = React.forwardRef<ScrollView, ScrollViewProps>(
  (props, ref) => <AnimatedScrollView {...props} ref={ref} />
);
OverlaySheetScrollView.displayName = 'OverlaySheetScrollView';

type BottomSheetContentSurfaceProps = {
  contentComponent: React.ReactNode;
  shouldEnableScroll: boolean;
  surfaceStyle?: StyleProp<ViewStyle>;
  contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
  primaryAnimatedScrollHandler: ScrollViewProps['onScroll'];
  onScrollBeginDrag?: () => void;
  onScrollEndDrag?: () => void;
  onMomentumBeginJS?: () => void;
  onMomentumEndJS?: () => void;
  showsVerticalScrollIndicator?: boolean;
  keyboardDismissMode?: ScrollViewProps['keyboardDismissMode'];
  bounces?: ScrollViewProps['bounces'];
  alwaysBounceVertical?: ScrollViewProps['alwaysBounceVertical'];
  overScrollMode?: ScrollViewProps['overScrollMode'];
  testID?: string;
  scrollIndicatorInsets?: ScrollViewProps['scrollIndicatorInsets'];
};

export const BottomSheetContentSurface = ({
  contentComponent,
  shouldEnableScroll,
  surfaceStyle,
  contentContainerStyle,
  keyboardShouldPersistTaps,
  primaryAnimatedScrollHandler,
  onScrollBeginDrag,
  onScrollEndDrag,
  onMomentumBeginJS,
  onMomentumEndJS,
  showsVerticalScrollIndicator,
  keyboardDismissMode,
  bounces,
  alwaysBounceVertical,
  overScrollMode,
  testID,
  scrollIndicatorInsets,
}: BottomSheetContentSurfaceProps): React.ReactElement => (
  <View pointerEvents="auto" style={styles.singleListLayer}>
    <OverlaySheetScrollView
      style={surfaceStyle}
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      scrollEnabled={shouldEnableScroll}
      onScroll={primaryAnimatedScrollHandler}
      scrollEventThrottle={16}
      onScrollBeginDrag={onScrollBeginDrag}
      onScrollEndDrag={onScrollEndDrag}
      onMomentumScrollBegin={onMomentumBeginJS}
      onMomentumScrollEnd={onMomentumEndJS}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      keyboardDismissMode={keyboardDismissMode}
      bounces={bounces}
      alwaysBounceVertical={alwaysBounceVertical}
      overScrollMode={overScrollMode}
      testID={testID}
      scrollIndicatorInsets={scrollIndicatorInsets}
    >
      {contentComponent}
    </OverlaySheetScrollView>
  </View>
);

const styles = {
  singleListLayer: {
    flex: 1,
  } satisfies ViewStyle,
};
