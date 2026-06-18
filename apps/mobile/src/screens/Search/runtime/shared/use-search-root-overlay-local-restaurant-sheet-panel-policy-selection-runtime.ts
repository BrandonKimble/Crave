import type {
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  SearchRootOverlayLocalRestaurantSheetPanelPolicySelectionRuntime,
} from './search-root-overlay-local-restaurant-runtime-contract';
import { useSearchRootOverlayLocalRestaurantSheetPanelSelectionRuntime } from './use-search-root-overlay-local-restaurant-sheet-panel-selection-runtime';
import { useSearchRootOverlayLocalRestaurantSheetPolicySelectionRuntime } from './use-search-root-overlay-local-restaurant-sheet-policy-selection-runtime';

export const useSearchRootOverlayLocalRestaurantSheetPanelPolicySelectionRuntime = ({
  routeLocalRestaurantOverlayPanelContentAuthority,
  routeLocalRestaurantOverlayPolicyAuthority,
}: Pick<
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  'routeLocalRestaurantOverlayPanelContentAuthority' | 'routeLocalRestaurantOverlayPolicyAuthority'
>): SearchRootOverlayLocalRestaurantSheetPanelPolicySelectionRuntime => ({
  ...useSearchRootOverlayLocalRestaurantSheetPanelSelectionRuntime({
    routeLocalRestaurantOverlayPanelContentAuthority,
  }),
  ...useSearchRootOverlayLocalRestaurantSheetPolicySelectionRuntime({
    routeLocalRestaurantOverlayPolicyAuthority,
  }),
});
