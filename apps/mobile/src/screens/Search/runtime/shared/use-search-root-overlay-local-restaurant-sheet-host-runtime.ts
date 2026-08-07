import type {
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  SearchRootOverlayLocalRestaurantSheetPublicationRuntime,
  SearchRootOverlayLocalRestaurantSheetStateRuntime,
} from './search-root-overlay-local-restaurant-runtime-contract';
import { useSearchRootOverlayLocalRestaurantSheetPublicationRuntime } from './use-search-root-overlay-local-restaurant-sheet-publication-runtime';
import { useSearchRootOverlayLocalRestaurantSheetSelectionRuntime } from './use-search-root-overlay-local-restaurant-sheet-selection-runtime';
import { useSearchRootOverlayLocalRestaurantSheetVisualHostRuntime } from './use-search-root-overlay-local-restaurant-sheet-visual-host-runtime';

export const useSearchRootOverlayLocalRestaurantSheetHostRuntime = ({
  routeOverlayVisibilityAuthority,
  routeLocalRestaurantOverlaySessionAuthority,
  routeLocalRestaurantOverlayPanelContentAuthority,
  routeLocalRestaurantOverlayPolicyAuthority,
  routeLocalRestaurantOverlayInteractionAuthority,
  overlayGateSnapshot,
  localRestaurantRouteVisualAuthority,
}: SearchRootOverlayLocalRestaurantSheetHostRuntimeParams): Pick<
  SearchRootOverlayLocalRestaurantSheetPublicationRuntime,
  'overlayLocalRestaurantSheetHostAuthority'
> => {
  const localRestaurantSheetSelectionRuntime =
    useSearchRootOverlayLocalRestaurantSheetSelectionRuntime({
      routeLocalRestaurantOverlayPanelContentAuthority,
      routeLocalRestaurantOverlayPolicyAuthority,
      routeLocalRestaurantOverlayInteractionAuthority,
    });
  const localRestaurantSheetVisualRuntime =
    useSearchRootOverlayLocalRestaurantSheetVisualHostRuntime({
      routeOverlayVisibilityAuthority,
      overlayGateSnapshot,
      localRestaurantRouteVisualAuthority,
    });

  const localRestaurantSheetStateRuntime: SearchRootOverlayLocalRestaurantSheetStateRuntime = {
    routeLocalRestaurantOverlaySessionAuthority,
    localRestaurantSheetControlSelectionAuthority:
      localRestaurantSheetSelectionRuntime.localRestaurantSheetControlSelectionAuthority,
    localRestaurantSheetVisualHostAuthority:
      localRestaurantSheetVisualRuntime.localRestaurantSheetVisualHostAuthority,
  };

  const localRestaurantSheetPublicationRuntime =
    useSearchRootOverlayLocalRestaurantSheetPublicationRuntime(localRestaurantSheetStateRuntime);

  return {
    overlayLocalRestaurantSheetHostAuthority:
      localRestaurantSheetPublicationRuntime.overlayLocalRestaurantSheetHostAuthority,
  };
};
