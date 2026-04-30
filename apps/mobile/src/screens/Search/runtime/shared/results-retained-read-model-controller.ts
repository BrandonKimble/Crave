import type { FoodResult, RestaurantResult } from '../../../../types';
import type { SearchResultsPayload } from './search-results-panel-runtime-state-contract';

type SearchResultsRetainedPayload = {
  dishes?: FoodResult[];
  restaurants?: RestaurantResult[];
  metadata?: unknown;
} | null;

export type SearchResultsRetainedReadModel<
  Results extends SearchResultsRetainedPayload = SearchResultsPayload
> = {
  resolvedResults: Results;
  dishes: FoodResult[];
  restaurants: RestaurantResult[];
};

export type SearchResultsRetainedResultsController<
  Results extends SearchResultsRetainedPayload = SearchResultsPayload
> = {
  getRetainedResults: () => Results;
  commitRetainedResults: (args: {
    results: Results;
    shouldRetainCommittedResults: boolean;
  }) => Results;
  readRetainedReadModel: (args: {
    results: Results;
    shouldRetainCommittedResults: boolean;
  }) => SearchResultsRetainedReadModel<Results>;
  reset: (results: Results) => Results;
};

const EMPTY_DISHES: FoodResult[] = [];
const EMPTY_RESTAURANTS: RestaurantResult[] = [];

export const resolveCommittedRetainedResults = <Results extends SearchResultsRetainedPayload>({
  currentRetainedResults,
  results,
  shouldRetainCommittedResults,
}: {
  currentRetainedResults: Results;
  results: Results;
  shouldRetainCommittedResults: boolean;
}): Results => {
  if (results != null) {
    return results;
  }
  if (!shouldRetainCommittedResults) {
    return null as Results;
  }
  return currentRetainedResults;
};

export const resolveRetainedResultsForRender = <Results extends SearchResultsRetainedPayload>({
  retainedResults,
  results,
  shouldRetainCommittedResults,
}: {
  retainedResults: Results;
  results: Results;
  shouldRetainCommittedResults: boolean;
}): Results => (shouldRetainCommittedResults && results == null ? retainedResults : results);

export const resolveSearchResultsRetainedReadModel = <
  Results extends SearchResultsRetainedPayload
>({
  retainedResults,
  results,
  shouldRetainCommittedResults,
}: {
  retainedResults: Results;
  results: Results;
  shouldRetainCommittedResults: boolean;
}): SearchResultsRetainedReadModel<Results> => {
  const resolvedResults = resolveRetainedResultsForRender({
    retainedResults,
    results,
    shouldRetainCommittedResults,
  });
  return {
    resolvedResults,
    dishes: resolvedResults?.dishes ?? EMPTY_DISHES,
    restaurants: resolvedResults?.restaurants ?? EMPTY_RESTAURANTS,
  };
};

export const createSearchResultsRetainedResultsController = <
  Results extends SearchResultsRetainedPayload
>(
  initialResults: Results
): SearchResultsRetainedResultsController<Results> => {
  let retainedResults = initialResults;

  return {
    getRetainedResults: () => retainedResults,
    commitRetainedResults({ results, shouldRetainCommittedResults }) {
      retainedResults = resolveCommittedRetainedResults({
        currentRetainedResults: retainedResults,
        results,
        shouldRetainCommittedResults,
      });
      return retainedResults;
    },
    readRetainedReadModel({ results, shouldRetainCommittedResults }) {
      return resolveSearchResultsRetainedReadModel({
        retainedResults,
        results,
        shouldRetainCommittedResults,
      });
    },
    reset(results) {
      retainedResults = results;
      return retainedResults;
    },
  };
};
