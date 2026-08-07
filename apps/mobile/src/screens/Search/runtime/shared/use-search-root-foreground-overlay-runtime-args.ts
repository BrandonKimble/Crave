import React from 'react';

import type { SearchRootEnvironment } from './search-root-environment-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './search-root-foundation-runtime';
import type {
  SearchForegroundOverlayRuntimeArgs,
  SearchForegroundTransientCleanupActions,
} from './search-foreground-interaction-runtime-contract';
import { useSearchRootForegroundOverlayActionArgs } from './use-search-root-foreground-overlay-action-args';
import { useSearchRootForegroundOverlayStateArgs } from './use-search-root-foreground-overlay-state-args';

type UseSearchRootForegroundOverlayRuntimeArgsArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  navigation: SearchRootEnvironment['navigation'];
  routeSearchIntent: SearchRootEnvironment['routeSearchIntent'];
  userLocation: SearchRootEnvironment['userLocation'];
  transientCleanupActions: SearchForegroundTransientCleanupActions;
};

export const useSearchRootForegroundOverlayRuntimeArgs = ({
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  navigation,
  routeSearchIntent,
  userLocation,
  transientCleanupActions,
}: UseSearchRootForegroundOverlayRuntimeArgsArgs): SearchForegroundOverlayRuntimeArgs => {
  const overlayStateArgs = useSearchRootForegroundOverlayStateArgs({
    stateFoundationLane,
    rootOverlayFoundationRuntime,
    navigation,
    routeSearchIntent,
    userLocation,
  });
  const overlayActionArgs = useSearchRootForegroundOverlayActionArgs({
    stateFoundationLane,
    rootOverlayFoundationRuntime,
  });

  return React.useMemo(
    () => ({
      ...overlayStateArgs,
      ...overlayActionArgs,
      transientCleanupActions,
    }),
    [overlayActionArgs, overlayStateArgs, transientCleanupActions]
  );
};
