import React from 'react';

import type { MapBounds } from '../../../types';
import {
  createViewportBoundsService,
  type ViewportBoundsService,
} from '../runtime/viewport/viewport-bounds-service';

type UseSearchRuntimeMapServicesRuntimeArgs = {
  startupPollBounds: MapBounds | null;
};

export type SearchRuntimeMapServicesRuntime = {
  viewportBoundsService: ViewportBoundsService;
  latestBoundsRef: React.MutableRefObject<MapBounds | null>;
};

export const useSearchRuntimeMapServicesRuntime = ({
  startupPollBounds,
}: UseSearchRuntimeMapServicesRuntimeArgs): SearchRuntimeMapServicesRuntime => {
  const viewportBoundsServiceRef = React.useRef<ViewportBoundsService | null>(null);
  if (!viewportBoundsServiceRef.current) {
    viewportBoundsServiceRef.current = createViewportBoundsService(startupPollBounds);
  }
  const viewportBoundsService = viewportBoundsServiceRef.current;
  const latestBoundsRef = viewportBoundsService.boundsRef;

  return React.useMemo(
    () => ({
      viewportBoundsService,
      latestBoundsRef,
    }),
    [latestBoundsRef, viewportBoundsService]
  );
};
