import React from 'react';

import { useAppRouteSceneChromeMotionRuntimeOwner } from '../../../../navigation/runtime/AppRouteSceneChromeMotionRuntimeProvider';
import { useAppRouteSheetHostOwner } from '../../../../navigation/runtime/AppRouteSheetHostRuntimeProvider';
import type { AppRouteSheetHostSurfaceBodySnapshot } from '../../../../navigation/runtime/app-route-sheet-host-surface-runtime-contract';
import { useRouteAuthoritySelector } from '../../../../navigation/runtime/use-route-authority-selector';
import { useSearchForegroundVisualRuntime } from './use-search-foreground-visual-runtime';
import { useSearchDismissMotionPlaneRuntime } from './use-search-dismiss-motion-plane-runtime';
import { useSearchRootOverlayChromePresentationDiagnosticRuntime } from './use-search-root-overlay-chrome-presentation-diagnostic-runtime';
import { useSearchRootOverlayForegroundVisualPresentationSourceRuntime } from './use-search-root-overlay-foreground-visual-presentation-source-runtime';
import { useSearchRootOverlayForegroundVisualSessionSourceRuntime } from './use-search-root-overlay-foreground-visual-session-source-runtime';
import { useSearchRootOverlayShortcutSubmissionRuntime } from './use-search-root-overlay-shortcut-submission-runtime';
import { useSearchRootRuntimeVisualAssemblyRuntime } from './use-search-root-runtime-visual-assembly-runtime';
import { useSearchChromeScalarSurfacePrimitiveSourceWriterRuntime } from '../native/use-search-chrome-scalar-surface-primitive-source-writer-runtime';
import type { SearchChromeScalarSurfaceRuntime } from '../native/search-chrome-scalar-surface-runtime';
import type { useSearchRootControlAuthorityRuntime } from './use-search-root-control-authority-runtime';
import type { useSearchRootControlResultsExperienceRuntime } from './use-search-root-control-results-experience-runtime';
import type { useSearchScreenAppEntryPlaneRuntime } from './use-search-screen-app-entry-plane-runtime';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { ResultsPresentationAuthority } from './results-presentation-authority';
import type { SearchRootViewportShortcutControlLane } from './use-search-root-control-plane-runtime-contract';
import type { useSearchRootRuntimeFoundationStageRuntime } from './use-search-root-runtime-foundation-stage-runtime';
import type { useSearchRootRuntimeOverlayFoundationAssemblyRuntime } from './use-search-root-runtime-overlay-foundation-assembly-runtime';
import type { SearchRouteSheetMotionStateSnapshot } from './search-route-sheet-motion-state-snapshot-contract';

export const useSearchRootRuntimeVisualStageRuntime = ({
  appEntryPlaneRuntime,
  searchRuntimeBus,
  resultsPresentationAuthority,
  stateAssemblyRuntime,
  overlayFoundationAssemblyRuntime,
  controlAuthorityRuntime,
  resultsControlRuntime,
  viewportShortcutControlLane,
  searchChromeScalarSurfaceRuntime,
}: {
  appEntryPlaneRuntime: ReturnType<typeof useSearchScreenAppEntryPlaneRuntime>;
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  stateAssemblyRuntime: ReturnType<
    typeof useSearchRootRuntimeFoundationStageRuntime
  >['stateAssemblyRuntime'];
  overlayFoundationAssemblyRuntime: ReturnType<
    typeof useSearchRootRuntimeOverlayFoundationAssemblyRuntime
  >;
  controlAuthorityRuntime: ReturnType<typeof useSearchRootControlAuthorityRuntime>;
  resultsControlRuntime: ReturnType<typeof useSearchRootControlResultsExperienceRuntime>;
  viewportShortcutControlLane: SearchRootViewportShortcutControlLane;
  searchChromeScalarSurfaceRuntime: SearchChromeScalarSurfaceRuntime;
}): {
  visualAssemblyRuntime: ReturnType<typeof useSearchRootRuntimeVisualAssemblyRuntime>;
} => {
  const appRouteSceneChromeMotionRuntime = useAppRouteSceneChromeMotionRuntimeOwner();
  const appRouteSheetHostRuntimeOwner = useAppRouteSheetHostOwner();
  const routeSheetRuntimeMotionState = useRouteAuthoritySelector<
    SearchRouteSheetMotionStateSnapshot,
    SearchRouteSheetMotionStateSnapshot['stateEntry']
  >({
    subscribe: appRouteSheetHostRuntimeOwner.routeSheetMotionRuntimeAuthority.subscribe,
    subscribeSelector:
      appRouteSheetHostRuntimeOwner.routeSheetMotionRuntimeAuthority.subscribeSelector,
    getSnapshot: appRouteSheetHostRuntimeOwner.routeSheetMotionRuntimeAuthority.getSnapshot,
    selector: React.useCallback((snapshot) => snapshot.stateEntry, []),
    isEqual: React.useCallback(
      (
        left: SearchRouteSheetMotionStateSnapshot['stateEntry'],
        right: SearchRouteSheetMotionStateSnapshot['stateEntry']
      ) =>
        left?.visible === right?.visible &&
        left?.snapPoints === right?.snapPoints &&
        left?.initialSnapPoint === right?.initialSnapPoint &&
        left?.currentSnapPoint === right?.currentSnapPoint &&
        left?.sheetYValue === right?.sheetYValue &&
        left?.motionCommandValue === right?.motionCommandValue,
      []
    ),
    attributionOwner: 'SearchRootRuntimeVisualStageRuntime',
    attributionOperation: 'routeSheetRuntimeMotionSelector',
  });
  const mountedRouteSheetMotionState = useRouteAuthoritySelector<
    AppRouteSheetHostSurfaceBodySnapshot,
    AppRouteSheetHostSurfaceBodySnapshot['motionStateEntry']
  >({
    subscribe: appRouteSheetHostRuntimeOwner.routeSheetSurfaceBodyAuthority.subscribe,
    subscribeSelector:
      appRouteSheetHostRuntimeOwner.routeSheetSurfaceBodyAuthority.subscribeSelector,
    getSnapshot: appRouteSheetHostRuntimeOwner.routeSheetSurfaceBodyAuthority.getSnapshot,
    selector: React.useCallback((snapshot) => snapshot.motionStateEntry, []),
    isEqual: React.useCallback(
      (
        left: AppRouteSheetHostSurfaceBodySnapshot['motionStateEntry'],
        right: AppRouteSheetHostSurfaceBodySnapshot['motionStateEntry']
      ) =>
        left?.visible === right?.visible &&
        left?.snapPoints === right?.snapPoints &&
        left?.initialSnapPoint === right?.initialSnapPoint &&
        left?.currentSnapPoint === right?.currentSnapPoint &&
        left?.sheetYValue === right?.sheetYValue &&
        left?.motionCommandValue === right?.motionCommandValue,
      []
    ),
    attributionOwner: 'SearchRootRuntimeVisualStageRuntime',
    attributionOperation: 'mountedRouteSheetMotionSelector',
  });
  const resultsPresentationOwner =
    controlAuthorityRuntime.presentationAuthorityRuntime.resultsPresentationControlLane
      .resultsPresentationOwner;
  const appRouteResultsSheetRuntimeOwner =
    overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime.appRouteResultsSheetRuntimeOwner;
  const routeSheetMotionState =
    mountedRouteSheetMotionState ?? routeSheetRuntimeMotionState;
  const searchSurfaceSheetTranslateY =
    routeSheetMotionState?.sheetYValue ?? appRouteResultsSheetRuntimeOwner.sheetTranslateY;
  const searchSurfaceSnapPoints =
    routeSheetMotionState?.snapPoints ?? appRouteResultsSheetRuntimeOwner.snapPoints;
  const searchSurfaceCurrentSnap =
    routeSheetMotionState?.currentSnapPoint ?? appRouteResultsSheetRuntimeOwner.sheetState;
  const commitSearchDismissCollapsedSnap = React.useCallback(() => {
    appRouteSheetHostRuntimeOwner.routeSheetSurfaceBodyAuthority
      .getSnapshot()
      .motionCallbacksEntry.onSnapChange?.('collapsed', { source: 'programmatic' });
    appRouteResultsSheetRuntimeOwner.handleSheetSnapChange('collapsed');
  }, [appRouteResultsSheetRuntimeOwner, appRouteSheetHostRuntimeOwner]);
  const dismissMotionPlaneRuntime = useSearchDismissMotionPlaneRuntime({
    isCloseTransitionActive: resultsPresentationOwner.shellModel.isCloseTransitionActive,
    sheetTranslateY: searchSurfaceSheetTranslateY,
    currentSheetSnap: searchSurfaceCurrentSnap,
    snapPoints: searchSurfaceSnapPoints,
    collapsedSnap: searchSurfaceSnapPoints.collapsed,
    notifyCloseCollapsedBoundaryReached: () => {
      commitSearchDismissCollapsedSnap();
      resultsControlRuntime.resultsTransitionControlLane.closeTransitionActions.markSearchSheetCloseCollapsedReached(
        'collapsed',
        'motion_plane'
      );
    },
    notifyCloseSheetSettled: () => {
      commitSearchDismissCollapsedSnap();
      resultsControlRuntime.resultsTransitionControlLane.closeTransitionActions.markSearchSheetCloseSheetSettled(
        'collapsed'
      );
    },
  });
  const surfaceBundleVisualRuntime = React.useMemo(
    () => ({
      searchSurfacePageBundleProgress: dismissMotionPlaneRuntime.searchSurfacePageBundleProgress,
    }),
    [dismissMotionPlaneRuntime.searchSurfacePageBundleProgress]
  );
  const foregroundVisualSessionSourceRuntime =
    useSearchRootOverlayForegroundVisualSessionSourceRuntime({
      insetsTop: appEntryPlaneRuntime.insets.top,
      rootOverlayStoreRuntime: {
        isSearchOverlay:
          overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime.rootOverlayStoreRuntime
            .isSearchOverlay,
      },
      rootOverlaySessionSurfaceRuntime:
        overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime
          .rootOverlaySessionSurfaceRuntime,
      resultsSheetRuntimeLane:
        overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime.rootResultsSheetRuntimeLane,
      suggestionRuntime: stateAssemblyRuntime.stateFoundationLane.rootSuggestionRuntime,
      dataPlaneRuntime: stateAssemblyRuntime.stateFoundationLane.rootDataPlaneRuntime,
      isSuggestionPanelActive:
        stateAssemblyRuntime.stateFoundationLane.rootPrimitivesRuntime.searchState
          .isSuggestionPanelActive,
      shouldDisableSearchShortcuts:
        stateAssemblyRuntime.stateFoundationLane.rootPrimitivesRuntime.searchState
          .shouldDisableSearchShortcutsRef.current,
      appRouteSceneChromeMotionRuntime,
    });
  const foregroundVisualPresentationSourceRuntime =
    useSearchRootOverlayForegroundVisualPresentationSourceRuntime({
      resultsPresentationStateControlLane:
        resultsControlRuntime.resultsPresentationStateControlLane,
      resultsPresentationOwner:
        controlAuthorityRuntime.presentationAuthorityRuntime.resultsPresentationControlLane
          .resultsPresentationOwner,
    });
  useSearchChromeScalarSurfacePrimitiveSourceWriterRuntime({
    primitiveSourceRuntime: searchChromeScalarSurfaceRuntime.primitiveSourceRuntime,
    routeOverlayIdentityAuthority:
      overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime.routeSceneRuntime
        .routeOverlayIdentityAuthority,
  });
  const foregroundVisualRuntime = useSearchForegroundVisualRuntime({
    ...foregroundVisualSessionSourceRuntime,
    ...foregroundVisualPresentationSourceRuntime,
  });
  const visualAssemblyRuntime = useSearchRootRuntimeVisualAssemblyRuntime({
    foregroundVisualRuntime,
    appRouteSceneChromeMotionRuntime,
    surfaceBundleVisualRuntime,
  });

  useSearchRootOverlayShortcutSubmissionRuntime({
    instrumentationRuntime:
      overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime.rootInstrumentationRuntime,
    viewportShortcutControlLane,
    searchState: {
      setQuery: stateAssemblyRuntime.stateFoundationLane.rootPrimitivesRuntime.searchState.setQuery,
    },
  });
  useSearchRootOverlayChromePresentationDiagnosticRuntime({
    searchRuntimeBus,
    resultsPresentationAuthority,
    shouldRenderResultsSheet:
      overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime.appRouteResultsSheetRuntimeOwner
        .shouldRenderResultsSheet,
  });

  return {
    visualAssemblyRuntime,
  };
};
