import type {
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  SearchRootOverlayLocalRestaurantSheetStateRuntime,
} from './search-root-overlay-local-restaurant-runtime-contract';
import { useSearchRootOverlayLocalRestaurantSheetPresenceRuntime } from './use-search-root-overlay-local-restaurant-sheet-presence-runtime';
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
  const localRestaurantSheetPresenceRuntime =
    useSearchRootOverlayLocalRestaurantSheetPresenceRuntime({
      routeOverlayVisibilityAuthority,
      overlayGateSnapshot,
    });
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
      localRestaurantSheetPresenceAuthority:
        localRestaurantSheetPresenceRuntime.localRestaurantSheetPresenceAuthority,
    });

  return {
    localRestaurantSheetSessionHostAuthority:
      localRestaurantSheetVisualSessionRuntime.localRestaurantSheetSessionHostAuthority,
    localRestaurantSheetControlSelectionAuthority:
      localRestaurantSheetSelectionRuntime.localRestaurantSheetControlSelectionAuthority,
    localRestaurantSheetVisualHostAuthority:
      localRestaurantSheetVisualSessionRuntime.localRestaurantSheetVisualHostAuthority,
  };
};
