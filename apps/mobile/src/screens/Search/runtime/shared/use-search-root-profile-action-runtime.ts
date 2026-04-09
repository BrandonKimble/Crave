import {
  type SearchRootProfileActionRuntime,
  type UseSearchRootProfileActionRuntimeArgs,
} from './use-search-root-profile-action-runtime-contract';
import { useSearchRootProfileAnalyticsModelRuntime } from './use-search-root-profile-analytics-model-runtime';
import { useSearchRootProfileAppExecutionArgsRuntime } from './use-search-root-profile-app-execution-args-runtime';
import { useSearchRootProfileNativeExecutionArgsRuntime } from './use-search-root-profile-native-execution-args-runtime';
import { useSearchRootProfileSelectionModelRuntime } from './use-search-root-profile-selection-model-runtime';

export type { SearchRootProfileActionRuntime } from './use-search-root-profile-action-runtime-contract';

export const useSearchRootProfileActionRuntime = ({
  insets,
  isSignedIn,
  userLocation,
  userLocationRef,
  rootSessionRuntime,
  rootPrimitivesRuntime,
  rootSuggestionRuntime,
  rootScaffoldRuntime,
  requestLaneRuntime,
}: UseSearchRootProfileActionRuntimeArgs): SearchRootProfileActionRuntime => {
  const {
    runtimeOwner: { searchRuntimeBus },
  } = rootSessionRuntime;
  const {
    searchState: {
      pendingRestaurantSelectionRef,
      restaurantOnlyId,
      restaurantOnlySearchRef,
      isSearchFocused,
      query,
      isSuggestionPanelActive,
    },
  } = rootPrimitivesRuntime;
  const selectionModel = useSearchRootProfileSelectionModelRuntime({
    userLocation,
    userLocationRef,
    rootSessionRuntime,
  });
  const analyticsModel = useSearchRootProfileAnalyticsModelRuntime({
    isSignedIn,
    rootSessionRuntime,
    requestLaneRuntime,
  });
  const {
    cameraTransitionPorts,
    selectionModel: nativeSelectionModel,
    nativeExecutionArgs,
  } = useSearchRootProfileNativeExecutionArgsRuntime({
    insets,
    rootSessionRuntime,
    rootPrimitivesRuntime,
    rootSuggestionRuntime,
    rootScaffoldRuntime,
    selectionModel,
  });
  const { pendingMarkerOpenAnimationFrameRef, appExecutionArgs } =
    useSearchRootProfileAppExecutionArgsRuntime({
      rootSessionRuntime,
      requestLaneRuntime,
    });

  return {
    profileOwnerArgs: {
      searchContext: {
        searchRuntimeBus,
        trimmedQuery: query.trim(),
        restaurantOnlyId,
        isProfileAutoOpenSuppressed: isSuggestionPanelActive || isSearchFocused,
        getPendingRestaurantSelection: () => pendingRestaurantSelectionRef.current,
        clearPendingRestaurantSelection: () => {
          pendingRestaurantSelectionRef.current = null;
        },
        getRestaurantOnlySearchId: () => restaurantOnlySearchRef.current,
      },
      cameraTransitionPorts,
      selectionModel: nativeSelectionModel,
      analyticsModel,
      nativeExecutionArgs,
      appExecutionArgs,
    },
    pendingMarkerOpenAnimationFrameRef,
    restaurantSelectionModel: {
      resolveRestaurantMapLocations: selectionModel.resolveRestaurantMapLocations,
      resolveRestaurantLocationSelectionAnchor:
        selectionModel.resolveRestaurantLocationSelectionAnchor,
      pickPreferredRestaurantMapLocation: selectionModel.pickPreferredRestaurantMapLocation,
    },
  };
};
