import { useSearchFilterModalRuntime } from './use-search-filter-modal-runtime';
import type {
  SearchSessionFilterRuntime,
  SearchSessionSubmitRuntime,
} from './search-session-action-runtime-contract';
import type { SearchRootPrimitivesRuntime } from './use-search-root-primitives-runtime';
import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';

type UseSearchRootFilterSurfaceRuntimeArgs = {
  submitRuntime: SearchSessionSubmitRuntime & {
    scheduleToggleCommit: Parameters<typeof useSearchFilterModalRuntime>[0]['scheduleToggleCommit'];
  };
  rootSessionRuntime: SearchRootSessionRuntime;
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootScaffoldRuntime: SearchRootScaffoldRuntime;
};

export const useSearchRootFilterSurfaceRuntime = ({
  submitRuntime,
  rootSessionRuntime,
  rootPrimitivesRuntime,
  rootScaffoldRuntime,
}: UseSearchRootFilterSurfaceRuntimeArgs): SearchSessionFilterRuntime => {
  const { submitRuntimeResult, scheduleToggleCommit } = submitRuntime;

  const filterModalRuntime = useSearchFilterModalRuntime({
    searchRuntimeBus: rootSessionRuntime.runtimeOwner.searchRuntimeBus,
    searchMode: rootSessionRuntime.runtimeFlags.searchMode,
    activeTab: rootPrimitivesRuntime.searchState.activeTab,
    submittedQuery: rootSessionRuntime.resultsArrivalState.submittedQuery,
    query: rootPrimitivesRuntime.searchState.query,
    isSearchSessionActive: rootSessionRuntime.runtimeFlags.isSearchSessionActive,
    openNow: rootSessionRuntime.filterStateRuntime.openNow,
    votesFilterActive: rootSessionRuntime.filterStateRuntime.votes100Plus,
    votes100Plus: rootSessionRuntime.filterStateRuntime.votes100Plus,
    scoreMode: rootSessionRuntime.filterStateRuntime.scoreMode,
    priceLevels: rootSessionRuntime.filterStateRuntime.priceLevels,
    panelVisible: rootScaffoldRuntime.resultsSheetRuntimeOwner.panelVisible,
    setVotes100Plus: rootSessionRuntime.filterStateRuntime.setVotes100Plus,
    setOpenNow: rootSessionRuntime.filterStateRuntime.setOpenNow,
    setPriceLevels: rootSessionRuntime.filterStateRuntime.setPriceLevels,
    setPreferredScoreMode: rootSessionRuntime.filterStateRuntime.setPreferredScoreMode,
    scheduleToggleCommit,
    rerunActiveSearch: submitRuntimeResult.rerunActiveSearch,
    registerTransientDismissor:
      rootScaffoldRuntime.overlaySessionRuntime.registerTransientDismissor,
    onMechanismEvent: rootScaffoldRuntime.instrumentationRuntime.emitRuntimeMechanismEvent,
  });

  return {
    filterModalRuntime,
  };
};
