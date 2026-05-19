import type {
  SearchRootFilterModalControlLane,
  SearchRootForegroundInputControlLane,
  SearchRootForegroundInteractionControlLane,
} from './use-search-root-control-plane-runtime-contract';
import type { SearchOverlayChromeHostSnapshot } from './search-foreground-chrome-contract';
import type { SearchOverlayHostGateSnapshot } from './search-overlay-host-gate-snapshot-contract';
import type { SearchOverlayShellHostSnapshot } from './search-overlay-shell-host-snapshot-contract';
import type { SearchOverlayLocalRestaurantSheetHostAuthority } from './search-root-host-authority-contract';
import type { SearchChromeTouchSurfaceRuntime } from './search-chrome-touch-surface-contract';
import type {
  RouteHostOverlayGeometryAuthority,
  RouteHostVisualRuntimeAuthority,
  RouteLocalRestaurantOverlayInteractionAuthority,
  RouteLocalRestaurantOverlayPanelContentAuthority,
  RouteLocalRestaurantOverlayPolicyAuthority,
  RouteLocalRestaurantOverlaySessionAuthority,
  RouteOverlayVisibilityAuthority,
  RouteResultsSheetVisualAuthority,
} from './search-root-route-runtime-contract';
import type { useSearchScreenAppEntryPlaneRuntime } from './use-search-screen-app-entry-plane-runtime';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type {
  SearchRootOverlayHostVisualRuntime,
  SearchRootOverlaySceneHostVisualRuntime,
} from './search-root-visual-runtime-contract';
import type { useSearchRootControlAuthorityRuntime } from './use-search-root-control-authority-runtime';
import type { useSearchRootControlProfileExperienceRuntime } from './use-search-root-control-profile-experience-runtime';

export type SearchRootOverlayHostRuntime = {
  overlayChromeHostSnapshot: SearchOverlayChromeHostSnapshot;
  searchChromeTouchSurfaceRuntime: SearchChromeTouchSurfaceRuntime;
  overlayGateSnapshot: SearchOverlayHostGateSnapshot;
  overlayShellSnapshot: SearchOverlayShellHostSnapshot;
  overlayLocalRestaurantSheetHostAuthority: SearchOverlayLocalRestaurantSheetHostAuthority;
};

export type SearchRootOverlayRouteAuthorityParams = {
  routeOverlayVisibilityAuthority: RouteOverlayVisibilityAuthority;
  routeLocalRestaurantOverlaySessionAuthority: RouteLocalRestaurantOverlaySessionAuthority;
  routeLocalRestaurantOverlayPanelContentAuthority: RouteLocalRestaurantOverlayPanelContentAuthority;
  routeLocalRestaurantOverlayPolicyAuthority: RouteLocalRestaurantOverlayPolicyAuthority;
  routeLocalRestaurantOverlayInteractionAuthority: RouteLocalRestaurantOverlayInteractionAuthority;
  routeHostOverlayGeometryAuthority: RouteHostOverlayGeometryAuthority;
  routeResultsSheetVisualAuthority: RouteResultsSheetVisualAuthority;
  routeHostVisualRuntimeAuthority: RouteHostVisualRuntimeAuthority;
};

export type SearchRootOverlayHostRuntimeParams = SearchRootOverlayRouteAuthorityParams & {
  appEntryPlaneRuntime: ReturnType<typeof useSearchScreenAppEntryPlaneRuntime>;
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  overlayHostVisualRuntime: SearchRootOverlayHostVisualRuntime;
  overlaySceneHostVisualRuntime: SearchRootOverlaySceneHostVisualRuntime;
  foregroundInteractionControlLane: SearchRootForegroundInteractionControlLane;
  foregroundInputControlLane: SearchRootForegroundInputControlLane;
  filterModalControlLane: SearchRootFilterModalControlLane;
  profileControlRuntime: ReturnType<typeof useSearchRootControlProfileExperienceRuntime>;
  controlAuthorityRuntime: ReturnType<typeof useSearchRootControlAuthorityRuntime>;
};

export type SearchRootOverlayShellHostRuntime = Pick<
  SearchRootOverlayHostRuntime,
  'overlayGateSnapshot' | 'overlayShellSnapshot'
>;

export type SearchRootOverlayChromeHostRuntime = Pick<
  SearchRootOverlayHostRuntime,
  'overlayChromeHostSnapshot' | 'searchChromeTouchSurfaceRuntime'
>;

export type SearchRootOverlayLocalRestaurantHostRuntime = Pick<
  SearchRootOverlayHostRuntime,
  'overlayLocalRestaurantSheetHostAuthority'
>;
