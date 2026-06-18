import { createSearchOverlayLocalRestaurantSheetPresenceStateController } from '../controller/search-overlay-local-restaurant-sheet-presence-state-controller';
import type {
  SearchRootOverlayLocalRestaurantSheetPresenceControllers,
  SearchRootOverlayLocalRestaurantSheetPresenceRuntime,
  SearchRootOverlayLocalRestaurantSheetVisibilityProfilerRuntime,
} from './search-root-overlay-local-restaurant-runtime-contract';
import { useSearchRuntimeControllerRuntime } from './use-search-runtime-controller-runtime';

export const useSearchRootOverlayLocalRestaurantSheetPresenceAuthorityRuntime = ({
  localRestaurantSheetRenderVisibilityAuthority,
  localRestaurantSheetProfilerGateAuthority,
}: SearchRootOverlayLocalRestaurantSheetVisibilityProfilerRuntime &
  Pick<
    SearchRootOverlayLocalRestaurantSheetPresenceControllers,
    'localRestaurantSheetRenderVisibilityAuthority' | 'localRestaurantSheetProfilerGateAuthority'
  >): SearchRootOverlayLocalRestaurantSheetPresenceRuntime &
  Pick<
    SearchRootOverlayLocalRestaurantSheetPresenceControllers,
    'localRestaurantSheetPresenceAuthority'
  > => {
  const localRestaurantSheetPresenceController = useSearchRuntimeControllerRuntime(() =>
    createSearchOverlayLocalRestaurantSheetPresenceStateController({
      localRestaurantSheetRenderVisibilityAuthority,
      localRestaurantSheetProfilerGateAuthority,
    })
  );

  return {
    localRestaurantSheetPresenceAuthority: localRestaurantSheetPresenceController.outputAuthority,
  };
};
