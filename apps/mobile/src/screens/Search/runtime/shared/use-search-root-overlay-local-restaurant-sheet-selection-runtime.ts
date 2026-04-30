import type {
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  SearchRootOverlayLocalRestaurantSheetSelectionRuntime,
} from './search-root-overlay-local-restaurant-runtime-contract';
import { useSearchRootOverlayLocalRestaurantSheetInteractionControlRuntime } from './use-search-root-overlay-local-restaurant-sheet-interaction-control-runtime';
import { useSearchRootOverlayLocalRestaurantSheetPanelPolicySelectionRuntime } from './use-search-root-overlay-local-restaurant-sheet-panel-policy-selection-runtime';

export const useSearchRootOverlayLocalRestaurantSheetSelectionRuntime = ({
  routeLocalRestaurantOverlayPanelContentAuthority,
  routeLocalRestaurantOverlayPolicyAuthority,
  routeLocalRestaurantOverlayInteractionAuthority,
}: Pick<
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  | 'routeLocalRestaurantOverlayPanelContentAuthority'
  | 'routeLocalRestaurantOverlayPolicyAuthority'
  | 'routeLocalRestaurantOverlayInteractionAuthority'
>): SearchRootOverlayLocalRestaurantSheetSelectionRuntime => {
  const localRestaurantSheetPanelPolicySelectionRuntime =
    useSearchRootOverlayLocalRestaurantSheetPanelPolicySelectionRuntime({
      routeLocalRestaurantOverlayPanelContentAuthority,
      routeLocalRestaurantOverlayPolicyAuthority,
    });
  const localRestaurantSheetInteractionControlRuntime =
    useSearchRootOverlayLocalRestaurantSheetInteractionControlRuntime({
      routeLocalRestaurantOverlayInteractionAuthority,
      localRestaurantSheetPanelSelectionAuthority:
        localRestaurantSheetPanelPolicySelectionRuntime.localRestaurantSheetPanelSelectionAuthority,
      localRestaurantSheetPolicySelectionAuthority:
        localRestaurantSheetPanelPolicySelectionRuntime.localRestaurantSheetPolicySelectionAuthority,
    });

  return {
    localRestaurantSheetControlSelectionAuthority:
      localRestaurantSheetInteractionControlRuntime.localRestaurantSheetControlSelectionAuthority,
  };
};
