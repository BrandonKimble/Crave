import type React from 'react';

import type { BottomSheetSnap, BottomSheetSnapChangeSource } from './bottomSheetMotionTypes';

export type BottomSheetSharedSnapChangeOptions = {
  force?: boolean;
};

export type BottomSheetSharedNotifyHidden = () => void;

export type BottomSheetSharedDispatchSnapChange = (
  snapKey: BottomSheetSnap,
  source: BottomSheetSnapChangeSource,
  options?: BottomSheetSharedSnapChangeOptions
) => void;

export type BottomSheetSharedNotifySnapStart = (
  snapKey: Exclude<BottomSheetSnap, 'hidden'>,
  source: BottomSheetSnapChangeSource
) => void;

export type BottomSheetSharedNotifySnapSettleComplete = (settleToken: number) => void;

export type BottomSheetSharedSnapExecutionResult = {
  resolveDestination: (value: number, velocity: number, gestureStartValue: number) => number;
  startSpring: (
    target: number,
    velocity?: number,
    shouldNotifyHidden?: boolean,
    source?: BottomSheetSnapChangeSource,
    settleToken?: number | null
  ) => void;
};

// F974(a): this used to declare THIRTEEN more fields — visible, listScrollEnabled,
// interactionEnabled, shouldEnableScroll, gestureEnabled, activeList, testID, listKey,
// dataCount, secondaryDataCount, scrollHeaderHeight, touchBlockingEnabled and
// isSearchResultsSheet — none of which the implementation ever destructured, while the one
// caller computed and passed all thirteen on EVERY render. They are the fossil of a deleted
// `SheetDiagSnapshot`. Same class F982 landed in the neighbouring publication runtime.
export type BottomSheetSharedSnapPublicationArgs = {
  screenHeight: number;
  sheetYObserver?: import('react-native-reanimated').SharedValue<number>;
  onHidden?: () => void;
  onSnapStart?: (
    snap: BottomSheetSnap,
    meta?: import('./bottomSheetMotionTypes').BottomSheetSnapChangeMeta
  ) => void;
  onSnapChange?: (
    snap: BottomSheetSnap,
    meta?: import('./bottomSheetMotionTypes').BottomSheetSnapChangeMeta
  ) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  onSettleStateChange?: (isSettling: boolean) => void;
  onSnapSettleComplete?: (settleToken: number) => void;
  sheetY: import('react-native-reanimated').SharedValue<number>;
  currentSnapKeyRef: React.MutableRefObject<BottomSheetSnap>;
  isDragging: import('react-native-reanimated').SharedValue<boolean>;
  isSettling: import('react-native-reanimated').SharedValue<boolean>;
  settlingToHidden: import('react-native-reanimated').SharedValue<boolean>;
  setTouchBlockingEnabled: (value: boolean) => void;
};

export type BottomSheetSharedSnapPublicationResult = {
  notifyHidden: BottomSheetSharedNotifyHidden;
  dispatchSnapChange: BottomSheetSharedDispatchSnapChange;
  notifySnapStart: BottomSheetSharedNotifySnapStart;
  notifySnapSettleComplete: BottomSheetSharedNotifySnapSettleComplete;
};
