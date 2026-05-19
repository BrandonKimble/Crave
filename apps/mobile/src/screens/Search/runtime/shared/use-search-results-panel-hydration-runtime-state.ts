import type { SearchRuntimeBus } from './search-runtime-bus';
import type { ResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import type { SearchResultsPanelHydrationRuntimeState } from './search-results-panel-runtime-state-contract';
import {
  isSearchSurfaceRedrawVisibleAdmissionPhase,
  type SearchSurfaceRedrawPhase,
} from '../controller/search-surface-redraw-phase';
import React from 'react';

const resolveBodyAdmissionHandoffPhase = (phase: SearchSurfaceRedrawPhase): SearchSurfaceRedrawPhase =>
  phase === 'redraw_committed' ? phase : 'markers_ready';

export const useSearchResultsPanelHydrationRuntimeState = (
  searchRuntimeBus: SearchRuntimeBus,
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority
): SearchResultsPanelHydrationRuntimeState => {
  const getRawSearchSurfaceRedrawPhase = React.useCallback(
    () => searchRuntimeBus.getState().searchSurfaceRedrawPhase,
    [searchRuntimeBus]
  );
  const getAllowHydrationFinalizeCommit = React.useCallback(
    () => resultsPresentationSurfaceAuthority.getSnapshot().allowHydrationFinalizeCommit,
    [resultsPresentationSurfaceAuthority]
  );
  const sampledSearchRuntimeState = searchRuntimeBus.getState();
  const sampledPolicyFacts = searchRuntimeBus.getPolicyFactsSnapshot();
  const surfaceResultsHydrationKey =
    resultsPresentationSurfaceAuthority.getSnapshot().resultsHydrationKey;
  const sampledSearchSurfaceRedrawPhase =
    surfaceResultsHydrationKey == null
      ? sampledSearchRuntimeState.searchSurfaceRedrawPhase
      : resolveBodyAdmissionHandoffPhase(sampledSearchRuntimeState.searchSurfaceRedrawPhase);

  return React.useMemo(
    () => ({
      searchSurfaceRedrawPhase: sampledSearchSurfaceRedrawPhase,
      rawSearchSurfaceRedrawPhase: sampledSearchRuntimeState.searchSurfaceRedrawPhase,
      searchSurfaceRedrawCommitSpanPressureActive:
        sampledSearchRuntimeState.searchSurfaceRedrawCommitSpanPressureActive,
      isSearchSurfaceRedrawChromeDeferred:
        sampledPolicyFacts.isSearchSurfaceRedrawChromeDeferred,
      chromeFreezeClassification: sampledPolicyFacts.freezeClassification,
      getAllowHydrationFinalizeCommit,
      getRawSearchSurfaceRedrawPhase,
    }),
    [
      getAllowHydrationFinalizeCommit,
      getRawSearchSurfaceRedrawPhase,
      sampledPolicyFacts.freezeClassification,
      sampledPolicyFacts.isSearchSurfaceRedrawChromeDeferred,
      sampledSearchRuntimeState.searchSurfaceRedrawCommitSpanPressureActive,
      sampledSearchRuntimeState.searchSurfaceRedrawPhase,
      sampledSearchSurfaceRedrawPhase,
      surfaceResultsHydrationKey,
    ]
  );
};

export const isSearchResultsHydrationVisibleAdmissionPhase =
  isSearchSurfaceRedrawVisibleAdmissionPhase;
