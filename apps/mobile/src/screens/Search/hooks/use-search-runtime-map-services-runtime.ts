import React from 'react';

import type { MapBounds } from '../../../types';
import { createMapQueryBudget, type MapQueryBudget } from '../runtime/map/map-query-budget';
import {
  createViewportBoundsService,
  type ViewportBoundsService,
} from '../runtime/viewport/viewport-bounds-service';

type UseSearchRuntimeMapServicesRuntimeArgs = {
  startupPollBounds: MapBounds | null;
};

export type SearchRuntimeMapServicesRuntime = {
  mapQueryBudget: MapQueryBudget;
  viewportBoundsService: ViewportBoundsService;
  latestBoundsRef: React.MutableRefObject<MapBounds | null>;
};

export const useSearchRuntimeMapServicesRuntime = ({
  startupPollBounds,
}: UseSearchRuntimeMapServicesRuntimeArgs): SearchRuntimeMapServicesRuntime => {
  const mapQueryBudgetRef = React.useRef<MapQueryBudget | null>(null);
  if (!mapQueryBudgetRef.current) {
    mapQueryBudgetRef.current = createMapQueryBudget();
  }
  const mapQueryBudget = mapQueryBudgetRef.current;

  const viewportBoundsServiceRef = React.useRef<ViewportBoundsService | null>(null);
  if (!viewportBoundsServiceRef.current) {
    viewportBoundsServiceRef.current = createViewportBoundsService(startupPollBounds);
  }
  const viewportBoundsService = viewportBoundsServiceRef.current;
  const latestBoundsRef = viewportBoundsService.boundsRef;

  return React.useMemo(
    () => ({
      mapQueryBudget,
      viewportBoundsService,
      latestBoundsRef,
    }),
    [latestBoundsRef, mapQueryBudget, viewportBoundsService]
  );
};
