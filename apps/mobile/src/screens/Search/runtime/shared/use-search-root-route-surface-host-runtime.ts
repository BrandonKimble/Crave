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
import type { useSearchRootRouteControlRuntime } from './use-search-root-route-control-runtime';

export const useSearchRootRouteSurfaceHostRuntime = ({
  routeSceneRuntime,
  routeRestaurantOverlayRuntime,
}: Pick<
  ReturnType<typeof useSearchRootRouteControlRuntime>,
  'routeSceneRuntime' | 'routeRestaurantOverlayRuntime'
>): {
  routeOverlayVisibilityAuthority: RouteOverlayVisibilityAuthority;
  routeLocalRestaurantOverlaySessionAuthority: RouteLocalRestaurantOverlaySessionAuthority;
  routeLocalRestaurantOverlayPanelContentAuthority: RouteLocalRestaurantOverlayPanelContentAuthority;
  routeLocalRestaurantOverlayPolicyAuthority: RouteLocalRestaurantOverlayPolicyAuthority;
  routeLocalRestaurantOverlayInteractionAuthority: RouteLocalRestaurantOverlayInteractionAuthority;
  routeHostOverlayGeometryAuthority: RouteHostOverlayGeometryAuthority;
  routeResultsSheetVisualAuthority: RouteResultsSheetVisualAuthority;
  routeHostVisualRuntimeAuthority: RouteHostVisualRuntimeAuthority;
} => {
  return {
    routeOverlayVisibilityAuthority: routeSceneRuntime.routeOverlayVisibilityAuthority,
    routeLocalRestaurantOverlaySessionAuthority:
      routeRestaurantOverlayRuntime.routeLocalRestaurantOverlaySessionAuthority,
    routeLocalRestaurantOverlayPanelContentAuthority:
      routeRestaurantOverlayRuntime.routeLocalRestaurantOverlayPanelContentAuthority,
    routeLocalRestaurantOverlayPolicyAuthority:
      routeRestaurantOverlayRuntime.routeLocalRestaurantOverlayPolicyAuthority,
    routeLocalRestaurantOverlayInteractionAuthority:
      routeRestaurantOverlayRuntime.routeLocalRestaurantOverlayInteractionAuthority,
    routeHostOverlayGeometryAuthority: routeSceneRuntime.routeHostOverlayGeometryAuthority,
    routeResultsSheetVisualAuthority: routeSceneRuntime.routeResultsSheetVisualAuthority,
    routeHostVisualRuntimeAuthority: routeSceneRuntime.routeHostVisualRuntimeAuthority,
  };
};
