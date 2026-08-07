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
  scrollHeaderComponent?: React.ReactNode;
  onHidden?: () => void;
  onSnapStart?: (snap: BottomSheetSnap, meta?: BottomSheetSnapChangeMeta) => void;
  onSnapChange?: (snap: BottomSheetSnap, meta?: BottomSheetSnapChangeMeta) => void;
  onScrollOffsetChange?: (offsetY: number) => void;
  onMomentumBeginJS?: () => void;
  onMomentumEndJS?: () => void;
  showsVerticalScrollIndicator?: boolean;
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
  // F2407 + F9301: a `dataCount`/`secondaryDataCount` pair once lived here, required, so the
  // runtime could decide "is there a secondary list to activate". No scene ever set
  // activeList:'secondary' and the sole producer hardcoded 0, so the decision was always
  // 'primary'. Both the field and the `activeList` prop are gone — the dead secondary-list
  // branch is now unrepresentable (useBottomSheetSharedRuntime.tsx: resolvedActiveList is
  // 'primary' by construction).
  runtimeConfigAuthority?: BottomSheetSharedRuntimeConfigAuthority;
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
    // The arbitration pair, exposed so BottomSheetScrollContainer can mint a PER-INSTANCE
    // native scroll gesture with native-side relations (requireExternalGestureToFail(expandPan) +
    // simultaneousWithExternalGesture(collapsePan)) — RNGH OR's relation declarations across the
    // pair, so any number of co-mounted scroll containers arbitrate correctly.
    expandPan: ReturnType<typeof Gesture.Pan>;
    collapsePan: ReturnType<typeof Gesture.Pan>;
    /**
     * The THIRD pan, and the one carrying boundary-physics law §3 (bottom overscroll +
     * rubber band + rebound). It was returned by the runtime and consumed by
     * useBottomSheetSharedRuntime for a long time while this contract declared only two
     * (F4502) — the read compiled against the hook's inferred type, before the narrowing.
     * The runtime's return is annotated with this type now, so the count cannot drift again.
     */
    overscrollPan: ReturnType<typeof Gesture.Pan>;
  };
  touchBlockingEnabled: boolean;
  touchBlockingAuthority: BottomSheetSharedTouchBlockingAuthority;
};

export type BottomSheetSharedScrollRuntime = {
  ScrollComponent: React.ComponentType<ScrollViewProps & React.RefAttributes<ScrollView>>;
  /**
   * THE scrollEnabled AUTHORITY, and the only one (F4504). A JS `shouldEnableScroll`
   * boolean used to ride alongside this SharedValue — the OLD authority, superseded by
   * the 2026-07-02 frame-drop fix and never removed. It was minted, threaded through
   * the scene-stack assembly, listed in that memo's dependency array (which is what
   * re-minted the runtime on every page switch), and then deliberately IGNORED by the
   * comparator to absorb the churn its own presence caused. It had no sinks at all.
   * Applied to the REAL ScrollView inside BottomSheetScrollContainer.
   */
  shouldEnableScrollShared: SharedValue<boolean>;
  effectiveShowsVerticalScrollIndicator: boolean;
  scrollHeaderHeight: number;
  scrollOffset: SharedValue<number>;
  /** Boundary-physics law §1: runtime-owned overscroll (<0 top / >0 bottom / 0 inside). */
  contentOverscroll: SharedValue<number>;
  /** Red team 2: the presented scene's projected boundary facts. */
  maxScrollOffset: SharedValue<number>;
  scrollViewportHeight: SharedValue<number>;
  boundaryFactsKnown: SharedValue<boolean>;
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

// F974(a): `SheetDiagSnapshot` lived here with ZERO consumers — the deleted diagnostic
// whose ghost kept thirteen arguments alive in BottomSheetSharedSnapPublicationArgs. The
// args are gone; so is the type that explained them.
