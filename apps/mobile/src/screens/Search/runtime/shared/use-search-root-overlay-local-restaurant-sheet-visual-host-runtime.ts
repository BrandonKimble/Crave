import { createSearchOverlayLocalRestaurantSheetVisualStateController } from '../controller/search-overlay-local-restaurant-sheet-visual-state-controller';
import type {
  SearchRootOverlayLocalRestaurantSheetVisualControllers,
  SearchRootOverlayLocalRestaurantSheetVisualRuntime,
} from './search-root-overlay-local-restaurant-runtime-contract';
import { useSearchRuntimeControllerRuntime } from './use-search-runtime-controller-runtime';

export const useSearchRootOverlayLocalRestaurantSheetVisualHostRuntime = ({
  localRestaurantSheetRenderVisualAuthority,
  localRestaurantSheetRouteHostVisualAuthority,
}: Pick<
  SearchRootOverlayLocalRestaurantSheetVisualRuntime,
  'localRestaurantSheetRenderVisualAuthority' | 'localRestaurantSheetRouteHostVisualAuthority'
> &
  Pick<
    SearchRootOverlayLocalRestaurantSheetVisualControllers,
    'localRestaurantSheetRenderVisualAuthority' | 'localRestaurantSheetRouteHostVisualAuthority'
  >): Pick<
  SearchRootOverlayLocalRestaurantSheetVisualRuntime,
  'localRestaurantSheetVisualHostAuthority'
> &
  Pick<
    SearchRootOverlayLocalRestaurantSheetVisualControllers,
    'localRestaurantSheetVisualHostAuthority'
  > => {
  const localRestaurantSheetVisualController = useSearchRuntimeControllerRuntime(() =>
    createSearchOverlayLocalRestaurantSheetVisualStateController({
      localRestaurantSheetRenderVisualAuthority,
      localRestaurantSheetRouteHostVisualAuthority,
    })
  );

  return {
    localRestaurantSheetVisualHostAuthority: localRestaurantSheetVisualController.outputAuthority,
  };
};
