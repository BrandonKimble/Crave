import React from 'react';

import type { SearchRuntimeBus } from './search-runtime-bus';
import type { SearchResultsPanelDataRuntime } from './search-results-panel-data-runtime-contract';
import type { SearchResultsPanelListSelectorsRuntime } from './use-search-results-panel-list-selectors-runtime';

type UseSearchResultsPanelListPublicationRuntimeArgs = Pick<
  SearchResultsPanelDataRuntime,
  'resolvedResults' | 'resultsHydrationKey' | 'hydratedResultsKey' | 'shouldHydrateResultsForRender'
> &
  SearchResultsPanelListSelectorsRuntime & {
    searchRuntimeBus: SearchRuntimeBus;
  };

export const useSearchResultsPanelListPublicationRuntime = ({
  searchRuntimeBus,
  resolvedResults,
  resultsHydrationKey,
  hydratedResultsKey,
  shouldHydrateResultsForRender,
  resultsReadModelSelectors,
}: UseSearchResultsPanelListPublicationRuntimeArgs): void => {
  const resultsFirstPaintKey = resolvedResults != null ? resultsHydrationKey : null;

  React.useEffect(() => {
    searchRuntimeBus.publish({
      resultsHydrationKey,
      hydratedResultsKey,
      resultsFirstPaintKey,
      listFirstPaintReady: resultsFirstPaintKey != null,
      shouldHydrateResultsForRender,
      isResultsHydrationSettled: resultsReadModelSelectors.isResultsHydrationSettled,
    });
  }, [
    hydratedResultsKey,
    resultsFirstPaintKey,
    resultsHydrationKey,
    resultsReadModelSelectors.isResultsHydrationSettled,
    searchRuntimeBus,
    shouldHydrateResultsForRender,
  ]);
};
