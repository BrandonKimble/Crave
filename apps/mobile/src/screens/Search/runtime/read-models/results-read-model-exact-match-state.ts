import type { SearchResponse } from '../../../../types';

export type SearchResultsExactMatchState = {
  sectionedSearchRequestId: string | null;
  exactDishesOnPage: number | null;
  exactRestaurantsOnPage: number | null;
  showAllExactDishes: boolean;
  showAllExactRestaurants: boolean;
};

export type SearchResultsExactMatchProjection = Omit<
  SearchResultsExactMatchState,
  'sectionedSearchRequestId'
>;

export type SearchResultsExactMatchOwnerController = {
  getSnapshot: () => SearchResultsExactMatchState;
  getProjection: () => SearchResultsExactMatchProjection;
  updateResults: (results: SearchResponse | null) => SearchResultsExactMatchState;
  showMoreExactDishes: () => SearchResultsExactMatchState;
  showMoreExactRestaurants: () => SearchResultsExactMatchState;
  reset: () => SearchResultsExactMatchState;
};

export const areSearchResultsExactMatchStatesEqual = (
  left: SearchResultsExactMatchState,
  right: SearchResultsExactMatchState
): boolean =>
  left.sectionedSearchRequestId === right.sectionedSearchRequestId &&
  left.exactDishesOnPage === right.exactDishesOnPage &&
  left.exactRestaurantsOnPage === right.exactRestaurantsOnPage &&
  left.showAllExactDishes === right.showAllExactDishes &&
  left.showAllExactRestaurants === right.showAllExactRestaurants;

export const createInitialSearchResultsExactMatchState = (): SearchResultsExactMatchState => ({
  sectionedSearchRequestId: null,
  exactDishesOnPage: null,
  exactRestaurantsOnPage: null,
  showAllExactDishes: false,
  showAllExactRestaurants: false,
});

export const resolveSearchResultsExactMatchState = ({
  currentState,
  results,
}: {
  currentState: SearchResultsExactMatchState;
  results: SearchResponse | null;
}): SearchResultsExactMatchState => {
  const searchRequestId = results?.metadata?.searchRequestId ?? null;
  const nextExactDishes =
    typeof results?.metadata?.exactDishCountOnPage === 'number'
      ? results.metadata.exactDishCountOnPage
      : null;
  const nextExactRestaurants =
    typeof results?.metadata?.exactRestaurantCountOnPage === 'number'
      ? results.metadata.exactRestaurantCountOnPage
      : null;

  const nextState = !searchRequestId
    ? createInitialSearchResultsExactMatchState()
    : searchRequestId !== currentState.sectionedSearchRequestId
      ? {
          sectionedSearchRequestId: searchRequestId,
          exactDishesOnPage: nextExactDishes,
          exactRestaurantsOnPage: nextExactRestaurants,
          showAllExactDishes: false,
          showAllExactRestaurants: false,
        }
      : {
          ...currentState,
          exactDishesOnPage:
            nextExactDishes !== null && currentState.exactDishesOnPage === null
              ? nextExactDishes
              : currentState.exactDishesOnPage,
          exactRestaurantsOnPage:
            nextExactRestaurants !== null && currentState.exactRestaurantsOnPage === null
              ? nextExactRestaurants
              : currentState.exactRestaurantsOnPage,
        };

  return areSearchResultsExactMatchStatesEqual(currentState, nextState) ? currentState : nextState;
};

export const toSearchResultsExactMatchProjection = ({
  exactDishesOnPage,
  exactRestaurantsOnPage,
  showAllExactDishes,
  showAllExactRestaurants,
}: SearchResultsExactMatchState): SearchResultsExactMatchProjection => ({
  exactDishesOnPage,
  exactRestaurantsOnPage,
  showAllExactDishes,
  showAllExactRestaurants,
});

export const createSearchResultsExactMatchOwnerController =
  (): SearchResultsExactMatchOwnerController => {
    let state = createInitialSearchResultsExactMatchState();

    const setState = (nextState: SearchResultsExactMatchState): SearchResultsExactMatchState => {
      state = areSearchResultsExactMatchStatesEqual(state, nextState) ? state : nextState;
      return state;
    };

    return {
      getSnapshot: () => state,
      getProjection: () => toSearchResultsExactMatchProjection(state),
      updateResults(results) {
        return setState(
          resolveSearchResultsExactMatchState({
            currentState: state,
            results,
          })
        );
      },
      showMoreExactDishes() {
        return setState(
          state.showAllExactDishes
            ? state
            : {
                ...state,
                showAllExactDishes: true,
              }
        );
      },
      showMoreExactRestaurants() {
        return setState(
          state.showAllExactRestaurants
            ? state
            : {
                ...state,
                showAllExactRestaurants: true,
              }
        );
      },
      reset() {
        return setState(createInitialSearchResultsExactMatchState());
      },
    };
  };
