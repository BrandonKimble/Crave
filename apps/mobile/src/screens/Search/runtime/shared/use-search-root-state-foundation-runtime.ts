import React from 'react';

import type { SearchForegroundPolicyPublicationAuthority } from './search-foreground-policy-publication-authority';
import type { SearchRootPrimitivesRuntime } from './search-root-primitives-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import { useSearchRootDataPlaneRuntime } from './use-search-root-data-plane-runtime';
import { useSearchRootSuggestionRuntime } from './use-search-root-suggestion-runtime';
import type {
  SearchRootSessionCoreLane,
  SearchRootSessionPrimitivesLane,
} from './use-search-root-session-runtime-contract';

type UseSearchRootStateFoundationRuntimeArgs = {
  isSignedIn: boolean;
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  sessionCoreLane: SearchRootSessionCoreLane;
  sessionPrimitivesLane: SearchRootSessionPrimitivesLane;
  foregroundPolicyPublicationAuthority: SearchForegroundPolicyPublicationAuthority;
};

export const useSearchRootStateFoundationRuntime = ({
  isSignedIn,
  rootPrimitivesRuntime,
  sessionCoreLane,
  sessionPrimitivesLane,
  foregroundPolicyPublicationAuthority,
}: UseSearchRootStateFoundationRuntimeArgs): SearchRootStateFoundationLane => {
  const rootDataPlaneRuntime = useSearchRootDataPlaneRuntime({
    isSignedIn,
    rootSessionCoreLane: sessionCoreLane,
    foregroundPolicyPublicationAuthority,
  });
  const rootSuggestionRuntime = useSearchRootSuggestionRuntime({
    rootPrimitivesRuntime,
    rootSessionPrimitivesLane: sessionPrimitivesLane,
    rootDataPlaneRuntime,
  });

  return React.useMemo<SearchRootStateFoundationLane>(
    () => ({
        rootPrimitivesRuntime,
        sessionPrimitivesLane,
        rootDataPlaneRuntime,
        rootSuggestionRuntime,
      }),
    [rootDataPlaneRuntime, rootPrimitivesRuntime, rootSuggestionRuntime, sessionPrimitivesLane]
  );
};
