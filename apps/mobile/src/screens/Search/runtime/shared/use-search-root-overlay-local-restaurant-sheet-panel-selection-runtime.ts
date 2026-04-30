import { createSearchOverlayLocalRestaurantSheetPanelSelectionStateController } from '../controller/search-overlay-local-restaurant-sheet-panel-selection-state-controller';
import type {
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  SearchRootOverlayLocalRestaurantSheetPanelPolicySelectionRuntime,
  SearchRootOverlayLocalRestaurantSheetSelectionControllers,
} from './search-root-overlay-local-restaurant-runtime-contract';
import { useSearchRuntimeControllerRuntime } from './use-search-runtime-controller-runtime';

export const useSearchRootOverlayLocalRestaurantSheetPanelSelectionRuntime = ({
  routeLocalRestaurantOverlayPanelContentAuthority,
}: Pick<
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  'routeLocalRestaurantOverlayPanelContentAuthority'
>): Pick<
  SearchRootOverlayLocalRestaurantSheetPanelPolicySelectionRuntime,
  'localRestaurantSheetPanelSelectionAuthority'
> &
  Pick<
    SearchRootOverlayLocalRestaurantSheetSelectionControllers,
    'localRestaurantSheetPanelSelectionAuthority'
  > => {
  const localRestaurantSheetPanelSelectionController =
    useSearchRuntimeControllerRuntime(() =>
      createSearchOverlayLocalRestaurantSheetPanelSelectionStateController({
        overlayLocalRestaurantPanelContentHostAuthority:
          routeLocalRestaurantOverlayPanelContentAuthority,
      })
    );

  return {
    localRestaurantSheetPanelSelectionAuthority:
      localRestaurantSheetPanelSelectionController.outputAuthority,
  };
};
