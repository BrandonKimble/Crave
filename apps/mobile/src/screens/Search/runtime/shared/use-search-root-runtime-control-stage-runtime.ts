import React from 'react';

import { useSearchForegroundLaunchIntentRuntime } from './use-search-foreground-launch-intent-runtime';
import { useSearchForegroundInteractionRenderRegistrationRuntime } from './use-search-foreground-interaction-effects-runtime';
import { useSearchRootForegroundEffectsRegistrationArgs } from './use-search-root-foreground-effects-registration-args';
import {
  useSearchRootFilterModalControlLane,
  useSearchRootForegroundInputControlLane,
  useSearchRootForegroundInteractionControlLane,
  useSearchRootViewportShortcutControlLane,
} from './use-search-root-foreground-control-lanes';
import { useSearchRootForegroundCommandRuntime } from './use-search-root-foreground-command-runtime';
import { useSearchRootForegroundTransientRuntime } from './use-search-root-foreground-transient-runtime';
import { useSearchRootControlAuthorityRuntime } from './use-search-root-control-authority-runtime';
import { useSearchRootControlProfileExperienceRuntime } from './use-search-root-control-profile-experience-runtime';
import { useSearchRootControlResultsExperienceRuntime } from './use-search-root-control-results-experience-runtime';
import { useSearchRootFilterModalRuntime } from './use-search-root-filter-modal-runtime';
import { useSearchRootSubmitControlRuntime } from './use-search-root-submit-control-runtime';
import type { SearchChromeScalarSurfaceRuntime } from '../native/search-chrome-scalar-surface-runtime';
import type { ResultsSurfacePolicyController } from './results-surface-policy-controller';
import { createSearchForegroundTransientCleanupActions } from './search-foreground-transient-cleanup-actions';
import type { SearchForegroundPolicyPublicationAuthority } from './search-foreground-policy-publication-authority';
import type { SearchRootViewportShortcutControlLane } from './use-search-root-control-plane-runtime-contract';
import type { useSearchScreenAppEntryPlaneRuntime } from './use-search-screen-app-entry-plane-runtime';
import type { useSearchRootRuntimeFoundationStageRuntime } from './use-search-root-runtime-foundation-stage-runtime';
import type { useSearchRootRuntimeOverlayFoundationAssemblyRuntime } from './use-search-root-runtime-overlay-foundation-assembly-runtime';

export const useSearchRootRuntimeControlStageRuntime = ({
  appEntryPlaneRuntime,
  sessionAssemblyRuntime,
  stateAssemblyRuntime,
  overlayFoundationAssemblyRuntime,
  resultsSurfacePolicyController,
  foregroundPolicyPublicationAuthority,
  searchChromeScalarSurfaceRuntime,
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
  resultsSurfacePolicyController?: ResultsSurfacePolicyController;
  foregroundPolicyPublicationAuthority?: SearchForegroundPolicyPublicationAuthority;
  searchChromeScalarSurfaceRuntime?: SearchChromeScalarSurfaceRuntime;
}): {
  controlAuthorityRuntime: ReturnType<typeof useSearchRootControlAuthorityRuntime>;
  profileControlRuntime: ReturnType<typeof useSearchRootControlProfileExperienceRuntime>;
  viewportShortcutControlLane: SearchRootViewportShortcutControlLane;
  filterModalControlLane: ReturnType<typeof useSearchRootFilterModalControlLane>;
  resultsControlRuntime: ReturnType<typeof useSearchRootControlResultsExperienceRuntime>;
  foregroundInteractionControlLane: ReturnType<
    typeof useSearchRootForegroundInteractionControlLane
  >;
  foregroundInputControlLane: ReturnType<typeof useSearchRootForegroundInputControlLane>;
} => {
  const controlAuthorityRuntime = useSearchRootControlAuthorityRuntime({
    sessionCoreLane: sessionAssemblyRuntime.sessionRuntime.sessionCoreLane,
    mapViewportIntentRuntime: overlayFoundationAssemblyRuntime.mapViewportIntentRuntime,
    stateFoundationLane: stateAssemblyRuntime.stateFoundationLane,
    rootOverlayFoundationRuntime: overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime,
    resultsSurfacePolicyController,
    foregroundPolicyPublicationAuthority,
    searchChromeScalarSurfaceRuntime,
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
    profileOwner: profileControlRuntime.profileOwner,
    userLocation: appEntryPlaneRuntime.userLocation,
  });
  const viewportShortcutControlLane = useSearchRootViewportShortcutControlLane(
    submitRuntimeResult.submitViewportShortcut
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
  const filterModalControlLane = useSearchRootFilterModalControlLane(filterModalRuntime);
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
  const foregroundTransientHandlersRuntime = useSearchRootForegroundTransientRuntime({
    stateFoundationLane: stateAssemblyRuntime.stateFoundationLane,
    rootOverlayFoundationRuntime: overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime,
    navigation: appEntryPlaneRuntime.navigation,
    routeSearchIntent: appEntryPlaneRuntime.routeSearchIntent,
    userLocation: appEntryPlaneRuntime.userLocation,
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
    filterModalRuntime,
    transientCleanupActions: foregroundTransientCleanupActions,
    foregroundCommandRuntime,
  });
  const foregroundInteractionRuntime = React.useMemo(
    () => ({
      ...foregroundCommandRuntime,
      ...foregroundTransientHandlersRuntime,
    }),
    [foregroundCommandRuntime, foregroundTransientHandlersRuntime]
  );
  const foregroundInteractionControlLane = useSearchRootForegroundInteractionControlLane(
    foregroundInteractionRuntime
  );
  const foregroundInputControlLane = useSearchRootForegroundInputControlLane(
    controlAuthorityRuntime.presentationAuthorityRuntime.foregroundInputRuntime
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

  const currentMarketKey =
    typeof stateAssemblyRuntime.stateFoundationLane.rootDataPlaneRuntime.resultsArrivalState
      .currentResults?.metadata?.marketKey === 'string' &&
    stateAssemblyRuntime.stateFoundationLane.rootDataPlaneRuntime.resultsArrivalState.currentResults.metadata.marketKey.trim()
      .length
      ? stateAssemblyRuntime.stateFoundationLane.rootDataPlaneRuntime.resultsArrivalState.currentResults.metadata.marketKey
          .trim()
          .toLowerCase()
      : null;

  useSearchForegroundLaunchIntentRuntime({
    routeSearchCommandActions:
      overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime.routeSearchCommandActions,
    navigation: appEntryPlaneRuntime.navigation,
    activeMainIntent: appEntryPlaneRuntime.activeMainIntent,
    consumeActiveMainIntent: appEntryPlaneRuntime.consumeActiveMainIntent,
    currentMarketKey,
    openRestaurantProfilePreview:
      profileControlRuntime.profileOwner.profileActions.openRestaurantProfilePreview,
    launchFavoritesListResults: submitRuntimeResult.launchFavoritesListResults,
    launchEntitySearchResults: submitRuntimeResult.launchEntitySearchResults,
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
