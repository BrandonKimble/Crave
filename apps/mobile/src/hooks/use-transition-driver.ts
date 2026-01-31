import React from 'react';
import {
  EasingFunction,
  runOnJS,
  type SharedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

type TransitionDriverOptions = {
  enabled: boolean;
  target: 0 | 1;
  getDurationMs: (target: 0 | 1) => number;
  getEasing?: (target: 0 | 1) => EasingFunction;
  getDelayMs?: (target: 0 | 1) => number;
  resetOnShowKey?: number;
};

type TransitionDriverResult = {
  progress: SharedValue<number>;
  isVisible: boolean;
};

export const useTransitionDriver = ({
  enabled,
  target,
  getDurationMs,
  getEasing,
  getDelayMs,
  resetOnShowKey,
}: TransitionDriverOptions): TransitionDriverResult => {
  const progress = useSharedValue(0);
  const [isVisible, setIsVisible] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useSharedValue(0);
  const lastResetKeyRef = React.useRef<number | undefined>(undefined);

  const runTransition = React.useCallback(
    (nextTarget: 0 | 1) => {
      requestSeq.value += 1;
      const requestId = requestSeq.value;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (nextTarget === 1) {
        setIsVisible(true);
        if (typeof resetOnShowKey === 'number' && resetOnShowKey !== lastResetKeyRef.current) {
          lastResetKeyRef.current = resetOnShowKey;
          progress.value = 0;
        }
      }
      const duration = getDurationMs(nextTarget);
      const easing = getEasing ? getEasing(nextTarget) : (t: number) => t;
      const start = () => {
        progress.value = withTiming(nextTarget, { duration, easing }, (finished) => {
          if (finished && nextTarget === 0 && requestId === requestSeq.value) {
            runOnJS(setIsVisible)(false);
          }
        });
      };
      const delayMs = getDelayMs ? getDelayMs(nextTarget) : 0;
      if (delayMs > 0) {
        timeoutRef.current = setTimeout(start, delayMs);
        return;
      }
      start();
    },
    [getDelayMs, getDurationMs, getEasing, progress, requestSeq, resetOnShowKey]
  );

  React.useEffect(() => {
    if (!enabled) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      progress.value = 0;
      setIsVisible(false);
      lastResetKeyRef.current = undefined;
      return;
    }
    runTransition(target);
  }, [enabled, progress, runTransition, target]);

  React.useEffect(
    () => () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    },
    []
  );

  return { progress, isVisible };
};

export default useTransitionDriver;
