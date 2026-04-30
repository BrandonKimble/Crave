import type {
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  SearchRootOverlayLocalRestaurantSheetPresenceRuntime,
  SearchRootOverlayLocalRestaurantSheetVisualRuntime,
} from './search-root-overlay-local-restaurant-runtime-contract';
import { useSearchRootOverlayLocalRestaurantSheetRenderVisualRuntime } from './use-search-root-overlay-local-restaurant-sheet-render-visual-runtime';
import { useSearchRootOverlayLocalRestaurantSheetRouteHostVisualRuntime } from './use-search-root-overlay-local-restaurant-sheet-route-host-visual-runtime';
import { useSearchRootOverlayLocalRestaurantSheetVisualHostRuntime } from './use-search-root-overlay-local-restaurant-sheet-visual-host-runtime';

export const useSearchRootOverlayLocalRestaurantSheetVisualRuntime = ({
  localRestaurantRouteVisualAuthority,
  localRestaurantSheetPresenceAuthority,
}: Pick<
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  'localRestaurantRouteVisualAuthority'
> &
  SearchRootOverlayLocalRestaurantSheetPresenceRuntime): SearchRootOverlayLocalRestaurantSheetVisualRuntime => {
  const localRestaurantSheetRenderVisualRuntime =
    useSearchRootOverlayLocalRestaurantSheetRenderVisualRuntime({
      localRestaurantSheetPresenceAuthority,
    });
  const localRestaurantSheetRouteHostVisualRuntime =
    useSearchRootOverlayLocalRestaurantSheetRouteHostVisualRuntime({
      localRestaurantRouteVisualAuthority,
    });
  const localRestaurantSheetVisualHostRuntime =
    useSearchRootOverlayLocalRestaurantSheetVisualHostRuntime({
      localRestaurantSheetRenderVisualAuthority:
        localRestaurantSheetRenderVisualRuntime.localRestaurantSheetRenderVisualAuthority,
      localRestaurantSheetRouteHostVisualAuthority:
        localRestaurantSheetRouteHostVisualRuntime.localRestaurantSheetRouteHostVisualAuthority,
    });

  return {
    localRestaurantSheetRenderVisualAuthority:
      localRestaurantSheetRenderVisualRuntime.localRestaurantSheetRenderVisualAuthority,
    localRestaurantSheetRouteHostVisualAuthority:
      localRestaurantSheetRouteHostVisualRuntime.localRestaurantSheetRouteHostVisualAuthority,
    localRestaurantSheetVisualHostAuthority:
      localRestaurantSheetVisualHostRuntime.localRestaurantSheetVisualHostAuthority,
  };
};
