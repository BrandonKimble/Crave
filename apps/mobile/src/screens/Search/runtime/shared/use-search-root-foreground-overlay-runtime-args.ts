import React from 'react';

import type { ProfileOwner } from '../profile/profile-owner-runtime-contract';
import type { SearchRootEnvironment } from './search-root-environment-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type {
  SearchForegroundOverlayRuntimeArgs,
  SearchForegroundTransientCleanupActions,
} from './use-search-foreground-interaction-runtime-contract';
import { useSearchRootForegroundOverlayActionArgs } from './use-search-root-foreground-overlay-action-args';
import { useSearchRootForegroundOverlayStateArgs } from './use-search-root-foreground-overlay-state-args';

type UseSearchRootForegroundOverlayRuntimeArgsArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  navigation: SearchRootEnvironment['navigation'];
  routeSearchIntent: SearchRootEnvironment['routeSearchIntent'];
  userLocation: SearchRootEnvironment['userLocation'];
  profileOwner: ProfileOwner;
  transientCleanupActions: SearchForegroundTransientCleanupActions;
};

export const useSearchRootForegroundOverlayRuntimeArgs = ({
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  navigation,
  routeSearchIntent,
  userLocation,
  profileOwner,
  transientCleanupActions,
}: UseSearchRootForegroundOverlayRuntimeArgsArgs): SearchForegroundOverlayRuntimeArgs => {
  const overlayStateArgs = useSearchRootForegroundOverlayStateArgs({
    stateFoundationLane,
    rootOverlayFoundationRuntime,
    navigation,
    routeSearchIntent,
    userLocation,
    profileOwner,
  });
  const overlayActionArgs = useSearchRootForegroundOverlayActionArgs({
    stateFoundationLane,
    rootOverlayFoundationRuntime,
    profileOwner,
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
