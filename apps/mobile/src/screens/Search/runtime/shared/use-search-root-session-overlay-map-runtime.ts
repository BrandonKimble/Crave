import { useSearchRouteOverlayCommandRuntime } from '../../../../overlays/useSearchRouteOverlayCommandRuntime';
import { useSearchMapBootstrapRuntime } from './use-search-map-bootstrap-runtime';
import type {
  SearchRootSessionRuntime,
  UseSearchRootSessionRuntimeArgs,
} from './use-search-root-session-runtime-contract';
import type { SearchRootSessionStateRuntime } from './use-search-root-session-state-runtime';

type UseSearchRootSessionOverlayMapRuntimeArgs = Pick<
  UseSearchRootSessionRuntimeArgs,
  | 'accessToken'
  | 'startupCamera'
  | 'mapRef'
  | 'markMainMapReady'
  | 'setMapCenter'
  | 'setMapZoom'
  | 'setIsFollowingUser'
> &
  SearchRootSessionStateRuntime;

export type SearchRootSessionOverlayMapRuntime = Pick<
  SearchRootSessionRuntime,
  'overlayCommandRuntime' | 'mapBootstrapRuntime'
>;

export const useSearchRootSessionOverlayMapRuntime = ({
  accessToken,
  startupCamera,
  mapRef,
  markMainMapReady,
  setMapCenter,
  setMapZoom,
  setIsFollowingUser,
  runtimeOwner,
  sharedSnapState,
  primitives,
}: UseSearchRootSessionOverlayMapRuntimeArgs): SearchRootSessionOverlayMapRuntime => {
  const overlayCommandRuntime = useSearchRouteOverlayCommandRuntime({
    hasUserSharedSnap: sharedSnapState.hasUserSharedSnap,
    sharedSnap: sharedSnapState.sharedSnap,
  });
  const mapBootstrapRuntime = useSearchMapBootstrapRuntime({
    accessToken,
    startupCamera,
    latestBoundsRef: runtimeOwner.latestBoundsRef,
    viewportBoundsService: runtimeOwner.viewportBoundsService,
    mapRef,
    markMainMapReady,
    commitCameraViewport: primitives.commitCameraViewport,
    setMapCenter,
    setMapZoom,
    setIsFollowingUser,
    lastCameraStateRef: primitives.lastCameraStateRef,
    lastPersistedCameraRef: primitives.lastPersistedCameraRef,
  });

  return {
    overlayCommandRuntime,
    mapBootstrapRuntime,
  };
};
