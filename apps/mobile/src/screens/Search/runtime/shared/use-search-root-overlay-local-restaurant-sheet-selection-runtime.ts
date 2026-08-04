import { createSearchOverlayLocalRestaurantSheetControlSelectionStateController } from '../controller/search-overlay-local-restaurant-sheet-control-selection-state-controller';
import type {
  SearchRootOverlayLocalRestaurantSheetHostRuntimeParams,
  SearchRootOverlayLocalRestaurantSheetSelectionRuntime,
} from './search-root-overlay-local-restaurant-runtime-contract';
import { useSearchRuntimeControllerRuntime } from './use-search-runtime-controller-runtime';

/**
 * F958 Cluster A: a five-hook, four-controller chain (panel → policy → panel-policy →
 * interaction → interaction-control → control) collapsed into the single ControlSelection
 * authority. The three intermediate subset projections were subsumed by this controller's
 * own seven-field comparator; see the controller's header for why that is equivalence
 * rather than a shortcut.
 */
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
  const localRestaurantSheetControlSelectionController = useSearchRuntimeControllerRuntime(() =>
    createSearchOverlayLocalRestaurantSheetControlSelectionStateController({
      overlayLocalRestaurantPanelContentHostAuthority:
        routeLocalRestaurantOverlayPanelContentAuthority,
      overlayLocalRestaurantPolicyHostAuthority: routeLocalRestaurantOverlayPolicyAuthority,
      overlayLocalRestaurantInteractionHostAuthority:
        routeLocalRestaurantOverlayInteractionAuthority,
    })
  );

  return {
    localRestaurantSheetControlSelectionAuthority:
      localRestaurantSheetControlSelectionController.outputAuthority,
  };
};
