import React from 'react';

import type {
  SearchForegroundInteractionSubmitHandlers,
  SearchForegroundInteractionTransientHandlersRuntime,
  UseSearchForegroundTransientHandlersRuntimeArgs,
} from './use-search-foreground-interaction-runtime-contract';
import { useSearchForegroundEditingHandlersRuntime } from './use-search-foreground-editing-handlers-runtime';
import { useSearchForegroundExternalSubmitRuntime } from './use-search-foreground-external-submit-runtime';
import { useSearchForegroundOverlayNavigationRuntime } from './use-search-foreground-overlay-navigation-runtime';
import { useSearchRouteSwitchPostCommitRuntime } from './use-search-route-switch-post-commit-runtime';

type UseSearchForegroundTransientControllerDependencies = {
  submitHandlers: Pick<
    SearchForegroundInteractionSubmitHandlers,
    | 'handleRecentSearchPress'
    | 'handleRecentlyViewedRestaurantPress'
    | 'handleRecentlyViewedFoodPress'
  >;
};

export const useSearchForegroundTransientController = ({
  editingRuntimeArgs,
  overlayRuntimeArgs,
  submitHandlers,
}: UseSearchForegroundTransientHandlersRuntimeArgs &
  UseSearchForegroundTransientControllerDependencies): SearchForegroundInteractionTransientHandlersRuntime => {
  const editingHandlers = useSearchForegroundEditingHandlersRuntime(editingRuntimeArgs);
  useSearchForegroundExternalSubmitRuntime({
    ...overlayRuntimeArgs,
    submitHandlers,
  });
  useSearchRouteSwitchPostCommitRuntime(overlayRuntimeArgs);
  const overlayHandlers = useSearchForegroundOverlayNavigationRuntime(overlayRuntimeArgs);

  /** F1610 — see use-search-foreground-submit-runtime.ts: the repacker's destructure was a
   *  runtime FILTER, so the eight fields are named explicitly rather than spread. */
  return React.useMemo<SearchForegroundInteractionTransientHandlersRuntime>(
    () => ({
      handleClear: editingHandlers.handleClear,
      handleSearchFocus: editingHandlers.handleSearchFocus,
      handleSearchBlur: editingHandlers.handleSearchBlur,
      handleSearchBack: editingHandlers.handleSearchBack,
      handleRecentViewMorePress: overlayHandlers.handleRecentViewMorePress,
      handleRecentlyViewedMorePress: overlayHandlers.handleRecentlyViewedMorePress,
      handleOverlaySelect: overlayHandlers.handleOverlaySelect,
      handleProfilePress: overlayHandlers.handleProfilePress,
    }),
    [editingHandlers, overlayHandlers]
  );
};
