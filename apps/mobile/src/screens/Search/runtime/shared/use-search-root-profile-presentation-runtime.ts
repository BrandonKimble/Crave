import React from 'react';

import { useSuggestionInteractionController } from '../../hooks/use-suggestion-interaction-controller';
import type { SearchRootEnvironment } from './search-root-environment-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { ProfileOwnerNativeExecutionArgs } from '../profile/profile-owner-runtime-contract';
import type { ProfilePresentationCameraLayoutModel } from '../profile/profile-presentation-model-runtime';
import type { SuggestionInteractionRuntime } from './use-search-root-control-plane-runtime-contract';
import type { SearchRootSessionCoreLane } from './use-search-root-session-runtime-contract';
import { useSearchRootProfileCameraTransitionRuntime } from './use-search-root-profile-camera-transition-runtime';
import { useSearchRootProfileNativeExecutionRuntime } from './use-search-root-profile-native-execution-runtime';
import { useSearchRootProfilePendingMarkerRuntime } from './use-search-root-profile-pending-marker-runtime';

type UseSearchRootProfilePresentationRuntimeArgs = {
  sessionCoreLane: SearchRootSessionCoreLane;
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  insets: SearchRootEnvironment['insets'];
};

type SearchRootProfilePresentationRuntime = {
  pendingMarkerOpenAnimationFrameRef: React.MutableRefObject<number | null>;
  cameraTransitionPorts: ProfilePresentationCameraLayoutModel;
  nativeExecutionArgs: ProfileOwnerNativeExecutionArgs;
  suggestionInteractionRuntime: SuggestionInteractionRuntime;
};

export const useSearchRootProfilePresentationRuntime = ({
  sessionCoreLane,
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  insets,
}: UseSearchRootProfilePresentationRuntimeArgs): SearchRootProfilePresentationRuntime => {
  const { rootPrimitivesRuntime, rootSuggestionRuntime, sessionPrimitivesLane } =
    stateFoundationLane;
  const pendingMarkerOpenAnimationFrameRef = useSearchRootProfilePendingMarkerRuntime();
  const cameraTransitionPorts = useSearchRootProfileCameraTransitionRuntime({
    stateFoundationLane,
    rootOverlayFoundationRuntime,
    insets,
  });
  const nativeExecutionArgs = useSearchRootProfileNativeExecutionRuntime({
    sessionCoreLane,
    sessionPrimitivesLane,
    stateFoundationLane,
    rootOverlayFoundationRuntime,
  });

  const suggestionInteractionRuntime = useSuggestionInteractionController({
    inputRef: rootPrimitivesRuntime.searchState.inputRef,
    allowSearchBlurExitRef: rootPrimitivesRuntime.searchState.allowSearchBlurExitRef,
    ignoreNextSearchBlurRef: rootPrimitivesRuntime.searchState.ignoreNextSearchBlurRef,
    beginSuggestionCloseHold: rootSuggestionRuntime.beginSuggestionCloseHold,
    resetSearchHeaderFocusProgress: rootSuggestionRuntime.resetSearchHeaderFocusProgress,
    setIsSearchFocused: rootPrimitivesRuntime.searchState.setIsSearchFocused,
    setIsSuggestionPanelActive: rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive,
    setShowSuggestions: rootPrimitivesRuntime.searchState.setShowSuggestions,
    setSuggestions: rootPrimitivesRuntime.searchState.setSuggestions,
    shouldLogPerf:
      rootOverlayFoundationRuntime.rootInstrumentationRuntime.shouldLogSearchStateChanges,
  });

  return React.useMemo(
    () => ({
      pendingMarkerOpenAnimationFrameRef,
      cameraTransitionPorts,
      nativeExecutionArgs,
      suggestionInteractionRuntime,
    }),
    [
      cameraTransitionPorts,
      nativeExecutionArgs,
      pendingMarkerOpenAnimationFrameRef,
      suggestionInteractionRuntime,
    ]
  );
};
