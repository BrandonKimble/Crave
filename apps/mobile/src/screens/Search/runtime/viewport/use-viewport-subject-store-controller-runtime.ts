import React from 'react';

import { fetchPlacesInView } from '../../../../services/places';
import { recordViewportDwell } from '../../../../services/signals';
import { createViewportSubjectStoreController } from './viewport-subject-store-controller-core';
import type { ViewportBoundsService } from './viewport-bounds-service';

/**
 * THE viewport subject controller's runtime binding: mounts the pure core
 * (viewport-subject-store-controller-core.ts — the settle+dwell hysteresis
 * pipeline over the shared §2.5 law) with the real IO — the sliding-slice
 * read (GET /places/in-view) and the §3 viewport_dwell signal.
 *
 * This hook lives in the search-root runtime layer (mounted from
 * use-search-root-session-services-foundation-runtime) where effects FIRE —
 * NEVER in a scene body-spec hook (CLAUDE.md: effects there are dead code).
 * All law/hysteresis/cadence documentation lives with the core.
 */

type UseViewportSubjectStoreControllerRuntimeArgs = {
  viewportBoundsService: ViewportBoundsService;
};

export const useViewportSubjectStoreControllerRuntime = ({
  viewportBoundsService,
}: UseViewportSubjectStoreControllerRuntimeArgs): void => {
  React.useEffect(
    () =>
      createViewportSubjectStoreController({
        viewportBoundsService,
        fetchSlice: fetchPlacesInView,
        recordDwell: recordViewportDwell,
      }),
    [viewportBoundsService]
  );
};
