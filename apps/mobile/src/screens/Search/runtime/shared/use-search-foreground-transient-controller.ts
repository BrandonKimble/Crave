import React from 'react';

import { createSearchForegroundTransientHandlersRuntimeValue } from '../controller/search-foreground-transient-runtime';
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

  return React.useMemo(
    () =>
      createSearchForegroundTransientHandlersRuntimeValue({
        ...editingHandlers,
        ...overlayHandlers,
      }),
    [editingHandlers, overlayHandlers]
  );
};
