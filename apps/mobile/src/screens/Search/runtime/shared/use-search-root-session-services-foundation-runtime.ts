import React from 'react';

import type { SearchRootPrimitivesRuntime } from './search-root-primitives-runtime-contract';
import type { SearchRootSessionServicesFoundationRuntime } from './search-root-session-services-foundation-runtime-contract';
import type {
  SearchRootSessionControlServicesRuntime,
  UseSearchRootSessionRuntimeArgs,
} from './use-search-root-session-runtime-contract';
import { useSearchRootSessionInteractionPrimitivesRuntime } from './use-search-root-session-interaction-primitives-runtime';
import { useSearchRuntimeCameraIntentRuntime } from '../../hooks/use-search-runtime-camera-intent-runtime';
import { useSearchRuntimeMapServicesRuntime } from '../../hooks/use-search-runtime-map-services-runtime';
import { useSearchRuntimeSessionServicesRuntime } from '../../hooks/use-search-runtime-session-services-runtime';
import { useSearchRuntimeWorkCoordinationRuntime } from '../../hooks/use-search-runtime-work-coordination-runtime';
import type { SearchRuntimeBus } from './search-runtime-bus';

type UseSearchRootSessionServicesFoundationRuntimeArgs = Pick<
  UseSearchRootSessionRuntimeArgs,
  'startupPollBounds' | 'searchMapNativeCameraExecutor'
> & {
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  searchRuntimeBus: SearchRuntimeBus;
};

export const useSearchRootSessionServicesFoundationRuntime = ({
  startupPollBounds,
  rootPrimitivesRuntime,
  searchMapNativeCameraExecutor,
  searchRuntimeBus,
}: UseSearchRootSessionServicesFoundationRuntimeArgs): SearchRootSessionServicesFoundationRuntime => {
  const interactionPrimitivesRuntime = useSearchRootSessionInteractionPrimitivesRuntime({
    rootPrimitivesRuntime,
  });
  const mapServicesRuntime = useSearchRuntimeMapServicesRuntime({
    startupPollBounds,
  });
  const cameraIntentRuntime = useSearchRuntimeCameraIntentRuntime({
    cameraRef: rootPrimitivesRuntime.mapState.cameraRef,
    searchMapNativeCameraExecutor,
    setMapCenter: rootPrimitivesRuntime.mapState.setMapCenter,
    setMapZoom: rootPrimitivesRuntime.mapState.setMapZoom,
    setMapCameraAnimation: rootPrimitivesRuntime.mapState.setMapCameraAnimation,
  });
  const sessionServicesRuntime = useSearchRuntimeSessionServicesRuntime();
  const workCoordinationRuntime = useSearchRuntimeWorkCoordinationRuntime({
    searchRuntimeBus,
  });
  const busRuntime = React.useMemo(
    () => ({
      searchRuntimeBus,
    }),
    [searchRuntimeBus]
  );
  const sessionControlServices = React.useMemo<SearchRootSessionControlServicesRuntime>(
    () => ({
      ...mapServicesRuntime,
      ...cameraIntentRuntime,
      ...sessionServicesRuntime,
      ...busRuntime,
      ...workCoordinationRuntime,
    }),
    [
      busRuntime,
      cameraIntentRuntime,
      mapServicesRuntime,
      sessionServicesRuntime,
      workCoordinationRuntime,
    ]
  );

  return React.useMemo(
    () => ({
      interactionPrimitivesRuntime,
      sessionControlServices,
    }),
    [interactionPrimitivesRuntime, sessionControlServices]
  );
};
