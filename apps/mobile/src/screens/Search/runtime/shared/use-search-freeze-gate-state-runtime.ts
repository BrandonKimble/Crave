import type { SearchFreezeClassification } from './search-freeze-classification-runtime';
import React from 'react';

import type { SearchRuntimeBus } from './search-runtime-bus';

type SearchFreezeGateState = {
  isSearchSurfaceRedrawChromeFreezeActive: boolean;
  isSearchSurfaceRedrawPreflightFreezeActive: boolean;
  isSearchSurfaceRedrawActive: boolean;
  isResponseFrameFreezeActive: boolean;
  freezeClassification: SearchFreezeClassification;
};

type SearchFreezeGateRuntimeState = {
  searchSurfaceRedrawPhase: ReturnType<SearchRuntimeBus['getState']>['searchSurfaceRedrawPhase'];
};

type SearchSurfaceRedrawRuntimeState = {
  searchSurfaceRedrawOperationId: ReturnType<SearchRuntimeBus['getState']>['searchSurfaceRedrawOperationId'];
  searchSurfaceRedrawPhase: ReturnType<SearchRuntimeBus['getState']>['searchSurfaceRedrawPhase'];
};

export const useSearchFreezeGateStateRuntime = (searchRuntimeBus: SearchRuntimeBus) => {
  const sampledRuntimeState = React.useMemo(() => {
    const state = searchRuntimeBus.getState();
    const policyFacts = searchRuntimeBus.getPolicyFactsSnapshot();
    return {
      freezeGateState: {
        isSearchSurfaceRedrawChromeFreezeActive: state.isSearchSurfaceRedrawChromeFreezeActive,
        isSearchSurfaceRedrawPreflightFreezeActive: state.isSearchSurfaceRedrawPreflightFreezeActive,
        isSearchSurfaceRedrawActive: state.isSearchSurfaceRedrawActive,
        isResponseFrameFreezeActive: state.isResponseFrameFreezeActive,
        freezeClassification: policyFacts.freezeClassification,
      },
      searchSurfaceRedrawRuntimeState: {
        searchSurfaceRedrawOperationId: state.searchSurfaceRedrawOperationId,
        searchSurfaceRedrawPhase: state.searchSurfaceRedrawPhase,
      },
    };
  }, [searchRuntimeBus]);

  return {
    freezeGateState: sampledRuntimeState.freezeGateState,
    searchSurfaceRedrawRuntimeState: sampledRuntimeState.searchSurfaceRedrawRuntimeState,
    freezeGateRuntimeState: {
      searchSurfaceRedrawPhase: sampledRuntimeState.searchSurfaceRedrawRuntimeState.searchSurfaceRedrawPhase,
    },
  } satisfies {
    freezeGateState: SearchFreezeGateState;
    searchSurfaceRedrawRuntimeState: SearchSurfaceRedrawRuntimeState;
    freezeGateRuntimeState: SearchFreezeGateRuntimeState;
  };
};
