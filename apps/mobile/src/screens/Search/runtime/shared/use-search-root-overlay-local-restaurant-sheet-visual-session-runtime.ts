import type {
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  SearchRootOverlayLocalRestaurantSheetPresenceRuntime,
  SearchRootOverlayLocalRestaurantSheetVisualSessionRuntime,
} from './search-root-overlay-local-restaurant-runtime-contract';
import { useSearchRootOverlayLocalRestaurantSheetSessionRuntime } from './use-search-root-overlay-local-restaurant-sheet-session-runtime';
import { useSearchRootOverlayLocalRestaurantSheetVisualRuntime } from './use-search-root-overlay-local-restaurant-sheet-visual-runtime';

export const useSearchRootOverlayLocalRestaurantSheetVisualSessionRuntime = ({
  routeLocalRestaurantOverlaySessionAuthority,
  localRestaurantRouteVisualAuthority,
  localRestaurantSheetPresenceAuthority,
}: Pick<
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  'routeLocalRestaurantOverlaySessionAuthority' | 'localRestaurantRouteVisualAuthority'
> &
  SearchRootOverlayLocalRestaurantSheetPresenceRuntime): SearchRootOverlayLocalRestaurantSheetVisualSessionRuntime => {
  const localRestaurantSheetVisualRuntime =
    useSearchRootOverlayLocalRestaurantSheetVisualRuntime({
      localRestaurantRouteVisualAuthority,
      localRestaurantSheetPresenceAuthority,
    });
  const localRestaurantSheetSessionRuntime =
    useSearchRootOverlayLocalRestaurantSheetSessionRuntime({
      routeLocalRestaurantOverlaySessionAuthority,
    });

  return {
    localRestaurantSheetSessionHostAuthority:
      localRestaurantSheetSessionRuntime.localRestaurantSheetSessionHostAuthority,
    localRestaurantSheetVisualHostAuthority:
      localRestaurantSheetVisualRuntime.localRestaurantSheetVisualHostAuthority,
  };
};
