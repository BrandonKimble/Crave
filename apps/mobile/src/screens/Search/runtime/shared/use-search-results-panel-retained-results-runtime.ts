import React from 'react';

import type { FoodResult, RestaurantResult } from '../../../../types';
import type { SearchResultsPanelRetainedResultsRuntime } from './search-results-panel-hydration-runtime-contract';
import type { SearchResultsPayload } from './search-results-panel-runtime-state-contract';
import type { SearchResultsShellModel } from './results-presentation-shell-contract';

const EMPTY_DISHES: FoodResult[] = [];
const EMPTY_RESTAURANTS: RestaurantResult[] = [];

type UseSearchResultsPanelRetainedResultsRuntimeArgs = {
  results: SearchResultsPayload;
  searchSheetContentLane: SearchResultsShellModel['searchSheetContentLane'];
};

export const useSearchResultsPanelRetainedResultsRuntime = ({
  results,
  searchSheetContentLane,
}: UseSearchResultsPanelRetainedResultsRuntimeArgs): SearchResultsPanelRetainedResultsRuntime => {
  const shouldRetainCommittedResults = searchSheetContentLane.kind !== 'persistent_poll';
  const [retainedResults, setRetainedResults] = React.useState(results);

  React.useEffect(() => {
    if (results != null) {
      setRetainedResults(results);
      return;
    }
    if (!shouldRetainCommittedResults) {
      setRetainedResults(null);
    }
  }, [results, shouldRetainCommittedResults]);

  const resolvedResults =
    shouldRetainCommittedResults && results == null ? retainedResults : results;
  const dishes = resolvedResults?.dishes ?? EMPTY_DISHES;
  const restaurants = resolvedResults?.restaurants ?? EMPTY_RESTAURANTS;

  return React.useMemo(
    () => ({
      resolvedResults,
      dishes,
      restaurants,
    }),
    [dishes, resolvedResults, restaurants]
  );
};
