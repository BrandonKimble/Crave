import React from 'react';

import type {
  SearchRootClearRestoreAuthorityRuntime,
  SearchRootProfileBridgeAuthorityRuntime,
  SearchRootResultsPresentationAuthorityRuntime,
} from './search-root-control-ports-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './search-root-foundation-runtime';
import type { SearchRootSessionCoreLane } from './search-root-session-runtime-contract';
import type { SearchForegroundPolicyPublicationAuthority } from './search-foreground-policy-publication-authority';
import { deferMountedResultsCleanupUntilAfterDismiss } from './search-mounted-results-data-store';
import { useResultsPresentationOwner } from './use-results-presentation-runtime-owner';
import { getSearchSurfaceRuntime } from '../surface/search-surface-runtime';
import { useShouldDisableSearchShortcuts } from './use-should-disable-search-shortcuts';

type UseSearchRootResultsPresentationAuthorityRuntimeArgs = {
  sessionCoreLane: SearchRootSessionCoreLane;
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  profileBridgeAuthorityRuntime: SearchRootProfileBridgeAuthorityRuntime;
  clearRestoreAuthorityRuntime: SearchRootClearRestoreAuthorityRuntime;
  foregroundPolicyPublicationAuthority?: SearchForegroundPolicyPublicationAuthority;
};

export const useSearchRootResultsPresentationAuthorityRuntime = ({
  sessionCoreLane,
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  profileBridgeAuthorityRuntime,
  clearRestoreAuthorityRuntime,
  foregroundPolicyPublicationAuthority,
}: UseSearchRootResultsPresentationAuthorityRuntimeArgs): SearchRootResultsPresentationAuthorityRuntime => {
  const { rootPrimitivesRuntime, rootDataPlaneRuntime } = stateFoundationLane;
  const shouldDisableSearchShortcuts = useShouldDisableSearchShortcuts(
    rootPrimitivesRuntime.searchState
  );
  const {
    rootInstrumentationRuntime,
    rootOverlaySessionSurfaceRuntime,
    appRouteSharedSheetRuntimeOwner,
  } = rootOverlayFoundationRuntime;

  // F1341 — THE MACHINE'S NARRATION IS CONNECTED AGAIN.
  //
  // This was `React.useCallback(() => {}, [])` passed as `log:` into the results-presentation
  // owner — the machine F1307 verified as this territory's best-shaped family precisely
  // BECAUSE it mints a labelled log with every decision it makes, applied or blocked
  // (results-presentation-runtime-machine-owner-runtime emits `attempt.appliedLog` and
  // `attempt.blockedLog`). All of that went into a no-op. A port wired to an empty function is
  // a disconnected wire, not a default: the one machine that explains its own rejections was
  // the one machine nobody could hear.
  //
  // It now routes to `emitRuntimeMechanismEvent`, the runtime's existing mechanism channel.
  // ON THE FLOOD RISK (the recorded red-team question): that channel short-circuits on
  // `isPerfScenarioAttributionActive` before doing any work, so with attribution OFF — the
  // normal case — this costs one function call and a ref read per decision, and NOTHING is
  // emitted. With attribution ON, these decisions are exactly what a scenario trace wants.
  const logControlPresentationDiag = React.useCallback(
    (label: string, data?: Record<string, unknown>) => {
      rootInstrumentationRuntime.emitRuntimeMechanismEvent(`results_presentation_${label}`, {
        ...(data ?? {}),
      });
    },
    [rootInstrumentationRuntime]
  );
  const handleSearchSheetContentLaneChanged = React.useCallback(
    (
      change: NonNullable<
        Parameters<typeof useResultsPresentationOwner>[0]['onSearchSheetContentLaneChanged']
      > extends (arg: infer Change) => void
        ? Change
        : never
    ) => {
      if (change.searchSheetContentLane.kind === 'docked_scene') {
        const transportSnapshot =
          sessionCoreLane.resultsPresentationAuthority.getSnapshot().resultsPresentationTransport;
        const activeRedrawTransactionId =
          getSearchSurfaceRuntime().getActiveOrPendingRedrawTransactionId();
        if (
          transportSnapshot.snapshotKind !== 'results_enter' &&
          activeRedrawTransactionId == null
        ) {
          deferMountedResultsCleanupUntilAfterDismiss('search_sheet_content_lane_docked_scene');
        }
      }
    },
    [sessionCoreLane.resultsPresentationAuthority]
  );
  const resultsPresentationOwner = useResultsPresentationOwner({
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
    // F1323: subscribed, not a render-time ref read.
    shouldEnableShortcutInteractions: !shouldDisableSearchShortcuts,
    ignoreNextSearchBlurRef: rootPrimitivesRuntime.searchState.ignoreNextSearchBlurRef,
    isClearingSearchRef: rootPrimitivesRuntime.searchState.isClearingSearchRef,
    searchRuntimeBus: sessionCoreLane.searchRuntimeBus,
    resultsPresentationAuthority: sessionCoreLane.resultsPresentationAuthority,
    resultsPresentationSurfaceAuthority: sessionCoreLane.resultsPresentationSurfaceAuthority,
    searchMapSourceFramePort: sessionCoreLane.searchMapSourceFramePort,
    log: logControlPresentationDiag,
    resultsSheetRuntime: appRouteSharedSheetRuntimeOwner,
    clearTypedQuery: clearRestoreAuthorityRuntime.clearOwner.clearTypedQuery,
    clearSearchState: clearRestoreAuthorityRuntime.clearOwner.clearSearchState,
    routeSceneVisibilityPolicyRuntime:
      foregroundPolicyPublicationAuthority?.routeSceneVisibilityPolicyRuntime ??
      rootOverlayFoundationRuntime.routeSceneRuntime.routeSceneVisibilityPolicyRuntime,
    onSearchSheetContentLaneChanged: handleSearchSheetContentLaneChanged,
  });

  // F1326 — SCENARIO VERBS ARE WIRED IN AN EFFECT AND UNWIRED ON UNMOUNT.
  //
  // These two were BARE ASSIGNMENTS in the render body, with no teardown. Two consequences,
  // both bad for a verification harness: the ref was written during render (a side effect in
  // render, which under concurrent rendering can be written by a render that is then thrown
  // away), and after unmount the ref kept pointing at THIS instance's closures — so a perf
  // deep link fired against a torn-down search root would drive a dead tree and report a
  // result, which is the worst possible failure mode for an instrument whose entire job is to
  // tell the truth about what the app did.
  //
  // The correct pattern was already in this file, on `cancelToggleInteractionRef` immediately
  // below: assign in an effect, restore the inert default in its cleanup. These now match it.
  React.useEffect(() => {
    const commandRef = rootInstrumentationRuntime.closeSearchScenarioCommandRef;
    commandRef.current = () => {
      resultsPresentationOwner.presentationActions.beginCloseSearch();
    };
    return () => {
      commandRef.current = () => undefined;
    };
  }, [
    rootInstrumentationRuntime.closeSearchScenarioCommandRef,
    resultsPresentationOwner.presentationActions,
  ]);

  // Verification harness: route the perf `toggle_tab` deep link through the REAL toggle flow.
  React.useEffect(() => {
    const commandRef = rootInstrumentationRuntime.tabToggleScenarioCommandRef;
    commandRef.current = resultsPresentationOwner.interactionModel.scheduleTabToggleCommit;
    return () => {
      commandRef.current = () => undefined;
    };
  }, [
    rootInstrumentationRuntime.tabToggleScenarioCommandRef,
    resultsPresentationOwner.interactionModel.scheduleTabToggleCommit,
  ]);

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
