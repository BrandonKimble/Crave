import React from 'react';

import type { SearchRootControlAuthorityRuntimeValue } from '../controller/search-root-control-authority-runtime';
import type { SearchRootMapViewportIntentRuntime } from './search-root-map-viewport-intent-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import { useSearchRootControlFoundationAuthorityRuntime } from './use-search-root-control-foundation-authority-runtime';
import { useSearchRootControlPresentationAuthorityRuntime } from './use-search-root-control-presentation-authority-runtime';
import type { SearchRootStateFoundationLane } from './search-root-foundation-runtime';
import type { SearchRootSessionCoreLane } from './search-root-session-runtime-contract';
import type { SearchForegroundPolicyPublicationAuthority } from './search-foreground-policy-publication-authority';

type UseSearchRootControlAuthorityRuntimeArgs = {
  sessionCoreLane: SearchRootSessionCoreLane;
  mapViewportIntentRuntime: SearchRootMapViewportIntentRuntime;
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  foregroundPolicyPublicationAuthority?: SearchForegroundPolicyPublicationAuthority;
};

export const useSearchRootControlAuthorityRuntime = ({
  sessionCoreLane,
  mapViewportIntentRuntime,
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  foregroundPolicyPublicationAuthority,
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
    profileBridgeAuthorityRuntime: foundationAuthorityRuntime.profileBridgeAuthorityRuntime,
    clearRestoreAuthorityRuntime: foundationAuthorityRuntime.clearRestoreAuthorityRuntime,
    autocompleteAuthorityRuntime: foundationAuthorityRuntime.autocompleteAuthorityRuntime,
    foregroundPolicyPublicationAuthority,
  });
  const autocompleteControlLane = React.useMemo(
    () => ({
      autocompleteControlPort: foundationAuthorityRuntime.autocompleteControlPort,
    }),
    [foundationAuthorityRuntime.autocompleteControlPort]
  );

  return React.useMemo<SearchRootControlAuthorityRuntimeValue>(
    () => ({
      foundationAuthorityRuntime,
      presentationAuthorityRuntime,
      autocompleteControlLane,
    }),
    [autocompleteControlLane, foundationAuthorityRuntime, presentationAuthorityRuntime]
  );
};
