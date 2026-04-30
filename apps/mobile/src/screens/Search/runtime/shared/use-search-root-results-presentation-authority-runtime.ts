import React from 'react';
import { logger } from '../../../../utils';

import type {
  SearchRootClearRestoreAuthorityRuntime,
  SearchRootMutationCancelAuthorityRuntime,
  SearchRootProfileBridgeAuthorityRuntime,
  SearchRootResultsPresentationAuthorityRuntime,
} from './search-root-control-ports-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchRootSessionCoreLane } from './use-search-root-session-runtime-contract';
import type { SearchChromeScalarSurfaceRuntime } from '../native/search-chrome-scalar-surface-runtime';
import type { ResultsSurfacePolicyController } from './results-surface-policy-controller';
import type { SearchForegroundPolicyPublicationAuthority } from './search-foreground-policy-publication-authority';
import { useResultsPresentationOwner } from './use-results-presentation-runtime-owner';

type UseSearchRootResultsPresentationAuthorityRuntimeArgs = {
  sessionCoreLane: SearchRootSessionCoreLane;
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  mutationCancelAuthorityRuntime: SearchRootMutationCancelAuthorityRuntime;
  profileBridgeAuthorityRuntime: SearchRootProfileBridgeAuthorityRuntime;
  clearRestoreAuthorityRuntime: SearchRootClearRestoreAuthorityRuntime;
  cancelActiveSearchRequest: () => void;
  resultsSurfacePolicyController?: ResultsSurfacePolicyController;
  foregroundPolicyPublicationAuthority?: SearchForegroundPolicyPublicationAuthority;
  searchChromeScalarSurfaceRuntime?: SearchChromeScalarSurfaceRuntime;
};

export const useSearchRootResultsPresentationAuthorityRuntime = ({
  sessionCoreLane,
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  mutationCancelAuthorityRuntime,
  profileBridgeAuthorityRuntime,
  clearRestoreAuthorityRuntime,
  cancelActiveSearchRequest,
  resultsSurfacePolicyController,
  foregroundPolicyPublicationAuthority,
  searchChromeScalarSurfaceRuntime,
}: UseSearchRootResultsPresentationAuthorityRuntimeArgs): SearchRootResultsPresentationAuthorityRuntime => {
  const { rootPrimitivesRuntime, rootDataPlaneRuntime, rootSuggestionRuntime } =
    stateFoundationLane;
  const {
    rootInstrumentationRuntime,
    routeOverlaySessionActions,
    routeOverlayCommandActions,
    rootOverlaySessionSurfaceRuntime,
    appRouteResultsSheetRuntimeOwner,
  } = rootOverlayFoundationRuntime;

  const logControlPresentationDiag = React.useCallback(
    (label: string, data?: Record<string, unknown>) => {
      const debugLogger = logger.debug as (
        message: string,
        payload?: Record<string, unknown>
      ) => void;
      debugLogger('[PRESENTATION-DIAG] controller', {
        label,
        ...(data ?? {}),
      });
    },
    []
  );
  const handleCancelPendingMutationWork = React.useCallback(() => {
    mutationCancelAuthorityRuntime.mutationCancelPort.cancelPendingMutationWork();
  }, [mutationCancelAuthorityRuntime.mutationCancelPort]);
  const handleSearchSheetContentLaneChanged = React.useCallback(
    (
      change: NonNullable<
        Parameters<typeof useResultsPresentationOwner>[0]['onSearchSheetContentLaneChanged']
      > extends (arg: infer Change) => void
        ? Change
        : never
    ) => {
      resultsSurfacePolicyController?.updateShellFacts({
        hasActiveSearchContent: change.hasActiveSearchContent,
        closeLaneState: change.closeTransitionState,
        holdPersistentPollLane: change.holdPersistentPollLane,
      });
      const policyFacts = sessionCoreLane.searchRuntimeBus.getPolicyFactsSnapshot();
      const laneKind = change.searchSheetContentLane.kind;
      resultsSurfacePolicyController?.updatePanelInputs({
        renderPolicy: policyFacts.renderPolicy,
        allowsInteractionLoadingState:
          laneKind !== 'results_closing' && laneKind !== 'persistent_poll',
        isSearchLoading: sessionCoreLane.searchRuntimeBus.getState().isSearchLoading,
        freezeClassification: policyFacts.freezeClassification,
        shouldUsePlaceholderRows: false,
      });
    },
    [resultsSurfacePolicyController, sessionCoreLane.searchRuntimeBus]
  );

  const resultsPresentationOwner = useResultsPresentationOwner({
    activeTab: rootPrimitivesRuntime.searchState.activeTab,
    setActiveTab: rootPrimitivesRuntime.searchState.setActiveTab,
    setActiveTabPreference: rootPrimitivesRuntime.searchState.setActiveTabPreference,
    query: rootPrimitivesRuntime.searchState.query,
    submittedQuery: rootDataPlaneRuntime.resultsArrivalState.submittedQuery,
    hasActiveSearchContent:
      rootDataPlaneRuntime.runtimeFlags.isSearchSessionActive ||
      rootDataPlaneRuntime.runtimeFlags.isSearchLoading ||
      rootDataPlaneRuntime.resultsArrivalState.hasResults ||
      rootDataPlaneRuntime.resultsArrivalState.submittedQuery.length > 0,
    isSearchSessionActive: rootDataPlaneRuntime.runtimeFlags.isSearchSessionActive,
    hasResults: rootDataPlaneRuntime.resultsArrivalState.hasResults,
    isSearchLoading: rootDataPlaneRuntime.runtimeFlags.isSearchLoading,
    isSuggestionPanelActive: rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
    shouldRenderSearchOverlay: rootOverlaySessionSurfaceRuntime.shouldRenderSearchOverlay,
    shouldEnableShortcutInteractions:
      !rootPrimitivesRuntime.searchState.shouldDisableSearchShortcutsRef.current,
    ignoreNextSearchBlurRef: rootPrimitivesRuntime.searchState.ignoreNextSearchBlurRef,
    isClearingSearchRef: rootPrimitivesRuntime.searchState.isClearingSearchRef,
    armSearchCloseRestore: routeOverlaySessionActions.armSearchCloseRestore,
    commitSearchCloseRestore: routeOverlaySessionActions.commitSearchCloseRestore,
    cancelSearchCloseRestore: routeOverlaySessionActions.cancelSearchCloseRestore,
    flushPendingSearchOriginRestore: routeOverlaySessionActions.flushPendingSearchOriginRestore,
    requestDefaultPostSearchRestore: routeOverlaySessionActions.requestDefaultPostSearchRestore,
    handleCloseResultsUiReset: routeOverlayCommandActions.handleCloseResultsUiReset,
    cancelAutocomplete: rootDataPlaneRuntime.requestStatusRuntime.cancelAutocomplete,
    resetSubmitTransitionHold: rootSuggestionRuntime.resetSubmitTransitionHold,
    setIsSearchFocused: rootPrimitivesRuntime.searchState.setIsSearchFocused,
    setIsSuggestionPanelActive: rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive,
    setIsAutocompleteSuppressed: rootPrimitivesRuntime.searchState.setIsAutocompleteSuppressed,
    setShowSuggestions: rootPrimitivesRuntime.searchState.setShowSuggestions,
    setQuery: rootPrimitivesRuntime.searchState.setQuery,
    setError: rootPrimitivesRuntime.searchState.setError,
    setSuggestions: rootPrimitivesRuntime.searchState.setSuggestions,
    inputRef: rootPrimitivesRuntime.searchState.inputRef,
    searchRuntimeBus: sessionCoreLane.searchRuntimeBus,
    log: logControlPresentationDiag,
    runOneHandoffCoordinatorRef: sessionCoreLane.runOneHandoffCoordinatorRef,
    emitRuntimeMechanismEvent: rootInstrumentationRuntime.emitRuntimeMechanismEvent as Parameters<
      typeof useResultsPresentationOwner
    >[0]['emitRuntimeMechanismEvent'],
    resultsSheetRuntime: appRouteResultsSheetRuntimeOwner,
    handleCancelPendingMutationWork,
    clearTypedQuery: clearRestoreAuthorityRuntime.clearOwner.clearTypedQuery,
    clearSearchState: clearRestoreAuthorityRuntime.clearOwner.clearSearchState,
    cancelActiveSearchRequest,
    routeSceneVisibilityPolicyRuntime:
      foregroundPolicyPublicationAuthority?.routeSceneVisibilityPolicyRuntime ??
      rootOverlayFoundationRuntime.routeSceneRuntime.routeSceneVisibilityPolicyRuntime,
    onSearchSheetContentLaneChanged: handleSearchSheetContentLaneChanged,
    searchChromeScalarSurfacePresentationRuntime:
      searchChromeScalarSurfaceRuntime?.presentationRuntime,
  });

  rootInstrumentationRuntime.closeSearchHarnessRef.current = () => {
    resultsPresentationOwner.presentationActions.beginCloseSearch();
  };

  React.useEffect(() => {
    profileBridgeAuthorityRuntime.profileBridge.cancelToggleInteractionRef.current =
      resultsPresentationOwner.cancelToggleInteraction;

    return () => {
      profileBridgeAuthorityRuntime.profileBridge.cancelToggleInteractionRef.current = () => {};
    };
  }, [
    profileBridgeAuthorityRuntime.profileBridge.cancelToggleInteractionRef,
    resultsPresentationOwner.cancelToggleInteraction,
  ]);

  return React.useMemo(
    () => ({
      resultsPresentationOwner,
    }),
    [resultsPresentationOwner]
  );
};
