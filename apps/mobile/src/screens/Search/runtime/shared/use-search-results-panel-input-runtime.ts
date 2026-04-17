import React from 'react';

import type { SearchRuntimeBus } from './search-runtime-bus';
import type {
  SearchResultsPanelDataRuntime,
  UseSearchResultsPanelDataRuntimeArgs,
} from './search-results-panel-data-runtime-contract';
import { useSearchResultsPanelFiltersRuntimeState } from './use-search-results-panel-filters-runtime-state';
import { useSearchResultsPanelHydrationRuntimeState } from './use-search-results-panel-hydration-runtime-state';
import { useSearchResultsPanelOverlayRuntime } from './use-search-results-panel-overlay-runtime';
import { useSearchResultsPanelPresentationRuntimeState } from './use-search-results-panel-presentation-runtime-state';
import { useSearchResultsPanelResultsRuntimeState } from './use-search-results-panel-results-runtime-state';

type UseSearchResultsPanelInputRuntimeArgs = Pick<
  UseSearchResultsPanelDataRuntimeArgs,
  'searchRuntimeBus' | 'resultsPresentationOwner'
>;

export type SearchResultsPanelInputRuntime = Pick<
  SearchResultsPanelDataRuntime,
  | 'searchSheetContentLane'
  | 'handleCloseResults'
  | 'notifyToggleInteractionFrostReady'
  | 'renderPolicy'
  | 'pendingPresentationIntentId'
  | 'activeTab'
  | 'canLoadMore'
  | 'isSearchLoading'
  | 'isLoadingMore'
  | 'submittedQuery'
  | 'activeOverlayKey'
  | 'runOneCommitSpanPressureActive'
  | 'isRunOneChromeDeferred'
  | 'hydrationOperationId'
  | 'allowHydrationFinalizeCommit'
> & {
  results: SearchResultsPanelDataRuntime['resolvedResults'];
  pendingTabSwitchTab: 'dishes' | 'restaurants' | null;
  priceButtonLabelText: string;
  priceButtonIsActive: boolean;
  openNow: boolean;
  votesFilterActive: boolean;
  isPriceSelectorVisible: boolean;
  runtimeHydratedResultsKey: string | null;
};

export const useSearchResultsPanelInputRuntime = ({
  searchRuntimeBus,
  resultsPresentationOwner,
}: UseSearchResultsPanelInputRuntimeArgs): SearchResultsPanelInputRuntime => {
  const {
    shellModel: resultsShellModel,
    presentationActions: resultsPresentationActions,
    interactionModel: resultsInteractionModel,
  } = resultsPresentationOwner;
  const { searchSheetContentLane } = resultsShellModel;
  const { handleCloseResults } = resultsPresentationActions;
  const { notifyToggleInteractionFrostReady } = resultsInteractionModel;
  const {
    results,
    activeTab,
    pendingTabSwitchTab,
    canLoadMore,
    isSearchLoading,
    isLoadingMore,
    submittedQuery,
  } = useSearchResultsPanelResultsRuntimeState(searchRuntimeBus);
  const {
    priceButtonLabelText,
    priceButtonIsActive,
    openNow,
    votesFilterActive,
    isPriceSelectorVisible,
  } = useSearchResultsPanelFiltersRuntimeState(searchRuntimeBus);
  const {
    runOneCommitSpanPressureActive,
    hydrationOperationId,
    allowHydrationFinalizeCommit,
    runtimeHydratedResultsKey,
    isRunOneChromeDeferred,
  } = useSearchResultsPanelHydrationRuntimeState(searchRuntimeBus);
  const { pendingPresentationIntentId, renderPolicy } =
    useSearchResultsPanelPresentationRuntimeState(searchRuntimeBus);
  const { activeOverlayKey } = useSearchResultsPanelOverlayRuntime();

  return React.useMemo(
    () => ({
      searchSheetContentLane,
      handleCloseResults,
      notifyToggleInteractionFrostReady,
      renderPolicy,
      pendingPresentationIntentId,
      results,
      activeTab,
      pendingTabSwitchTab,
      canLoadMore,
      isSearchLoading,
      isLoadingMore,
      submittedQuery,
      activeOverlayKey,
      runOneCommitSpanPressureActive,
      isRunOneChromeDeferred,
      hydrationOperationId,
      allowHydrationFinalizeCommit,
      priceButtonLabelText,
      priceButtonIsActive,
      openNow,
      votesFilterActive,
      isPriceSelectorVisible,
      runtimeHydratedResultsKey,
    }),
    [
      activeOverlayKey,
      activeTab,
      allowHydrationFinalizeCommit,
      canLoadMore,
      handleCloseResults,
      hydrationOperationId,
      isLoadingMore,
      isPriceSelectorVisible,
      isRunOneChromeDeferred,
      isSearchLoading,
      notifyToggleInteractionFrostReady,
      openNow,
      pendingPresentationIntentId,
      pendingTabSwitchTab,
      priceButtonIsActive,
      priceButtonLabelText,
      renderPolicy,
      results,
      runOneCommitSpanPressureActive,
      runtimeHydratedResultsKey,
      searchSheetContentLane,
      submittedQuery,
      votesFilterActive,
    ]
  );
};
