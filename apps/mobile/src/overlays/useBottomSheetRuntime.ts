import React from 'react';

import { type SharedValue, useSharedValue } from 'react-native-reanimated';

import type {
  BottomSheetSnap,
  BottomSheetSnapChangeSource,
  BottomSheetMotionCommand,
} from './bottomSheetMotionTypes';

type BottomSheetPresentationState = {
  sheetY: SharedValue<number>;
  scrollOffset: SharedValue<number>;
  momentumFlag: SharedValue<boolean>;
};

type BottomSheetSnapController = {
  motionCommand: SharedValue<BottomSheetMotionCommand | null>;
  requestSnap: (
    snapTo: BottomSheetSnap,
    velocity?: number,
    requestToken?: number | null,
    settleToken?: number | null
  ) => void;
  clearCommand: () => void;
};

export type BottomSheetRuntimeModel = {
  presentationState: {
    sheetY: SharedValue<number>;
    scrollOffset: SharedValue<number>;
    momentumFlag: SharedValue<boolean>;
  };
  snapController: {
    motionCommand: SharedValue<BottomSheetMotionCommand | null>;
    requestSnap: (
      snapTo: BottomSheetSnap,
      velocity?: number,
      requestToken?: number | null,
      settleToken?: number | null
    ) => void;
    clearCommand: () => void;
  };
};

// F969(e), banked re-grep (repo-wide, zero external hits): the PROGRAMMATIC half of this
// module — `BottomSheetProgrammaticRuntimeModel`, `BottomSheetProgrammaticSnapController`,
// `useBottomSheetProgrammaticSnapController`, `useBottomSheetProgrammaticRuntimeModel` and
// the whole `onProgrammaticHidden` / `onProgrammaticSnapSettled` settle protocol — is
// DELETED: ~90 of this file's 272 lines, with no producer and no consumer. The type
// additionally widened three union positions elsewhere (the sheet-host authority
// controller, the surface-state contract and the dead-sheet contract) to admit a model
// nothing could ever construct; those unions are narrowed to `BottomSheetRuntimeModel`.
// Only `useBottomSheetRuntimeModel` was ever built or read.

const useBottomSheetPresentationState = ({
  sheetYOverride,
  scrollOffsetOverride,
  momentumFlagOverride,
  initialSheetY = 0,
  initialScrollOffset = 0,
  initialMomentumFlag = false,
}: {
  sheetYOverride?: SharedValue<number>;
  scrollOffsetOverride?: SharedValue<number>;
  momentumFlagOverride?: SharedValue<boolean>;
  initialSheetY?: number;
  initialScrollOffset?: number;
  initialMomentumFlag?: boolean;
} = {}): BottomSheetPresentationState => {
  const ownedSheetY = useSharedValue(initialSheetY);
  const ownedScrollOffset = useSharedValue(initialScrollOffset);
  const ownedMomentumFlag = useSharedValue(initialMomentumFlag);
  const sheetY = sheetYOverride ?? ownedSheetY;
  const scrollOffset = scrollOffsetOverride ?? ownedScrollOffset;
  const momentumFlag = momentumFlagOverride ?? ownedMomentumFlag;
  return React.useMemo(
    () => ({
      sheetY,
      scrollOffset,
      momentumFlag,
    }),
    [momentumFlag, scrollOffset, sheetY]
  );
};

const useBottomSheetSnapController = ({
  motionCommandOverride,
}: {
  motionCommandOverride?: SharedValue<BottomSheetMotionCommand | null>;
} = {}): BottomSheetSnapController => {
  const ownedMotionCommand = useSharedValue<BottomSheetMotionCommand | null>(null);
  const motionCommand = motionCommandOverride ?? ownedMotionCommand;
  const motionCommandTokenRef = React.useRef(0);

  const requestSnap = React.useCallback(
    (
      snapTo: BottomSheetSnap,
      velocity?: number,
      requestToken?: number | null,
      settleToken?: number | null
    ) => {
      motionCommandTokenRef.current = requestToken ?? motionCommandTokenRef.current + 1;
      motionCommand.value = {
        snapTo,
        token: motionCommandTokenRef.current,
        settleToken: settleToken ?? null,
        velocity,
      };
    },
    [motionCommand]
  );

  const clearCommand = React.useCallback(() => {
    motionCommand.value = null;
  }, [motionCommand]);

  return React.useMemo(
    () => ({
      motionCommand,
      requestSnap,
      clearCommand,
    }),
    [clearCommand, motionCommand, requestSnap]
  );
};

export const useBottomSheetRuntimeModel = ({
  presentationStateOverride,
  snapControllerOverride,
  sheetYOverride,
  scrollOffsetOverride,
  momentumFlagOverride,
  motionCommandOverride,
  initialSheetY,
  initialScrollOffset,
  initialMomentumFlag,
}: {
  presentationStateOverride?: BottomSheetRuntimeModel['presentationState'];
  snapControllerOverride?: BottomSheetRuntimeModel['snapController'];
  sheetYOverride?: SharedValue<number>;
  scrollOffsetOverride?: SharedValue<number>;
  momentumFlagOverride?: SharedValue<boolean>;
  motionCommandOverride?: SharedValue<BottomSheetMotionCommand | null>;
  initialSheetY?: number;
  initialScrollOffset?: number;
  initialMomentumFlag?: boolean;
} = {}): BottomSheetRuntimeModel => {
  const ownedPresentationState = useBottomSheetPresentationState({
    sheetYOverride,
    scrollOffsetOverride,
    momentumFlagOverride,
    initialSheetY,
    initialScrollOffset,
    initialMomentumFlag,
  });
  const ownedSnapController = useBottomSheetSnapController({
    motionCommandOverride,
  });
  const presentationState = presentationStateOverride ?? ownedPresentationState;
  const snapController = snapControllerOverride ?? ownedSnapController;
  return React.useMemo(
    () => ({
      presentationState,
      snapController,
    }),
    [presentationState, snapController]
  );
};
