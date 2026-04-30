import type { FoodResult, RestaurantResult } from '../../../../types';
import {
  buildSafeResultsData,
  buildSectionedResultsData,
  type ResultsListItem,
} from './list-read-model-builder';
import type { SearchResultsExactMatchProjection } from './results-read-model-exact-match-state';

export const SEARCH_RESULTS_EXACT_VISIBLE_LIMIT = 5;

export type SearchResultsReadModelTab = 'dishes' | 'restaurants';

export type SearchResultsSectionedProjection = {
  safeResultsDataByTab: {
    dishes: Array<FoodResult | RestaurantResult>;
    restaurants: Array<FoodResult | RestaurantResult>;
  };
  sectionedRowsByTab: {
    dishes: ResultsListItem[];
    restaurants: ResultsListItem[];
  };
};

export type SearchResultsSectionedProjectionCounts = {
  safeRowCountByTab: Record<SearchResultsReadModelTab, number>;
  sectionedRowCountByTab: Record<SearchResultsReadModelTab, number>;
};

export const buildSearchResultsSectionedProjection = ({
  dishes,
  restaurants,
  exactMatchState,
}: {
  dishes: FoodResult[];
  restaurants: RestaurantResult[];
  exactMatchState: SearchResultsExactMatchProjection;
}): SearchResultsSectionedProjection => {
  const safeDishesData = buildSafeResultsData({
    activeTab: 'dishes',
    dishes,
    restaurants,
  });
  const safeRestaurantsData = buildSafeResultsData({
    activeTab: 'restaurants',
    dishes,
    restaurants,
  });
  const sectionedDishesData = buildSectionedResultsData({
    activeTab: 'dishes',
    safeResultsData: safeDishesData,
    exactDishesOnPage: exactMatchState.exactDishesOnPage,
    exactRestaurantsOnPage: exactMatchState.exactRestaurantsOnPage,
    showAllExactDishes: exactMatchState.showAllExactDishes,
    showAllExactRestaurants: exactMatchState.showAllExactRestaurants,
    exactVisibleLimit: SEARCH_RESULTS_EXACT_VISIBLE_LIMIT,
  });
  const sectionedRestaurantsData = buildSectionedResultsData({
    activeTab: 'restaurants',
    safeResultsData: safeRestaurantsData,
    exactDishesOnPage: exactMatchState.exactDishesOnPage,
    exactRestaurantsOnPage: exactMatchState.exactRestaurantsOnPage,
    showAllExactDishes: exactMatchState.showAllExactDishes,
    showAllExactRestaurants: exactMatchState.showAllExactRestaurants,
    exactVisibleLimit: SEARCH_RESULTS_EXACT_VISIBLE_LIMIT,
  });

  return {
    safeResultsDataByTab: {
      dishes: safeDishesData,
      restaurants: safeRestaurantsData,
    },
    sectionedRowsByTab: {
      dishes: sectionedDishesData,
      restaurants: sectionedRestaurantsData,
    },
  };
};

export const resolveSearchResultsSectionedProjectionCounts = ({
  safeResultsDataByTab,
  sectionedRowsByTab,
}: SearchResultsSectionedProjection): SearchResultsSectionedProjectionCounts => ({
  safeRowCountByTab: {
    dishes: safeResultsDataByTab.dishes.length,
    restaurants: safeResultsDataByTab.restaurants.length,
  },
  sectionedRowCountByTab: {
    dishes: sectionedRowsByTab.dishes.length,
    restaurants: sectionedRowsByTab.restaurants.length,
  },
});
