import { createSearchOverlayLocalRestaurantSheetControlSelectionStateController } from '../controller/search-overlay-local-restaurant-sheet-control-selection-state-controller';
import type {
  SearchRootOverlayLocalRestaurantSheetInteractionControlRuntime,
  SearchRootOverlayLocalRestaurantSheetPanelPolicySelectionRuntime,
  SearchRootOverlayLocalRestaurantSheetSelectionControllers,
} from './search-root-overlay-local-restaurant-runtime-contract';
import { useSearchRuntimeControllerRuntime } from './use-search-runtime-controller-runtime';

export const useSearchRootOverlayLocalRestaurantSheetControlSelectionRuntime = ({
  localRestaurantSheetPanelSelectionAuthority,
  localRestaurantSheetPolicySelectionAuthority,
  localRestaurantSheetInteractionSelectionAuthority,
}: SearchRootOverlayLocalRestaurantSheetPanelPolicySelectionRuntime &
  Pick<
    SearchRootOverlayLocalRestaurantSheetInteractionControlRuntime,
    'localRestaurantSheetInteractionSelectionAuthority'
  >): Pick<
  SearchRootOverlayLocalRestaurantSheetInteractionControlRuntime,
  'localRestaurantSheetControlSelectionAuthority'
> &
  Pick<
    SearchRootOverlayLocalRestaurantSheetSelectionControllers,
    'localRestaurantSheetControlSelectionAuthority'
  > => {
  const localRestaurantSheetControlSelectionController = useSearchRuntimeControllerRuntime(() =>
    createSearchOverlayLocalRestaurantSheetControlSelectionStateController({
      localRestaurantSheetPanelSelectionAuthority,
      localRestaurantSheetPolicySelectionAuthority,
      localRestaurantSheetInteractionSelectionAuthority,
    })
  );

  return {
    localRestaurantSheetControlSelectionAuthority:
      localRestaurantSheetControlSelectionController.outputAuthority,
  };
};
