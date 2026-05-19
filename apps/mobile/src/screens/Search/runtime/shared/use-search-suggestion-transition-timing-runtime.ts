import React from 'react';
import { Easing } from 'react-native-reanimated';

import type { SearchSuggestionTransitionTimingRuntime } from './use-search-suggestion-surface-runtime-contract';

const SUGGESTION_PANEL_SHOW_MS = 160;
const SUGGESTION_PANEL_HIDE_MS = 160;
const SUGGESTION_PANEL_KEYBOARD_DELAY_MS = 0;

export const useSearchSuggestionTransitionTimingRuntime =
  (): SearchSuggestionTransitionTimingRuntime => {
    const getSuggestionTransitionDurationMs = React.useCallback(
      (target: 0 | 1) => (target === 1 ? SUGGESTION_PANEL_SHOW_MS : SUGGESTION_PANEL_HIDE_MS),
      []
    );

    const getSuggestionTransitionEasing = React.useCallback(() => Easing.out(Easing.cubic), []);

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
