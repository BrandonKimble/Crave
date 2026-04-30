import type {
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  SearchRootOverlayLocalRestaurantSheetPresenceRuntime,
} from './search-root-overlay-local-restaurant-runtime-contract';
import { useSearchRootOverlayLocalRestaurantSheetPresenceAuthorityRuntime } from './use-search-root-overlay-local-restaurant-sheet-presence-authority-runtime';
import { useSearchRootOverlayLocalRestaurantSheetVisibilityProfilerRuntime } from './use-search-root-overlay-local-restaurant-sheet-visibility-profiler-runtime';

export const useSearchRootOverlayLocalRestaurantSheetPresenceRuntime = ({
  routeOverlayVisibilityAuthority,
  overlayGateSnapshot,
}: Pick<
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  'routeOverlayVisibilityAuthority' | 'overlayGateSnapshot'
>): SearchRootOverlayLocalRestaurantSheetPresenceRuntime => {
  const localRestaurantSheetVisibilityProfilerRuntime =
    useSearchRootOverlayLocalRestaurantSheetVisibilityProfilerRuntime({
      routeOverlayVisibilityAuthority,
      overlayGateSnapshot,
    });

  return useSearchRootOverlayLocalRestaurantSheetPresenceAuthorityRuntime({
    localRestaurantSheetRenderVisibilityAuthority:
      localRestaurantSheetVisibilityProfilerRuntime.localRestaurantSheetRenderVisibilityAuthority,
    localRestaurantSheetProfilerGateAuthority:
      localRestaurantSheetVisibilityProfilerRuntime.localRestaurantSheetProfilerGateAuthority,
  });
};
