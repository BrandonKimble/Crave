import { createSearchOverlayLocalRestaurantSheetPolicySelectionStateController } from '../controller/search-overlay-local-restaurant-sheet-policy-selection-state-controller';
import type {
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  SearchRootOverlayLocalRestaurantSheetPanelPolicySelectionRuntime,
  SearchRootOverlayLocalRestaurantSheetSelectionControllers,
} from './search-root-overlay-local-restaurant-runtime-contract';
import { useSearchRuntimeControllerRuntime } from './use-search-runtime-controller-runtime';

export const useSearchRootOverlayLocalRestaurantSheetPolicySelectionRuntime = ({
  routeLocalRestaurantOverlayPolicyAuthority,
}: Pick<
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  'routeLocalRestaurantOverlayPolicyAuthority'
>): Pick<
  SearchRootOverlayLocalRestaurantSheetPanelPolicySelectionRuntime,
  'localRestaurantSheetPolicySelectionAuthority'
> &
  Pick<
    SearchRootOverlayLocalRestaurantSheetSelectionControllers,
    'localRestaurantSheetPolicySelectionAuthority'
  > => {
  const localRestaurantSheetPolicySelectionController =
    useSearchRuntimeControllerRuntime(() =>
      createSearchOverlayLocalRestaurantSheetPolicySelectionStateController({
        overlayLocalRestaurantPolicyHostAuthority:
          routeLocalRestaurantOverlayPolicyAuthority,
      })
    );

  return {
    localRestaurantSheetPolicySelectionAuthority:
      localRestaurantSheetPolicySelectionController.outputAuthority,
  };
};
