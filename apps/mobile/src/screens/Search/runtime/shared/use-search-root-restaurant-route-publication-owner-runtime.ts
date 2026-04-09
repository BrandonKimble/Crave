import type { SearchRootActionLanes } from './search-root-action-runtime-contract';
import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import type { SearchRootSuggestionRuntime } from './use-search-root-suggestion-runtime';
import type { SearchRootPresentationVisualRuntime } from './use-search-root-presentation-visual-runtime';
import { useSearchRestaurantRoutePublicationRuntime } from './use-search-restaurant-route-publication-runtime';

type UseSearchRootRestaurantRoutePublicationOwnerRuntimeArgs = {
  rootSuggestionRuntime: SearchRootSuggestionRuntime;
  rootScaffoldRuntime: SearchRootScaffoldRuntime;
  presentationVisualRuntime: SearchRootPresentationVisualRuntime;
} & Pick<SearchRootActionLanes, 'sessionActionRuntime' | 'presentationState'>;

export const useSearchRootRestaurantRoutePublicationOwnerRuntime = ({
  rootSuggestionRuntime,
  rootScaffoldRuntime,
  sessionActionRuntime,
  presentationState,
  presentationVisualRuntime,
}: UseSearchRootRestaurantRoutePublicationOwnerRuntimeArgs): void => {
  useSearchRestaurantRoutePublicationRuntime({
    suggestionProgress: rootSuggestionRuntime.suggestionProgress,
    shouldPublish: rootScaffoldRuntime.overlaySessionRuntime.shouldRenderSearchOverlay,
    restaurantPanelSnapshot:
      sessionActionRuntime.profileOwner.profileViewState.restaurantPanelSnapshot,
    onRequestClose: sessionActionRuntime.profileOwner.profileActions.closeRestaurantProfile,
    onToggleFavorite: rootScaffoldRuntime.overlaySessionRuntime.handleRestaurantSavePress,
    shouldFreezeRestaurantPanelContent: presentationState.shouldFreezeRestaurantPanelContent,
    shouldEnableRestaurantOverlayInteraction:
      presentationState.shouldEnableRestaurantOverlayInteraction,
    shouldSuppressRestaurantOverlay: presentationState.shouldSuppressRestaurantOverlay,
    restaurantSheetSnapController: sessionActionRuntime.profileOwner.restaurantSheetSnapController,
    searchSheetVisualContextValue: presentationVisualRuntime.searchSheetVisualContextValue,
  });
};
