import type { ProfileOwner } from '../profile/profile-owner-runtime-contract';
import type { SearchRootEnvironment } from './search-root-environment-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type {
  SearchRootAutocompleteAuthorityRuntime,
  SearchRootClearRestoreAuthorityRuntime,
  SearchRootForegroundInputRuntime,
} from './search-root-control-ports-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { FilterModalRuntime } from './use-search-root-control-plane-runtime-contract';
import type { ResultsPresentationOwner } from './use-results-presentation-runtime-owner';
import { useSearchForegroundTransientController } from './use-search-foreground-transient-controller';
import { useSearchRootForegroundEditingRuntimeArgs } from './use-search-root-foreground-editing-runtime-args';
import { useSearchRootForegroundOverlayRuntimeArgs } from './use-search-root-foreground-overlay-runtime-args';
import type {
  SearchForegroundInteractionSubmitHandlers,
  SearchForegroundTransientCleanupActions,
} from './use-search-foreground-interaction-runtime-contract';

type UseSearchRootForegroundTransientRuntimeArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  navigation: SearchRootEnvironment['navigation'];
  routeSearchIntent: SearchRootEnvironment['routeSearchIntent'];
  userLocation: SearchRootEnvironment['userLocation'];
  autocompleteAuthorityRuntime: SearchRootAutocompleteAuthorityRuntime;
  clearRestoreAuthorityRuntime: SearchRootClearRestoreAuthorityRuntime;
  resultsPresentationOwner: ResultsPresentationOwner;
  foregroundInputRuntime: SearchRootForegroundInputRuntime;
  profileOwner: ProfileOwner;
  filterModalRuntime: FilterModalRuntime;
  transientCleanupActions: SearchForegroundTransientCleanupActions;
  foregroundCommandRuntime: Pick<
    SearchForegroundInteractionSubmitHandlers,
    | 'handleRecentSearchPress'
    | 'handleRecentlyViewedRestaurantPress'
    | 'handleRecentlyViewedFoodPress'
  >;
};

export const useSearchRootForegroundTransientRuntime = ({
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  navigation,
  routeSearchIntent,
  userLocation,
  autocompleteAuthorityRuntime,
  clearRestoreAuthorityRuntime,
  resultsPresentationOwner,
  foregroundInputRuntime,
  profileOwner,
  transientCleanupActions,
  foregroundCommandRuntime,
}: UseSearchRootForegroundTransientRuntimeArgs) => {
  const editingRuntimeArgs = useSearchRootForegroundEditingRuntimeArgs({
    stateFoundationLane,
    rootOverlayFoundationRuntime,
    autocompleteAuthorityRuntime,
    clearRestoreAuthorityRuntime,
    resultsPresentationOwner,
    foregroundInputRuntime,
    profileOwner,
  });
  const overlayRuntimeArgs = useSearchRootForegroundOverlayRuntimeArgs({
    stateFoundationLane,
    rootOverlayFoundationRuntime,
    navigation,
    routeSearchIntent,
    userLocation,
    profileOwner,
    transientCleanupActions,
  });

  return useSearchForegroundTransientController({
    editingRuntimeArgs,
    overlayRuntimeArgs,
    submitHandlers: {
      handleRecentSearchPress: foregroundCommandRuntime.handleRecentSearchPress,
      handleRecentlyViewedRestaurantPress:
        foregroundCommandRuntime.handleRecentlyViewedRestaurantPress,
      handleRecentlyViewedFoodPress: foregroundCommandRuntime.handleRecentlyViewedFoodPress,
    },
  });
};
