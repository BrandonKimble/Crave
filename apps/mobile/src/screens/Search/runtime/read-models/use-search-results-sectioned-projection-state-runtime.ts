import React from 'react';

import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import type { FoodResult, RestaurantResult, SearchResponse } from '../../../../types';
import type { SearchSurfaceRedrawPhase } from '../controller/search-surface-redraw-phase';
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
  searchSurfaceRedrawPhase: SearchSurfaceRedrawPhase;
};

export const useSearchResultsSectionedProjectionStateRuntime = ({
  activeTab,
  dishes,
  restaurants,
  exactMatchStateRuntime,
  results,
  shouldRetainCommittedResults,
  readModelProjection,
  searchSurfaceRedrawPhase,
}: SearchResultsSectionedProjectionStateRuntimeArgs) => {
  const scenarioConfig = usePerfScenarioRuntimeStore((state) => state.activeConfig);
  const searchSurfaceRedrawPhaseRef = React.useRef(searchSurfaceRedrawPhase);
  searchSurfaceRedrawPhaseRef.current = searchSurfaceRedrawPhase;
  const listProjection = React.useMemo(() => {
    const buildStartedAtMs = getNowMs();
    if (readModelProjection) {
      const policySnapshot = readModelProjection.readSnapshot({
        activeTab,
        results,
        shouldRetainCommittedResults,
      });
      const buildDurationMs = getNowMs() - buildStartedAtMs;
      if (isPerfScenarioAttributionActive(scenarioConfig)) {
        logPerfScenarioAttributionEvent('WorkSpan', scenarioConfig, {
          event: 'scenario_work_span',
          owner: 'results_read_model_projection',
          path: 'policy_snapshot',
          durationMs: Number(buildDurationMs.toFixed(3)),
          handoffPhase: searchSurfaceRedrawPhaseRef.current,
          activeTab,
          dishesCount: policySnapshot.safeRowCountByTab.dishes,
          restaurantsCount: policySnapshot.safeRowCountByTab.restaurants,
        });
      }
      return {
        buildDurationMs,
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
    const buildDurationMs = getNowMs() - buildStartedAtMs;
    if (isPerfScenarioAttributionActive(scenarioConfig)) {
      logPerfScenarioAttributionEvent('WorkSpan', scenarioConfig, {
        event: 'scenario_work_span',
        owner: 'results_read_model_projection',
        path: 'local_projection',
        durationMs: Number(buildDurationMs.toFixed(3)),
        handoffPhase: searchSurfaceRedrawPhaseRef.current,
        activeTab,
        dishesCount: projectionCounts.safeRowCountByTab.dishes,
        restaurantsCount: projectionCounts.safeRowCountByTab.restaurants,
      });
    }
    return {
      buildDurationMs,
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
    scenarioConfig,
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
