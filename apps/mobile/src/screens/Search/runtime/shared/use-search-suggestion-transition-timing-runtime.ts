import React from 'react';
import { Keyboard } from 'react-native';
import { Easing } from 'react-native-reanimated';

import type { SearchSuggestionTransitionTimingRuntime } from './use-search-suggestion-surface-runtime-contract';

const SUGGESTION_PANEL_FADE_MS = 200;
const SUGGESTION_PANEL_KEYBOARD_DELAY_MS = 0;
const SUGGESTION_PANEL_MIN_MS = 160;
const SUGGESTION_PANEL_MAX_MS = 320;

const clampSearchTransitionDuration = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const useSearchSuggestionTransitionTimingRuntime =
  (): SearchSuggestionTransitionTimingRuntime => {
    const suggestionTransitionDurationRef = React.useRef({
      show: SUGGESTION_PANEL_FADE_MS,
      hide: SUGGESTION_PANEL_FADE_MS,
    });

    React.useEffect(() => {
      const handleKeyboardShow = (event: { duration?: number }) => {
        if (typeof event.duration !== 'number') {
          return;
        }
        suggestionTransitionDurationRef.current.show = clampSearchTransitionDuration(
          event.duration,
          SUGGESTION_PANEL_MIN_MS,
          SUGGESTION_PANEL_MAX_MS
        );
      };
      const handleKeyboardHide = (event: { duration?: number }) => {
        if (typeof event.duration !== 'number') {
          return;
        }
        suggestionTransitionDurationRef.current.hide = clampSearchTransitionDuration(
          event.duration,
          SUGGESTION_PANEL_MIN_MS,
          SUGGESTION_PANEL_MAX_MS
        );
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
    }, []);

    const getSuggestionTransitionDurationMs = React.useCallback(
      (target: 0 | 1) =>
        target === 1
          ? suggestionTransitionDurationRef.current.show
          : suggestionTransitionDurationRef.current.hide,
      []
    );

    const getSuggestionTransitionEasing = React.useCallback(
      (target: 0 | 1) => (target === 1 ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic)),
      []
    );

    const getSuggestionTransitionDelayMs = React.useCallback(
      (target: 0 | 1) => (target === 1 ? SUGGESTION_PANEL_KEYBOARD_DELAY_MS : 0),
      []
    );

    return {
      getSuggestionTransitionDurationMs,
      getSuggestionTransitionEasing,
      getSuggestionTransitionDelayMs,
    };
  };
