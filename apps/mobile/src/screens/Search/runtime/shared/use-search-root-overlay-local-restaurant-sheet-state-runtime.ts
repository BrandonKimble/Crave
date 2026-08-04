import type {
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  SearchRootOverlayLocalRestaurantSheetStateRuntime,
} from './search-root-overlay-local-restaurant-runtime-contract';
import { useSearchRootOverlayLocalRestaurantSheetSelectionRuntime } from './use-search-root-overlay-local-restaurant-sheet-selection-runtime';
import { useSearchRootOverlayLocalRestaurantSheetVisualSessionRuntime } from './use-search-root-overlay-local-restaurant-sheet-visual-session-runtime';

export const useSearchRootOverlayLocalRestaurantSheetStateRuntime = ({
  routeOverlayVisibilityAuthority,
  routeLocalRestaurantOverlaySessionAuthority,
  routeLocalRestaurantOverlayPanelContentAuthority,
  routeLocalRestaurantOverlayPolicyAuthority,
  routeLocalRestaurantOverlayInteractionAuthority,
  overlayGateSnapshot,
  localRestaurantRouteVisualAuthority,
}: SearchRootOverlayLocalRestaurantSheetHostRuntimeParams): SearchRootOverlayLocalRestaurantSheetStateRuntime => {
  const localRestaurantSheetSelectionRuntime =
    useSearchRootOverlayLocalRestaurantSheetSelectionRuntime({
      routeLocalRestaurantOverlayPanelContentAuthority,
      routeLocalRestaurantOverlayPolicyAuthority,
      routeLocalRestaurantOverlayInteractionAuthority,
    });
  const localRestaurantSheetVisualSessionRuntime =
    useSearchRootOverlayLocalRestaurantSheetVisualSessionRuntime({
      routeLocalRestaurantOverlaySessionAuthority,
      localRestaurantRouteVisualAuthority,
      routeOverlayVisibilityAuthority,
      overlayGateSnapshot,
    });

  return {
    routeLocalRestaurantOverlaySessionAuthority:
      localRestaurantSheetVisualSessionRuntime.routeLocalRestaurantOverlaySessionAuthority,
    localRestaurantSheetControlSelectionAuthority:
      localRestaurantSheetSelectionRuntime.localRestaurantSheetControlSelectionAuthority,
    localRestaurantSheetVisualHostAuthority:
      localRestaurantSheetVisualSessionRuntime.localRestaurantSheetVisualHostAuthority,
  };
};
