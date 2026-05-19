import React from 'react';

import {
  getActivePerfScenarioSearchThisAreaSubmitId,
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import { resolveSearchSurfaceResultsSheetTargetSnap } from './results-presentation-shell-transaction-intent';
import { requestSearchBottomNavMotionTarget } from './search-bottom-nav-motion-runtime';
import { getSearchSurfaceRuntime } from '../surface/search-surface-runtime';
import { resolveSearchSubmitEntryMotion } from './search-submit-entry-surface-contract';
import type {
  ResultsSurfaceEnterTransactionExecutor,
  UseResultsSurfaceEnterTransactionExecutionRuntimeArgs,
} from './search-surface-results-transaction-execution-runtime-contract';
import { useAppRouteSceneRuntime } from '../../../../navigation/runtime/AppRouteSceneRuntimeProvider';

export const useResultsSurfaceEnterTransactionExecutionRuntime = ({
  resultsRuntimeOwner,
  prepareShortcutSheetTransition,
  setDisplayQueryOverride,
}: UseResultsSurfaceEnterTransactionExecutionRuntimeArgs): ResultsSurfaceEnterTransactionExecutor => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  return React.useCallback(
    ({
      snapshot,
      displayQueryOverride,
      preserveSheetState = false,
      shouldPrepareShortcutSheetTransition = false,
      entrySurface,
    }) => {
      const targetSnap = resolveSearchSurfaceResultsSheetTargetSnap(
        snapshot.kind,
        preserveSheetState
      );
      const entryMotion = resolveSearchSubmitEntryMotion({ entrySurface, preserveSheetState });
      setDisplayQueryOverride(displayQueryOverride ?? '');
      const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
      if (
        snapshot.mutationKind === 'shortcut_rerun' &&
        isPerfScenarioAttributionActive(scenarioConfig)
      ) {
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'shortcut_submit_press_up_contract',
          coverState: snapshot.coverState,
          loadingStateVisible: true,
          queryPopulated: (displayQueryOverride ?? '').trim().length > 0,
          resultSheetBeginsSlidingUp: targetSnap != null,
          searchBarText: displayQueryOverride ?? '',
          shortcutButtonsFadeOutRequested: shouldPrepareShortcutSheetTransition,
          targetSnap,
          transactionId: snapshot.transactionId,
        });
      }
      if (
        snapshot.mutationKind === 'search_this_area' &&
        isPerfScenarioAttributionActive(scenarioConfig)
      ) {
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'search_this_area_presentation_intent_contract',
          transactionId: snapshot.transactionId,
          coverState: snapshot.coverState,
          preserveSheetState,
          targetSnap,
          resultSheetBeginsSlidingUp: false,
          loadingStateVisible: true,
          queryPopulated: (displayQueryOverride ?? '').trim().length > 0,
          mutationKind: snapshot.mutationKind,
          searchThisAreaSubmitId: getActivePerfScenarioSearchThisAreaSubmitId(),
        });
      }
      if (targetSnap != null) {
        requestSearchBottomNavMotionTarget('hide');
        prepareShortcutSheetTransition?.();
      }
      resultsRuntimeOwner.cancelPresentationIntent();
      if (targetSnap != null) {
        routeSceneRuntime.routeSceneSwitchRuntime.requestOverlaySwitch({
          targetSceneKey: 'search',
          sheetTransitionKind: 'topLevelSwitch',
          sheetOpenerSource: 'routeCommand',
          sheetMotion: {
            kind: 'snapTo',
            snap: targetSnap,
            mode: entryMotion === 'instant_behind_search_mode' ? 'instant' : undefined,
          },
          snapPersistence: 'sharedOnly',
        });
      }
      resultsRuntimeOwner.stageSearchSurfaceResultsTransaction(snapshot);
      if (targetSnap == null) {
        getSearchSurfaceRuntime().markRedrawSheetReady(snapshot.transactionId);
      }
      return snapshot.transactionId;
    },
    [
      prepareShortcutSheetTransition,
      resultsRuntimeOwner,
      routeSceneRuntime.routeSceneSwitchRuntime,
      setDisplayQueryOverride,
    ]
  );
};
