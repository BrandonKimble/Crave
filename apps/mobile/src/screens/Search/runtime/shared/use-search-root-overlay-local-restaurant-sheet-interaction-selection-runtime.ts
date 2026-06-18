import { createSearchOverlayLocalRestaurantSheetInteractionSelectionStateController } from '../controller/search-overlay-local-restaurant-sheet-interaction-selection-state-controller';
import type {
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  SearchRootOverlayLocalRestaurantSheetInteractionControlRuntime,
  SearchRootOverlayLocalRestaurantSheetSelectionControllers,
} from './search-root-overlay-local-restaurant-runtime-contract';
import { useSearchRuntimeControllerRuntime } from './use-search-runtime-controller-runtime';

export const useSearchRootOverlayLocalRestaurantSheetInteractionSelectionRuntime = ({
  routeLocalRestaurantOverlayInteractionAuthority,
}: Pick<
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  'routeLocalRestaurantOverlayInteractionAuthority'
>): Pick<
  SearchRootOverlayLocalRestaurantSheetInteractionControlRuntime,
  'localRestaurantSheetInteractionSelectionAuthority'
> &
  Pick<
    SearchRootOverlayLocalRestaurantSheetSelectionControllers,
    'localRestaurantSheetInteractionSelectionAuthority'
  > => {
  const localRestaurantSheetInteractionSelectionController = useSearchRuntimeControllerRuntime(() =>
    createSearchOverlayLocalRestaurantSheetInteractionSelectionStateController({
      overlayLocalRestaurantInteractionHostAuthority:
        routeLocalRestaurantOverlayInteractionAuthority,
    })
  );

  return {
    localRestaurantSheetInteractionSelectionAuthority:
      localRestaurantSheetInteractionSelectionController.outputAuthority,
  };
};
