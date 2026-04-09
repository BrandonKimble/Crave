import React from 'react';
import {
  runOnJS,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

type UseSearchCloseVisualHandoffRuntimeArgs = {
  isCloseTransitionActive: boolean;
  sheetTranslateY: SharedValue<number>;
  collapsedSnap: number;
  notifyCloseCollapsedBoundaryReached: () => void;
};

export const useSearchCloseVisualHandoffRuntime = ({
  isCloseTransitionActive,
  sheetTranslateY,
  collapsedSnap,
  notifyCloseCollapsedBoundaryReached,
}: UseSearchCloseVisualHandoffRuntimeArgs) => {
  const closeVisualHandoffLatch = useSharedValue(0);

  React.useEffect(() => {
    if (!isCloseTransitionActive) {
      closeVisualHandoffLatch.value = 0;
    }
  }, [closeVisualHandoffLatch, isCloseTransitionActive]);

  useAnimatedReaction(
    () => ({
      closeActive: isCloseTransitionActive ? 1 : 0,
      thresholdPassed: sheetTranslateY.value >= collapsedSnap ? 1 : 0,
      latch: closeVisualHandoffLatch.value,
    }),
    (next) => {
      if (next.closeActive !== 1 || next.thresholdPassed !== 1 || next.latch >= 1) {
        return;
      }
      closeVisualHandoffLatch.value = 1;
      runOnJS(notifyCloseCollapsedBoundaryReached)();
    },
    [
      closeVisualHandoffLatch,
      collapsedSnap,
      isCloseTransitionActive,
      notifyCloseCollapsedBoundaryReached,
      sheetTranslateY,
    ]
  );

  const closeVisualHandoffProgress = useDerivedValue(() => {
    if (!isCloseTransitionActive) {
      return 0;
    }
    return closeVisualHandoffLatch.value >= 1 ? 1 : 0;
  }, [closeVisualHandoffLatch, isCloseTransitionActive]);

  return React.useMemo(
    () => ({
      closeVisualHandoffProgress,
    }),
    [closeVisualHandoffProgress]
  );
};
