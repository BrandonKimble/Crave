import React from 'react';

import { buildMapStyleURL } from '../../../../constants/map';
import { createSearchRootMapSurfaceState } from '../controller/search-root-map-surface-state-controller-runtime';
import type { SearchRootMapViewportIntentRuntime } from './search-root-map-viewport-intent-runtime-contract';
import { useSearchRootMapPresentationLifecycleRuntime } from './use-search-root-map-presentation-lifecycle-runtime';
import type { useSearchRootMapPresentationRuntime } from './use-search-root-map-presentation-runtime';
import type { useSearchScreenAppEntryPlaneRuntime } from './use-search-screen-app-entry-plane-runtime';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';

type UseSearchRootMapSurfaceStateRuntimeArgs = {
  appEntryPlaneRuntime: Pick<ReturnType<typeof useSearchScreenAppEntryPlaneRuntime>, 'accessToken'>;
  stateFoundationLane: SearchRootStateFoundationLane;
  mapViewportIntentRuntime: SearchRootMapViewportIntentRuntime;
  mapPresentationRuntime: ReturnType<typeof useSearchRootMapPresentationRuntime>;
};

export type SearchRootMapSurfaceStateRuntimeValue = {
  styleURL: string;
  presentationLifecyclePort: ReturnType<typeof useSearchRootMapPresentationLifecycleRuntime>;
  mapSurfaceState: ReturnType<typeof createSearchRootMapSurfaceState>;
};

export const useSearchRootMapSurfaceStateRuntime = ({
  appEntryPlaneRuntime,
  stateFoundationLane,
  mapViewportIntentRuntime,
  mapPresentationRuntime,
}: UseSearchRootMapSurfaceStateRuntimeArgs): SearchRootMapSurfaceStateRuntimeValue => {
  const styleURL = React.useMemo(
    () => buildMapStyleURL(appEntryPlaneRuntime.accessToken ?? ''),
    [appEntryPlaneRuntime.accessToken]
  );

  const presentationLifecyclePort = useSearchRootMapPresentationLifecycleRuntime({
    presentationLifecycleHandlers: mapPresentationRuntime.presentationLifecycleHandlers,
  });

  const mapSurfaceState = React.useMemo(
    () =>
      createSearchRootMapSurfaceState({
        stateFoundationLane,
        mapViewportIntentRuntime,
      }),
    [
      // F1610/F1611 (second site, found 2026-08-04 by the mechanical dep-coverage scanner):
      // `createSearchRootMapSurfaceState` READS mapBearing and mapPitch, and this dep array
      // omitted both — so a bearing/pitch-only intent could not invalidate this memo, and the
      // stale `mapSurfaceState` it returned is exactly what feeds the presentation-props memo
      // where F1611 was hand-fixed in 68e61fed7. That fix could not take effect while this
      // gate withheld the recompute. Latent, not live (no shipping path emits a bearing/
      // pitch-only intent — see the sim attribution), but the truth is restored here and the
      // scanner in spec-support/repacker-dep-array-coverage.spec.ts now holds it.
      mapViewportIntentRuntime.isFollowingUser,
      mapViewportIntentRuntime.mapBearing,
      mapViewportIntentRuntime.mapCameraAnimation,
      mapViewportIntentRuntime.mapCenter,
      mapViewportIntentRuntime.mapPitch,
      mapViewportIntentRuntime.mapZoom,
      stateFoundationLane.rootPrimitivesRuntime.mapState.cameraRef,
      stateFoundationLane.rootPrimitivesRuntime.mapState.mapRef,
    ]
  );

  return React.useMemo(
    () => ({
      styleURL,
      presentationLifecyclePort,
      mapSurfaceState,
    }),
    [mapSurfaceState, presentationLifecyclePort, styleURL]
  );
};
