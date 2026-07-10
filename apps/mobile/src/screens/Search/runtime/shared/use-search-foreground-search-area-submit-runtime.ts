import React from 'react';

import {
  clearActivePerfScenarioSearchThisAreaSubmitId,
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
  setActivePerfScenarioSearchThisAreaSubmitId,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import type {
  SearchForegroundInteractionSubmitHandlers,
  SearchForegroundSubmitRuntimeArgs,
} from './use-search-foreground-interaction-runtime-contract';

type UseSearchForegroundSearchAreaSubmitRuntimeArgs = Pick<
  SearchForegroundSubmitRuntimeArgs,
  | 'submitRuntime'
  | 'query'
  | 'submittedQuery'
  | 'searchMode'
  | 'activeTab'
  | 'hasResults'
  | 'isSearchLoading'
  | 'isLoadingMore'
  | 'isSearchSessionActive'
  | 'resetFocusedMapState'
  | 'resetMapMoveFlag'
>;

type SearchForegroundSearchAreaSubmitRuntime = Pick<
  SearchForegroundInteractionSubmitHandlers,
  'handleSearchThisArea'
>;

export const useSearchForegroundSearchAreaSubmitRuntime = ({
  submitRuntime,
  query,
  submittedQuery,
  searchMode,
  activeTab,
  hasResults,
  isSearchLoading,
  isLoadingMore,
  isSearchSessionActive,
  resetFocusedMapState,
  resetMapMoveFlag,
}: UseSearchForegroundSearchAreaSubmitRuntimeArgs): SearchForegroundSearchAreaSubmitRuntime => {
  const { rerunActiveSearch } = submitRuntime;
  const searchThisAreaSubmitSeqRef = React.useRef(0);

  const handleSearchThisArea = React.useCallback(() => {
    const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
    if (isSearchLoading || isLoadingMore || !hasResults) {
      if (isPerfScenarioAttributionActive(scenarioConfig)) {
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'search_this_area_submit_blocked_contract',
          activeTab,
          hasResults,
          isLoadingMore,
          isSearchLoading,
          isSearchSessionActive,
          queryLength: query.trim().length,
          searchMode,
          submittedQueryLength: submittedQuery.trim().length,
        });
      }
      return;
    }
    const searchThisAreaSubmitId = `search-this-area-submit:${++searchThisAreaSubmitSeqRef.current}`;
    setActivePerfScenarioSearchThisAreaSubmitId(searchThisAreaSubmitId);
    if (isPerfScenarioAttributionActive(scenarioConfig)) {
      logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
        event: 'search_this_area_submit_press_up_contract',
        activeTab,
        coverState: 'interaction_loading',
        forceFreshBounds: true,
        hasResults,
        isLoadingMore,
        isSearchLoading,
        isSearchSessionActive,
        preserveSheetState: true,
        queryLength: query.trim().length,
        replaceResultsInPlace: true,
        searchMode,
        searchThisAreaSubmitId,
        submittedQueryLength: submittedQuery.trim().length,
      });
    }
    resetFocusedMapState();
    // S-A (toggle-system-ideal §STA): mapMovedSinceSearch resets AT CAPTURE (press time),
    // not at finalize. Reset-at-finalize carried two live bugs: a pan during the in-flight
    // window got wiped (the button vanished while screen ≠ searched area), and a FAILED
    // search cleared the retry affordance (the old finalize ran on BOTH promise arms).
    // Post-press pans re-set the flag naturally; failure leaves it set.
    resetMapMoveFlag();
    // Press-up map fade-out rides the WIRE (S4d completion): the rerun below runs the
    // reconciler's search-this-area pending synchronously in this tick, which applies the
    // interaction cover to the transport — serialized as the 'interaction' phase that
    // holds the map ramp down. No side-channel fade verb exists anymore.
    const finalizeSearchThisAreaRerun = () => {
      clearActivePerfScenarioSearchThisAreaSubmitId(searchThisAreaSubmitId);
      if (isPerfScenarioAttributionActive(scenarioConfig)) {
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'search_this_area_submit_rerun_completed_contract',
          activeTab,
          forceFreshBounds: true,
          preserveSheetState: true,
          replaceResultsInPlace: true,
          searchMode,
          searchThisAreaSubmitId,
        });
      }
    };
    void rerunActiveSearch({
      searchMode,
      activeTab,
      submittedQuery,
      query,
      isSearchSessionActive,
    }).then(finalizeSearchThisAreaRerun, finalizeSearchThisAreaRerun);
  }, [
    activeTab,
    hasResults,
    isLoadingMore,
    isSearchLoading,
    isSearchSessionActive,
    query,
    rerunActiveSearch,
    resetFocusedMapState,
    resetMapMoveFlag,
    searchMode,
    submittedQuery,
  ]);

  return React.useMemo(
    () => ({
      handleSearchThisArea,
    }),
    [handleSearchThisArea]
  );
};
