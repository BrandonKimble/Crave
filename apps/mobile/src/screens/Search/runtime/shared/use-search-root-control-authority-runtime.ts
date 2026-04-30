import React from 'react';

import {
  createSearchRootControlAuthorityRuntimeValue,
  type SearchRootControlAuthorityRuntimeValue,
} from '../controller/search-root-control-authority-runtime';
import type { SearchRootMapViewportIntentRuntime } from './search-root-map-viewport-intent-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import { useSearchRootControlFoundationAuthorityRuntime } from './use-search-root-control-foundation-authority-runtime';
import { useSearchRootControlPresentationAuthorityRuntime } from './use-search-root-control-presentation-authority-runtime';
import type { SearchChromeScalarSurfaceRuntime } from '../native/search-chrome-scalar-surface-runtime';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchRootSessionCoreLane } from './use-search-root-session-runtime-contract';
import type { ResultsSurfacePolicyController } from './results-surface-policy-controller';
import type { SearchForegroundPolicyPublicationAuthority } from './search-foreground-policy-publication-authority';

type UseSearchRootControlAuthorityRuntimeArgs = {
  sessionCoreLane: SearchRootSessionCoreLane;
  mapViewportIntentRuntime: SearchRootMapViewportIntentRuntime;
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  resultsSurfacePolicyController?: ResultsSurfacePolicyController;
  foregroundPolicyPublicationAuthority?: SearchForegroundPolicyPublicationAuthority;
  searchChromeScalarSurfaceRuntime?: SearchChromeScalarSurfaceRuntime;
};

export const useSearchRootControlAuthorityRuntime = ({
  sessionCoreLane,
  mapViewportIntentRuntime,
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  resultsSurfacePolicyController,
  foregroundPolicyPublicationAuthority,
  searchChromeScalarSurfaceRuntime,
}: UseSearchRootControlAuthorityRuntimeArgs): SearchRootControlAuthorityRuntimeValue => {
  const foundationAuthorityRuntime = useSearchRootControlFoundationAuthorityRuntime({
    sessionCoreLane,
    mapViewportIntentRuntime,
    stateFoundationLane,
    rootOverlayFoundationRuntime,
  });
  const presentationAuthorityRuntime = useSearchRootControlPresentationAuthorityRuntime({
    sessionCoreLane,
    stateFoundationLane,
    rootOverlayFoundationRuntime,
    mutationCancelAuthorityRuntime: foundationAuthorityRuntime.mutationCancelAuthorityRuntime,
    profileBridgeAuthorityRuntime: foundationAuthorityRuntime.profileBridgeAuthorityRuntime,
    clearRestoreAuthorityRuntime: foundationAuthorityRuntime.clearRestoreAuthorityRuntime,
    cancelActiveSearchRequest:
      foundationAuthorityRuntime.requestExecutionAuthorityRuntime.searchRequestRuntimeOwner
        .cancelActiveSearchRequest,
    autocompleteAuthorityRuntime: foundationAuthorityRuntime.autocompleteAuthorityRuntime,
    resultsSurfacePolicyController,
    foregroundPolicyPublicationAuthority,
    searchChromeScalarSurfaceRuntime,
  });
  const autocompleteControlLane = React.useMemo(
    () => ({
      autocompleteControlPort: foundationAuthorityRuntime.autocompleteControlPort,
    }),
    [foundationAuthorityRuntime.autocompleteControlPort]
  );

  return React.useMemo(
    () =>
      createSearchRootControlAuthorityRuntimeValue({
        foundationAuthorityRuntime,
        presentationAuthorityRuntime,
        autocompleteControlLane,
      }),
    [autocompleteControlLane, foundationAuthorityRuntime, presentationAuthorityRuntime]
  );
};
