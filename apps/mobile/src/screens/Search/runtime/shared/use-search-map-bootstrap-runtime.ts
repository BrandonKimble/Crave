import React from 'react';
import MapboxGL from '@rnmapbox/maps';

import type { MainLaunchCoordinatorValue } from '../../../../navigation/runtime/MainLaunchCoordinator';
import { boundsFromPairs, isLngLatTuple } from '../../utils/geo';
import type { MapboxMapRef } from '../../components/search-map';
import type { ViewportBoundsService } from '../viewport/viewport-bounds-service';

type UseSearchMapBootstrapRuntimeArgs = {
  accessToken: string;
  startupCamera: MainLaunchCoordinatorValue['startupCamera'];
  latestBoundsRef: React.MutableRefObject<ReturnType<ViewportBoundsService['getBounds']>>;
  viewportBoundsService: ViewportBoundsService;
  mapRef: React.MutableRefObject<MapboxMapRef | null>;
  markMainMapReady: () => void;
  commitCameraViewport: (
    payload: { center: [number, number]; zoom: number },
    options?: {
      allowDuringGesture?: boolean;
      animationMode?: 'none' | 'easeTo';
      animationDurationMs?: number;
      requestToken?: number | null;
    }
  ) => void;
  setMapCenter: React.Dispatch<React.SetStateAction<[number, number] | null>>;
  setMapZoom: React.Dispatch<React.SetStateAction<number | null>>;
  setIsFollowingUser: React.Dispatch<React.SetStateAction<boolean>>;
  lastCameraStateRef: React.MutableRefObject<{ center: [number, number]; zoom: number } | null>;
  lastPersistedCameraRef: React.MutableRefObject<string | null>;
};

export const useSearchMapBootstrapRuntime = ({
  accessToken,
  startupCamera,
  latestBoundsRef,
  viewportBoundsService,
  mapRef,
  markMainMapReady,
  commitCameraViewport,
  setMapCenter,
  setMapZoom,
  setIsFollowingUser,
  lastCameraStateRef,
  lastPersistedCameraRef,
}: UseSearchMapBootstrapRuntimeArgs) => {
  const [isInitialCameraReady, setIsInitialCameraReady] = React.useState(
    () => startupCamera != null
  );
  const ensureInitialCameraReady = React.useCallback(() => {
    setIsInitialCameraReady(true);
  }, []);

  const [isMapStyleReady, setIsMapStyleReady] = React.useState(false);
  const hasPrimedInitialBoundsRef = React.useRef(false);

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
    if (hasPrimedInitialBoundsRef.current) {
      return;
    }
    hasPrimedInitialBoundsRef.current = true;
    void (async () => {
      if (latestBoundsRef.current) {
        return;
      }
      if (!mapRef.current?.getVisibleBounds) {
        return;
      }
      try {
        const visibleBounds = await mapRef.current.getVisibleBounds();
        if (
          Array.isArray(visibleBounds) &&
          visibleBounds.length >= 2 &&
          isLngLatTuple(visibleBounds[0]) &&
          isLngLatTuple(visibleBounds[1])
        ) {
          viewportBoundsService.setBounds(boundsFromPairs(visibleBounds[0], visibleBounds[1]));
        }
      } catch {
        // ignore
      }
    })();
  }, [latestBoundsRef, mapRef, viewportBoundsService]);

  const handleMainMapFullyRendered = React.useCallback(() => {
    markMainMapReady();
  }, [markMainMapReady]);

  React.useEffect(() => {
    if (!startupCamera) {
      return;
    }
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
