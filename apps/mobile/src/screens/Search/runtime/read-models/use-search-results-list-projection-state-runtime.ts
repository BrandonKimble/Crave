import React from 'react';

import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import type { FoodResult, RestaurantResult, SearchResponse } from '../../../../types';
import type { SearchResultsBodyAdmissionHandoffPhase } from '../shared/search-results-panel-runtime-state-contract';
import { buildSafeResultsDataByTab, type ResultsListItem } from './list-read-model-builder';
import type { SearchRouteResultsPolicyReadModelProjectionFacet } from '../shared/search-route-results-policy-domain-contract';

const getNowMs = (): number =>
  typeof performance?.now === 'function' ? performance.now() : Date.now();

type SearchResultsListProjectionStateRuntimeArgs = {
  activeTab: 'dishes' | 'restaurants';
  dishes: FoodResult[];
  restaurants: RestaurantResult[];
  results: SearchResponse | null;
  shouldRetainCommittedResults: boolean;
  readModelProjection?: SearchRouteResultsPolicyReadModelProjectionFacet;
  searchSurfaceRedrawPhase: SearchResultsBodyAdmissionHandoffPhase;
};

// ONE LIST (owner ruling): the projection is a pass-through of the server's ranked rows.
// It neither reorders nor partitions — `rowsByTab` IS `safeResultsDataByTab`.
export const useSearchResultsListProjectionStateRuntime = ({
  activeTab,
  dishes,
  restaurants,
  results,
  shouldRetainCommittedResults,
  readModelProjection,
  searchSurfaceRedrawPhase,
}: SearchResultsListProjectionStateRuntimeArgs) => {
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
          dishesCount: policySnapshot.rowCountByTab.dishes,
          restaurantsCount: policySnapshot.rowCountByTab.restaurants,
        });
      }
      return {
        buildDurationMs,
        rowsByTab: policySnapshot.rowsByTab,
        rowCountByTab: policySnapshot.rowCountByTab,
      };
    }

    const rowsByTab = buildSafeResultsDataByTab({ dishes, restaurants });
    const rowCountByTab = {
      dishes: rowsByTab.dishes.length,
      restaurants: rowsByTab.restaurants.length,
    };
    const buildDurationMs = getNowMs() - buildStartedAtMs;
    if (isPerfScenarioAttributionActive(scenarioConfig)) {
      logPerfScenarioAttributionEvent('WorkSpan', scenarioConfig, {
        event: 'scenario_work_span',
        owner: 'results_read_model_projection',
        path: 'local_projection',
        durationMs: Number(buildDurationMs.toFixed(3)),
        handoffPhase: searchSurfaceRedrawPhaseRef.current,
        activeTab,
        dishesCount: rowCountByTab.dishes,
        restaurantsCount: rowCountByTab.restaurants,
      });
    }
    return {
      buildDurationMs,
      rowsByTab,
      rowCountByTab,
    };
  }, [
    dishes,
    activeTab,
    readModelProjection,
    restaurants,
    results,
    scenarioConfig,
    shouldRetainCommittedResults,
  ]);

  const activeSafeResultsData = listProjection.rowsByTab[activeTab];

  return React.useMemo(
    () => ({
      activeSafeResultsData,
      buildDurationMs: listProjection.buildDurationMs,
      activeSafeResultsCount: activeSafeResultsData.length,
      safeResultsCountByTab: listProjection.rowCountByTab,
      rowsByTab: listProjection.rowsByTab as {
        dishes: ResultsListItem[];
        restaurants: ResultsListItem[];
      },
    }),
    [
      activeSafeResultsData,
      listProjection.buildDurationMs,
      listProjection.rowCountByTab,
      listProjection.rowsByTab,
    ]
  );
};
