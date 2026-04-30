import React from 'react';

import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import { useSearchRootForegroundEffectsUiArgs } from './use-search-root-foreground-effects-ui-args';
import type { SearchForegroundRestaurantOnlyResolutionArgs } from './use-search-foreground-interaction-runtime-contract';
import type { SearchForegroundInteractionRouteEffectsRuntimeArgs } from './use-search-foreground-interaction-effects-runtime';

type UseSearchRootForegroundEffectsRuntimeArgsArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
};

export const useSearchRootForegroundEffectsRuntimeArgs = ({
  stateFoundationLane,
  rootOverlayFoundationRuntime,
}: UseSearchRootForegroundEffectsRuntimeArgsArgs): SearchForegroundInteractionRouteEffectsRuntimeArgs => {
  return useSearchRootForegroundEffectsUiArgs({
    stateFoundationLane,
    rootOverlayFoundationRuntime,
  });
};

type UseSearchRootForegroundRestaurantOnlyResolutionArgsArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
};

export const useSearchRootForegroundRestaurantOnlyResolutionArgs = ({
  stateFoundationLane,
}: UseSearchRootForegroundRestaurantOnlyResolutionArgsArgs): SearchForegroundRestaurantOnlyResolutionArgs => {
  const { rootPrimitivesRuntime, rootDataPlaneRuntime } = stateFoundationLane;

  return React.useMemo(
    () => ({
      hasResults: rootDataPlaneRuntime.resultsArrivalState.hasResults,
      restaurantOnlySearchRef: rootPrimitivesRuntime.searchState.restaurantOnlySearchRef,
      restaurantResults: rootDataPlaneRuntime.resultsArrivalState.restaurantResults,
      setRestaurantOnlyId: rootPrimitivesRuntime.searchState.setRestaurantOnlyId,
    }),
    [
      rootDataPlaneRuntime.resultsArrivalState.hasResults,
      rootDataPlaneRuntime.resultsArrivalState.restaurantResults,
      rootPrimitivesRuntime.searchState.restaurantOnlySearchRef,
      rootPrimitivesRuntime.searchState.setRestaurantOnlyId,
    ]
  );
};
