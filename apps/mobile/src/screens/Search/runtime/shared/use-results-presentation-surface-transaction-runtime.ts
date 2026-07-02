import React from 'react';

import {
  getActivePerfScenarioSearchThisAreaSubmitId,
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import {
  areSearchSurfaceResultsRowsReadyForPresentation,
  createSearchSurfaceResultsEnterTransaction,
  createSearchSurfaceResultsTransactionCoordinator,
  type SearchSurfaceResultsEnterTransaction,
  type SearchSurfaceResultsTransactionGateInputs,
  type SearchSurfaceResultsTransactionCoordinator,
} from './search-surface-results-transaction';
import type { SearchRuntimeBus } from './search-runtime-bus';
import {
  type ResultsPresentationAuthority,
  useResultsPresentationAuthoritySelector,
} from './results-presentation-authority';
import type { ResultsPresentationTransportState } from './results-presentation-runtime-contract';
import {
  deriveCommittedSearchSurfaceResultsTransactionKeyFromSurface,
  type ResultsPresentationSurfaceAuthority,
} from './results-presentation-surface-authority';
import {
  commitSearchMountedResultsSearchSurfaceResultsTransactionKey,
  getSearchMountedResultsBodyRuntimeSnapshot,
  getSearchMountedResultsDataSnapshot,
} from './search-mounted-results-data-store';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';
import type { ResultsPresentationRuntimeMachine } from './results-presentation-runtime-machine';
import type { SearchMapSourceFramePort } from '../map/search-map-source-frame-port';
import { getSearchSurfaceRuntime } from '../surface/search-surface-runtime';

type UseResultsPresentationSurfaceTransactionRuntimeArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  searchMapSourceFramePort: SearchMapSourceFramePort;
  runtimeMachineRef: React.MutableRefObject<ResultsPresentationRuntimeMachine | null>;
  handleRuntimePresentationIntentAbort: () => void;
};

const schedulePostFrame = (callback: () => void): (() => void) => {
  if (
    typeof globalThis.requestAnimationFrame === 'function' &&
    typeof globalThis.cancelAnimationFrame === 'function'
  ) {
    const frameId = globalThis.requestAnimationFrame(() => {
      callback();
    });
    return () => {
      globalThis.cancelAnimationFrame(frameId);
    };
  }
  const timeoutId = globalThis.setTimeout(callback, 16);
  return () => {
    globalThis.clearTimeout(timeoutId);
  };
};

const RESULTS_REVEAL_WATCHDOG_INITIAL_DELAY_MS = 1200;
const RESULTS_REVEAL_WATCHDOG_REPEAT_DELAY_MS = 1800;
const COMMITTED_COVER_WATCHDOG_INITIAL_DELAY_MS = 1600;
const COMMITTED_COVER_WATCHDOG_REPEAT_DELAY_MS = 2000;

type SearchSurfaceResultsTransactionCommitSource =
  | 'stage'
  | 'page_one_results_committed'
  | 'runtime_store_notify'
  | 'prepared_source_frame_ready'
  | 'surface_runtime_notify'
  | 'staged_transaction_version';

type PendingPageOneResultsCommit = {
  transactionId: string;
  expectedResultsDataKey: string | null;
  dataReadyFrom?: Exclude<SearchSurfaceResultsEnterTransaction['dataReadyFrom'], 'pending'>;
  searchInputKey: string | null;
};

const resolveResultsRevealBlockedReasons = ({
  inputs,
  stagedTransaction,
}: {
  inputs: SearchSurfaceResultsTransactionGateInputs;
  stagedTransaction: ReturnType<SearchSurfaceResultsTransactionCoordinator['getStagedTransaction']>;
}): string[] => {
  const reasons: string[] = [];
  const expectedTransactionId = stagedTransaction?.snapshot.transactionId ?? null;
  const expectedResultsDataKey = stagedTransaction?.snapshot.expectedResultsDataKey ?? null;
  if (stagedTransaction == null) {
    reasons.push('no_staged_transaction');
    return reasons;
  }
  if (!stagedTransaction.dataReady) {
    reasons.push('data_not_ready');
  }
  const rowsReadyForPresentation = areSearchSurfaceResultsRowsReadyForPresentation(
    inputs,
    expectedResultsDataKey
  );
  if (inputs.resultsSnapshotKey == null) {
    reasons.push('missing_results_snapshot_key');
  }
  if (expectedResultsDataKey != null && inputs.resultsSnapshotKey !== expectedResultsDataKey) {
    reasons.push('results_snapshot_key_mismatch');
  }
  if (!rowsReadyForPresentation) {
    if (!inputs.listPreparedRowsReady && !inputs.hasNoRenderableResults) {
      reasons.push('list_prepared_rows_not_ready');
    }
    if (inputs.mountedPreparedRowsActiveCount <= 0 && !inputs.hasNoRenderableResults) {
      reasons.push('prepared_rows_empty');
    }
    if (
      inputs.resultsSnapshotKey != null &&
      !inputs.hasNoRenderableResults &&
      inputs.mountedPreparedRowsReadyKey !== inputs.resultsSnapshotKey
    ) {
      reasons.push('prepared_rows_key_mismatch');
    }
  }
  if (inputs.shouldHydrateResultsForRender) {
    reasons.push('render_hydration_pending');
  }
  if (!inputs.isResultsHydrationSettled) {
    reasons.push('hydration_unsettled');
  }
  if (!inputs.mapSearchSurfaceResultsSourcesReady) {
    reasons.push('map_sources_not_ready');
  }
  if (
    expectedTransactionId != null &&
    inputs.mapSearchSurfaceResultsSourcesReadyKey !== expectedTransactionId
  ) {
    reasons.push('map_sources_key_mismatch');
  }
  if (inputs.isShortcutCoverageLoading) {
    reasons.push('shortcut_coverage_loading');
  }
  if (inputs.visualRevealTransactionId === expectedTransactionId) {
    if (!inputs.visualRevealCardsReady) {
      reasons.push('visual_cards_not_ready');
    }
    if (!inputs.visualRevealNativeMarkerFrameReady) {
      reasons.push('native_marker_frame_not_ready');
    }
    if (!inputs.visualRevealSheetReady) {
      reasons.push('visual_sheet_not_ready');
    }
  } else if (expectedTransactionId != null) {
    reasons.push('surface_redraw_transaction_mismatch');
  }
  return Array.from(new Set(reasons));
};

const isCommittedEnterCoverPending = (transport: ResultsPresentationTransportState): boolean =>
  transport.snapshotKind === 'results_enter' &&
  transport.transactionId != null &&
  transport.coverState !== 'hidden' &&
  transport.executionStage !== 'idle' &&
  transport.executionStage !== 'settled';

export const useResultsPresentationSurfaceTransactionRuntime = ({
  searchRuntimeBus,
  resultsPresentationAuthority,
  resultsPresentationSurfaceAuthority,
  searchMapSourceFramePort,
  runtimeMachineRef,
  handleRuntimePresentationIntentAbort,
}: UseResultsPresentationSurfaceTransactionRuntimeArgs) => {
  const activeScenarioConfig = usePerfScenarioRuntimeStore((state) => state.activeConfig);
  const [
    stagedSearchSurfaceResultsTransactionVersion,
    bumpStagedSearchSurfaceResultsTransactionVersion,
  ] = React.useReducer((value: number) => value + 1, 0);
  const stagingCoordinatorRef = React.useRef<SearchSurfaceResultsTransactionCoordinator | null>(
    null
  );

  const searchSurfaceResultsPresentationTransactionInput = useResultsPresentationAuthoritySelector(
    resultsPresentationAuthority,
    (snapshot) => ({
      resultsPresentationTransport: snapshot.resultsPresentationTransport,
    }),
    (left, right) => left.resultsPresentationTransport === right.resultsPresentationTransport,
    ['resultsPresentationTransport'] as const,
    'search_surface_results_transaction_presentation_transaction_input'
  );
  const searchSurfaceResultsTransactionKeyInput = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      activeOperationId: state.activeOperationId,
    }),
    (left, right) => left.activeOperationId === right.activeOperationId,
    ['activeOperationId'] as const,
    'search_surface_results_transaction_active_operation_input'
  );
  const searchSurfaceResultsTransactionInputs = React.useMemo(
    () => ({
      committedSearchSurfaceResultsTransactionKey:
        deriveCommittedSearchSurfaceResultsTransactionKeyFromSurface({
          surfaceSnapshot: resultsPresentationSurfaceAuthority.getSnapshot(),
          resultsPresentationTransport:
            searchSurfaceResultsPresentationTransactionInput.resultsPresentationTransport,
        }),
      resultsSnapshotKey:
        resultsPresentationSurfaceAuthority.getSnapshot().resultsHydrationKey ??
        resultsPresentationSurfaceAuthority.getSnapshot().resultsRequestKey,
    }),
    [
      searchSurfaceResultsPresentationTransactionInput.resultsPresentationTransport,
      searchSurfaceResultsTransactionKeyInput.activeOperationId,
      resultsPresentationSurfaceAuthority,
    ]
  );
  const activeScenarioConfigRef = React.useRef(activeScenarioConfig);
  activeScenarioConfigRef.current = activeScenarioConfig;
  const cancelDeferredStageRef = React.useRef<(() => void) | null>(null);
  const cancelDeferredSourceReadyCommitRef = React.useRef<(() => void) | null>(null);
  const pendingPageOneResultsCommitRef = React.useRef<PendingPageOneResultsCommit | null>(null);
  const pendingStageTransactionRef = React.useRef<SearchSurfaceResultsEnterTransaction | null>(
    null
  );
  const resultsRevealWatchdogRef = React.useRef<{
    transactionId: string;
    timeoutId: ReturnType<typeof setTimeout>;
    startedAtMs: number;
    attempt: number;
  } | null>(null);
  const committedCoverWatchdogRef = React.useRef<{
    transactionId: string;
    timeoutId: ReturnType<typeof setTimeout>;
    startedAtMs: number;
    attempt: number;
  } | null>(null);

  const cancelResultsRevealWatchdog = React.useCallback((transactionId?: string | null) => {
    const watchdog = resultsRevealWatchdogRef.current;
    if (watchdog == null) {
      return;
    }
    if (transactionId != null && watchdog.transactionId !== transactionId) {
      return;
    }
    clearTimeout(watchdog.timeoutId);
    resultsRevealWatchdogRef.current = null;
  }, []);

  const cancelCommittedCoverWatchdog = React.useCallback((transactionId?: string | null) => {
    const watchdog = committedCoverWatchdogRef.current;
    if (watchdog == null) {
      return;
    }
    if (transactionId != null && watchdog.transactionId !== transactionId) {
      return;
    }
    clearTimeout(watchdog.timeoutId);
    committedCoverWatchdogRef.current = null;
  }, []);

  if (!stagingCoordinatorRef.current) {
    stagingCoordinatorRef.current = createSearchSurfaceResultsTransactionCoordinator({
      applyStagingCoverState: (coverState) => {
        runtimeMachineRef.current!.applyStagingCoverState(coverState);
      },
      publishSearchSurfaceResultsTransactionKey: (key) => {
        resultsPresentationSurfaceAuthority.publish(
          {
            searchSurfaceResultsTransactionKey: key,
          },
          'search_surface_results_transaction_snapshot_key'
        );
        commitSearchMountedResultsSearchSurfaceResultsTransactionKey(key);
      },
      publishMapSearchSurfaceResultsSourcesReady: (value, key) => {
        searchMapSourceFramePort.publishVisualState({
          mapSearchSurfaceResultsSourcesReady: value,
          mapSearchSurfaceResultsSourcesReadyKey: key,
        });
      },
      onRowsReadyForPresentation: (snapshot) => {
        getSearchSurfaceRuntime().markRedrawCardsReady(snapshot.transactionId);
      },
      commitSearchSurfaceResultsEnterPresentation: (snapshot) => {
        runtimeMachineRef.current!.commitSearchSurfaceResultsEnterPresentation(snapshot);
      },
      clearCommittedSearchSurfaceResultsTransactionKey: () => {
        resultsPresentationSurfaceAuthority.publish(
          {
            searchSurfaceResultsTransactionKey: null,
          },
          'search_surface_results_transaction_commit_clear'
        );
        commitSearchMountedResultsSearchSurfaceResultsTransactionKey(null);
      },
      onStagedTransactionChanged: () => {
        bumpStagedSearchSurfaceResultsTransactionVersion();
      },
    });
  }

  const clearStagedSearchSurfaceResultsTransaction = React.useCallback(
    (transactionId?: string) => {
      cancelDeferredStageRef.current?.();
      cancelDeferredSourceReadyCommitRef.current?.();
      cancelResultsRevealWatchdog(transactionId);
      const pendingStageTransaction = pendingStageTransactionRef.current;
      if (
        pendingStageTransaction != null &&
        (transactionId == null || pendingStageTransaction.transactionId === transactionId)
      ) {
        pendingStageTransactionRef.current = null;
      }
      const pendingPageOneCommit = pendingPageOneResultsCommitRef.current;
      if (
        pendingPageOneCommit != null &&
        (transactionId == null || pendingPageOneCommit.transactionId === transactionId)
      ) {
        pendingPageOneResultsCommitRef.current = null;
      }
      stagingCoordinatorRef.current!.clear(transactionId);

      const publishedTransactionKey =
        resultsPresentationSurfaceAuthority.getSnapshot().searchSurfaceResultsTransactionKey;
      if (publishedTransactionKey == null) {
        return;
      }
      if (transactionId != null && publishedTransactionKey !== transactionId) {
        return;
      }
      resultsPresentationSurfaceAuthority.publish(
        {
          searchSurfaceResultsTransactionKey: null,
        },
        'search_surface_results_transaction_clear'
      );
      commitSearchMountedResultsSearchSurfaceResultsTransactionKey(null);
      searchMapSourceFramePort.publishVisualState({
        mapSearchSurfaceResultsSourcesReady: false,
        mapSearchSurfaceResultsSourcesReadyKey: null,
      });
    },
    [cancelResultsRevealWatchdog, resultsPresentationSurfaceAuthority, searchMapSourceFramePort]
  );

  const armSearchSurfaceResultsPending = React.useCallback(
    (
      snapshot: SearchSurfaceResultsEnterTransaction,
      stagingInputs: SearchSurfaceResultsTransactionGateInputs
    ) => {
      getSearchSurfaceRuntime().beginRedrawTransaction({
        reason:
          snapshot.mutationKind === 'search_this_area'
            ? 'search_this_area'
            : snapshot.mutationKind === 'shortcut_rerun'
              ? 'shortcut'
              : 'submit',
        transactionId: snapshot.transactionId,
        coverState: snapshot.coverState,
      });
      runtimeMachineRef.current!.applyStagingCoverState(snapshot.coverState);
      // "SECOND SETTLE HANGS" FIX (map-LOD-v6): reset the source-ready flag to pending BEFORE
      // re-keying the transaction below. The transaction-key publish synchronously re-triggers the
      // map source projection (source controller subscribes to searchSurfaceResultsTransactionKey),
      // which for a RESIDENT/cache-replay reveal — a re-toggle onto already-projected data — nested-
      // synchronously republishes ready:true for this key. In the old order the ready:false reset ran
      // AFTER that nested republish and clobbered it, so the reveal hung forever on
      // map_sources_not_ready (reproduced: toggle-intent:10 stuck 25s+ across every steady-state
      // rapid toggle). Ordering the reset FIRST makes the source's ready:true the final word; a
      // genuine tab SWITCH still re-projects and (re)sets false-until-frame-ready exactly as before.
      searchMapSourceFramePort.publishVisualState({
        mapSearchSurfaceResultsSourcesReady: false,
        mapSearchSurfaceResultsSourcesReadyKey: snapshot.transactionId,
      });
      resultsPresentationSurfaceAuthority.publish(
        {
          searchSurfaceResultsTransactionKey: snapshot.transactionId,
        },
        'search_surface_results_transaction_press_up_pending'
      );
      commitSearchMountedResultsSearchSurfaceResultsTransactionKey(snapshot.transactionId);
    },
    [resultsPresentationSurfaceAuthority, runtimeMachineRef, searchMapSourceFramePort]
  );

  const beginSearchThisAreaPresentationPending = React.useCallback(() => {
    clearStagedSearchSurfaceResultsTransaction();
    const transactionId = searchSurfaceResultsTransactionKeyInput.activeOperationId;
    if (transactionId != null) {
      getSearchSurfaceRuntime().beginRedrawTransaction({
        reason: 'search_this_area',
        transactionId,
        coverState: 'interaction_loading',
      });
    }
    runtimeMachineRef.current!.applyStagingCoverState('interaction_loading');
    resultsPresentationSurfaceAuthority.publish(
      {
        searchSurfaceResultsTransactionKey: transactionId,
      },
      'search_this_area_pending_cover'
    );
    commitSearchMountedResultsSearchSurfaceResultsTransactionKey(transactionId);
    searchMapSourceFramePort.publishVisualState({
      mapSearchSurfaceResultsSourcesReady: false,
      mapSearchSurfaceResultsSourcesReadyKey: transactionId,
    });
    const scenarioConfig = activeScenarioConfigRef.current;
    if (isPerfScenarioAttributionActive(scenarioConfig)) {
      logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
        event: 'search_this_area_pending_cover_contract',
        searchThisAreaSubmitId: getActivePerfScenarioSearchThisAreaSubmitId(),
        coverState: 'interaction_loading',
        preserveSheetState: true,
        loadingStateVisible: true,
        searchSurfaceResultsTransactionKey: transactionId,
        mapSearchSurfaceResultsSourcesReady: false,
        mapSearchSurfaceResultsSourcesReadyKey: transactionId,
      });
    }
  }, [
    clearStagedSearchSurfaceResultsTransaction,
    resultsPresentationSurfaceAuthority,
    runtimeMachineRef,
    searchMapSourceFramePort,
    searchSurfaceResultsTransactionKeyInput.activeOperationId,
  ]);

  const readSearchSurfaceResultsTransactionGateInputs = React.useCallback(() => {
    const surfaceSnapshot = resultsPresentationSurfaceAuthority.getSnapshot();
    const sourceFrameSnapshot = searchMapSourceFramePort.getSnapshot();
    const mountedBodyRuntimeSnapshot = getSearchMountedResultsBodyRuntimeSnapshot();
    const mountedResultsSnapshot = getSearchMountedResultsDataSnapshot();
    const mountedResultsKey =
      mountedResultsSnapshot.resultsHydrationKey ?? mountedResultsSnapshot.resultsRequestKey;
    const preparedRowsSnapshot = surfaceSnapshot.preparedRows;
    const mountedPreparedRowsReadyKey = preparedRowsSnapshot.readyReadinessKey;
    const mountedPreparedRowsTargetKey = preparedRowsSnapshot.targetReadinessKey;
    const mountedPreparedRowsActiveCount = preparedRowsSnapshot.activeRowCount;
    const currentResultsSnapshotKey =
      surfaceSnapshot.resultsHydrationKey ?? surfaceSnapshot.resultsRequestKey;
    const hasNoRenderableResults =
      mountedResultsSnapshot.results != null &&
      mountedResultsSnapshot.results.dishes.length === 0 &&
      mountedResultsSnapshot.results.restaurants.length === 0 &&
      mountedResultsKey != null &&
      currentResultsSnapshotKey === mountedResultsKey;
    const searchSurfaceRuntimeSnapshot = getSearchSurfaceRuntime().getSnapshot();
    const activeRedrawTransaction = searchSurfaceRuntimeSnapshot.redrawTransaction;
    const completedRedrawTransaction = searchSurfaceRuntimeSnapshot.completedRedrawTransaction;
    const visualRevealTransaction = activeRedrawTransaction ?? completedRedrawTransaction;
    const visualRevealSource =
      activeRedrawTransaction != null
        ? ('active' as const)
        : completedRedrawTransaction != null
          ? ('completed' as const)
          : null;
    return {
      hydratedResultsKey: surfaceSnapshot.hydratedResultsKey,
      isResultsHydrationSettled: surfaceSnapshot.isResultsHydrationSettled,
      listPreparedRowsReady: surfaceSnapshot.listPreparedRowsReady,
      mountedPreparedRowsActiveCount,
      mountedPreparedRowsReadyKey,
      mountedPreparedRowsTargetKey,
      hasNoRenderableResults,
      shouldHydrateResultsForRender: mountedBodyRuntimeSnapshot.shouldHydrateResultsForRender,
      isShortcutCoverageLoading: sourceFrameSnapshot.isShortcutCoverageLoading,
      mapSearchSurfaceResultsSourcesReady: sourceFrameSnapshot.mapSearchSurfaceResultsSourcesReady,
      mapSearchSurfaceResultsSourcesReadyKey:
        sourceFrameSnapshot.mapSearchSurfaceResultsSourcesReadyKey,
      resultsSnapshotKey: currentResultsSnapshotKey,
      visualRevealTransactionId: visualRevealTransaction?.id ?? null,
      visualRevealCardsReady: visualRevealTransaction?.readiness.cardsReady ?? false,
      visualRevealSheetReady: visualRevealTransaction?.readiness.sheetReady ?? false,
      visualRevealNativeMarkerFrameReady:
        visualRevealTransaction?.readiness.nativeMarkerFrameReady ?? false,
      visualRevealSource,
    };
  }, [resultsPresentationSurfaceAuthority, searchMapSourceFramePort]);

  const armResultsRevealWatchdog = React.useCallback(
    (transactionId: string) => {
      cancelResultsRevealWatchdog();
      const startedAtMs = globalThis.performance?.now?.() ?? Date.now();
      const schedule = (attempt: number, delayMs: number) => {
        const timeoutId = setTimeout(() => {
          const watchdog = resultsRevealWatchdogRef.current;
          if (watchdog == null || watchdog.transactionId !== transactionId) {
            return;
          }
          const stagedTransaction = stagingCoordinatorRef.current!.getStagedTransaction();
          if (stagedTransaction?.snapshot.transactionId !== transactionId) {
            cancelResultsRevealWatchdog(transactionId);
            return;
          }
          const inputs = readSearchSurfaceResultsTransactionGateInputs();
          const surfaceSnapshot = getSearchSurfaceRuntime().getSnapshot();
          const activeRedrawTransaction = surfaceSnapshot.redrawTransaction;
          const currentTransport =
            resultsPresentationAuthority.getSnapshot().resultsPresentationTransport;
          const activeResultsTransactionId =
            surfaceSnapshot.activeBundle.kind === 'results'
              ? surfaceSnapshot.activeBundle.transactionId
              : null;
          const activeResultsCoverState =
            surfaceSnapshot.activeBundle.kind === 'results'
              ? surfaceSnapshot.activeBundle.coverState
              : null;
          const isStagedTransactionStillActive =
            activeRedrawTransaction?.id === transactionId ||
            (activeResultsTransactionId === transactionId &&
              activeResultsCoverState !== 'hidden') ||
            (currentTransport.transactionId === transactionId &&
              currentTransport.snapshotKind === 'results_enter' &&
              currentTransport.coverState !== 'hidden');
          if (!isStagedTransactionStillActive) {
            cancelResultsRevealWatchdog(transactionId);
            return;
          }
          const blockedReasons = resolveResultsRevealBlockedReasons({
            inputs,
            stagedTransaction,
          });
          const elapsedMs = Number(
            ((globalThis.performance?.now?.() ?? Date.now()) - startedAtMs).toFixed(1)
          );
          const scenarioConfig = activeScenarioConfigRef.current;
          if (isPerfScenarioAttributionActive(scenarioConfig)) {
            logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
              event: 'results_reveal_watchdog_pending',
              attempt,
              elapsedMs,
              transactionId,
              blockedReasons,
              mutationKind: stagedTransaction.snapshot.mutationKind,
              coverState: stagedTransaction.snapshot.coverState,
              stagedDataReady: stagedTransaction.dataReady,
              resultsSnapshotKey: inputs.resultsSnapshotKey,
              hydratedResultsKey: inputs.hydratedResultsKey,
              isResultsHydrationSettled: inputs.isResultsHydrationSettled,
              shouldHydrateResultsForRender: inputs.shouldHydrateResultsForRender,
              listPreparedRowsReady: inputs.listPreparedRowsReady,
              mountedPreparedRowsActiveCount: inputs.mountedPreparedRowsActiveCount,
              mountedPreparedRowsReadyKey: inputs.mountedPreparedRowsReadyKey,
              mountedPreparedRowsTargetKey: inputs.mountedPreparedRowsTargetKey,
              hasNoRenderableResults: inputs.hasNoRenderableResults,
              mapSearchSurfaceResultsSourcesReady: inputs.mapSearchSurfaceResultsSourcesReady,
              mapSearchSurfaceResultsSourcesReadyKey: inputs.mapSearchSurfaceResultsSourcesReadyKey,
              activeRedrawCardsReady: activeRedrawTransaction?.readiness.cardsReady ?? null,
              activeRedrawNativeMarkerFrameReady:
                activeRedrawTransaction?.readiness.nativeMarkerFrameReady ?? null,
              activeRedrawSheetReady: activeRedrawTransaction?.readiness.sheetReady ?? null,
            });
          }
          schedule(attempt + 1, RESULTS_REVEAL_WATCHDOG_REPEAT_DELAY_MS);
        }, delayMs);
        resultsRevealWatchdogRef.current = {
          transactionId,
          timeoutId,
          startedAtMs,
          attempt,
        };
      };
      schedule(1, RESULTS_REVEAL_WATCHDOG_INITIAL_DELAY_MS);
    },
    [
      cancelResultsRevealWatchdog,
      readSearchSurfaceResultsTransactionGateInputs,
      resultsPresentationAuthority,
      searchMapSourceFramePort,
    ]
  );
  const armCommittedCoverWatchdog = React.useCallback(
    (transport: ResultsPresentationTransportState) => {
      if (!isCommittedEnterCoverPending(transport) || transport.transactionId == null) {
        cancelCommittedCoverWatchdog();
        return;
      }
      const transactionId = transport.transactionId;
      cancelCommittedCoverWatchdog();
      const startedAtMs = globalThis.performance?.now?.() ?? Date.now();
      const schedule = (attempt: number, delayMs: number) => {
        const timeoutId = setTimeout(() => {
          const watchdog = committedCoverWatchdogRef.current;
          if (watchdog == null || watchdog.transactionId !== transactionId) {
            return;
          }
          const currentTransport =
            resultsPresentationAuthority.getSnapshot().resultsPresentationTransport;
          if (
            currentTransport.transactionId !== transactionId ||
            !isCommittedEnterCoverPending(currentTransport)
          ) {
            cancelCommittedCoverWatchdog(transactionId);
            return;
          }
          const inputs = readSearchSurfaceResultsTransactionGateInputs();
          const stagedTransaction = stagingCoordinatorRef.current!.getStagedTransaction();
          const surfaceSnapshot = getSearchSurfaceRuntime().getSnapshot();
          const activeRedrawTransaction = surfaceSnapshot.redrawTransaction;
          const blockedReasons = resolveResultsRevealBlockedReasons({
            inputs,
            stagedTransaction,
          });
          const elapsedMs = Number(
            ((globalThis.performance?.now?.() ?? Date.now()) - startedAtMs).toFixed(1)
          );
          const scenarioConfig = activeScenarioConfigRef.current;
          if (isPerfScenarioAttributionActive(scenarioConfig)) {
            logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
              event: 'committed_results_cover_watchdog_pending',
              attempt,
              elapsedMs,
              transactionId,
              blockedReasons,
              transportExecutionStage: currentTransport.executionStage,
              transportCoverState: currentTransport.coverState,
              resultsSnapshotKey: inputs.resultsSnapshotKey,
              hydratedResultsKey: inputs.hydratedResultsKey,
              isResultsHydrationSettled: inputs.isResultsHydrationSettled,
              shouldHydrateResultsForRender: inputs.shouldHydrateResultsForRender,
              mapSearchSurfaceResultsSourcesReady: inputs.mapSearchSurfaceResultsSourcesReady,
              mapSearchSurfaceResultsSourcesReadyKey: inputs.mapSearchSurfaceResultsSourcesReadyKey,
              activeRedrawTransactionId: activeRedrawTransaction?.id ?? null,
              activeRedrawCardsReady: activeRedrawTransaction?.readiness.cardsReady ?? null,
              activeRedrawNativeMarkerFrameReady:
                activeRedrawTransaction?.readiness.nativeMarkerFrameReady ?? null,
              activeRedrawSheetReady: activeRedrawTransaction?.readiness.sheetReady ?? null,
            });
          }
          schedule(attempt + 1, COMMITTED_COVER_WATCHDOG_REPEAT_DELAY_MS);
        }, delayMs);
        committedCoverWatchdogRef.current = {
          transactionId,
          timeoutId,
          startedAtMs,
          attempt,
        };
      };
      schedule(1, COMMITTED_COVER_WATCHDOG_INITIAL_DELAY_MS);
    },
    [
      cancelCommittedCoverWatchdog,
      readSearchSurfaceResultsTransactionGateInputs,
      resultsPresentationAuthority,
      searchMapSourceFramePort,
    ]
  );

  const maybeCommitStagedSearchSurfaceResultsTransaction = React.useCallback(
    (source: SearchSurfaceResultsTransactionCommitSource) => {
      const stagingInputs = readSearchSurfaceResultsTransactionGateInputs();
      const stagedBeforeCommit = stagingCoordinatorRef.current!.getStagedTransaction();
      const didCommit = stagingCoordinatorRef.current!.maybeCommit(stagingInputs);
      if (didCommit) {
        cancelResultsRevealWatchdog(stagedBeforeCommit?.snapshot.transactionId ?? null);
      }
      const scenarioConfig = activeScenarioConfigRef.current;
      if (didCommit && isPerfScenarioAttributionActive(scenarioConfig)) {
        const transactionId = stagedBeforeCommit?.snapshot.transactionId ?? null;
        const searchThisAreaSubmitId =
          stagedBeforeCommit?.snapshot.mutationKind === 'search_this_area'
            ? (stagedBeforeCommit.snapshot.searchThisAreaSubmitId ??
              getActivePerfScenarioSearchThisAreaSubmitId())
            : null;
        if (transactionId != null) {
          logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
            event: 'result_cards_ready',
            transactionId,
            searchThisAreaSubmitId,
            requestKey: transactionId,
            resultsSnapshotKey: stagingInputs.resultsSnapshotKey,
            readinessKey: stagingInputs.mountedPreparedRowsReadyKey,
            targetReadinessKey: stagingInputs.mountedPreparedRowsTargetKey,
            activeRowCount: stagingInputs.mountedPreparedRowsActiveCount,
            listPreparedRowsReady: stagingInputs.listPreparedRowsReady,
            hasNoRenderableResults: stagingInputs.hasNoRenderableResults,
            readyAtMs: globalThis.performance?.now?.() ?? Date.now(),
            source: 'surface_transaction_commit_gate',
          });
        }
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'cards_pins_transaction_commit_gate',
          source,
          transactionId,
          searchThisAreaSubmitId,
          kind: stagedBeforeCommit?.snapshot.kind ?? null,
          listPreparedRowsReady: stagingInputs.listPreparedRowsReady,
          mountedPreparedRowsActiveCount: stagingInputs.mountedPreparedRowsActiveCount,
          mountedPreparedRowsReadyKey: stagingInputs.mountedPreparedRowsReadyKey,
          mountedPreparedRowsTargetKey: stagingInputs.mountedPreparedRowsTargetKey,
          hasNoRenderableResults: stagingInputs.hasNoRenderableResults,
          hydratedResultsKey: stagingInputs.hydratedResultsKey,
          isResultsHydrationSettled: stagingInputs.isResultsHydrationSettled,
          shouldHydrateResultsForRender: stagingInputs.shouldHydrateResultsForRender,
          mapSearchSurfaceResultsSourcesReady: stagingInputs.mapSearchSurfaceResultsSourcesReady,
          mapSearchSurfaceResultsSourcesReadyKey:
            stagingInputs.mapSearchSurfaceResultsSourcesReadyKey,
          isShortcutCoverageLoading: stagingInputs.isShortcutCoverageLoading,
          resultsSnapshotKey: stagingInputs.resultsSnapshotKey,
        });
      }
      return didCommit;
    },
    [cancelResultsRevealWatchdog, readSearchSurfaceResultsTransactionGateInputs]
  );
  const maybeCommitAfterPreparedSourceFrame = React.useCallback(
    (source: SearchSurfaceResultsTransactionCommitSource) => {
      cancelDeferredSourceReadyCommitRef.current?.();
      let didCancel = false;
      const cancelers: Array<() => void> = [];
      cancelDeferredSourceReadyCommitRef.current = () => {
        didCancel = true;
        cancelers.forEach((cancel) => {
          cancel();
        });
        cancelers.length = 0;
        cancelDeferredSourceReadyCommitRef.current = null;
      };
      const runAfterFrames = (remainingFrameCount: number): void => {
        if (didCancel) {
          return;
        }
        if (remainingFrameCount <= 0) {
          const timeoutId = globalThis.setTimeout(() => {
            if (didCancel) {
              return;
            }
            cancelDeferredSourceReadyCommitRef.current = null;
            maybeCommitStagedSearchSurfaceResultsTransaction(source);
          }, 0);
          cancelers.push(() => {
            globalThis.clearTimeout(timeoutId);
          });
          return;
        }
        cancelers.push(
          schedulePostFrame(() => {
            runAfterFrames(remainingFrameCount - 1);
          })
        );
      };
      runAfterFrames(1);
    },
    [maybeCommitStagedSearchSurfaceResultsTransaction]
  );
  const stageSearchSurfaceResultsTransaction = React.useCallback(
    (snapshot: SearchSurfaceResultsEnterTransaction) => {
      const stagingInputs = readSearchSurfaceResultsTransactionGateInputs();
      const scenarioConfig = activeScenarioConfigRef.current;
      cancelDeferredStageRef.current?.();
      const recoverablePreparedRowsDataKey =
        snapshot.expectedResultsDataKey == null &&
        snapshot.dataReadyFrom === 'pending' &&
        stagingInputs.mountedPreparedRowsReadyKey != null &&
        stagingInputs.mountedPreparedRowsReadyKey === stagingInputs.mountedPreparedRowsTargetKey &&
        stagingInputs.mountedPreparedRowsActiveCount > 0
          ? stagingInputs.mountedPreparedRowsReadyKey
          : null;
      const transactionSnapshot =
        recoverablePreparedRowsDataKey == null
          ? snapshot
          : {
              ...snapshot,
              dataReadyFrom: 'cache' as const,
              expectedResultsDataKey: recoverablePreparedRowsDataKey,
            };
      const stagingResultsSnapshotKey =
        recoverablePreparedRowsDataKey ?? stagingInputs.resultsSnapshotKey;
      if (recoverablePreparedRowsDataKey != null) {
        resultsPresentationSurfaceAuthority.publish(
          {
            resultsHydrationKey: recoverablePreparedRowsDataKey,
            hydratedResultsKey: recoverablePreparedRowsDataKey,
            resultsPreparedRowsKey: recoverablePreparedRowsDataKey,
            listPreparedRowsReady: true,
            isResultsHydrationSettled: true,
          },
          'search_surface_results_cached_prepared_rows_recovered'
        );
      }
      pendingStageTransactionRef.current = transactionSnapshot;
      const pendingPageOneCommit = pendingPageOneResultsCommitRef.current;
      if (
        pendingPageOneCommit != null &&
        pendingPageOneCommit.transactionId !== transactionSnapshot.transactionId
      ) {
        pendingPageOneResultsCommitRef.current = null;
      }
      if (isPerfScenarioAttributionActive(scenarioConfig)) {
        logPerfScenarioAttributionEvent('WorkSpan', scenarioConfig, {
          event: 'scenario_work_span',
          owner: 'search_surface_results_transaction_stage',
          path: transactionSnapshot.dataReadyFrom,
          durationMs: 0,
          transactionId: snapshot.transactionId,
          mutationKind: snapshot.mutationKind,
          resultsSnapshotKey: stagingResultsSnapshotKey,
          hydratedResultsKey: stagingInputs.hydratedResultsKey,
          isResultsHydrationSettled: stagingInputs.isResultsHydrationSettled,
          shouldHydrateResultsForRender: stagingInputs.shouldHydrateResultsForRender,
          listPreparedRowsReady: stagingInputs.listPreparedRowsReady,
          mountedPreparedRowsActiveCount: stagingInputs.mountedPreparedRowsActiveCount,
          mountedPreparedRowsReadyKey: stagingInputs.mountedPreparedRowsReadyKey,
          mountedPreparedRowsTargetKey: stagingInputs.mountedPreparedRowsTargetKey,
          hasNoRenderableResults: stagingInputs.hasNoRenderableResults,
          mapSearchSurfaceResultsSourcesReady: stagingInputs.mapSearchSurfaceResultsSourcesReady,
          mapSearchSurfaceResultsSourcesReadyKey:
            stagingInputs.mapSearchSurfaceResultsSourcesReadyKey,
        });
      }
      armSearchSurfaceResultsPending(transactionSnapshot, stagingInputs);
      let didCancelDeferredStage = false;
      const cancelers: Array<() => void> = [];
      cancelDeferredStageRef.current = () => {
        didCancelDeferredStage = true;
        cancelers.forEach((cancel) => {
          cancel();
        });
        cancelers.length = 0;
        cancelDeferredStageRef.current = null;
        if (
          pendingStageTransactionRef.current?.transactionId === transactionSnapshot.transactionId
        ) {
          pendingStageTransactionRef.current = null;
        }
      };
      const runDeferredStage = () => {
        if (didCancelDeferredStage) {
          return;
        }
        cancelDeferredStageRef.current = null;
        if (
          pendingStageTransactionRef.current?.transactionId === transactionSnapshot.transactionId
        ) {
          pendingStageTransactionRef.current = null;
        }
        const pendingPageOneCommitForTransaction = pendingPageOneResultsCommitRef.current;
        const shouldMergePendingPageOneCommit =
          pendingPageOneCommitForTransaction != null &&
          pendingPageOneCommitForTransaction.transactionId === transactionSnapshot.transactionId;
        const stagedTransactionSnapshot = shouldMergePendingPageOneCommit
          ? {
              ...transactionSnapshot,
              dataReadyFrom:
                pendingPageOneCommitForTransaction.dataReadyFrom ??
                transactionSnapshot.dataReadyFrom,
              expectedResultsDataKey:
                pendingPageOneCommitForTransaction.expectedResultsDataKey ??
                transactionSnapshot.expectedResultsDataKey ??
                null,
              searchInputKey:
                pendingPageOneCommitForTransaction.searchInputKey ??
                transactionSnapshot.searchInputKey ??
                null,
            }
          : transactionSnapshot;
        const stagedResultsSnapshotKey = shouldMergePendingPageOneCommit
          ? (pendingPageOneCommitForTransaction.expectedResultsDataKey ?? stagingResultsSnapshotKey)
          : stagingResultsSnapshotKey;
        stagingCoordinatorRef.current!.stage(stagedTransactionSnapshot, stagedResultsSnapshotKey);
        if (shouldMergePendingPageOneCommit) {
          pendingPageOneResultsCommitRef.current = null;
        }
        armResultsRevealWatchdog(stagedTransactionSnapshot.transactionId);
        if (isPerfScenarioAttributionActive(scenarioConfig)) {
          const searchThisAreaSubmitId =
            stagedTransactionSnapshot.mutationKind === 'search_this_area'
              ? (stagedTransactionSnapshot.searchThisAreaSubmitId ??
                getActivePerfScenarioSearchThisAreaSubmitId())
              : null;
          if (stagedTransactionSnapshot.mutationKind === 'search_this_area') {
            logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
              event: 'search_this_area_presentation_intent_contract',
              transactionId: stagedTransactionSnapshot.transactionId,
              searchThisAreaSubmitId,
              coverState: stagedTransactionSnapshot.coverState,
              preserveSheetState: true,
              targetSnap: null,
              resultSheetBeginsSlidingUp: false,
              loadingStateVisible: true,
              mutationKind: stagedTransactionSnapshot.mutationKind,
              expectedResultsDataKey: stagedTransactionSnapshot.expectedResultsDataKey ?? null,
            });
          }
          logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
            event: 'cards_pins_transaction_stage_contract',
            transactionId: stagedTransactionSnapshot.transactionId,
            kind: stagedTransactionSnapshot.kind,
            mutationKind: stagedTransactionSnapshot.mutationKind,
            searchThisAreaSubmitId,
            coverState: stagedTransactionSnapshot.coverState,
            dataReadyFrom: stagedTransactionSnapshot.dataReadyFrom,
            searchInputKey: stagedTransactionSnapshot.searchInputKey ?? null,
            visualOnlyRedraw: false,
            listPreparedRowsReady: stagingInputs.listPreparedRowsReady,
            mountedPreparedRowsActiveCount: stagingInputs.mountedPreparedRowsActiveCount,
            mountedPreparedRowsReadyKey: stagingInputs.mountedPreparedRowsReadyKey,
            mountedPreparedRowsTargetKey: stagingInputs.mountedPreparedRowsTargetKey,
            hasNoRenderableResults: stagingInputs.hasNoRenderableResults,
            mapSearchSurfaceResultsSourcesReady: stagingInputs.mapSearchSurfaceResultsSourcesReady,
            mapSearchSurfaceResultsSourcesReadyKey:
              stagingInputs.mapSearchSurfaceResultsSourcesReadyKey,
            resultsSnapshotKey: stagingInputs.resultsSnapshotKey,
          });
        }
        maybeCommitStagedSearchSurfaceResultsTransaction('stage');
      };
      const scheduleDeferredStageAfterFrames = (remainingFrameCount: number): void => {
        if (didCancelDeferredStage) {
          return;
        }
        if (remainingFrameCount <= 0) {
          const timeoutId = globalThis.setTimeout(runDeferredStage, 0);
          cancelers.push(() => {
            globalThis.clearTimeout(timeoutId);
          });
          return;
        }
        cancelers.push(
          schedulePostFrame(() => {
            scheduleDeferredStageAfterFrames(remainingFrameCount - 1);
          })
        );
      };
      scheduleDeferredStageAfterFrames(2);
    },
    [
      armSearchSurfaceResultsPending,
      armResultsRevealWatchdog,
      maybeCommitStagedSearchSurfaceResultsTransaction,
      readSearchSurfaceResultsTransactionGateInputs,
      resultsPresentationSurfaceAuthority,
      runtimeMachineRef,
      searchMapSourceFramePort,
    ]
  );
  const handlePageOneResultsCommitted = React.useCallback(
    (payload?: {
      surfaceTransactionMutationKind?: 'search_this_area';
      expectedResultsDataKey?: string | null;
      dataReadyFrom?: 'network' | 'cache' | 'in_flight';
      searchInputKey?: string | null;
    }) => {
      if (
        payload?.surfaceTransactionMutationKind === 'search_this_area' &&
        payload.expectedResultsDataKey != null
      ) {
        const searchThisAreaTransactionId =
          searchSurfaceResultsTransactionKeyInput.activeOperationId ??
          payload.expectedResultsDataKey;
        stageSearchSurfaceResultsTransaction(
          createSearchSurfaceResultsEnterTransaction(
            searchThisAreaTransactionId,
            'search_this_area',
            'interaction_loading',
            payload.expectedResultsDataKey,
            payload.dataReadyFrom ?? 'network',
            payload.searchInputKey ?? null,
            getActivePerfScenarioSearchThisAreaSubmitId()
          )
        );
        return;
      }
      const activeTransactionId = searchSurfaceResultsTransactionKeyInput.activeOperationId;
      const pendingStageTransactionId = pendingStageTransactionRef.current?.transactionId ?? null;
      const stagedTransactionId =
        stagingCoordinatorRef.current!.getStagedTransaction()?.snapshot.transactionId ?? null;
      if (stagingCoordinatorRef.current!.getStagedTransaction() == null) {
        const targetTransactionId =
          pendingStageTransactionId ?? stagedTransactionId ?? activeTransactionId;
        if (targetTransactionId != null) {
          pendingPageOneResultsCommitRef.current = {
            transactionId: targetTransactionId,
            expectedResultsDataKey: payload?.expectedResultsDataKey ?? null,
            dataReadyFrom: payload?.dataReadyFrom,
            searchInputKey: payload?.searchInputKey ?? null,
          };
        }
        return;
      }
      stagingCoordinatorRef.current!.handlePageOneResultsCommitted(
        readSearchSurfaceResultsTransactionGateInputs(),
        payload?.expectedResultsDataKey ?? null,
        payload?.dataReadyFrom,
        payload?.searchInputKey ?? null
      );
      maybeCommitStagedSearchSurfaceResultsTransaction('page_one_results_committed');
    },
    [
      maybeCommitStagedSearchSurfaceResultsTransaction,
      readSearchSurfaceResultsTransactionGateInputs,
      searchSurfaceResultsTransactionKeyInput.activeOperationId,
      stageSearchSurfaceResultsTransaction,
    ]
  );

  React.useEffect(() => {
    const transport = searchSurfaceResultsPresentationTransactionInput.resultsPresentationTransport;
    if (!isCommittedEnterCoverPending(transport)) {
      cancelCommittedCoverWatchdog();
      return;
    }
    armCommittedCoverWatchdog(transport);
    return () => {
      cancelCommittedCoverWatchdog(transport.transactionId);
    };
  }, [
    armCommittedCoverWatchdog,
    cancelCommittedCoverWatchdog,
    searchSurfaceResultsPresentationTransactionInput.resultsPresentationTransport,
  ]);

  React.useEffect(() => {
    const tryCommitFromRuntimeStores = () => {
      maybeCommitStagedSearchSurfaceResultsTransaction('runtime_store_notify');
    };
    const tryCommitFromPreparedSourceFrame = () => {
      const sourceFrameSnapshot = searchMapSourceFramePort.getSnapshot();
      if (
        sourceFrameSnapshot.mapSearchSurfaceResultsSourcesReady &&
        sourceFrameSnapshot.mapSearchSurfaceResultsSourcesReadyKey != null
      ) {
        maybeCommitAfterPreparedSourceFrame('prepared_source_frame_ready');
      }
    };
    const unsubscribeSurfaceAuthority = resultsPresentationSurfaceAuthority.subscribe(
      tryCommitFromRuntimeStores,
      [
        'resultsHydrationKey',
        'resultsRequestKey',
        'hydratedResultsKey',
        'isResultsHydrationSettled',
        'listPreparedRowsReady',
        'preparedRows',
      ] as const,
      'search_surface_results_transaction_surface_imperative_gate'
    );
    const unsubscribeSourceFrame = searchMapSourceFramePort.subscribe(
      tryCommitFromPreparedSourceFrame,
      [
        'isShortcutCoverageLoading',
        'mapSearchSurfaceResultsSourcesReady',
        'mapSearchSurfaceResultsSourcesReadyKey',
      ] as const,
      'search_surface_results_transaction_map_source_imperative_gate'
    );
    const unsubscribeSearchSurfaceRuntime = getSearchSurfaceRuntime().subscribe(() => {
      maybeCommitStagedSearchSurfaceResultsTransaction('surface_runtime_notify');
    });
    tryCommitFromRuntimeStores();
    return () => {
      unsubscribeSurfaceAuthority();
      unsubscribeSourceFrame();
      unsubscribeSearchSurfaceRuntime();
    };
  }, [
    maybeCommitAfterPreparedSourceFrame,
    maybeCommitStagedSearchSurfaceResultsTransaction,
    resultsPresentationSurfaceAuthority,
    searchMapSourceFramePort,
  ]);

  React.useEffect(() => {
    maybeCommitStagedSearchSurfaceResultsTransaction('staged_transaction_version');
  }, [
    maybeCommitStagedSearchSurfaceResultsTransaction,
    stagedSearchSurfaceResultsTransactionVersion,
  ]);

  React.useEffect(
    () => () => {
      cancelDeferredStageRef.current?.();
      cancelDeferredSourceReadyCommitRef.current?.();
      cancelResultsRevealWatchdog();
      cancelCommittedCoverWatchdog();
    },
    [cancelCommittedCoverWatchdog, cancelResultsRevealWatchdog]
  );
  const searchSurfaceResultsTransactionKey = React.useMemo(() => {
    return stagingCoordinatorRef.current!.getSearchSurfaceResultsTransactionKey(
      searchSurfaceResultsTransactionInputs.committedSearchSurfaceResultsTransactionKey
    );
  }, [
    searchSurfaceResultsTransactionInputs.committedSearchSurfaceResultsTransactionKey,
    stagedSearchSurfaceResultsTransactionVersion,
  ]);

  const handlePresentationIntentAbort = React.useCallback(() => {
    clearStagedSearchSurfaceResultsTransaction();
    handleRuntimePresentationIntentAbort();
  }, [clearStagedSearchSurfaceResultsTransaction, handleRuntimePresentationIntentAbort]);

  return React.useMemo(
    () => ({
      searchSurfaceResultsTransactionKey,
      beginSearchThisAreaPresentationPending,
      stageSearchSurfaceResultsTransaction,
      clearStagedSearchSurfaceResultsTransaction,
      handlePageOneResultsCommitted,
      handlePresentationIntentAbort,
    }),
    [
      beginSearchThisAreaPresentationPending,
      clearStagedSearchSurfaceResultsTransaction,
      handlePageOneResultsCommitted,
      handlePresentationIntentAbort,
      searchSurfaceResultsTransactionKey,
      stageSearchSurfaceResultsTransaction,
    ]
  );
};
