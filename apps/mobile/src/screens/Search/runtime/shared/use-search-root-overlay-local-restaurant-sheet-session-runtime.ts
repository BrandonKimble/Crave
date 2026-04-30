import { createSearchOverlayLocalRestaurantSheetSessionHostStateController } from '../controller/search-overlay-local-restaurant-sheet-session-host-state-controller';
import type {
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  SearchRootOverlayLocalRestaurantSheetSessionRuntime,
} from './search-root-overlay-local-restaurant-runtime-contract';
import { useSearchRuntimeControllerRuntime } from './use-search-runtime-controller-runtime';

export const useSearchRootOverlayLocalRestaurantSheetSessionRuntime = ({
  routeLocalRestaurantOverlaySessionAuthority,
}: Pick<
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  'routeLocalRestaurantOverlaySessionAuthority'
>): SearchRootOverlayLocalRestaurantSheetSessionRuntime => {
  const localRestaurantSheetSessionHostController =
    useSearchRuntimeControllerRuntime(() =>
      createSearchOverlayLocalRestaurantSheetSessionHostStateController({
        overlayLocalRestaurantSessionHostAuthority:
          routeLocalRestaurantOverlaySessionAuthority,
      })
    );

  return {
    localRestaurantSheetSessionHostAuthority:
      localRestaurantSheetSessionHostController.outputAuthority,
  };
};
