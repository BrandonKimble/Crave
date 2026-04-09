import React from 'react';

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
  'resultsPresentationOwner'
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
  rankButtonLabelText: string;
  rankButtonIsActive: boolean;
  priceButtonLabelText: string;
  priceButtonIsActive: boolean;
  openNow: boolean;
  votesFilterActive: boolean;
  isRankSelectorVisible: boolean;
  isPriceSelectorVisible: boolean;
  runtimeHydratedResultsKey: string | null;
};

export const useSearchResultsPanelInputRuntime = ({
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
  } = useSearchResultsPanelResultsRuntimeState();
  const {
    rankButtonLabelText,
    rankButtonIsActive,
    priceButtonLabelText,
    priceButtonIsActive,
    openNow,
    votesFilterActive,
    isRankSelectorVisible,
    isPriceSelectorVisible,
  } = useSearchResultsPanelFiltersRuntimeState();
  const {
    runOneCommitSpanPressureActive,
    hydrationOperationId,
    allowHydrationFinalizeCommit,
    runtimeHydratedResultsKey,
    isRunOneChromeDeferred,
  } = useSearchResultsPanelHydrationRuntimeState();
  const { pendingPresentationIntentId, renderPolicy } =
    useSearchResultsPanelPresentationRuntimeState();
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
      rankButtonLabelText,
      rankButtonIsActive,
      priceButtonLabelText,
      priceButtonIsActive,
      openNow,
      votesFilterActive,
      isRankSelectorVisible,
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
      isRankSelectorVisible,
      isRunOneChromeDeferred,
      isSearchLoading,
      notifyToggleInteractionFrostReady,
      openNow,
      pendingPresentationIntentId,
      pendingTabSwitchTab,
      priceButtonIsActive,
      priceButtonLabelText,
      rankButtonIsActive,
      rankButtonLabelText,
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
