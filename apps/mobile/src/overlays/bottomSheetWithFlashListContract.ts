import type React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import type { FlashListProps, FlashListRef } from '@shopify/flash-list';

import type {
  BottomSheetSnap as SheetSnap,
  BottomSheetSnapChangeMeta as SnapChangeMeta,
  BottomSheetSnapPoint as SheetSnapPoint,
  BottomSheetSnapPoints as SnapPoints,
} from './bottomSheetMotionTypes';
import type {
  BottomSheetProgrammaticRuntimeModel,
  BottomSheetRuntimeModel,
} from './useBottomSheetRuntime';

export type DualListSelection = 'primary' | 'secondary';

export type SecondaryListSpec<T> = {
  data: ReadonlyArray<T>;
  listKey?: string;
  listRef?: React.RefObject<FlashListRef<T> | null>;
  extraData?: FlashListProps<T>['extraData'];
  onEndReached?: FlashListProps<T>['onEndReached'];
  scrollIndicatorInsets?: FlashListProps<T>['scrollIndicatorInsets'];
  testID?: string;
};

type BottomSheetWithFlashListBaseProps<T> = {
  nativeHostKey?: string;
  visible: boolean;
  listScrollEnabled?: boolean;
  snapPoints: SnapPoints;
  initialSnapPoint?: SheetSnapPoint;
  preservePositionOnSnapPointsChange?: boolean;
  headerComponent?: React.ReactNode;
  backgroundComponent?: React.ReactNode;
  overlayComponent?: React.ReactNode;
  contentContainerStyle?: FlashListProps<T>['contentContainerStyle'];
  keyboardShouldPersistTaps?: FlashListProps<T>['keyboardShouldPersistTaps'];
  scrollIndicatorInsets?: FlashListProps<T>['scrollIndicatorInsets'];
  onHidden?: () => void;
  onSnapStart?: (snap: SheetSnap, meta?: SnapChangeMeta) => void;
  onSnapChange?: (snap: SheetSnap, meta?: SnapChangeMeta) => void;
  onScrollOffsetChange?: (offsetY: number) => void;
  onScrollBeginDrag?: () => void;
  onScrollEndDrag?: () => void;
  onMomentumBeginJS?: () => void;
  onMomentumEndJS?: () => void;
  onEndReached?: FlashListProps<T>['onEndReached'];
  onEndReachedThreshold?: FlashListProps<T>['onEndReachedThreshold'];
  showsVerticalScrollIndicator?: boolean;
  keyboardDismissMode?: FlashListProps<T>['keyboardDismissMode'];
  bounces?: boolean;
  alwaysBounceVertical?: boolean;
  overScrollMode?: FlashListProps<T>['overScrollMode'];
  testID?: string;
  activeList?: DualListSelection;
  onDragStateChange?: (isDragging: boolean) => void;
  onSettleStateChange?: (isSettling: boolean) => void;
  runtimeModel?: BottomSheetRuntimeModel | BottomSheetProgrammaticRuntimeModel;
  dismissThreshold?: number;
  preventSwipeDismiss?: boolean;
  interactionEnabled?: boolean;
  animateOnMount?: boolean;
  flashListProps?: Partial<
    Omit<
      FlashListProps<T>,
      | 'data'
      | 'renderItem'
      | 'estimatedItemSize'
      | 'onScroll'
      | 'onMomentumScrollBegin'
      | 'onMomentumScrollEnd'
      | 'scrollEnabled'
      | 'ListHeaderComponent'
      | 'ListFooterComponent'
      | 'ListEmptyComponent'
      | 'ItemSeparatorComponent'
      | 'contentContainerStyle'
      | 'keyboardShouldPersistTaps'
      | 'keyExtractor'
    >
  >;
  style?: StyleProp<ViewStyle>;
  surfaceStyle?: StyleProp<ViewStyle>;
  shadowStyle?: StyleProp<ViewStyle>;
  contentSurfaceStyle?: StyleProp<ViewStyle>;
};

export type BottomSheetWithFlashListListProps<T> = {
  surfaceKind: 'list';
  data: ReadonlyArray<T>;
  renderItem: FlashListProps<T>['renderItem'];
  keyExtractor?: FlashListProps<T>['keyExtractor'];
  estimatedItemSize: number;
  listRef?: React.RefObject<FlashListRef<T> | null>;
  ListHeaderComponent?: FlashListProps<T>['ListHeaderComponent'];
  ListFooterComponent?: FlashListProps<T>['ListFooterComponent'];
  ListEmptyComponent?: FlashListProps<T>['ListEmptyComponent'];
  ItemSeparatorComponent?: FlashListProps<T>['ItemSeparatorComponent'];
  extraData?: FlashListProps<T>['extraData'];
  secondaryList?: SecondaryListSpec<T>;
  listKey?: string;
  onEndReached?: FlashListProps<T>['onEndReached'];
  onEndReachedThreshold?: FlashListProps<T>['onEndReachedThreshold'];
};

export type BottomSheetWithFlashListContentOnlyProps = {
  surfaceKind: 'content';
  contentComponent: React.ReactNode;
  data?: never;
  renderItem?: never;
  keyExtractor?: never;
  estimatedItemSize?: never;
  listRef?: never;
  ListHeaderComponent?: never;
  ListFooterComponent?: never;
  ListEmptyComponent?: never;
  ItemSeparatorComponent?: never;
  extraData?: never;
  secondaryList?: never;
  listKey?: never;
  onEndReached?: never;
  onEndReachedThreshold?: never;
};

export type BottomSheetWithFlashListProps<T> = BottomSheetWithFlashListBaseProps<T> &
  (BottomSheetWithFlashListListProps<T> | BottomSheetWithFlashListContentOnlyProps);

export const isBottomSheetListSurface = <T>(
  props:
    | BottomSheetWithFlashListListProps<T>
    | BottomSheetWithFlashListContentOnlyProps
    | BottomSheetWithFlashListProps<T>
): props is BottomSheetWithFlashListListProps<T> => props.surfaceKind === 'list';
