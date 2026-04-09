import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';

import type { FlashListProps, FlashListRef } from '@shopify/flash-list';
import Reanimated from 'react-native-reanimated';

import type { SnapPoints } from '../bottomSheetMotionTypes';
import type { BottomSheetWithFlashListProps } from '../bottomSheetWithFlashListContract';
import { overlaySheetStyles } from '../overlaySheetStyles';
import { RESULTS_BOTTOM_PADDING } from '../../screens/Search/constants/search';
import searchStyles from '../../screens/Search/styles';
import type { OverlayContentSpec, OverlaySheetSnap } from '../types';
import type { BottomSheetRuntimeModel } from '../useBottomSheetRuntime';

type UseSearchPanelSpecOptions<T> = {
  visible: boolean;
  listScrollEnabled: boolean;
  snapPoints: SnapPoints;
  initialSnapPoint: Exclude<OverlaySheetSnap, 'hidden'>;
  runtimeModel?: BottomSheetRuntimeModel;
  onScrollOffsetChange?: (offsetY: number) => void;
  onScrollBeginDrag: () => void;
  onScrollEndDrag: () => void;
  onMomentumBeginJS?: () => void;
  onMomentumEndJS?: () => void;
  onDragStateChange?: (isDragging: boolean) => void;
  onSettleStateChange?: (isSettling: boolean) => void;
  listKey?: string;
  onEndReached?: FlashListProps<T>['onEndReached'];
  scrollIndicatorInsets?: FlashListProps<T>['scrollIndicatorInsets'];
  extraData?: FlashListProps<T>['extraData'];
  secondaryList?: BottomSheetWithFlashListProps<T>['secondaryList'];
  activeList?: BottomSheetWithFlashListProps<T>['activeList'];
  interactionEnabled?: boolean;
  data: ReadonlyArray<T>;
  renderItem: FlashListProps<T>['renderItem'];
  keyExtractor: NonNullable<FlashListProps<T>['keyExtractor']>;
  estimatedItemSize: number;
  getItemType?: FlashListProps<T>['getItemType'];
  overrideItemLayout?: FlashListProps<T>['overrideItemLayout'];
  ListHeaderComponent?: FlashListProps<T>['ListHeaderComponent'];
  ListFooterComponent?: FlashListProps<T>['ListFooterComponent'];
  ListEmptyComponent?: FlashListProps<T>['ListEmptyComponent'];
  ItemSeparatorComponent?: FlashListProps<T>['ItemSeparatorComponent'];
  flashListProps?: BottomSheetWithFlashListProps<T>['flashListProps'];
  headerComponent?: React.ReactNode;
  backgroundComponent?: React.ReactNode;
  overlayComponent?: React.ReactNode;
  contentContainerStyle?: FlashListProps<T>['contentContainerStyle'];
  resultsContainerAnimatedStyle: StyleProp<ViewStyle>;
  listRef?: React.RefObject<FlashListRef<T> | null>;
  onHidden: () => void;
  onSnapStart?: BottomSheetWithFlashListProps<T>['onSnapStart'];
  onSnapChange: (snap: OverlaySheetSnap) => void;
  style?: StyleProp<ViewStyle>;
  surfaceStyle?: StyleProp<ViewStyle>;
};

export const useSearchPanelSpec = <T,>({
  visible: _visible,
  listScrollEnabled,
  snapPoints,
  initialSnapPoint,
  runtimeModel,
  onScrollOffsetChange,
  onScrollBeginDrag,
  onScrollEndDrag,
  onMomentumBeginJS,
  onMomentumEndJS,
  onDragStateChange,
  onSettleStateChange,
  listKey,
  onEndReached,
  scrollIndicatorInsets,
  extraData,
  secondaryList,
  activeList,
  interactionEnabled = true,
  data,
  renderItem,
  keyExtractor,
  estimatedItemSize,
  getItemType,
  overrideItemLayout,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
  ItemSeparatorComponent,
  flashListProps,
  headerComponent,
  backgroundComponent,
  overlayComponent,
  contentContainerStyle,
  resultsContainerAnimatedStyle,
  listRef,
  onHidden,
  onSnapStart,
  onSnapChange,
  style,
  surfaceStyle,
}: UseSearchPanelSpecOptions<T>): OverlayContentSpec<T> => {
  const resolvedFlashListProps = React.useMemo(
    () => ({
      ...flashListProps,
      getItemType,
      overrideItemLayout,
      removeClippedSubviews: flashListProps?.removeClippedSubviews ?? false,
      overrideProps: {
        ...(flashListProps?.overrideProps ?? {}),
      },
    }),
    [flashListProps, getItemType, overrideItemLayout]
  );

  const resolvedContentContainerStyle = React.useMemo(
    () => contentContainerStyle ?? { paddingBottom: RESULTS_BOTTOM_PADDING },
    [contentContainerStyle]
  );
  const resolvedStyle = React.useMemo(() => [overlaySheetStyles.container, style], [style]);
  const resolvedSurfaceStyle = React.useMemo(
    () => surfaceStyle ?? [overlaySheetStyles.surface, searchStyles.resultsSheetSurface],
    [surfaceStyle]
  );
  const underlayComponent = React.useMemo(
    () => (
      <Reanimated.View
        pointerEvents="none"
        style={[searchStyles.resultsShadow, resultsContainerAnimatedStyle]}
      />
    ),
    [resultsContainerAnimatedStyle]
  );

  return React.useMemo(
    () => ({
      overlayKey: 'search',
      surfaceKind: 'list',
      snapPersistenceKey: null,
      snapPoints,
      listScrollEnabled,
      initialSnapPoint,
      runtimeModel,
      preventSwipeDismiss: true,
      onScrollOffsetChange,
      onScrollBeginDrag,
      onScrollEndDrag,
      onMomentumBeginJS,
      onMomentumEndJS,
      onDragStateChange,
      onSettleStateChange,
      listKey,
      onEndReached,
      onEndReachedThreshold: 0,
      showsVerticalScrollIndicator: true,
      scrollIndicatorInsets,
      keyboardShouldPersistTaps: 'handled',
      keyboardDismissMode: 'on-drag',
      bounces: false,
      alwaysBounceVertical: false,
      overScrollMode: 'never',
      testID: 'search-results-flatlist',
      extraData,
      secondaryList,
      activeList,
      data,
      renderItem,
      keyExtractor,
      estimatedItemSize,
      ListHeaderComponent,
      ListFooterComponent,
      ListEmptyComponent,
      ItemSeparatorComponent,
      contentContainerStyle: resolvedContentContainerStyle,
      headerComponent,
      backgroundComponent,
      overlayComponent,
      listRef,
      style: resolvedStyle,
      surfaceStyle: resolvedSurfaceStyle,
      onHidden,
      onSnapStart,
      onSnapChange,
      interactionEnabled,
      flashListProps: resolvedFlashListProps,
      underlayComponent,
    }),
    [
      ItemSeparatorComponent,
      ListEmptyComponent,
      ListFooterComponent,
      ListHeaderComponent,
      data,
      estimatedItemSize,
      extraData,
      secondaryList,
      activeList,
      headerComponent,
      initialSnapPoint,
      interactionEnabled,
      keyExtractor,
      listKey,
      listRef,
      listScrollEnabled,
      onDragStateChange,
      onEndReached,
      onHidden,
      onMomentumBeginJS,
      onMomentumEndJS,
      onScrollBeginDrag,
      onScrollEndDrag,
      onScrollOffsetChange,
      onSettleStateChange,
      onSnapChange,
      onSnapStart,
      overlayComponent,
      backgroundComponent,
      renderItem,
      resolvedContentContainerStyle,
      resolvedFlashListProps,
      resolvedStyle,
      resolvedSurfaceStyle,
      scrollIndicatorInsets,
      snapPoints,
      runtimeModel,
      underlayComponent,
    ]
  );
};
