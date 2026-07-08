import React from 'react';
import { reportSearchFlowContractViolation } from './search-flow-contracts';

import {
  getActivePerfScenarioSearchThisAreaSubmitId,
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import {
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

type SearchSurfaceResultsTransactionCommitSource =
  | 'stage'
  | 'page_one_results_committed'
  | 'runtime_store_notify'
  | 'prepared_source_frame_ready'
  | 'surface_runtime_notify'
  | 'staged_transaction_version';

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
        resultsPresentationSurfaceAuthority.getSnapshot().resultsIdentityKey ??
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
    [resultsPresentationSurfaceAuthority, searchMapSourceFramePort]
  );

  const armSearchSurfaceResultsPending = React.useCallback(
    (
      snapshot: SearchSurfaceResultsEnterTransaction,
      _stagingInputs: SearchSurfaceResultsTransactionGateInputs
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

  // TR5-N: a chip rerun (open-now/rising/price/mid-pagination include-similar) is an IN-PLACE
  // variant swap — the toggle coordinator's runner arms this pending cover at COMMIT (before
  // firing the network request), and the enter transaction is staged only at RESPONSE time
  // (handlePageOneResultsCommitted, data-keyed) — the search-this-area lane's shape, keyed to
  // the TOGGLE INTENT id so the coordinator's visual-sync finalize fires at reveal settle.
  const pendingVariantRerunTransactionIdRef = React.useRef<string | null>(null);
  const beginVariantRerunPresentationPending = React.useCallback(
    (transactionId: string) => {
      clearStagedSearchSurfaceResultsTransaction();
      pendingVariantRerunTransactionIdRef.current = transactionId;
      getSearchSurfaceRuntime().beginRedrawTransaction({
        reason: 'toggle',
        transactionId,
        coverState: 'interaction_loading',
      });
      runtimeMachineRef.current!.applyStagingCoverState('interaction_loading');
      resultsPresentationSurfaceAuthority.publish(
        {
          searchSurfaceResultsTransactionKey: transactionId,
        },
        'variant_rerun_pending_cover'
      );
      commitSearchMountedResultsSearchSurfaceResultsTransactionKey(transactionId);
      searchMapSourceFramePort.publishVisualState({
        mapSearchSurfaceResultsSourcesReady: false,
        mapSearchSurfaceResultsSourcesReadyKey: transactionId,
      });
    },
    [
      clearStagedSearchSurfaceResultsTransaction,
      resultsPresentationSurfaceAuthority,
      runtimeMachineRef,
      searchMapSourceFramePort,
    ]
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
    } else {
      // R0 loud-contracts (§D6): a search-this-area pending WITHOUT an active operation id
      // proceeds with NO redraw transaction — readiness signals then arrive against
      // transactionId:null and are ignored (loud via the contract event below).
      reportSearchFlowContractViolation('search_this_area_pending_without_transaction', {
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
      mountedResultsSnapshot.resultsIdentityKey ?? mountedResultsSnapshot.resultsRequestKey;
    const preparedRowsSnapshot = surfaceSnapshot.preparedRows;
    const mountedPreparedRowsReadyKey = preparedRowsSnapshot.readyResultsIdentityKey;
    const mountedPreparedRowsTargetKey = preparedRowsSnapshot.targetResultsIdentityKey;
    const mountedPreparedRowsActiveCount = preparedRowsSnapshot.activeRowCount;
    const currentResultsSnapshotKey =
      surfaceSnapshot.resultsIdentityKey ?? surfaceSnapshot.resultsRequestKey;
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

  const maybeCommitStagedSearchSurfaceResultsTransaction = React.useCallback(
    (source: SearchSurfaceResultsTransactionCommitSource) => {
      const stagingInputs = readSearchSurfaceResultsTransactionGateInputs();
      const stagedBeforeCommit = stagingCoordinatorRef.current!.getStagedTransaction();
      const didCommit = stagingCoordinatorRef.current!.maybeCommit(stagingInputs);
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
            targetResultsIdentityKey: stagingInputs.mountedPreparedRowsTargetKey,
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
    [readSearchSurfaceResultsTransactionGateInputs]
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
      // S4c-1c: no recovery lane, no ordering refs — the coordinator's world-ready
      // latch merges a data commit that landed before this (deferred) stage, in the
      // pure gate, order-independently.
      const transactionSnapshot = snapshot;
      const stagingResultsSnapshotKey = stagingInputs.resultsSnapshotKey;
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
      };
      const runDeferredStage = () => {
        if (didCancelDeferredStage) {
          return;
        }
        cancelDeferredStageRef.current = null;
        const stagedTransactionSnapshot = transactionSnapshot;
        stagingCoordinatorRef.current!.stage(stagedTransactionSnapshot, stagingResultsSnapshotKey);
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
      maybeCommitStagedSearchSurfaceResultsTransaction,
      readSearchSurfaceResultsTransactionGateInputs,
      resultsPresentationSurfaceAuthority,
      runtimeMachineRef,
      searchMapSourceFramePort,
    ]
  );
  const handlePageOneResultsCommitted = React.useCallback(
    (payload?: {
      surfaceTransactionMutationKind?: 'search_this_area' | 'variant_rerun';
      expectedResultsDataKey?: string | null;
      dataReadyFrom?: 'network' | 'cache' | 'in_flight';
      searchInputKey?: string | null;
    }) => {
      if (
        payload?.surfaceTransactionMutationKind === 'variant_rerun' &&
        payload.expectedResultsDataKey != null
      ) {
        // TR5-N: the chip rerun's response just committed — stage the enter NOW, data-keyed,
        // under the pending cover the runner armed at commit. The transaction id is the toggle
        // intent id (armed by beginVariantRerunPresentationPending) so the coordinator's
        // finalize fires at reveal settle; the transaction MUTATION kind reuses
        // 'search_this_area' (the identical data-keyed in-place-rerun gate semantics).
        const variantRerunTransactionId =
          pendingVariantRerunTransactionIdRef.current ??
          searchSurfaceResultsTransactionKeyInput.activeOperationId ??
          payload.expectedResultsDataKey;
        pendingVariantRerunTransactionIdRef.current = null;
        stageSearchSurfaceResultsTransaction(
          createSearchSurfaceResultsEnterTransaction(
            variantRerunTransactionId,
            'search_this_area',
            'interaction_loading',
            payload.expectedResultsDataKey,
            payload.dataReadyFrom ?? 'network',
            payload.searchInputKey ?? null,
            null
          )
        );
        return;
      }
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
      // Enter world_ready: hand it to the coordinator in EITHER order — if the deferred
      // stage hasn't landed yet, the pure gate latches it (S4c-1c).
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
        'resultsIdentityKey',
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
    },
    []
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
    pendingVariantRerunTransactionIdRef.current = null;
    clearStagedSearchSurfaceResultsTransaction();
    handleRuntimePresentationIntentAbort();
  }, [clearStagedSearchSurfaceResultsTransaction, handleRuntimePresentationIntentAbort]);

  return React.useMemo(
    () => ({
      searchSurfaceResultsTransactionKey,
      beginSearchThisAreaPresentationPending,
      beginVariantRerunPresentationPending,
      stageSearchSurfaceResultsTransaction,
      clearStagedSearchSurfaceResultsTransaction,
      handlePageOneResultsCommitted,
      handlePresentationIntentAbort,
    }),
    [
      beginSearchThisAreaPresentationPending,
      beginVariantRerunPresentationPending,
      clearStagedSearchSurfaceResultsTransaction,
      handlePageOneResultsCommitted,
      handlePresentationIntentAbort,
      searchSurfaceResultsTransactionKey,
      stageSearchSurfaceResultsTransaction,
    ]
  );
};
