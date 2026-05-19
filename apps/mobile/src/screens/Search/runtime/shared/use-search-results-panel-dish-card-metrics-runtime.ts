import React from 'react';

import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import type { FoodResult } from '../../../../types';
import { getMarkerColorForDish } from '../../utils/marker-lod';

const getNowMs = (): number =>
  typeof performance?.now === 'function' ? performance.now() : Date.now();

export const useSearchResultsPanelDishCardMetricsRuntime = ({
  dishes,
}: {
  dishes: FoodResult[];
}) => {
  const scenarioConfig = usePerfScenarioRuntimeStore((state) => state.activeConfig);
  const dishQualityColorByConnectionId = React.useMemo(() => {
    const startedAtMs = getNowMs();
    const map = new Map<string, string>();
    dishes.forEach((dish) => {
      map.set(dish.connectionId, getMarkerColorForDish(dish));
    });
    const durationMs = getNowMs() - startedAtMs;
    if (isPerfScenarioAttributionActive(scenarioConfig)) {
      logPerfScenarioAttributionEvent('WorkSpan', scenarioConfig, {
        event: 'scenario_work_span',
        owner: 'results_dish_card_metrics',
        durationMs: Number(durationMs.toFixed(3)),
        dishesCount: dishes.length,
      });
    }
    return map;
  }, [dishes, scenarioConfig]);

  return React.useMemo(
    () => ({
      dishQualityColorByConnectionId,
    }),
    [dishQualityColorByConnectionId]
  );
};
