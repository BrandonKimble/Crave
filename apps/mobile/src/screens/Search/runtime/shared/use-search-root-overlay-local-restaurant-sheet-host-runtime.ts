import type {
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  SearchRootOverlayLocalRestaurantSheetPublicationRuntime,
} from './search-root-overlay-local-restaurant-runtime-contract';
import { useSearchRootOverlayLocalRestaurantSheetPublicationRuntime } from './use-search-root-overlay-local-restaurant-sheet-publication-runtime';
import { useSearchRootOverlayLocalRestaurantSheetStateRuntime } from './use-search-root-overlay-local-restaurant-sheet-state-runtime';

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
  const localRestaurantSheetStateRuntime = useSearchRootOverlayLocalRestaurantSheetStateRuntime({
    routeOverlayVisibilityAuthority,
    routeLocalRestaurantOverlaySessionAuthority,
    routeLocalRestaurantOverlayPanelContentAuthority,
    routeLocalRestaurantOverlayPolicyAuthority,
    routeLocalRestaurantOverlayInteractionAuthority,
    overlayGateSnapshot,
    localRestaurantRouteVisualAuthority,
  });
  const localRestaurantSheetPublicationRuntime =
    useSearchRootOverlayLocalRestaurantSheetPublicationRuntime(localRestaurantSheetStateRuntime);

  return {
    overlayLocalRestaurantSheetHostAuthority:
      localRestaurantSheetPublicationRuntime.overlayLocalRestaurantSheetHostAuthority,
  };
};
