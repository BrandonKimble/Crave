import React from 'react';

import {
  cancelAnimation,
  Easing,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { clampValue } from './sheetUtils';

export type OverlayHeaderActionMode = 'fixed-close' | 'fixed-plus' | 'follow-collapse';

type UseOverlayHeaderActionControllerOptions = {
  visible: boolean;
  mode: OverlayHeaderActionMode;
  sheetY: SharedValue<number>;
  collapseRange: {
    start: number;
    end: number;
  };
  durationMs?: number;
  progress?: SharedValue<number>;
};

const clamp01 = (value: number): number => {
  'worklet';
  return clampValue(value, 0, 1);
};

const resolveTargetProgress = (
  mode: OverlayHeaderActionMode,
  collapseProgress: number
): number => {
  'worklet';
  switch (mode) {
    case 'fixed-plus':
      return 1;
    case 'follow-collapse':
      return collapseProgress;
    case 'fixed-close':
    default:
      return 0;
  }
};

export const useOverlayHeaderActionController = ({
  visible,
  mode,
  sheetY,
  collapseRange,
  durationMs = 220,
  progress: progressProp,
}: UseOverlayHeaderActionControllerOptions): SharedValue<number> => {
  const visibleSV = useSharedValue(visible ? 1 : 0);
  const modeSV = useSharedValue<OverlayHeaderActionMode>(mode);
  const internalProgress = useSharedValue(0);
  const progress = progressProp ?? internalProgress;
  const overrideActive = useSharedValue(false);

  React.useEffect(() => {
    visibleSV.value = visible ? 1 : 0;
  }, [visible, visibleSV]);

  React.useEffect(() => {
    modeSV.value = mode;
  }, [mode, modeSV]);

  const collapseProgress = useDerivedValue(() => {
    const range = collapseRange.end - collapseRange.start;
    const raw = range !== 0 ? (sheetY.value - collapseRange.start) / range : 0;
    return clamp01(raw);
  }, [collapseRange.end, collapseRange.start, sheetY]);

  useAnimatedReaction(
    () => ({
      visible: visibleSV.value,
      mode: modeSV.value,
      collapse: collapseProgress.value,
    }),
    (next, prev) => {
      if (!next.visible) {
        overrideActive.value = false;
        cancelAnimation(progress);
        return;
      }

      const desired = resolveTargetProgress(next.mode, next.collapse);
      const prevMode = prev?.mode;

      if (prevMode !== undefined && prevMode !== next.mode) {
        const current = progress.value;
        if (Math.abs(current - desired) < 0.001) {
          overrideActive.value = false;
          cancelAnimation(progress);
          progress.value = desired;
          return;
        }
        overrideActive.value = true;
        cancelAnimation(progress);
        progress.value = withTiming(
          desired,
          { duration: durationMs, easing: Easing.out(Easing.cubic) },
          (finished) => {
            'worklet';
            if (finished) {
              overrideActive.value = false;
            }
          }
        );
        return;
      }

      if (!overrideActive.value) {
        progress.value = desired;
      }
    },
    [collapseProgress, durationMs, modeSV, overrideActive, progress, visibleSV]
  );

  return progress;
};
