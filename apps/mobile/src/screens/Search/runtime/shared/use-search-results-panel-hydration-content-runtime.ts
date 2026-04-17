import React from 'react';

import type { SearchRuntimeBus } from './search-runtime-bus';
import type {
  SearchResultsPanelHydrationKeyRuntime,
  SearchResultsPanelOnDemandQueryRuntime,
  SearchResultsPanelRetainedResultsRuntime,
} from './search-results-panel-hydration-runtime-contract';
import { useSearchResultsPanelHydrationKeyRuntime } from './use-search-results-panel-hydration-key-runtime';
import { useSearchResultsPanelOnDemandQueryRuntime } from './use-search-results-panel-on-demand-query-runtime';
import { useSearchResultsPanelRetainedResultsRuntime } from './use-search-results-panel-retained-results-runtime';
import type { SearchResultsPanelInputRuntime } from './use-search-results-panel-input-runtime';

type UseSearchResultsPanelHydrationContentRuntimeArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  panelInputRuntime: SearchResultsPanelInputRuntime;
};

export type SearchResultsPanelHydrationContentRuntime = SearchResultsPanelRetainedResultsRuntime &
  SearchResultsPanelHydrationKeyRuntime &
  SearchResultsPanelOnDemandQueryRuntime;

export const useSearchResultsPanelHydrationContentRuntime = ({
  searchRuntimeBus,
  panelInputRuntime,
}: UseSearchResultsPanelHydrationContentRuntimeArgs): SearchResultsPanelHydrationContentRuntime => {
  const retainedResultsRuntime = useSearchResultsPanelRetainedResultsRuntime({
    results: panelInputRuntime.results,
    searchSheetContentLane: panelInputRuntime.searchSheetContentLane,
  });
  const hydrationKeyRuntime = useSearchResultsPanelHydrationKeyRuntime({
    searchRuntimeBus,
    resolvedResults: retainedResultsRuntime.resolvedResults,
    runtimeHydratedResultsKey: panelInputRuntime.runtimeHydratedResultsKey,
    activeOverlayKey: panelInputRuntime.activeOverlayKey,
  });
  const onDemandQueryRuntime = useSearchResultsPanelOnDemandQueryRuntime({
    resolvedResults: retainedResultsRuntime.resolvedResults,
    submittedQuery: panelInputRuntime.submittedQuery,
  });

  return React.useMemo(
    () => ({
      ...retainedResultsRuntime,
      ...hydrationKeyRuntime,
      ...onDemandQueryRuntime,
    }),
    [hydrationKeyRuntime, onDemandQueryRuntime, retainedResultsRuntime]
  );
};
