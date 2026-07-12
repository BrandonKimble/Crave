import React from 'react';
import MapboxGL from '@rnmapbox/maps';

import type { MainLaunchCoordinatorValue } from '../../../../navigation/runtime/MainLaunchCoordinator';
import type { SearchRootEnvironment } from './search-root-environment-contract';
import type { SearchRootPrimitivesRuntime } from './search-root-primitives-runtime-contract';
import type {
  SearchRootMapBootstrapRuntime,
  SearchRootSessionPrimitivesLane,
} from './use-search-root-session-runtime-contract';

type UseSearchRootMapBootstrapRuntimeArgs = {
  accessToken: SearchRootEnvironment['accessToken'];
  startupCamera: MainLaunchCoordinatorValue['startupCamera'];
  markMainMapLoaded: () => void;
  markMainMapReady: () => void;
  commitCameraViewport: SearchRootSessionPrimitivesLane['primitives']['commitCameraViewport'];
  lastCameraStateRef: SearchRootSessionPrimitivesLane['primitives']['lastCameraStateRef'];
  lastPersistedCameraRef: SearchRootSessionPrimitivesLane['primitives']['lastPersistedCameraRef'];
  viewportBoundsService: {
    seedCamera: (camera: { center: [number, number]; zoom: number }) => void;
  };
  mapState: Pick<
    SearchRootPrimitivesRuntime['mapState'],
    'setMapCenter' | 'setMapZoom' | 'setIsFollowingUser'
  >;
};

export const useSearchRootMapBootstrapRuntime = ({
  accessToken,
  startupCamera,
  markMainMapLoaded,
  markMainMapReady,
  commitCameraViewport,
  lastCameraStateRef,
  lastPersistedCameraRef,
  viewportBoundsService,
  mapState,
}: UseSearchRootMapBootstrapRuntimeArgs): SearchRootMapBootstrapRuntime => {
  const [isInitialCameraReady, setIsInitialCameraReady] = React.useState(
    () => startupCamera != null
  );
  const ensureInitialCameraReady = React.useCallback(() => {
    setIsInitialCameraReady(true);
  }, []);
  const [isMapStyleReady, setIsMapStyleReady] = React.useState(false);
  const hasAppliedStartupCameraRef = React.useRef(false);
  const { setMapCenter, setMapZoom, setIsFollowingUser } = mapState;

  React.useLayoutEffect(() => {
    if (accessToken) {
      void MapboxGL.setAccessToken(accessToken);
    }
  }, [accessToken]);

  React.useEffect(() => {
    if (!isInitialCameraReady) {
      setIsMapStyleReady(false);
    }
  }, [isInitialCameraReady]);

  const handleMapLoaded = React.useCallback(() => {
    setIsMapStyleReady(true);
    markMainMapLoaded();
  }, [markMainMapLoaded]);
  const handleMainMapFullyRendered = React.useCallback(() => {
    markMainMapReady();
  }, [markMainMapReady]);

  React.useEffect(() => {
    if (!startupCamera || hasAppliedStartupCameraRef.current) {
      return;
    }
    hasAppliedStartupCameraRef.current = true;
    commitCameraViewport(
      {
        center: startupCamera.center,
        zoom: startupCamera.zoom,
      },
      { allowDuringGesture: true }
    );
    lastCameraStateRef.current = {
      center: startupCamera.center,
      zoom: startupCamera.zoom,
    };
    // Seed the viewport service's camera too, so a commit-moment capture (e.g. a
    // deep-link search) BEFORE the map's first camera event still carries a camera —
    // the first real event overwrites (seedCamera never clobbers a non-null camera).
    viewportBoundsService.seedCamera({
      center: [startupCamera.center[0], startupCamera.center[1]],
      zoom: startupCamera.zoom,
    });
    lastPersistedCameraRef.current = JSON.stringify({
      center: startupCamera.center,
      zoom: startupCamera.zoom,
    });
    setMapCenter((current) => current ?? startupCamera.center);
    setMapZoom((current) => current ?? startupCamera.zoom);
    setIsFollowingUser(false);
    ensureInitialCameraReady();
  }, [
    commitCameraViewport,
    ensureInitialCameraReady,
    lastCameraStateRef,
    lastPersistedCameraRef,
    setIsFollowingUser,
    setMapCenter,
    setMapZoom,
    startupCamera,
    viewportBoundsService,
  ]);

  return React.useMemo(
    () => ({
      isInitialCameraReady,
      ensureInitialCameraReady,
      isMapStyleReady,
      handleMapLoaded,
      handleMainMapFullyRendered,
    }),
    [
      ensureInitialCameraReady,
      handleMainMapFullyRendered,
      handleMapLoaded,
      isInitialCameraReady,
      isMapStyleReady,
    ]
  );
};
