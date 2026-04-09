import React from 'react';

import {
  resolveResultsPresentationPanelState,
  type ResultsPresentationPanelState,
} from './results-presentation-panel-state-contract';
import type { type ResultsPresentationPanelState } from './results-presentation-panel-state-contract';
import type { SearchResultsPanelDataRuntime } from './search-results-panel-data-runtime-contract';
import type { SearchResultsPanelReadModelRuntime } from './use-search-results-panel-read-model-runtime';

type UseSearchResultsPanelRenderPolicyRuntimeArgs = {
  panelDataRuntime: SearchResultsPanelDataRuntime;
  readModelRuntime: SearchResultsPanelReadModelRuntime;
};

export type SearchResultsPanelRenderPolicyRuntime = ResultsPresentationPanelState;

export const useSearchResultsPanelRenderPolicyRuntime = ({
  panelDataRuntime,
  readModelRuntime,
}: UseSearchResultsPanelRenderPolicyRuntimeArgs): SearchResultsPanelRenderPolicyRuntime => {
  const { searchSheetContentLane, renderPolicy, activeTab, isSearchLoading } = panelDataRuntime;
  const { shouldUsePlaceholderRows, hasResolvedResults, resultsReadModelSelectors } =
    readModelRuntime;

  const isResultsClosing = searchSheetContentLane.kind === 'results_closing';
  const isPersistentPollLane = searchSheetContentLane.kind === 'persistent_poll';

  return React.useMemo(
    () =>
      resolveResultsPresentationPanelState({
        renderPolicy,
        allowsInteractionLoadingState: !isResultsClosing && !isPersistentPollLane,
        hasRenderableRows: resultsReadModelSelectors.rowsByTab[activeTab].length > 0,
        hasResolvedResults,
        isSearchLoading,
        shouldUsePlaceholderRows,
      }),
    [
      activeTab,
      hasResolvedResults,
      isPersistentPollLane,
      isResultsClosing,
      isSearchLoading,
      renderPolicy,
      resultsReadModelSelectors,
      shouldUsePlaceholderRows,
    ]
  );
};
