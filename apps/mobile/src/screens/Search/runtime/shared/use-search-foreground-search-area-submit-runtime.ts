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
  | 'setRestaurantOnlyIntent'
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
  setRestaurantOnlyIntent,
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
    setRestaurantOnlyIntent(null);
    const finalizeSearchThisAreaRerun = () => {
      resetMapMoveFlag();
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
      preserveSheetState: true,
      replaceResultsInPlace: true,
      presentationIntentKind: 'search_this_area',
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
    setRestaurantOnlyIntent,
    submittedQuery,
  ]);

  return React.useMemo(
    () => ({
      handleSearchThisArea,
    }),
    [handleSearchThisArea]
  );
};
