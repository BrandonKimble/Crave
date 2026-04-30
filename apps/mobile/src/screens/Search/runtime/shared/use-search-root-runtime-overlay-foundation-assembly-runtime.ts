import { useSearchRootMapViewportIntentRuntime } from './use-search-root-map-viewport-intent-runtime';
import { useSearchRootOverlayFoundationRuntime } from './use-search-root-overlay-foundation-runtime';
import type {
  RouteOverlayPollsVisibilityAuthority,
  RouteOverlayVisibilityAuthority,
} from './route-authority-contract';
import type { AppRouteSceneRuntime } from '../../../../navigation/runtime/app-route-scene-runtime';
import type { SearchChromeScalarSurfaceRuntime } from '../native/search-chrome-scalar-surface-runtime';
import type { useSearchRootRuntimeSessionAssemblyRuntime } from './use-search-root-runtime-session-assembly-runtime';
import type { useSearchRootRuntimeStateAssemblyRuntime } from './use-search-root-runtime-state-assembly-runtime';
import type { useSearchScreenAppEntryPlaneRuntime } from './use-search-screen-app-entry-plane-runtime';

export type SearchRootRuntimeOverlayFoundationAssemblyRuntime = ReturnType<
  typeof useSearchRootRuntimeOverlayFoundationAssemblyRuntime
>;

type SearchRootRuntimeSessionAssembly = ReturnType<
  typeof useSearchRootRuntimeSessionAssemblyRuntime
>;
type SearchRootRuntimeStateAssembly = ReturnType<typeof useSearchRootRuntimeStateAssemblyRuntime>;

export const useSearchRootRuntimeOverlayFoundationAssemblyRuntime = ({
  appEntryPlaneRuntime,
  sessionAssemblyRuntime,
  stateAssemblyRuntime,
  routeSceneRuntime,
  routeOverlayIdentityAuthority,
  routeOverlayPollsVisibilityAuthority,
  routeOverlayVisibilityAuthority,
  searchChromeScalarSurfaceRuntime,
}: {
  appEntryPlaneRuntime: ReturnType<typeof useSearchScreenAppEntryPlaneRuntime>;
  sessionAssemblyRuntime: SearchRootRuntimeSessionAssembly;
  stateAssemblyRuntime: SearchRootRuntimeStateAssembly;
  routeSceneRuntime: AppRouteSceneRuntime;
  routeOverlayIdentityAuthority: AppRouteSceneRuntime['routeOverlayIdentityAuthority'];
  routeOverlayPollsVisibilityAuthority: RouteOverlayPollsVisibilityAuthority;
  routeOverlayVisibilityAuthority: RouteOverlayVisibilityAuthority;
  searchChromeScalarSurfaceRuntime?: SearchChromeScalarSurfaceRuntime;
}) => {
  const rootOverlayFoundationRuntime = useSearchRootOverlayFoundationRuntime({
    insets: appEntryPlaneRuntime.insets,
    startupPollBounds: appEntryPlaneRuntime.startupPollBounds,
    sessionCoreLane: sessionAssemblyRuntime.sessionRuntime.sessionCoreLane,
    routeSceneRuntime,
    routeOverlayIdentityAuthority,
    routeOverlayPollsVisibilityAuthority,
    routeOverlayVisibilityAuthority,
    stateFoundationLane: stateAssemblyRuntime.stateFoundationLane,
    searchChromeScalarSurfaceRuntime,
  });
  const mapViewportIntentRuntime = useSearchRootMapViewportIntentRuntime(
    stateAssemblyRuntime.stateFoundationLane
  );

  return {
    rootOverlayFoundationRuntime,
    mapViewportIntentRuntime,
  };
};
