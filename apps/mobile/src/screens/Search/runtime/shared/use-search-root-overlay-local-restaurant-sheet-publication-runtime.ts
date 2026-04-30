import { createSearchOverlayLocalRestaurantSheetHostController } from '../controller/search-overlay-local-restaurant-sheet-host-controller';
import type {
  SearchRootOverlayLocalRestaurantSheetPublicationRuntime,
  SearchRootOverlayLocalRestaurantSheetStateRuntime,
} from './search-root-overlay-local-restaurant-runtime-contract';
import { useSearchRuntimeControllerRuntime } from './use-search-runtime-controller-runtime';

export const useSearchRootOverlayLocalRestaurantSheetPublicationRuntime = ({
  localRestaurantSheetSessionHostAuthority,
  localRestaurantSheetControlSelectionAuthority,
  localRestaurantSheetVisualHostAuthority,
}: SearchRootOverlayLocalRestaurantSheetStateRuntime): SearchRootOverlayLocalRestaurantSheetPublicationRuntime => {
  const localRestaurantSheetHostController =
    useSearchRuntimeControllerRuntime(() =>
      createSearchOverlayLocalRestaurantSheetHostController({
        localRestaurantSheetSessionHostAuthority,
        localRestaurantSheetControlSelectionAuthority,
        localRestaurantSheetVisualHostAuthority,
      })
    );

  return {
    localRestaurantSheetHostAuthority:
      localRestaurantSheetHostController.outputAuthority,
    overlayLocalRestaurantSheetHostAuthority:
      localRestaurantSheetHostController.outputAuthority,
  };
};
