import React from 'react';

import { logger } from '../../../../utils';
import {
  createPreparedResultsStagingCoordinator,
  type PreparedResultsPresentationSnapshot,
  type PreparedResultsStagingCoordinator,
} from './prepared-presentation-transaction';
import {
  deriveCommittedPreparedResultsSnapshotKey,
  type SearchRuntimeBus,
} from './search-runtime-bus';
import { shouldLogSearchNavSwitchDiagnosticLogs } from './search-nav-switch-perf-probe';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';
import type { ResultsPresentationRuntimeMachine } from './results-presentation-runtime-machine';

type UseResultsPresentationPreparedSnapshotRuntimeArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  runtimeMachineRef: React.MutableRefObject<ResultsPresentationRuntimeMachine | null>;
  handleRuntimePresentationIntentAbort: () => void;
};

export const useResultsPresentationPreparedSnapshotRuntime = ({
  searchRuntimeBus,
  runtimeMachineRef,
  handleRuntimePresentationIntentAbort,
}: UseResultsPresentationPreparedSnapshotRuntimeArgs) => {
  const [stagedPreparedResultsSnapshotVersion, bumpStagedPreparedResultsSnapshotVersion] =
    React.useReducer((value: number) => value + 1, 0);
  const stagingCoordinatorRef = React.useRef<PreparedResultsStagingCoordinator | null>(null);

  const preparedResultsTransactionInputs = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      committedPreparedResultsSnapshotKey: deriveCommittedPreparedResultsSnapshotKey(state),
      resultsSnapshotKey: state.resultsHydrationKey ?? state.resultsRequestKey,
    }),
    (left, right) =>
      left.committedPreparedResultsSnapshotKey === right.committedPreparedResultsSnapshotKey &&
      left.resultsSnapshotKey === right.resultsSnapshotKey,
    ['resultsPresentationTransport', 'resultsHydrationKey', 'resultsRequestKey'] as const
  );
  const preparedResultsStagingInputs = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      listFirstPaintReady: state.listFirstPaintReady,
      isShortcutCoverageLoading: state.isShortcutCoverageLoading,
      mapPreparedLabelSourcesReady: state.mapPreparedLabelSourcesReady,
    }),
    (left, right) =>
      left.listFirstPaintReady === right.listFirstPaintReady &&
      left.isShortcutCoverageLoading === right.isShortcutCoverageLoading &&
      left.mapPreparedLabelSourcesReady === right.mapPreparedLabelSourcesReady,
    ['listFirstPaintReady', 'isShortcutCoverageLoading', 'mapPreparedLabelSourcesReady'] as const
  );

  if (!stagingCoordinatorRef.current) {
    stagingCoordinatorRef.current = createPreparedResultsStagingCoordinator({
      applyStagingCoverState: (coverState) => {
        runtimeMachineRef.current!.applyStagingCoverState(coverState);
      },
      publishMapPreparedLabelSourcesReady: (value) => {
        searchRuntimeBus.publish({
          mapPreparedLabelSourcesReady: value,
        });
      },
      commitPreparedResultsSnapshot: (snapshot) => {
        runtimeMachineRef.current!.commitPreparedResultsSnapshot(snapshot);
      },
      onStagedSnapshotChanged: () => {
        bumpStagedPreparedResultsSnapshotVersion();
      },
    });
  }

  const clearStagedPreparedResultsSnapshot = React.useCallback((transactionId?: string) => {
    stagingCoordinatorRef.current!.clear(transactionId);
  }, []);
  const maybeCommitStagedPreparedResultsSnapshot = React.useCallback(() => {
    const stagedBeforeCommit = stagingCoordinatorRef.current!.getStagedSnapshot();
    const didCommit = stagingCoordinatorRef.current!.maybeCommit({
      ...preparedResultsStagingInputs,
      resultsSnapshotKey: preparedResultsTransactionInputs.resultsSnapshotKey,
    });
    if (shouldLogSearchNavSwitchDiagnosticLogs()) {
      logger.debug('[PRESENTATION-DIAG] preparedStagingMaybeCommit', {
        didCommit,
        stagedTransactionId: stagedBeforeCommit?.snapshot.transactionId ?? null,
        stagedKind: stagedBeforeCommit?.snapshot.kind ?? null,
        stagedDataReady: stagedBeforeCommit?.dataReady ?? null,
        stagingResultsSnapshotKey: stagedBeforeCommit?.stagingResultsSnapshotKey ?? null,
        resultsSnapshotKey: preparedResultsTransactionInputs.resultsSnapshotKey,
        listFirstPaintReady: preparedResultsStagingInputs.listFirstPaintReady,
        isShortcutCoverageLoading: preparedResultsStagingInputs.isShortcutCoverageLoading,
        mapPreparedLabelSourcesReady: preparedResultsStagingInputs.mapPreparedLabelSourcesReady,
      });
    }
    return didCommit;
  }, [preparedResultsStagingInputs, preparedResultsTransactionInputs.resultsSnapshotKey]);
  const stagePreparedResultsSnapshot = React.useCallback(
    (snapshot: PreparedResultsPresentationSnapshot) => {
      stagingCoordinatorRef.current!.stage(
        snapshot,
        preparedResultsTransactionInputs.resultsSnapshotKey
      );
      if (shouldLogSearchNavSwitchDiagnosticLogs()) {
        logger.debug('[PRESENTATION-DIAG] preparedStagingStage', {
          transactionId: snapshot.transactionId,
          kind: snapshot.kind,
          stagingResultsSnapshotKey: preparedResultsTransactionInputs.resultsSnapshotKey,
        });
      }
    },
    [preparedResultsTransactionInputs.resultsSnapshotKey]
  );
  const handlePageOneResultsCommitted = React.useCallback(() => {
    stagingCoordinatorRef.current!.handlePageOneResultsCommitted({
      ...preparedResultsStagingInputs,
      resultsSnapshotKey: preparedResultsTransactionInputs.resultsSnapshotKey,
    });
  }, [preparedResultsStagingInputs, preparedResultsTransactionInputs.resultsSnapshotKey]);

  React.useEffect(() => {
    maybeCommitStagedPreparedResultsSnapshot();
  }, [maybeCommitStagedPreparedResultsSnapshot, stagedPreparedResultsSnapshotVersion]);

  const preparedResultsSnapshotKey = React.useMemo(() => {
    return stagingCoordinatorRef.current!.getPreparedResultsSnapshotKey(
      preparedResultsTransactionInputs.committedPreparedResultsSnapshotKey
    );
  }, [
    preparedResultsTransactionInputs.committedPreparedResultsSnapshotKey,
    stagedPreparedResultsSnapshotVersion,
  ]);

  const handlePresentationIntentAbort = React.useCallback(() => {
    clearStagedPreparedResultsSnapshot();
    handleRuntimePresentationIntentAbort();
  }, [clearStagedPreparedResultsSnapshot, handleRuntimePresentationIntentAbort]);

  return React.useMemo(
    () => ({
      preparedResultsSnapshotKey,
      stagePreparedResultsSnapshot,
      clearStagedPreparedResultsSnapshot,
      handlePageOneResultsCommitted,
      handlePresentationIntentAbort,
    }),
    [
      clearStagedPreparedResultsSnapshot,
      handlePageOneResultsCommitted,
      handlePresentationIntentAbort,
      preparedResultsSnapshotKey,
      stagePreparedResultsSnapshot,
    ]
  );
};
