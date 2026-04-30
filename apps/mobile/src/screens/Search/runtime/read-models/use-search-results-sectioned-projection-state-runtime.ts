import React from 'react';

import type { FoodResult, RestaurantResult, SearchResponse } from '../../../../types';
import { type ResultsListItem } from './list-read-model-builder';
import {
  buildSearchResultsSectionedProjection,
  resolveSearchResultsSectionedProjectionCounts,
} from './results-read-model-sectioned-projection';
import type { useSearchResultsExactMatchStateRuntime } from './use-search-results-exact-match-state-runtime';
import type { SearchRouteResultsPolicyReadModelProjectionFacet } from '../shared/search-route-results-policy-domain-contract';

const getNowMs = (): number =>
  typeof performance?.now === 'function' ? performance.now() : Date.now();

type SearchResultsSectionedProjectionStateRuntimeArgs = {
  activeTab: 'dishes' | 'restaurants';
  dishes: FoodResult[];
  restaurants: RestaurantResult[];
  exactMatchStateRuntime: ReturnType<typeof useSearchResultsExactMatchStateRuntime>;
  results: SearchResponse | null;
  shouldRetainCommittedResults: boolean;
  readModelProjection?: SearchRouteResultsPolicyReadModelProjectionFacet;
};

export const useSearchResultsSectionedProjectionStateRuntime = ({
  activeTab,
  dishes,
  restaurants,
  exactMatchStateRuntime,
  results,
  shouldRetainCommittedResults,
  readModelProjection,
}: SearchResultsSectionedProjectionStateRuntimeArgs) => {
  const listProjection = React.useMemo(() => {
    const buildStartedAtMs = getNowMs();
    if (readModelProjection) {
      const policySnapshot = readModelProjection.readSnapshot({
        activeTab,
        results,
        shouldRetainCommittedResults,
      });
      return {
        buildDurationMs: getNowMs() - buildStartedAtMs,
        safeResultsDataByTab: policySnapshot.safeResultsDataByTab,
        sectionedRowsByTab: policySnapshot.rowsByTab,
        projectionCounts: {
          safeRowCountByTab: policySnapshot.safeRowCountByTab,
          sectionedRowCountByTab: policySnapshot.sectionedRowCountByTab,
        },
      };
    }

    const sectionedProjection = buildSearchResultsSectionedProjection({
      dishes,
      restaurants,
      exactMatchState: exactMatchStateRuntime,
    });
    const projectionCounts = resolveSearchResultsSectionedProjectionCounts(sectionedProjection);
    return {
      buildDurationMs: getNowMs() - buildStartedAtMs,
      ...sectionedProjection,
      projectionCounts,
    };
  }, [
    dishes,
    exactMatchStateRuntime.exactDishesOnPage,
    exactMatchStateRuntime.exactRestaurantsOnPage,
    exactMatchStateRuntime.showAllExactDishes,
    exactMatchStateRuntime.showAllExactRestaurants,
    activeTab,
    readModelProjection,
    restaurants,
    results,
    shouldRetainCommittedResults,
  ]);

  const activeSafeResultsData = listProjection.safeResultsDataByTab[activeTab];
  const activeSectionedRows = listProjection.sectionedRowsByTab[activeTab];

  return React.useMemo(
    () => ({
      activeSafeResultsData,
      buildDurationMs: listProjection.buildDurationMs,
      activeSafeResultsCount: activeSafeResultsData.length,
      activeSectionedRowCount: activeSectionedRows.length,
      safeResultsCountByTab: listProjection.projectionCounts.safeRowCountByTab,
      rowsByTab: listProjection.sectionedRowsByTab as {
        dishes: ResultsListItem[];
        restaurants: ResultsListItem[];
      },
    }),
    [
      activeSafeResultsData,
      activeSectionedRows.length,
      listProjection.buildDurationMs,
      listProjection.projectionCounts.safeRowCountByTab,
      listProjection.sectionedRowsByTab,
    ]
  );
};
