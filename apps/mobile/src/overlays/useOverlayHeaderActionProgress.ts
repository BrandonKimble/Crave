import React from 'react';

import {
  cancelAnimation,
  useAnimatedReaction,
  useSharedValue,
  runOnJS,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { clampValue } from './sheetUtils';

type HeaderActionHandoff = {
  enabled: boolean;
  key: string;
  from: number;
  durationMs?: number;
  minTarget?: number;
  maxTarget?: number;
};

type UseOverlayHeaderActionProgressOptions = {
  visible: boolean;
  sheetY: SharedValue<number>;
  progressRange: {
    start: number;
    end: number;
  };
  handoff?: HeaderActionHandoff;
  debugLabel?: string;
  debug?: boolean;
};

const clamp01 = (value: number): number => {
  'worklet';
  return clampValue(value, 0, 1);
};

export const useOverlayHeaderActionProgress = ({
  visible,
  sheetY,
  progressRange,
  handoff,
  debugLabel,
  debug = false,
}: UseOverlayHeaderActionProgressOptions): SharedValue<number> => {
  const progress = useSharedValue(0);
  const overrideActive = useSharedValue(true);
  const lastHandoffKeyRef = React.useRef<string | null>(null);
  const debugEnabled = __DEV__ && debug;
  const label = debugLabel ?? 'overlay';

  const debugLog = React.useCallback(
    (message: string, payload?: Record<string, unknown>) => {
      if (!debugEnabled) {
        return;
      }
      // eslint-disable-next-line no-console
      console.log(`[OverlayHeaderAction] ${label} ${message}`, payload ?? {});
    },
    [debugEnabled, label]
  );

  useAnimatedReaction(
    () => {
      const range = progressRange.end - progressRange.start;
      const raw = range !== 0 ? (sheetY.value - progressRange.start) / range : 0;
      return clamp01(raw);
    },
    (nextProgress) => {
      if (overrideActive.value) {
        return;
      }
      progress.value = nextProgress;
    },
    [overrideActive, progress, progressRange.end, progressRange.start, sheetY]
  );

  React.useEffect(() => {
    if (!visible) {
      overrideActive.value = true;
      cancelAnimation(progress);
      debugLog('hide->cancel');
      return;
    }

    const range = progressRange.end - progressRange.start;
    const raw = range !== 0 ? (sheetY.value - progressRange.start) / range : 0;
    const target = Math.min(Math.max(raw, 0), 1);

    const shouldHandoff = Boolean(handoff?.enabled);
    if (shouldHandoff) {
      const nextKey = handoff?.key ?? 'handoff';
      if (lastHandoffKeyRef.current === nextKey) {
        debugLog('handoff key repeat->sync', { key: nextKey, target });
        overrideActive.value = true;
        cancelAnimation(progress);
        progress.value = target;
        overrideActive.value = false;
        return;
      }
      const minTarget = handoff?.minTarget ?? 0;
      const maxTarget = handoff?.maxTarget ?? 1;
      if (target < minTarget || target > maxTarget) {
        debugLog('handoff skip (target out of range)', { key: nextKey, target, minTarget, maxTarget });
        lastHandoffKeyRef.current = null;
        overrideActive.value = true;
        cancelAnimation(progress);
        progress.value = target;
        overrideActive.value = false;
        return;
      }
      lastHandoffKeyRef.current = nextKey;
      overrideActive.value = true;
      cancelAnimation(progress);
      progress.value = handoff?.from ?? 0;
      debugLog('handoff start', {
        key: nextKey,
        from: handoff?.from ?? 0,
        target,
        minTarget,
        maxTarget,
        sheetY: sheetY.value,
        rangeStart: progressRange.start,
        rangeEnd: progressRange.end,
      });
      progress.value = withTiming(
        target,
        { duration: handoff?.durationMs ?? 220 },
        (finished) => {
          'worklet';
          if (debugEnabled) {
            runOnJS(debugLog)('handoff end', { key: nextKey, finished });
          }
          if (finished) {
            overrideActive.value = false;
          }
        }
      );
      return;
    }

    lastHandoffKeyRef.current = null;
    overrideActive.value = true;
    cancelAnimation(progress);
    progress.value = target;
    overrideActive.value = false;
    debugLog('sync target', {
      target,
      sheetY: sheetY.value,
      rangeStart: progressRange.start,
      rangeEnd: progressRange.end,
    });
  }, [
    handoff?.durationMs,
    handoff?.enabled,
    handoff?.from,
    handoff?.key,
    debugEnabled,
    debugLog,
    overrideActive,
    progress,
    progressRange.end,
    progressRange.start,
    sheetY,
    visible,
  ]);

  return progress;
};
