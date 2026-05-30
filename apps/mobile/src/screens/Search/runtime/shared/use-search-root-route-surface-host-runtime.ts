import type {
  RouteHostOverlayGeometryAuthority,
  RouteHostVisualRuntimeAuthority,
  RouteLocalRestaurantOverlayInteractionAuthority,
  RouteLocalRestaurantOverlayPanelContentAuthority,
  RouteLocalRestaurantOverlayPolicyAuthority,
  RouteLocalRestaurantOverlaySessionAuthority,
  RouteOverlayVisibilityAuthority,
  RouteSharedSheetVisualAuthority,
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
  routeSharedSheetVisualAuthority: RouteSharedSheetVisualAuthority;
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
    routeSharedSheetVisualAuthority: routeSceneRuntime.routeSharedSheetVisualAuthority,
    routeHostVisualRuntimeAuthority: routeSceneRuntime.routeHostVisualRuntimeAuthority,
  };
};
