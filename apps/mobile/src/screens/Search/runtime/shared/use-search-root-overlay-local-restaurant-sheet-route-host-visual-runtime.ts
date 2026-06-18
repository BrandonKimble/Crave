import { createSearchOverlayLocalRestaurantSheetRouteHostVisualStateController } from '../controller/search-overlay-local-restaurant-sheet-route-host-visual-state-controller';
import type {
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  SearchRootOverlayLocalRestaurantSheetVisualControllers,
  SearchRootOverlayLocalRestaurantSheetVisualRuntime,
} from './search-root-overlay-local-restaurant-runtime-contract';
import { useSearchRuntimeControllerRuntime } from './use-search-runtime-controller-runtime';

export const useSearchRootOverlayLocalRestaurantSheetRouteHostVisualRuntime = ({
  localRestaurantRouteVisualAuthority,
}: Pick<
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  'localRestaurantRouteVisualAuthority'
>): Pick<
  SearchRootOverlayLocalRestaurantSheetVisualRuntime,
  'localRestaurantSheetRouteHostVisualAuthority'
> &
  Pick<
    SearchRootOverlayLocalRestaurantSheetVisualControllers,
    'localRestaurantSheetRouteHostVisualAuthority'
  > => {
  const localRestaurantSheetRouteHostVisualController = useSearchRuntimeControllerRuntime(() =>
    createSearchOverlayLocalRestaurantSheetRouteHostVisualStateController({
      localRestaurantRouteVisualAuthority,
    })
  );

  return {
    localRestaurantSheetRouteHostVisualAuthority:
      localRestaurantSheetRouteHostVisualController.outputAuthority,
  };
};
