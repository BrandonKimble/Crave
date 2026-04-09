import React from 'react';

import { cancelAnimation, runOnUI, withSpring } from 'react-native-reanimated';

import type { BottomSheetSnapChangeSource } from './bottomSheetMotionTypes';
import { SHEET_SPRING_CONFIG } from './sheetUtils';
import type {
  BottomSheetNativeEventRuntimeArgs,
  BottomSheetNativeSnapEvent,
} from './bottomSheetNativeEventRuntimeContract';

type UseBottomSheetNativeSnapEventRuntimeArgs = Pick<
  BottomSheetNativeEventRuntimeArgs,
  'resolveSnapTargetY' | 'onHidden' | 'onSnapStart' | 'onSnapChange'
> & {
  sheetY: BottomSheetNativeEventRuntimeArgs['runtime']['presentationState']['sheetY'];
  handleProgrammaticSnapEvent?: (
    snap: BottomSheetNativeSnapEvent['snap'],
    source: BottomSheetNativeSnapEvent['source']
  ) => void;
  handleSnapStartVisibility: (snap: BottomSheetNativeSnapEvent['snap']) => void;
  handleSnapChangeVisibility: (
    snap: BottomSheetNativeSnapEvent['snap']
  ) => BottomSheetNativeSnapEvent['snap'];
};

export const useBottomSheetNativeSnapEventRuntime = ({
  resolveSnapTargetY,
  onHidden,
  onSnapStart,
  onSnapChange,
  sheetY,
  handleProgrammaticSnapEvent,
  handleSnapStartVisibility,
  handleSnapChangeVisibility,
}: UseBottomSheetNativeSnapEventRuntimeArgs) => {
  const handleSnapStartEvent = React.useCallback(
    (snap: BottomSheetNativeSnapEvent['snap'], source: BottomSheetNativeSnapEvent['source']) => {
      handleSnapStartVisibility(snap);
      const targetY = resolveSnapTargetY?.(snap);
      if (targetY !== undefined) {
        runOnUI((nextTargetY: number, nextSource: BottomSheetSnapChangeSource) => {
          'worklet';
          cancelAnimation(sheetY);
          sheetY.value = withSpring(nextTargetY, {
            ...SHEET_SPRING_CONFIG,
            overshootClamping: nextSource !== 'gesture',
            velocity: 0,
          });
        })(targetY, source);
      }
      onSnapStart?.({ snap, source });
    },
    [handleSnapStartVisibility, onSnapStart, resolveSnapTargetY, sheetY]
  );

  const handleSnapChangeEvent = React.useCallback(
    (snap: BottomSheetNativeSnapEvent['snap'], source: BottomSheetNativeSnapEvent['source']) => {
      const previousSnap = handleSnapChangeVisibility(snap);
      handleProgrammaticSnapEvent?.(snap, source);
      if (source === 'programmatic' || previousSnap !== snap) {
        onSnapChange?.({ snap, source });
      }
      if (snap === 'hidden' && previousSnap !== 'hidden') {
        onHidden?.();
      }
    },
    [handleProgrammaticSnapEvent, handleSnapChangeVisibility, onHidden, onSnapChange]
  );

  return React.useMemo(
    () => ({
      handleSnapStartEvent,
      handleSnapChangeEvent,
    }),
    [handleSnapChangeEvent, handleSnapStartEvent]
  );
};
