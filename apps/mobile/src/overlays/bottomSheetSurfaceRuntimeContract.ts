import type { RefObject } from 'react';
import type { FlashListRef } from '@shopify/flash-list';
import type { SharedValue } from 'react-native-reanimated';

import type {
  BottomSheetWithFlashListContentOnlyProps,
  BottomSheetWithFlashListListProps,
  BottomSheetWithFlashListProps,
  DualListSelection,
} from './bottomSheetWithFlashListContract';

export type UseBottomSheetSurfaceRuntimeArgs<T> = {
  visible: boolean;
  listScrollEnabled: boolean;
  interactionEnabled: boolean;
  activeList: DualListSelection;
  contentContainerStyle: BottomSheetWithFlashListProps<T>['contentContainerStyle'];
  flashListProps: BottomSheetWithFlashListProps<T>['flashListProps'];
  onScrollBeginDrag?: BottomSheetWithFlashListProps<T>['onScrollBeginDrag'];
  onScrollEndDrag?: BottomSheetWithFlashListProps<T>['onScrollEndDrag'];
  onScrollOffsetChange?: BottomSheetWithFlashListProps<T>['onScrollOffsetChange'];
  scrollOffset: SharedValue<number>;
  surfaceProps: Omit<
    BottomSheetWithFlashListProps<T>,
    | 'nativeHostKey'
    | 'visible'
    | 'listScrollEnabled'
    | 'snapPoints'
    | 'initialSnapPoint'
    | 'preservePositionOnSnapPointsChange'
    | 'headerComponent'
    | 'backgroundComponent'
    | 'overlayComponent'
    | 'contentContainerStyle'
    | 'keyboardShouldPersistTaps'
    | 'scrollIndicatorInsets'
    | 'onHidden'
    | 'onSnapStart'
    | 'onSnapChange'
    | 'onScrollOffsetChange'
    | 'onScrollBeginDrag'
    | 'onScrollEndDrag'
    | 'onMomentumBeginJS'
    | 'onMomentumEndJS'
    | 'onEndReached'
    | 'onEndReachedThreshold'
    | 'showsVerticalScrollIndicator'
    | 'keyboardDismissMode'
    | 'bounces'
    | 'alwaysBounceVertical'
    | 'overScrollMode'
    | 'testID'
    | 'activeList'
    | 'onDragStateChange'
    | 'onSettleStateChange'
    | 'runtimeModel'
    | 'dismissThreshold'
    | 'preventSwipeDismiss'
    | 'interactionEnabled'
    | 'animateOnMount'
    | 'flashListProps'
    | 'style'
    | 'surfaceStyle'
    | 'shadowStyle'
    | 'contentSurfaceStyle'
  >;
};

export type BottomSheetSurfaceRefsRuntime<T> = {
  listProps: BottomSheetWithFlashListListProps<T> | null;
  contentProps: BottomSheetWithFlashListContentOnlyProps | null;
  flashListRef: RefObject<FlashListRef<T> | null>;
  secondaryFlashListRef: RefObject<FlashListRef<T> | null>;
  shouldRenderDualLists: boolean;
  resolvedActiveList: DualListSelection;
};
