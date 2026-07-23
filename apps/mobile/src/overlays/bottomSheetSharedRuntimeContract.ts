import type React from 'react';
import type {
  LayoutChangeEvent,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  ViewStyle,
} from 'react-native';

import type { FlashListProps } from '@shopify/flash-list';
import { Gesture } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';

import type {
  BottomSheetMotionCommand,
  BottomSheetSnap,
  BottomSheetSnapChangeMeta,
  BottomSheetSnapPoint,
  BottomSheetSnapPoints,
} from './bottomSheetMotionTypes';
import type { BottomSheetSharedTouchBlockingAuthority } from './bottomSheetSharedPublicationController';

export type BottomSheetSharedRuntimeProps = {
  visible: boolean;
  listScrollEnabled?: boolean;
  snapPoints: BottomSheetSnapPoints;
  initialSnapPoint?: BottomSheetSnapPoint;
  preservePositionOnSnapPointsChange?: boolean;
  scrollHeaderComponent?: React.ReactNode;
  onHidden?: () => void;
  onSnapStart?: (snap: BottomSheetSnap, meta?: BottomSheetSnapChangeMeta) => void;
  onSnapChange?: (snap: BottomSheetSnap, meta?: BottomSheetSnapChangeMeta) => void;
  onScrollOffsetChange?: (offsetY: number) => void;
  onMomentumBeginJS?: () => void;
  onMomentumEndJS?: () => void;
  showsVerticalScrollIndicator?: boolean;
  dynamicScrollIndicator?: boolean;
  testID?: string;
  activeList?: 'primary' | 'secondary';
  onDragStateChange?: (isDragging: boolean) => void;
  onSettleStateChange?: (isSettling: boolean) => void;
  onSnapSettleComplete?: (settleToken: number) => void;
  motionCommandValue?: SharedValue<BottomSheetMotionCommand | null>;
  dismissThreshold?: number;
  preventSwipeDismiss?: boolean;
  interactionEnabled?: boolean;
  animateOnMount?: boolean;
  sheetYValue?: SharedValue<number>;
  sheetYObserver?: SharedValue<number>;
  scrollOffsetValue?: SharedValue<number>;
  momentumFlag?: SharedValue<boolean>;
  listKey?: string;
  dataCount: number;
  secondaryDataCount: number;
  runtimeConfigAuthority?: BottomSheetSharedRuntimeConfigAuthority;
  subscribeTouchBlockingToReact?: boolean;
};

export type BottomSheetSharedRuntimeConfigSnapshot = {
  visible: boolean;
  listScrollEnabled: boolean;
  snapPoints: BottomSheetSnapPoints;
  initialSnapPoint: BottomSheetSnapPoint;
  dismissThreshold?: number;
  preventSwipeDismiss: boolean;
  interactionEnabled: boolean;
};

export type BottomSheetSharedRuntimeConfigAuthority = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => BottomSheetSharedRuntimeConfigSnapshot;
  registerSharedValues?: (values: BottomSheetSharedRuntimeConfigSharedValues) => () => void;
};

export type BottomSheetSharedRuntimeConfigSharedValues = {
  visible: SharedValue<boolean>;
  listScrollEnabled: SharedValue<boolean>;
  interactionEnabled: SharedValue<boolean>;
  gestureEnabled: SharedValue<number>;
  shouldEnableScroll: SharedValue<boolean>;
  preventSwipeDismiss: SharedValue<boolean>;
  dismissThreshold: SharedValue<number | null>;
  expandedSnap: SharedValue<number>;
  middleSnap: SharedValue<number>;
  collapsedSnap: SharedValue<number>;
  hiddenSnap: SharedValue<number>;
  hasHiddenSnap: SharedValue<boolean>;
  initialSnapValue: SharedValue<number>;
  hiddenOrCollapsed: SharedValue<number>;
};

export type BottomSheetSharedGestureRuntime = {
  gestures: {
    sheet: ReturnType<typeof Gesture.Simultaneous>;
    // The two pans, exposed so BottomSheetScrollContainer can mint a PER-INSTANCE native scroll
    // gesture with native-side relations (requireExternalGestureToFail(expandPan) +
    // simultaneousWithExternalGesture(collapsePan)) — RNGH OR's relation declarations across the
    // pair, so any number of co-mounted scroll containers arbitrate correctly.
    expandPan: ReturnType<typeof Gesture.Pan>;
    collapsePan: ReturnType<typeof Gesture.Pan>;
  };
  touchBlockingEnabled: boolean;
  touchBlockingAuthority: BottomSheetSharedTouchBlockingAuthority;
};

export type BottomSheetSharedScrollRuntime = {
  ScrollComponent: React.ComponentType<ScrollViewProps & React.RefAttributes<ScrollView>>;
  shouldEnableScroll: boolean;
  // UI-thread mirror of shouldEnableScroll. Applied to the REAL ScrollView inside
  // BottomSheetScrollContainer (the single scrollEnabled authority); exposed for non-render readers.
  shouldEnableScrollShared: SharedValue<boolean>;
  effectiveShowsVerticalScrollIndicator: boolean;
  scrollHeaderHeight: number;
  scrollOffset: SharedValue<number>;
  /** Boundary-physics law §1: runtime-owned overscroll (<0 top / >0 bottom / 0 inside). */
  contentOverscroll: SharedValue<number>;
  onHeaderLayout: (event: LayoutChangeEvent) => void;
  onScrollHeaderLayout: (event: LayoutChangeEvent) => void;
  primaryListOnScroll: FlashListProps<unknown>['onScroll'];
  secondaryListOnScroll: FlashListProps<unknown>['onScroll'];
  primaryScrollViewOnScroll: ScrollViewProps['onScroll'];
};

export type BottomSheetSharedSurfaceRuntime = {
  sheetHeightStyle: {
    height: number;
  };
  animatedSheetStyle: StyleProp<ViewStyle>;
  scrollHeaderSyncStyle: StyleProp<ViewStyle>;
  // Full-screen top-radius morph (settings full-snap): borderTopLeft/RightRadius 22→0 as
  // the sheet's top edge approaches y=0; inert (constant 22) for every ordinary scene.
};

export type BottomSheetSharedRuntimeResult = {
  gestureRuntime: BottomSheetSharedGestureRuntime;
  scrollRuntime: BottomSheetSharedScrollRuntime;
  surfaceRuntime: BottomSheetSharedSurfaceRuntime;
};

export type SheetDiagSnapshot = {
  visible: boolean;
  listScrollEnabled: boolean;
  interactionEnabled: boolean;
  shouldEnableScroll: boolean;
  gestureEnabled: boolean;
  activeList: 'primary' | 'secondary';
  currentSnapKey: BottomSheetSnap;
  dataCount: number;
  secondaryDataCount: number;
  touchBlockingEnabled: boolean;
  scrollHeaderHeight: number;
};
