import React from 'react';

import type { MapQueryBudget } from '../map/map-query-budget';

const getNowMs = (): number =>
  typeof performance?.now === 'function' ? performance.now() : Date.now();

export const useSearchResultsHydrationKeyApplyRuntime = ({
  setHydratedResultsKeySync,
  mapQueryBudget,
}: {
  setHydratedResultsKeySync: (nextHydrationKey: string | null) => void;
  mapQueryBudget: MapQueryBudget;
}) =>
  React.useCallback(
    (nextHydrationKey: string | null) => {
      const commitStartedAtMs = getNowMs();
      setHydratedResultsKeySync(nextHydrationKey);
      const durationMs = getNowMs() - commitStartedAtMs;
      mapQueryBudget.recordRuntimeAttributionDurationMs(
        'hydration_commit_apply',
        durationMs
      );
      mapQueryBudget.recordRuntimeAttributionDurationMs(
        'hydration_finalize_key_commit',
        durationMs
      );
      return durationMs;
    },
    [mapQueryBudget, setHydratedResultsKeySync]
  );
