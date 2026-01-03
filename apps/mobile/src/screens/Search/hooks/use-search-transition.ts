import React from 'react';
import { Keyboard } from 'react-native';
import { Easing, type SharedValue } from 'react-native-reanimated';
import useTransitionDriver from '../../../hooks/use-transition-driver';

type UseSearchTransitionOptions = {
  enabled: boolean;
  active: boolean;
  showMs: number;
  hideMs: number;
  minMs: number;
  maxMs: number;
  delayMs?: number;
};

type UseSearchTransitionResult = {
  progress: SharedValue<number>;
  isVisible: boolean;
};

const clampDuration = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const useSearchTransition = ({
  enabled,
  active,
  showMs,
  hideMs,
  minMs,
  maxMs,
  delayMs = 0,
}: UseSearchTransitionOptions): UseSearchTransitionResult => {
  const durationRef = React.useRef({ show: showMs, hide: hideMs });

  React.useEffect(() => {
    durationRef.current.show = showMs;
    durationRef.current.hide = hideMs;
  }, [showMs, hideMs]);

  React.useEffect(() => {
    const handleKeyboardShow = (event: { duration?: number }) => {
      if (typeof event.duration !== 'number') {
        return;
      }
      durationRef.current.show = clampDuration(event.duration, minMs, maxMs);
    };
    const handleKeyboardHide = (event: { duration?: number }) => {
      if (typeof event.duration !== 'number') {
        return;
      }
      durationRef.current.hide = clampDuration(event.duration, minMs, maxMs);
    };
    const showSubscription = Keyboard.addListener('keyboardWillShow', handleKeyboardShow);
    const hideSubscription = Keyboard.addListener('keyboardWillHide', handleKeyboardHide);
    const showFallback = Keyboard.addListener('keyboardDidShow', handleKeyboardShow);
    const hideFallback = Keyboard.addListener('keyboardDidHide', handleKeyboardHide);
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
      showFallback.remove();
      hideFallback.remove();
    };
  }, [maxMs, minMs]);

  const getDurationMs = React.useCallback(
    (target: 0 | 1) => (target === 1 ? durationRef.current.show : durationRef.current.hide),
    []
  );
  const getEasing = React.useCallback(
    (target: 0 | 1) => (target === 1 ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic)),
    []
  );
  const getDelayMs = React.useCallback((target: 0 | 1) => (target === 1 ? delayMs : 0), [delayMs]);

  return useTransitionDriver({
    enabled,
    target: active ? 1 : 0,
    getDurationMs,
    getEasing,
    getDelayMs,
  });
};

export default useSearchTransition;
