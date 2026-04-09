import { useSearchRootProfileActionRuntime } from './use-search-root-profile-action-runtime';
import type { SearchRootProfileActionRuntime } from './use-search-root-profile-action-runtime-contract';
import type { UseSearchRootRuntimeArgs } from './use-search-root-runtime-contract';
import type { SearchRootPrimitivesRuntime } from './use-search-root-primitives-runtime';
import type { SearchRootRequestLaneRuntime } from './use-search-root-request-lane-runtime';
import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';
import type { SearchRootSuggestionRuntime } from './use-search-root-suggestion-runtime';
import type { SearchSessionProfileOwnerRuntime } from './search-session-action-runtime-contract';
import { useSearchSessionProfileOwnerRuntime } from './use-search-session-profile-owner-runtime';

type UseSearchRootSessionProfileSurfaceRuntimeArgs = Pick<
  UseSearchRootRuntimeArgs,
  'insets' | 'isSignedIn' | 'userLocation' | 'userLocationRef'
> & {
  rootSessionRuntime: SearchRootSessionRuntime;
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootSuggestionRuntime: SearchRootSuggestionRuntime;
  rootScaffoldRuntime: SearchRootScaffoldRuntime;
  requestLaneRuntime: SearchRootRequestLaneRuntime;
};

export type SearchRootSessionProfileSurfaceRuntime = SearchSessionProfileOwnerRuntime & {
  pendingMarkerOpenAnimationFrameRef: SearchRootProfileActionRuntime['pendingMarkerOpenAnimationFrameRef'];
  restaurantSelectionModel: SearchRootProfileActionRuntime['restaurantSelectionModel'];
};

export const useSearchRootSessionProfileSurfaceRuntime = ({
  insets,
  isSignedIn,
  userLocation,
  userLocationRef,
  rootSessionRuntime,
  rootPrimitivesRuntime,
  rootSuggestionRuntime,
  rootScaffoldRuntime,
  requestLaneRuntime,
}: UseSearchRootSessionProfileSurfaceRuntimeArgs): SearchRootSessionProfileSurfaceRuntime => {
  const {
    requestPresentationFlowRuntime: {
      requestPresentationRuntime: {
        profileBridgeRefs: {
          profilePresentationActiveRef,
          closeRestaurantProfileRef,
          resetRestaurantProfileFocusSessionRef,
        },
      },
    },
  } = requestLaneRuntime;

  const profileActionRuntime = useSearchRootProfileActionRuntime({
    insets,
    isSignedIn,
    userLocation,
    userLocationRef,
    rootSessionRuntime,
    rootPrimitivesRuntime,
    rootSuggestionRuntime,
    rootScaffoldRuntime,
    requestLaneRuntime,
  });
  const { pendingMarkerOpenAnimationFrameRef, restaurantSelectionModel } = profileActionRuntime;

  const profileOwnerRuntime = useSearchSessionProfileOwnerRuntime({
    suggestionInteractionArgs: {
      inputRef: rootPrimitivesRuntime.searchState.inputRef,
      allowSearchBlurExitRef: rootPrimitivesRuntime.searchState.allowSearchBlurExitRef,
      ignoreNextSearchBlurRef: rootPrimitivesRuntime.searchState.ignoreNextSearchBlurRef,
      beginSuggestionCloseHold: rootSuggestionRuntime.beginSuggestionCloseHold,
      resetSearchHeaderFocusProgress: rootSuggestionRuntime.resetSearchHeaderFocusProgress,
      setIsSearchFocused: rootPrimitivesRuntime.searchState.setIsSearchFocused,
      setIsSuggestionPanelActive: rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive,
      setShowSuggestions: rootPrimitivesRuntime.searchState.setShowSuggestions,
      setSuggestions: rootPrimitivesRuntime.searchState.setSuggestions,
    },
    profileOwnerArgs: profileActionRuntime.profileOwnerArgs,
    profilePresentationActiveRef,
    closeRestaurantProfileRef,
    resetRestaurantProfileFocusSessionRef,
  });

  return {
    ...profileOwnerRuntime,
    pendingMarkerOpenAnimationFrameRef,
    restaurantSelectionModel,
  };
};
