import React from 'react';

import { useSearchForegroundLaunchIntentRuntime } from './use-search-foreground-launch-intent-runtime';
import { useSearchForegroundInteractionRenderRegistrationRuntime } from './use-search-foreground-interaction-effects-runtime';
import { useSearchRootForegroundEffectsRegistrationArgs } from './use-search-root-foreground-effects-registration-args';
import { useSearchRootForegroundCommandRuntime } from './use-search-root-foreground-command-runtime';
import { useSearchForegroundTransientController } from './use-search-foreground-transient-controller';
import { useSearchRootForegroundEditingRuntimeArgs } from './use-search-root-foreground-editing-runtime-args';
import { useSearchRootForegroundOverlayRuntimeArgs } from './use-search-root-foreground-overlay-runtime-args';
import { useSearchRootControlAuthorityRuntime } from './use-search-root-control-authority-runtime';
import { useSearchRootControlProfileExperienceRuntime } from './use-search-root-control-profile-experience-runtime';
import { useSearchRootControlResultsExperienceRuntime } from './use-search-root-control-results-experience-runtime';
import { useSearchRootFilterModalRuntime } from './use-search-root-filter-modal-runtime';
import { useSearchRootSubmitControlRuntime } from './use-search-root-submit-control-runtime';
import { createSearchForegroundTransientCleanupActions } from './search-foreground-transient-cleanup-actions';
import type { SearchForegroundPolicyPublicationAuthority } from './search-foreground-policy-publication-authority';
import type {
  SearchRootFilterModalControlLane,
  SearchRootForegroundInputControlLane,
  SearchRootForegroundInteractionControlLane,
  SearchRootViewportShortcutControlLane,
} from './search-root-control-plane-runtime-contract';
import type { useSearchScreenAppEntryPlaneRuntime } from './use-search-screen-app-entry-plane-runtime';
import type { useSearchRootRuntimeFoundationStageRuntime } from './use-search-root-runtime-foundation-stage-runtime';
import type { useSearchRootRuntimeOverlayFoundationAssemblyRuntime } from './use-search-root-runtime-overlay-foundation-assembly-runtime';

export const useSearchRootRuntimeControlStageRuntime = ({
  appEntryPlaneRuntime,
  sessionAssemblyRuntime,
  stateAssemblyRuntime,
  overlayFoundationAssemblyRuntime,
  foregroundPolicyPublicationAuthority,
}: {
  appEntryPlaneRuntime: ReturnType<typeof useSearchScreenAppEntryPlaneRuntime>;
  sessionAssemblyRuntime: ReturnType<
    typeof useSearchRootRuntimeFoundationStageRuntime
  >['sessionAssemblyRuntime'];
  stateAssemblyRuntime: ReturnType<
    typeof useSearchRootRuntimeFoundationStageRuntime
  >['stateAssemblyRuntime'];
  overlayFoundationAssemblyRuntime: ReturnType<
    typeof useSearchRootRuntimeOverlayFoundationAssemblyRuntime
  >;
  foregroundPolicyPublicationAuthority?: SearchForegroundPolicyPublicationAuthority;
}): {
  controlAuthorityRuntime: ReturnType<typeof useSearchRootControlAuthorityRuntime>;
  profileControlRuntime: ReturnType<typeof useSearchRootControlProfileExperienceRuntime>;
  viewportShortcutControlLane: SearchRootViewportShortcutControlLane;
  filterModalControlLane: SearchRootFilterModalControlLane;
  resultsControlRuntime: ReturnType<typeof useSearchRootControlResultsExperienceRuntime>;
  foregroundInteractionControlLane: SearchRootForegroundInteractionControlLane;
  foregroundInputControlLane: SearchRootForegroundInputControlLane;
} => {
  const controlAuthorityRuntime = useSearchRootControlAuthorityRuntime({
    sessionCoreLane: sessionAssemblyRuntime.sessionRuntime.sessionCoreLane,
    mapViewportIntentRuntime: overlayFoundationAssemblyRuntime.mapViewportIntentRuntime,
    stateFoundationLane: stateAssemblyRuntime.stateFoundationLane,
    rootOverlayFoundationRuntime: overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime,
    foregroundPolicyPublicationAuthority,
  });
  const profileControlRuntime = useSearchRootControlProfileExperienceRuntime({
    sessionCoreLane: sessionAssemblyRuntime.sessionRuntime.sessionCoreLane,
    stateFoundationLane: stateAssemblyRuntime.stateFoundationLane,
    rootOverlayFoundationRuntime: overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime,
    insets: appEntryPlaneRuntime.insets,
    isSignedIn: appEntryPlaneRuntime.isSignedIn,
    userLocation: appEntryPlaneRuntime.userLocation,
    userLocationRef: appEntryPlaneRuntime.userLocationRef,
    profileBridgeAuthorityRuntime:
      controlAuthorityRuntime.foundationAuthorityRuntime.profileBridgeAuthorityRuntime,
    recentActivityAuthorityRuntime:
      controlAuthorityRuntime.foundationAuthorityRuntime.recentActivityAuthorityRuntime,
    clearRestoreAuthorityRuntime:
      controlAuthorityRuntime.foundationAuthorityRuntime.clearRestoreAuthorityRuntime,
  });
  const submitRuntimeResult = useSearchRootSubmitControlRuntime({
    sessionCoreLane: sessionAssemblyRuntime.sessionRuntime.sessionCoreLane,
    stateFoundationLane: stateAssemblyRuntime.stateFoundationLane,
    rootOverlayFoundationRuntime: overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime,
    requestExecutionAuthorityRuntime:
      controlAuthorityRuntime.foundationAuthorityRuntime.requestExecutionAuthorityRuntime,
    recentActivityAuthorityRuntime:
      controlAuthorityRuntime.foundationAuthorityRuntime.recentActivityAuthorityRuntime,
    resultsScrollAuthorityRuntime:
      controlAuthorityRuntime.foundationAuthorityRuntime.resultsScrollAuthorityRuntime,
    resultsPresentationOwner:
      controlAuthorityRuntime.presentationAuthorityRuntime.resultsPresentationControlLane
        .resultsPresentationOwner,
    userLocation: appEntryPlaneRuntime.userLocation,
  });
  // F1012 lane-cluster collapse: each lane is the single-field wrapper its deleted
  // `use-search-root-foreground-control-lanes.ts` hook produced, memoized PER LANE so a
  // change in one source cannot invalidate a sibling lane's identity.
  const { submitViewportShortcut } = submitRuntimeResult;
  const viewportShortcutControlLane: SearchRootViewportShortcutControlLane = React.useMemo(
    () => ({ submitViewportShortcut }),
    [submitViewportShortcut]
  );
  const filterModalRuntime = useSearchRootFilterModalRuntime({
    sessionCoreLane: sessionAssemblyRuntime.sessionRuntime.sessionCoreLane,
    stateFoundationLane: stateAssemblyRuntime.stateFoundationLane,
    rootOverlayFoundationRuntime: overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime,
    resultsPresentationOwner:
      controlAuthorityRuntime.presentationAuthorityRuntime.resultsPresentationControlLane
        .resultsPresentationOwner,
    submitRuntimeResult,
  });
  const filterModalControlLane: SearchRootFilterModalControlLane = React.useMemo(
    () => ({ filterModalRuntime }),
    [filterModalRuntime]
  );
  const resultsControlRuntime = useSearchRootControlResultsExperienceRuntime({
    stateFoundationLane: stateAssemblyRuntime.stateFoundationLane,
    rootOverlayFoundationRuntime: overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime,
    resultsPresentationControlLane:
      controlAuthorityRuntime.presentationAuthorityRuntime.resultsPresentationControlLane,
    resultsInteractionPorts:
      controlAuthorityRuntime.presentationAuthorityRuntime.resultsInteractionPorts,
    profileControlRuntime,
    submitRuntimeResult,
  });
  const foregroundCommandRuntime = useSearchRootForegroundCommandRuntime({
    stateFoundationLane: stateAssemblyRuntime.stateFoundationLane,
    rootOverlayFoundationRuntime: overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime,
    autocompleteAuthorityRuntime:
      controlAuthorityRuntime.foundationAuthorityRuntime.autocompleteAuthorityRuntime,
    recentActivityAuthorityRuntime:
      controlAuthorityRuntime.foundationAuthorityRuntime.recentActivityAuthorityRuntime,
    profileOwner: profileControlRuntime.profileOwner,
    suggestionInteractionRuntime:
      profileControlRuntime.suggestionInteractionControlLane.suggestionInteractionRuntime,
    submitRuntimeResult,
  });
  const foregroundTransientCleanupActions = React.useMemo(
    () =>
      createSearchForegroundTransientCleanupActions({
        primitiveUiCleanupActions:
          stateAssemblyRuntime.stateFoundationLane.rootPrimitivesRuntime.searchState
            .primitiveUiCleanupActions,
        suggestionPanelStateController:
          stateAssemblyRuntime.stateFoundationLane.rootPrimitivesRuntime.searchState
            .suggestionPanelStateController,
        setIsSuggestionPanelActive:
          stateAssemblyRuntime.stateFoundationLane.rootPrimitivesRuntime.searchState
            .setIsSuggestionPanelActive,
        dismissTransientOverlays:
          overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime.rootOverlayStoreRuntime
            .dismissTransientOverlays,
        profileBridge:
          controlAuthorityRuntime.foundationAuthorityRuntime.profileBridgeAuthorityRuntime
            .profileBridge,
      }),
    [
      controlAuthorityRuntime.foundationAuthorityRuntime.profileBridgeAuthorityRuntime
        .profileBridge,
      overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime.rootOverlayStoreRuntime
        .dismissTransientOverlays,
      stateAssemblyRuntime.stateFoundationLane.rootPrimitivesRuntime.searchState
        .primitiveUiCleanupActions,
      stateAssemblyRuntime.stateFoundationLane.rootPrimitivesRuntime.searchState
        .setIsSuggestionPanelActive,
      stateAssemblyRuntime.stateFoundationLane.rootPrimitivesRuntime.searchState
        .suggestionPanelStateController,
    ]
  );
  const foregroundEditingRuntimeArgs = useSearchRootForegroundEditingRuntimeArgs({
    stateFoundationLane: stateAssemblyRuntime.stateFoundationLane,
    rootOverlayFoundationRuntime: overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime,
    autocompleteAuthorityRuntime:
      controlAuthorityRuntime.foundationAuthorityRuntime.autocompleteAuthorityRuntime,
    clearRestoreAuthorityRuntime:
      controlAuthorityRuntime.foundationAuthorityRuntime.clearRestoreAuthorityRuntime,
    resultsPresentationOwner:
      controlAuthorityRuntime.presentationAuthorityRuntime.resultsPresentationControlLane
        .resultsPresentationOwner,
    foregroundInputRuntime:
      controlAuthorityRuntime.presentationAuthorityRuntime.foregroundInputRuntime,
    profileOwner: profileControlRuntime.profileOwner,
  });
  const foregroundOverlayRuntimeArgs = useSearchRootForegroundOverlayRuntimeArgs({
    stateFoundationLane: stateAssemblyRuntime.stateFoundationLane,
    rootOverlayFoundationRuntime: overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime,
    navigation: appEntryPlaneRuntime.navigation,
    routeSearchIntent: appEntryPlaneRuntime.routeSearchIntent,
    userLocation: appEntryPlaneRuntime.userLocation,
    profileOwner: profileControlRuntime.profileOwner,
    transientCleanupActions: foregroundTransientCleanupActions,
  });
  const foregroundTransientHandlersRuntime = useSearchForegroundTransientController({
    editingRuntimeArgs: foregroundEditingRuntimeArgs,
    overlayRuntimeArgs: foregroundOverlayRuntimeArgs,
    submitHandlers: {
      handleRecentSearchPress: foregroundCommandRuntime.handleRecentSearchPress,
      handleRecentlyViewedRestaurantPress:
        foregroundCommandRuntime.handleRecentlyViewedRestaurantPress,
      handleRecentlyViewedFoodPress: foregroundCommandRuntime.handleRecentlyViewedFoodPress,
    },
  });
  const foregroundInteractionRuntime = React.useMemo(
    () => ({
      ...foregroundCommandRuntime,
      ...foregroundTransientHandlersRuntime,
    }),
    [foregroundCommandRuntime, foregroundTransientHandlersRuntime]
  );
  const foregroundInteractionControlLane: SearchRootForegroundInteractionControlLane =
    React.useMemo(() => ({ foregroundInteractionRuntime }), [foregroundInteractionRuntime]);
  const { foregroundInputRuntime } = controlAuthorityRuntime.presentationAuthorityRuntime;
  const foregroundInputControlLane: SearchRootForegroundInputControlLane = React.useMemo(
    () => ({ foregroundInputRuntime }),
    [foregroundInputRuntime]
  );

  const foregroundEffectsRegistrationArgs = useSearchRootForegroundEffectsRegistrationArgs({
    mutationCancelAuthorityRuntime:
      controlAuthorityRuntime.foundationAuthorityRuntime.mutationCancelAuthorityRuntime,
    resultsPresentationOwner:
      controlAuthorityRuntime.presentationAuthorityRuntime.resultsPresentationControlLane
        .resultsPresentationOwner,
  });
  useSearchForegroundInteractionRenderRegistrationRuntime({
    effectsRuntimeArgs: foregroundEffectsRegistrationArgs,
  });

  useSearchForegroundLaunchIntentRuntime({
    routeSearchCommandActions:
      overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime.routeSearchCommandActions,
    navigation: appEntryPlaneRuntime.navigation,
    activeMainIntent: appEntryPlaneRuntime.activeMainIntent,
    consumeActiveMainIntent: appEntryPlaneRuntime.consumeActiveMainIntent,
    openRestaurantProfilePreview:
      profileControlRuntime.profileOwner.profileActions.openRestaurantProfilePreview,
    launchEntitySearchResults: submitRuntimeResult.launchEntitySearchResults,
    // Wave-4 §3 — the list-world half of the listWorld composite.
    launchListSearchResults: submitRuntimeResult.launchListSearchResults,
    // Phase 4 — the committed restaurant reveal lane (replaces the cold preview lane).
    runRestaurantEntitySearch: submitRuntimeResult.runRestaurantEntitySearch,
    submitSearch: submitRuntimeResult.submitSearch,
    submitViewportShortcut: submitRuntimeResult.submitViewportShortcut,
    pendingRestaurantSelectionRef:
      stateAssemblyRuntime.stateFoundationLane.rootPrimitivesRuntime.searchState
        .pendingRestaurantSelectionRef,
  });

  return {
    controlAuthorityRuntime,
    profileControlRuntime,
    viewportShortcutControlLane,
    filterModalControlLane,
    resultsControlRuntime,
    foregroundInteractionControlLane,
    foregroundInputControlLane,
  };
};
