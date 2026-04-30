import type React from 'react';

import type {
  BottomSheetSnap,
  BottomSheetSnapChangeSource,
} from './bottomSheetMotionTypes';

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

export type BottomSheetSharedNotifySnapSettleComplete = (
  settleToken: number
) => void;

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

export type BottomSheetSharedSnapPublicationArgs = {
  visible: boolean;
  listScrollEnabled: boolean;
  interactionEnabled: boolean;
  shouldEnableScroll: boolean;
  gestureEnabled: boolean;
  activeList: 'primary' | 'secondary';
  screenHeight: number;
  testID?: string;
  listKey?: string;
  dataCount: number;
  secondaryDataCount: number;
  scrollHeaderHeight: number;
  touchBlockingEnabled: boolean;
  isSearchResultsSheet: boolean;
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
