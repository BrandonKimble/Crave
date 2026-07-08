import React from 'react';
import { unstable_batchedUpdates } from 'react-native';

import { useAppRouteSceneRuntime } from '../../../../navigation/runtime/AppRouteSceneRuntimeProvider';
import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import type {
  ResultsSurfaceExitTransactionExecutor,
  UseResultsSurfaceExitTransactionExecutionRuntimeArgs,
} from './search-surface-results-transaction-execution-runtime-contract';
import { requestSearchBottomNavMotionTarget } from './search-bottom-nav-motion-runtime';

export const useResultsSurfaceExitTransactionExecutionRuntime = ({
  getCurrentSheetSnap,
  beginCloseTransition,
  resultsRuntimeOwner,
}: UseResultsSurfaceExitTransactionExecutionRuntimeArgs): ResultsSurfaceExitTransactionExecutor => {
  const routeSceneRuntime = useAppRouteSceneRuntime();

  return React.useCallback(
    (snapshot) => {
      const currentSheetSnap = getCurrentSheetSnap?.();
      const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
      if (isPerfScenarioAttributionActive(scenarioConfig)) {
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'results_dismiss_press_up_contract',
          currentSheetSnap: currentSheetSnap ?? null,
          pinsLabelsDotsFadeOutRequested: true,
          pinsLabelsFadeOutRequested: true,
          pollsSwitchImmediate: currentSheetSnap === 'collapsed' || currentSheetSnap === 'hidden',
          outgoingResultCardsHeldForDismissTransition: true,
          queryClearedToPlaceholder: true,
          queryHeldForDismissTransition: false,
          resultSheetBeginsSlidingDown:
            currentSheetSnap !== 'collapsed' && currentSheetSnap !== 'hidden',
          shortcutsFadeInRequested: true,
          transactionId: snapshot.transactionId,
        });
      }
      requestSearchBottomNavMotionTarget('show');
      unstable_batchedUpdates(() => {
        resultsRuntimeOwner.commitSearchSurfaceResultsExitTransaction(snapshot);
        beginCloseTransition(snapshot.transactionId, {
          terminalDismissSource: snapshot.terminalDismissSource,
          outgoingSheetSceneKey: snapshot.outgoingSheetSceneKey,
        });
      });
      routeSceneRuntime.routeSearchCommandActions.dismissAppSearchRouteResultsToPolls({
        sourceSceneKey: snapshot.outgoingSheetSceneKey ?? undefined,
      });
      if (isPerfScenarioAttributionActive(scenarioConfig)) {
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'search_header_visual_contract',
          backdropTarget: 'default',
          bottomBandOwner: 'results_header',
          canAdmitResultsBody: true,
          canExposePersistentPolls: false,
          canReleasePersistentPolls: false,
          chromeMode: 'default',
          displayQuery: '',
          isCloseTransitionActive: true,
          searchSheetContentLaneKind: 'results_closing',
          searchSurfacePhase: 'results_dismissing',
          shouldHoldResultsHeader: true,
          shouldHoldSearchDisplayForPollRestore: false,
          resultPageBundleFrozenUntilBoundary: true,
          sheetClipMode: 'animatedSearchTransition',
          shortcutsInteractive: false,
          shortcutsVisibleTarget: true,
          transactionId: snapshot.transactionId,
        });
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'search_shortcuts_visibility_contract',
          backdropTarget: 'none',
          headerShortcutsInteractive: false,
          headerShortcutsVisibleTarget: true,
          isSearchOverlay: true,
          isSuggestionOverlayVisible: false,
          isSuggestionPanelActive: false,
          shouldEnableSearchShortcutsInteraction: false,
          shouldKeepMountedForResultsExit: false,
          shouldMountSearchShortcuts: true,
          shouldRenderSearchOverlay: true,
          shouldShowSearchShortcutsTarget: true,
          shortcutBackgroundOpacityTarget: 1,
          shortcutChipContainerOpacityTarget: 1,
          shortcutContentOpacityTarget: 1,
          shortcutOpacityTargetsShareTransition: true,
          shortcutOpacityTransitionDurationMs: 180,
          transactionId: snapshot.transactionId,
        });
        // S4e: the synthetic native_marker_exit_started pre-announce is deleted — the real
        // event logs once from the native presentation_exit_started emit in the render owner
        // (the double publish made every dismiss read as two exits in the attribution trace).
      }
      return snapshot.transactionId;
    },
    [
      beginCloseTransition,
      getCurrentSheetSnap,
      resultsRuntimeOwner,
      routeSceneRuntime.routeSearchCommandActions,
    ]
  );
};
