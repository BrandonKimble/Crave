import React from 'react';

import type {
  SearchRootAutocompleteAuthorityRuntime,
  SearchRootForegroundInputRuntime,
  SearchRootProfileBridgeAuthorityRuntime,
  SearchRootResultsInteractionPorts,
} from './search-root-control-ports-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootResultsPresentationControlLane } from './search-root-control-plane-runtime-contract';
import type { SearchRootStateFoundationLane } from './search-root-foundation-runtime';
import { useSearchRootForegroundInputAuthorityRuntime } from './use-search-root-foreground-input-authority-runtime';
import { useSearchRootResultsInteractionAuthorityRuntime } from './use-search-root-results-interaction-authority-runtime';
import { useSearchRootResultsPresentationAuthorityRuntime } from './use-search-root-results-presentation-authority-runtime';
import type { SearchRootClearRestoreAuthorityRuntime } from './search-root-control-ports-runtime-contract';
import type { SearchRootSessionCoreLane } from './search-root-session-runtime-contract';
import type { SearchForegroundPolicyPublicationAuthority } from './search-foreground-policy-publication-authority';

type UseSearchRootControlPresentationAuthorityRuntimeArgs = {
  sessionCoreLane: SearchRootSessionCoreLane;
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  profileBridgeAuthorityRuntime: SearchRootProfileBridgeAuthorityRuntime;
  clearRestoreAuthorityRuntime: SearchRootClearRestoreAuthorityRuntime;
  autocompleteAuthorityRuntime: SearchRootAutocompleteAuthorityRuntime;
  foregroundPolicyPublicationAuthority?: SearchForegroundPolicyPublicationAuthority;
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
  profileBridgeAuthorityRuntime,
  clearRestoreAuthorityRuntime,
  autocompleteAuthorityRuntime,
  foregroundPolicyPublicationAuthority,
}: UseSearchRootControlPresentationAuthorityRuntimeArgs): SearchRootControlPresentationAuthorityRuntime => {
  const resultsInteractionAuthorityRuntime = useSearchRootResultsInteractionAuthorityRuntime();
  const resultsPresentationAuthorityRuntime = useSearchRootResultsPresentationAuthorityRuntime({
    sessionCoreLane,
    stateFoundationLane,
    rootOverlayFoundationRuntime,
    profileBridgeAuthorityRuntime,
    clearRestoreAuthorityRuntime,
    foregroundPolicyPublicationAuthority,
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
