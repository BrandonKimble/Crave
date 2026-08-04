import { createSearchOverlayLocalRestaurantRouteVisualStateController } from '../controller/search-overlay-local-restaurant-route-visual-state-controller';
import type { SearchRootOverlayLocalRestaurantRouteHostRuntime } from './search-root-overlay-local-restaurant-runtime-contract';
import type { SearchRootOverlayLocalRestaurantRouteHostRuntimeParams } from './search-root-overlay-local-restaurant-runtime-contract';
import { useSearchRuntimeControllerRuntime } from './use-search-runtime-controller-runtime';

/**
 * F958 Cluster A: this hook used to hand-roll FOUR ref-latched controllers and one
 * disposal effect ordering them by hand. Three of the four were null-wrappers whose
 * dedupe guards could not fire (F1604); the RouteFrame authority now reads the three
 * route bindings directly, so the composition is one controller with the standard
 * lifetime hook.
 */
export const useSearchRootOverlayLocalRestaurantRouteHostRuntime = ({
  routeHostOverlayGeometryAuthority,
  routeSharedSheetVisualAuthority,
  routeHostVisualRuntimeAuthority,
}: SearchRootOverlayLocalRestaurantRouteHostRuntimeParams): SearchRootOverlayLocalRestaurantRouteHostRuntime => {
  const localRestaurantRouteVisualController = useSearchRuntimeControllerRuntime(() =>
    createSearchOverlayLocalRestaurantRouteVisualStateController({
      routeHostOverlayGeometryAuthority,
      routeHostVisualRuntimeAuthority,
      routeSharedSheetVisualAuthority,
    })
  );

  return {
    localRestaurantRouteVisualAuthority: localRestaurantRouteVisualController.outputAuthority,
  };
};
