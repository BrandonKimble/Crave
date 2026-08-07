import React from 'react';

import type { SearchRootEnvironment } from './search-root-environment-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './search-root-foundation-runtime';
import type { SearchForegroundOverlayRuntimeArgs } from './search-foreground-interaction-runtime-contract';

type SearchRootForegroundOverlayStateArgs = Pick<
  SearchForegroundOverlayRuntimeArgs,
  | 'navigation'
  | 'routeSearchIntent'
  | 'userLocation'
  | 'rootOverlay'
  | 'ignoreNextSearchBlurRef'
  | 'allowSearchBlurExitRef'
  | 'inputRef'
>;

type UseSearchRootForegroundOverlayStateArgsArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  navigation: SearchRootEnvironment['navigation'];
  routeSearchIntent: SearchRootEnvironment['routeSearchIntent'];
  userLocation: SearchRootEnvironment['userLocation'];
};

export const useSearchRootForegroundOverlayStateArgs = ({
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  navigation,
  routeSearchIntent,
  userLocation,
}: UseSearchRootForegroundOverlayStateArgsArgs): SearchRootForegroundOverlayStateArgs => {
  const { rootPrimitivesRuntime } = stateFoundationLane;
  const { rootOverlay } = rootOverlayFoundationRuntime.rootOverlayStoreRuntime;

  return React.useMemo(
    () => ({
      navigation,
      routeSearchIntent,
      userLocation,
      rootOverlay,
      ignoreNextSearchBlurRef: rootPrimitivesRuntime.searchState.ignoreNextSearchBlurRef,
      allowSearchBlurExitRef: rootPrimitivesRuntime.searchState.allowSearchBlurExitRef,
      inputRef: rootPrimitivesRuntime.searchState.inputRef,
    }),
    [
      navigation,
      rootOverlay,
      rootPrimitivesRuntime.searchState.allowSearchBlurExitRef,
      rootPrimitivesRuntime.searchState.ignoreNextSearchBlurRef,
      rootPrimitivesRuntime.searchState.inputRef,
      routeSearchIntent,
      userLocation,
    ]
  );
};
