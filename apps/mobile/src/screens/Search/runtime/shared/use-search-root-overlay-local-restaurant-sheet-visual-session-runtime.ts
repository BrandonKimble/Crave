import type {
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  SearchRootOverlayLocalRestaurantSheetVisualSessionRuntime,
} from './search-root-overlay-local-restaurant-runtime-contract';
import { useSearchRootOverlayLocalRestaurantSheetVisualHostRuntime } from './use-search-root-overlay-local-restaurant-sheet-visual-host-runtime';

export const useSearchRootOverlayLocalRestaurantSheetVisualSessionRuntime = ({
  routeLocalRestaurantOverlaySessionAuthority,
  localRestaurantRouteVisualAuthority,
  routeOverlayVisibilityAuthority,
  overlayGateSnapshot,
}: Pick<
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  | 'routeLocalRestaurantOverlaySessionAuthority'
  | 'localRestaurantRouteVisualAuthority'
  | 'routeOverlayVisibilityAuthority'
  | 'overlayGateSnapshot'
>): SearchRootOverlayLocalRestaurantSheetVisualSessionRuntime => {
  const localRestaurantSheetVisualRuntime =
    useSearchRootOverlayLocalRestaurantSheetVisualHostRuntime({
      routeOverlayVisibilityAuthority,
      overlayGateSnapshot,
      localRestaurantRouteVisualAuthority,
    });
  return {
    routeLocalRestaurantOverlaySessionAuthority,
    localRestaurantSheetVisualHostAuthority:
      localRestaurantSheetVisualRuntime.localRestaurantSheetVisualHostAuthority,
  };
};
