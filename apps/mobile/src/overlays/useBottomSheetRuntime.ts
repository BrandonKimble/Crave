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
  requestSnap: (snapTo: BottomSheetSnap, velocity?: number, requestToken?: number | null) => void;
  clearCommand: () => void;
};

type BottomSheetProgrammaticSnapController = BottomSheetSnapController & {
  handleProgrammaticSnapEvent: (snap: BottomSheetSnap, source: BottomSheetSnapChangeSource) => void;
};

export type BottomSheetRuntimeModel = {
  presentationState: {
    sheetY: SharedValue<number>;
    scrollOffset: SharedValue<number>;
    momentumFlag: SharedValue<boolean>;
  };
  snapController: {
    motionCommand: SharedValue<BottomSheetMotionCommand | null>;
    requestSnap: (snapTo: BottomSheetSnap, velocity?: number, requestToken?: number | null) => void;
    clearCommand: () => void;
  };
};

export type BottomSheetProgrammaticRuntimeModel = {
  presentationState: BottomSheetRuntimeModel['presentationState'];
  snapController: BottomSheetRuntimeModel['snapController'] & {
    handleProgrammaticSnapEvent: (
      snap: BottomSheetSnap,
      source: BottomSheetSnapChangeSource
    ) => void;
  };
};

const useBottomSheetPresentationState = ({
  sheetYOverride,
  scrollOffsetOverride,
  momentumFlagOverride,
}: {
  sheetYOverride?: SharedValue<number>;
  scrollOffsetOverride?: SharedValue<number>;
  momentumFlagOverride?: SharedValue<boolean>;
} = {}): BottomSheetPresentationState => {
  const ownedSheetY = useSharedValue(0);
  const ownedScrollOffset = useSharedValue(0);
  const ownedMomentumFlag = useSharedValue(false);
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
    (snapTo: BottomSheetSnap, velocity?: number, requestToken?: number | null) => {
      motionCommandTokenRef.current = requestToken ?? motionCommandTokenRef.current + 1;
      motionCommand.value = {
        snapTo,
        token: motionCommandTokenRef.current,
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

const useBottomSheetProgrammaticSnapController = ({
  onProgrammaticHidden,
  onProgrammaticSnapSettled,
  motionCommandOverride,
}: {
  onProgrammaticHidden: (requestToken: number | null) => void;
  onProgrammaticSnapSettled?: (
    snap: Exclude<BottomSheetSnap, 'hidden'>,
    requestToken: number | null
  ) => void;
  motionCommandOverride?: SharedValue<BottomSheetMotionCommand | null>;
}): BottomSheetProgrammaticSnapController => {
  const snapController = useBottomSheetSnapController({
    motionCommandOverride,
  });
  const { motionCommand } = snapController;

  const handleProgrammaticSnapEvent = React.useCallback(
    (snap: BottomSheetSnap, source: BottomSheetSnapChangeSource) => {
      if (source !== 'programmatic') {
        return;
      }
      const command = motionCommand.value;
      const requestToken = command?.token ?? null;
      if (snap === 'hidden') {
        motionCommand.value = null;
        onProgrammaticHidden(requestToken);
        return;
      }
      if (!command || command.snapTo !== snap) {
        return;
      }
      motionCommand.value = null;
      onProgrammaticSnapSettled?.(snap, requestToken);
    },
    [motionCommand, onProgrammaticHidden, onProgrammaticSnapSettled]
  );

  return React.useMemo(
    () => ({
      ...snapController,
      handleProgrammaticSnapEvent,
    }),
    [handleProgrammaticSnapEvent, snapController]
  );
};

export const useBottomSheetRuntimeModel = ({
  presentationStateOverride,
  snapControllerOverride,
  sheetYOverride,
  scrollOffsetOverride,
  momentumFlagOverride,
  motionCommandOverride,
}: {
  presentationStateOverride?: BottomSheetRuntimeModel['presentationState'];
  snapControllerOverride?: BottomSheetRuntimeModel['snapController'];
  sheetYOverride?: SharedValue<number>;
  scrollOffsetOverride?: SharedValue<number>;
  momentumFlagOverride?: SharedValue<boolean>;
  motionCommandOverride?: SharedValue<BottomSheetMotionCommand | null>;
} = {}): BottomSheetRuntimeModel => {
  const ownedPresentationState = useBottomSheetPresentationState({
    sheetYOverride,
    scrollOffsetOverride,
    momentumFlagOverride,
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

export const useBottomSheetProgrammaticRuntimeModel = ({
  presentationStateOverride,
  snapControllerOverride,
  sheetYOverride,
  scrollOffsetOverride,
  momentumFlagOverride,
  motionCommandOverride,
  onProgrammaticHidden,
  onProgrammaticSnapSettled,
}: {
  presentationStateOverride?: BottomSheetProgrammaticRuntimeModel['presentationState'];
  snapControllerOverride?: BottomSheetProgrammaticRuntimeModel['snapController'];
  sheetYOverride?: SharedValue<number>;
  scrollOffsetOverride?: SharedValue<number>;
  momentumFlagOverride?: SharedValue<boolean>;
  motionCommandOverride?: SharedValue<BottomSheetMotionCommand | null>;
  onProgrammaticHidden: (requestToken: number | null) => void;
  onProgrammaticSnapSettled?: (
    snap: Exclude<BottomSheetSnap, 'hidden'>,
    requestToken: number | null
  ) => void;
}): BottomSheetProgrammaticRuntimeModel => {
  const ownedPresentationState = useBottomSheetPresentationState({
    sheetYOverride,
    scrollOffsetOverride,
    momentumFlagOverride,
  });
  const ownedSnapController = useBottomSheetProgrammaticSnapController({
    onProgrammaticHidden,
    onProgrammaticSnapSettled,
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
