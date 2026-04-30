import { createSearchOverlayLocalRestaurantSheetRenderVisualStateController } from '../controller/search-overlay-local-restaurant-sheet-render-visual-state-controller';
import type {
  SearchRootOverlayLocalRestaurantSheetPresenceRuntime,
  SearchRootOverlayLocalRestaurantSheetVisualControllers,
  SearchRootOverlayLocalRestaurantSheetVisualRuntime,
} from './search-root-overlay-local-restaurant-runtime-contract';
import { useSearchRuntimeControllerRuntime } from './use-search-runtime-controller-runtime';

export const useSearchRootOverlayLocalRestaurantSheetRenderVisualRuntime = ({
  localRestaurantSheetPresenceAuthority,
}: SearchRootOverlayLocalRestaurantSheetPresenceRuntime): Pick<
  SearchRootOverlayLocalRestaurantSheetVisualRuntime,
  'localRestaurantSheetRenderVisualAuthority'
> &
  Pick<
    SearchRootOverlayLocalRestaurantSheetVisualControllers,
    'localRestaurantSheetRenderVisualAuthority'
  > => {
  const localRestaurantSheetRenderVisualController =
    useSearchRuntimeControllerRuntime(() =>
      createSearchOverlayLocalRestaurantSheetRenderVisualStateController({
        localRestaurantSheetPresenceAuthority,
      })
    );

  return {
    localRestaurantSheetRenderVisualAuthority:
      localRestaurantSheetRenderVisualController.outputAuthority,
  };
};
