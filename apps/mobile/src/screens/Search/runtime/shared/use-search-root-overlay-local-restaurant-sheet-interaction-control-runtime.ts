import type {
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  SearchRootOverlayLocalRestaurantSheetInteractionControlRuntime,
  SearchRootOverlayLocalRestaurantSheetPanelPolicySelectionRuntime,
} from './search-root-overlay-local-restaurant-runtime-contract';
import { useSearchRootOverlayLocalRestaurantSheetControlSelectionRuntime } from './use-search-root-overlay-local-restaurant-sheet-control-selection-runtime';
import { useSearchRootOverlayLocalRestaurantSheetInteractionSelectionRuntime } from './use-search-root-overlay-local-restaurant-sheet-interaction-selection-runtime';

export const useSearchRootOverlayLocalRestaurantSheetInteractionControlRuntime = ({
  routeLocalRestaurantOverlayInteractionAuthority,
  localRestaurantSheetPanelSelectionAuthority,
  localRestaurantSheetPolicySelectionAuthority,
}: Pick<
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  'routeLocalRestaurantOverlayInteractionAuthority'
> &
  SearchRootOverlayLocalRestaurantSheetPanelPolicySelectionRuntime): SearchRootOverlayLocalRestaurantSheetInteractionControlRuntime => {
  const localRestaurantSheetInteractionSelectionRuntime =
    useSearchRootOverlayLocalRestaurantSheetInteractionSelectionRuntime({
      routeLocalRestaurantOverlayInteractionAuthority,
    });
  const localRestaurantSheetControlSelectionRuntime =
    useSearchRootOverlayLocalRestaurantSheetControlSelectionRuntime({
      localRestaurantSheetPanelSelectionAuthority,
      localRestaurantSheetPolicySelectionAuthority,
      localRestaurantSheetInteractionSelectionAuthority:
        localRestaurantSheetInteractionSelectionRuntime.localRestaurantSheetInteractionSelectionAuthority,
    });

  return {
    localRestaurantSheetInteractionSelectionAuthority:
      localRestaurantSheetInteractionSelectionRuntime.localRestaurantSheetInteractionSelectionAuthority,
    localRestaurantSheetControlSelectionAuthority:
      localRestaurantSheetControlSelectionRuntime.localRestaurantSheetControlSelectionAuthority,
  };
};
