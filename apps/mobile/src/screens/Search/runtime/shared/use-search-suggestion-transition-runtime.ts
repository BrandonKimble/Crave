import React from 'react';
import { useSearchSuggestionLayoutWarmthRuntime } from './use-search-suggestion-layout-warmth-runtime';
import { useSearchSuggestionTransitionPresenceRuntime } from './use-search-suggestion-transition-presence-runtime';
import { useSearchSuggestionTransitionTimingRuntime } from './use-search-suggestion-transition-timing-runtime';
import type {
  SearchSuggestionLayoutWarmthRuntime,
  SearchSuggestionTransitionPresenceRuntime,
  SearchSuggestionTransitionRuntime,
  SearchSuggestionTransitionRuntimeArgs,
  SuggestionTransitionVariant,
  SearchSuggestionTransitionTimingRuntime,
} from './use-search-suggestion-surface-runtime-contract';

export const useSearchSuggestionTransitionRuntime = ({
  isSuggestionPanelActive,
}: SearchSuggestionTransitionRuntimeArgs): SearchSuggestionTransitionRuntime => {
  const [, setSearchTransitionVariant] = React.useState<SuggestionTransitionVariant>('default');
  const transitionTimingRuntime: SearchSuggestionTransitionTimingRuntime =
    useSearchSuggestionTransitionTimingRuntime();
  const transitionPresenceRuntime: SearchSuggestionTransitionPresenceRuntime =
    useSearchSuggestionTransitionPresenceRuntime({
      isSuggestionPanelActive,
      getSuggestionTransitionDurationMs: transitionTimingRuntime.getSuggestionTransitionDurationMs,
      getSuggestionTransitionEasing: transitionTimingRuntime.getSuggestionTransitionEasing,
      getSuggestionTransitionDelayMs: transitionTimingRuntime.getSuggestionTransitionDelayMs,
    });
  const layoutWarmthRuntime: SearchSuggestionLayoutWarmthRuntime =
    useSearchSuggestionLayoutWarmthRuntime({
      isSuggestionPanelActive,
      isSuggestionPanelVisible: transitionPresenceRuntime.isSuggestionPanelVisible,
    });

  return {
    isSuggestionLayoutWarm: layoutWarmthRuntime.isSuggestionLayoutWarm,
    setIsSuggestionLayoutWarm: layoutWarmthRuntime.setIsSuggestionLayoutWarm,
    isSuggestionPanelVisible: transitionPresenceRuntime.isSuggestionPanelVisible,
    isSuggestionOverlayVisible: transitionPresenceRuntime.isSuggestionOverlayVisible,
    suggestionProgress: transitionPresenceRuntime.suggestionProgress,
    setSearchTransitionVariant,
    shouldDriveSuggestionLayout: layoutWarmthRuntime.shouldDriveSuggestionLayout,
  };
};
