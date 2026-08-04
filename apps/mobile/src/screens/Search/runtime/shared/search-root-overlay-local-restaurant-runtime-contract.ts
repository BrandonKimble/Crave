import type { createSearchOverlayLocalRestaurantRouteVisualStateController } from '../controller/search-overlay-local-restaurant-route-visual-state-controller';
import type { createSearchOverlayLocalRestaurantSheetControlSelectionStateController } from '../controller/search-overlay-local-restaurant-sheet-control-selection-state-controller';
import type { createSearchOverlayLocalRestaurantSheetHostController } from '../controller/search-overlay-local-restaurant-sheet-host-controller';
import type { createSearchOverlayLocalRestaurantSheetVisualStateController } from '../controller/search-overlay-local-restaurant-sheet-visual-state-controller';
import type { SearchOverlayHostGateSnapshot } from './search-overlay-host-gate-snapshot-contract';
import type { SearchOverlayLocalRestaurantSheetProfilerGateAuthority } from './search-overlay-local-restaurant-sheet-profiler-gate-snapshot-contract';
import type { SearchOverlayLocalRestaurantSheetHostAuthority } from './search-root-host-authority-contract';
import type { SearchRootOverlayRouteAuthorityParams } from './search-root-overlay-host-runtime-contract';

export type SearchRootOverlayLocalRestaurantRouteHostRuntime = {
  localRestaurantRouteVisualAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantRouteVisualStateController
  >['outputAuthority'];
};

export type SearchRootOverlayLocalRestaurantRouteHostRuntimeParams = Pick<
  SearchRootOverlayRouteAuthorityParams,
  | 'routeHostOverlayGeometryAuthority'
  | 'routeSharedSheetVisualAuthority'
  | 'routeHostVisualRuntimeAuthority'
>;

export type SearchRootOverlayLocalRestaurantSheetHostRuntimeParams = Pick<
  SearchRootOverlayRouteAuthorityParams,
  | 'routeOverlayVisibilityAuthority'
  | 'routeLocalRestaurantOverlaySessionAuthority'
  | 'routeLocalRestaurantOverlayPanelContentAuthority'
  | 'routeLocalRestaurantOverlayPolicyAuthority'
  | 'routeLocalRestaurantOverlayInteractionAuthority'
> & {
  overlayGateSnapshot: SearchOverlayHostGateSnapshot;
} & Pick<SearchRootOverlayLocalRestaurantRouteHostRuntime, 'localRestaurantRouteVisualAuthority'>;

export type SearchRootOverlayLocalRestaurantSheetStateRuntime = {
  routeLocalRestaurantOverlaySessionAuthority: SearchRootOverlayLocalRestaurantSheetHostRuntimeParams['routeLocalRestaurantOverlaySessionAuthority'];
  localRestaurantSheetControlSelectionAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetControlSelectionStateController
  >['outputAuthority'];
  localRestaurantSheetVisualHostAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetVisualStateController
  >['outputAuthority'];
};

export type SearchRootOverlayLocalRestaurantSheetSelectionRuntime = {
  localRestaurantSheetControlSelectionAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetControlSelectionStateController
  >['outputAuthority'];
};

// F958 Cluster A: `SheetPanelPolicySelectionRuntime`, `SheetInteractionControlRuntime` and
// `SheetSelectionControllers` named the seams of a five-hook selection chain that no longer
// exists. The one surviving name is `SheetSelectionRuntime`, above.

export type SearchRootOverlayLocalRestaurantSheetVisualSessionRuntime = {
  routeLocalRestaurantOverlaySessionAuthority: SearchRootOverlayLocalRestaurantSheetHostRuntimeParams['routeLocalRestaurantOverlaySessionAuthority'];
  localRestaurantSheetVisualHostAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetVisualStateController
  >['outputAuthority'];
};

export type SearchRootOverlayLocalRestaurantSheetVisualRuntime = {
  localRestaurantSheetVisualHostAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetVisualStateController
  >['outputAuthority'];
};

export type SearchRootOverlayLocalRestaurantSheetVisualControllers = {
  localRestaurantSheetVisualHostAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetVisualStateController
  >['outputAuthority'];
};

// F1316: this used to declare the SAME authority object under two names —
// `overlayLocalRestaurantSheetHostAuthority` and `localRestaurantSheetHostAuthority`, both
// assigned `controller.outputAuthority` — and nothing outside the publication runtime ever
// consumed the second. One object, one name.
export type SearchRootOverlayLocalRestaurantSheetPublicationRuntime = {
  overlayLocalRestaurantSheetHostAuthority: SearchOverlayLocalRestaurantSheetHostAuthority;
};
