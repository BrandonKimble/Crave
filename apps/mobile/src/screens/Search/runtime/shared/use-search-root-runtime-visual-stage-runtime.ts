import React from 'react';

import { useAppRouteSceneChromeMotionRuntimeOwner } from '../../../../navigation/runtime/AppRouteSceneChromeMotionRuntimeProvider';
import { useSearchForegroundVisualRuntime } from './use-search-foreground-visual-runtime';
import { useSearchRootOverlayCloseHandoffRuntime } from './use-search-root-overlay-close-handoff-runtime';
import { useSearchRootOverlayChromeDiagnosticRuntime } from './use-search-root-overlay-chrome-diagnostic-runtime';
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
import type { SearchRootViewportShortcutControlLane } from './use-search-root-control-plane-runtime-contract';
import type { useSearchRootRuntimeFoundationStageRuntime } from './use-search-root-runtime-foundation-stage-runtime';
import type { useSearchRootRuntimeOverlayFoundationAssemblyRuntime } from './use-search-root-runtime-overlay-foundation-assembly-runtime';

export const useSearchRootRuntimeVisualStageRuntime = ({
  appEntryPlaneRuntime,
  searchRuntimeBus,
  stateAssemblyRuntime,
  overlayFoundationAssemblyRuntime,
  controlAuthorityRuntime,
  resultsControlRuntime,
  viewportShortcutControlLane,
  searchChromeScalarSurfaceRuntime,
}: {
  appEntryPlaneRuntime: ReturnType<typeof useSearchScreenAppEntryPlaneRuntime>;
  searchRuntimeBus: SearchRuntimeBus;
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
  const resultsPresentationOwner =
    controlAuthorityRuntime.presentationAuthorityRuntime.resultsPresentationControlLane
      .resultsPresentationOwner;
  const appRouteResultsSheetRuntimeOwner =
    overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime.appRouteResultsSheetRuntimeOwner;
  const { closeVisualHandoffProgress } = useSearchRootOverlayCloseHandoffRuntime({
    isCloseTransitionActive: resultsPresentationOwner.shellModel.isCloseTransitionActive,
    sheetTranslateY: appRouteResultsSheetRuntimeOwner.sheetTranslateY,
    collapsedSnap: appRouteResultsSheetRuntimeOwner.snapPoints.collapsed,
    notifyCloseCollapsedBoundaryReached: () => {
      resultsControlRuntime.resultsTransitionControlLane.closeTransitionActions.markSearchSheetCloseCollapsedReached(
        'collapsed'
      );
    },
  });
  const closeHandoffVisualRuntime = React.useMemo(
    () => ({
      closeVisualHandoffProgress,
    }),
    [closeVisualHandoffProgress]
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
    closeHandoffVisualRuntime,
  });

  useSearchRootOverlayShortcutSubmissionRuntime({
    instrumentationRuntime:
      overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime.rootInstrumentationRuntime,
    viewportShortcutControlLane,
    searchState: {
      setQuery: stateAssemblyRuntime.stateFoundationLane.rootPrimitivesRuntime.searchState.setQuery,
    },
  });
  const resultsSheetDiagRuntimeState = useSearchRootOverlayChromeDiagnosticRuntime({
    searchRuntimeBus,
  });
  useSearchRootOverlayChromePresentationDiagnosticRuntime({
    shouldRenderResultsSheet:
      overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime.appRouteResultsSheetRuntimeOwner
        .shouldRenderResultsSheet,
    runOneHandoffPhase: resultsSheetDiagRuntimeState.runOneHandoffPhase,
    resultsPresentation: resultsSheetDiagRuntimeState.resultsPresentation,
  });

  return {
    visualAssemblyRuntime,
  };
};
