import type { createSearchOverlayLocalRestaurantRouteVisualStateController } from '../controller/search-overlay-local-restaurant-route-visual-state-controller';
import type { createSearchOverlayLocalRestaurantSheetControlSelectionStateController } from '../controller/search-overlay-local-restaurant-sheet-control-selection-state-controller';
import type { createSearchOverlayLocalRestaurantSheetHostController } from '../controller/search-overlay-local-restaurant-sheet-host-controller';
import type { createSearchOverlayLocalRestaurantSheetInteractionSelectionStateController } from '../controller/search-overlay-local-restaurant-sheet-interaction-selection-state-controller';
import type { createSearchOverlayLocalRestaurantSheetPanelSelectionStateController } from '../controller/search-overlay-local-restaurant-sheet-panel-selection-state-controller';
import type { createSearchOverlayLocalRestaurantSheetPolicySelectionStateController } from '../controller/search-overlay-local-restaurant-sheet-policy-selection-state-controller';
import type { createSearchOverlayLocalRestaurantSheetPresenceStateController } from '../controller/search-overlay-local-restaurant-sheet-presence-state-controller';
import type { createSearchOverlayLocalRestaurantSheetRenderVisualStateController } from '../controller/search-overlay-local-restaurant-sheet-render-visual-state-controller';
import type { createSearchOverlayLocalRestaurantSheetRenderVisibilityStateController } from '../controller/search-overlay-local-restaurant-sheet-render-visibility-state-controller';
import type { createSearchOverlayLocalRestaurantSheetRouteHostVisualStateController } from '../controller/search-overlay-local-restaurant-sheet-route-host-visual-state-controller';
import type { createSearchOverlayLocalRestaurantSheetSessionHostStateController } from '../controller/search-overlay-local-restaurant-sheet-session-host-state-controller';
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
  localRestaurantSheetSessionHostAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetSessionHostStateController
  >['outputAuthority'];
  localRestaurantSheetControlSelectionAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetControlSelectionStateController
  >['outputAuthority'];
  localRestaurantSheetVisualHostAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetVisualStateController
  >['outputAuthority'];
};

export type SearchRootOverlayLocalRestaurantSheetPresenceRuntime = {
  localRestaurantSheetPresenceAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetPresenceStateController
  >['outputAuthority'];
};

export type SearchRootOverlayLocalRestaurantSheetVisibilityProfilerRuntime = {
  localRestaurantSheetRenderVisibilityAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetRenderVisibilityStateController
  >['outputAuthority'];
  localRestaurantSheetProfilerGateAuthority: SearchOverlayLocalRestaurantSheetProfilerGateAuthority;
};

export type SearchRootOverlayLocalRestaurantSheetSelectionRuntime = {
  localRestaurantSheetControlSelectionAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetControlSelectionStateController
  >['outputAuthority'];
};

export type SearchRootOverlayLocalRestaurantSheetPanelPolicySelectionRuntime = {
  localRestaurantSheetPanelSelectionAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetPanelSelectionStateController
  >['outputAuthority'];
  localRestaurantSheetPolicySelectionAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetPolicySelectionStateController
  >['outputAuthority'];
};

export type SearchRootOverlayLocalRestaurantSheetInteractionControlRuntime = {
  localRestaurantSheetInteractionSelectionAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetInteractionSelectionStateController
  >['outputAuthority'];
  localRestaurantSheetControlSelectionAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetControlSelectionStateController
  >['outputAuthority'];
};

export type SearchRootOverlayLocalRestaurantSheetVisualSessionRuntime = {
  localRestaurantSheetSessionHostAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetSessionHostStateController
  >['outputAuthority'];
  localRestaurantSheetVisualHostAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetVisualStateController
  >['outputAuthority'];
};

export type SearchRootOverlayLocalRestaurantSheetVisualRuntime = {
  localRestaurantSheetRenderVisualAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetRenderVisualStateController
  >['outputAuthority'];
  localRestaurantSheetRouteHostVisualAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetRouteHostVisualStateController
  >['outputAuthority'];
  localRestaurantSheetVisualHostAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetVisualStateController
  >['outputAuthority'];
};

export type SearchRootOverlayLocalRestaurantSheetSessionRuntime = {
  localRestaurantSheetSessionHostAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetSessionHostStateController
  >['outputAuthority'];
};

export type SearchRootOverlayLocalRestaurantSheetPresenceControllers = {
  localRestaurantSheetRenderVisibilityAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetRenderVisibilityStateController
  >['outputAuthority'];
  localRestaurantSheetProfilerGateAuthority: SearchOverlayLocalRestaurantSheetProfilerGateAuthority;
  localRestaurantSheetPresenceAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetPresenceStateController
  >['outputAuthority'];
};

export type SearchRootOverlayLocalRestaurantSheetSelectionControllers = {
  localRestaurantSheetPanelSelectionAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetPanelSelectionStateController
  >['outputAuthority'];
  localRestaurantSheetPolicySelectionAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetPolicySelectionStateController
  >['outputAuthority'];
  localRestaurantSheetInteractionSelectionAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetInteractionSelectionStateController
  >['outputAuthority'];
  localRestaurantSheetControlSelectionAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetControlSelectionStateController
  >['outputAuthority'];
};

export type SearchRootOverlayLocalRestaurantSheetVisualControllers = {
  localRestaurantSheetRenderVisualAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetRenderVisualStateController
  >['outputAuthority'];
  localRestaurantSheetRouteHostVisualAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetRouteHostVisualStateController
  >['outputAuthority'];
  localRestaurantSheetVisualHostAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetVisualStateController
  >['outputAuthority'];
};

export type SearchRootOverlayLocalRestaurantSheetPublicationRuntime = {
  overlayLocalRestaurantSheetHostAuthority: SearchOverlayLocalRestaurantSheetHostAuthority;
  localRestaurantSheetHostAuthority: ReturnType<
    typeof createSearchOverlayLocalRestaurantSheetHostController
  >['outputAuthority'];
};
