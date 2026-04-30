import React from 'react';

import type {
  SearchRootAutocompleteAuthorityRuntime,
  SearchRootForegroundInputRuntime,
  SearchRootProfileBridgeAuthorityRuntime,
  SearchRootResultsInteractionPorts,
} from './search-root-control-ports-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootResultsPresentationControlLane } from './use-search-root-control-plane-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import { useSearchRootForegroundInputAuthorityRuntime } from './use-search-root-foreground-input-authority-runtime';
import { useSearchRootResultsInteractionAuthorityRuntime } from './use-search-root-results-interaction-authority-runtime';
import { useSearchRootResultsPresentationAuthorityRuntime } from './use-search-root-results-presentation-authority-runtime';
import type { SearchChromeScalarSurfaceRuntime } from '../native/search-chrome-scalar-surface-runtime';
import type {
  SearchRootClearRestoreAuthorityRuntime,
  SearchRootMutationCancelAuthorityRuntime,
} from './search-root-control-ports-runtime-contract';
import type { SearchRootSessionCoreLane } from './use-search-root-session-runtime-contract';
import type { ResultsSurfacePolicyController } from './results-surface-policy-controller';
import type { SearchForegroundPolicyPublicationAuthority } from './search-foreground-policy-publication-authority';

type UseSearchRootControlPresentationAuthorityRuntimeArgs = {
  sessionCoreLane: SearchRootSessionCoreLane;
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  mutationCancelAuthorityRuntime: SearchRootMutationCancelAuthorityRuntime;
  profileBridgeAuthorityRuntime: SearchRootProfileBridgeAuthorityRuntime;
  clearRestoreAuthorityRuntime: SearchRootClearRestoreAuthorityRuntime;
  cancelActiveSearchRequest: () => void;
  autocompleteAuthorityRuntime: SearchRootAutocompleteAuthorityRuntime;
  resultsSurfacePolicyController?: ResultsSurfacePolicyController;
  foregroundPolicyPublicationAuthority?: SearchForegroundPolicyPublicationAuthority;
  searchChromeScalarSurfaceRuntime?: SearchChromeScalarSurfaceRuntime;
};

export type SearchRootControlPresentationAuthorityRuntime = {
  resultsPresentationOwner: SearchRootResultsPresentationControlLane['resultsPresentationOwner'];
  foregroundInputRuntime: SearchRootForegroundInputRuntime;
  resultsInteractionPorts: SearchRootResultsInteractionPorts;
  resultsPresentationControlLane: SearchRootResultsPresentationControlLane;
};

export const useSearchRootControlPresentationAuthorityRuntime = ({
  sessionCoreLane,
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  mutationCancelAuthorityRuntime,
  profileBridgeAuthorityRuntime,
  clearRestoreAuthorityRuntime,
  cancelActiveSearchRequest,
  autocompleteAuthorityRuntime,
  resultsSurfacePolicyController,
  foregroundPolicyPublicationAuthority,
  searchChromeScalarSurfaceRuntime,
}: UseSearchRootControlPresentationAuthorityRuntimeArgs): SearchRootControlPresentationAuthorityRuntime => {
  const resultsInteractionAuthorityRuntime = useSearchRootResultsInteractionAuthorityRuntime();
  const resultsPresentationAuthorityRuntime = useSearchRootResultsPresentationAuthorityRuntime({
    sessionCoreLane,
    stateFoundationLane,
    rootOverlayFoundationRuntime,
    mutationCancelAuthorityRuntime,
    profileBridgeAuthorityRuntime,
    clearRestoreAuthorityRuntime,
    cancelActiveSearchRequest,
    resultsSurfacePolicyController,
    foregroundPolicyPublicationAuthority,
    searchChromeScalarSurfaceRuntime,
  });
  const foregroundInputAuthorityRuntime = useSearchRootForegroundInputAuthorityRuntime({
    rootPrimitivesRuntime: stateFoundationLane.rootPrimitivesRuntime,
    rootDataPlaneRuntime: stateFoundationLane.rootDataPlaneRuntime,
    rootOverlayStoreRuntime: rootOverlayFoundationRuntime.rootOverlayStoreRuntime,
    resultsPresentationAuthorityRuntime,
    autocompleteAuthorityRuntime,
  });

  const resultsPresentationOwner = resultsPresentationAuthorityRuntime.resultsPresentationOwner;
  const foregroundInputRuntime = foregroundInputAuthorityRuntime.foregroundInputRuntime;
  const resultsInteractionPorts = resultsInteractionAuthorityRuntime.resultsInteractionPorts;

  const resultsPresentationControlLane = React.useMemo(
    (): SearchRootResultsPresentationControlLane => ({
      resultsPresentationOwner,
    }),
    [resultsPresentationOwner]
  );

  return React.useMemo(
    () => ({
      resultsPresentationOwner,
      foregroundInputRuntime,
      resultsInteractionPorts,
      resultsPresentationControlLane,
    }),
    [
      foregroundInputRuntime,
      resultsInteractionPorts,
      resultsPresentationControlLane,
      resultsPresentationOwner,
    ]
  );
};
