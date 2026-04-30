import React from 'react';

import type { SearchResponse } from '../../../../types';
import type { SearchRouteResultsPolicyExactMatchWriterFacet } from '../shared/search-route-results-policy-domain-contract';
import {
  createSearchResultsExactMatchOwnerController,
  toSearchResultsExactMatchProjection,
} from './results-read-model-exact-match-state';

type SearchResultsExactMatchStateRuntimeArgs = {
  results: SearchResponse | null;
  exactMatchWriter?: SearchRouteResultsPolicyExactMatchWriterFacet;
  onShowMoreExactDishes?: () => void;
  onShowMoreExactRestaurants?: () => void;
};

export const useSearchResultsExactMatchStateRuntime = ({
  results,
  exactMatchWriter: providedExactMatchWriter,
  onShowMoreExactDishes,
  onShowMoreExactRestaurants,
}: SearchResultsExactMatchStateRuntimeArgs) => {
  const searchRequestId = results?.metadata?.searchRequestId ?? null;
  const exactDishCountOnPage = results?.metadata?.exactDishCountOnPage;
  const exactRestaurantCountOnPage = results?.metadata?.exactRestaurantCountOnPage;
  const localExactMatchController = React.useMemo(
    () => createSearchResultsExactMatchOwnerController(),
    []
  );
  const exactMatchWriter = providedExactMatchWriter ?? localExactMatchController;
  const [exactMatchState, setExactMatchState] = React.useState(exactMatchWriter.getSnapshot);

  React.useEffect(() => {
    setExactMatchState(exactMatchWriter.updateResults(results));
  }, [
    exactDishCountOnPage,
    exactMatchWriter,
    exactRestaurantCountOnPage,
    results,
    searchRequestId,
  ]);

  const handleShowMoreExactDishes = React.useCallback(() => {
    onShowMoreExactDishes?.();
    setExactMatchState(exactMatchWriter.showMoreExactDishes());
  }, [exactMatchWriter, onShowMoreExactDishes]);

  const handleShowMoreExactRestaurants = React.useCallback(() => {
    onShowMoreExactRestaurants?.();
    setExactMatchState(exactMatchWriter.showMoreExactRestaurants());
  }, [exactMatchWriter, onShowMoreExactRestaurants]);

  const exactMatchProjection = React.useMemo(
    () => toSearchResultsExactMatchProjection(exactMatchState),
    [
      exactMatchState.exactDishesOnPage,
      exactMatchState.exactRestaurantsOnPage,
      exactMatchState.showAllExactDishes,
      exactMatchState.showAllExactRestaurants,
    ]
  );

  return React.useMemo(
    () => ({
      ...exactMatchProjection,
      handleShowMoreExactDishes,
      handleShowMoreExactRestaurants,
    }),
    [exactMatchProjection, handleShowMoreExactDishes, handleShowMoreExactRestaurants]
  );
};
