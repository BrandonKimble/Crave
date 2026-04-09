import React from 'react';

import {
  createPreparedResultsStagingCoordinator,
  type PreparedResultsPresentationSnapshot,
  type PreparedResultsStagingCoordinator,
} from './prepared-presentation-transaction';
import {
  deriveCommittedPreparedResultsSnapshotKey,
  type SearchRuntimeBus,
} from './search-runtime-bus';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';
import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';

type ResultsPresentationStagingRuntime = Pick<
  ResultsPresentationRuntimeOwner,
  | 'preparedResultsSnapshotKey'
  | 'stagePreparedResultsSnapshot'
  | 'clearStagedPreparedResultsSnapshot'
  | 'handlePageOneResultsCommitted'
  | 'handlePresentationIntentAbort'
>;

export type UseResultsPresentationStagingRuntimeArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  applyStagingCoverState: (nextCoverState: 'initial_loading' | 'interaction_loading') => void;
  commitPreparedResultsSnapshot: (snapshot: PreparedResultsPresentationSnapshot) => void;
  handleRuntimePresentationIntentAbort: () => void;
};

export const useResultsPresentationStagingRuntime = ({
  searchRuntimeBus,
  applyStagingCoverState,
  commitPreparedResultsSnapshot,
  handleRuntimePresentationIntentAbort,
}: UseResultsPresentationStagingRuntimeArgs): ResultsPresentationStagingRuntime => {
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

  const preparedResultsResultsSnapshotKey = preparedResultsTransactionInputs.resultsSnapshotKey;
  const [stagedPreparedResultsSnapshotVersion, bumpStagedPreparedResultsSnapshotVersion] =
    React.useReducer((value: number) => value + 1, 0);
  const stagingCoordinatorRef = React.useRef<PreparedResultsStagingCoordinator | null>(null);

  if (!stagingCoordinatorRef.current) {
    stagingCoordinatorRef.current = createPreparedResultsStagingCoordinator({
      applyStagingCoverState,
      publishMapPreparedLabelSourcesReady: (value) => {
        searchRuntimeBus.publish({
          mapPreparedLabelSourcesReady: value,
        });
      },
      commitPreparedResultsSnapshot,
      onStagedSnapshotChanged: () => {
        bumpStagedPreparedResultsSnapshotVersion();
      },
    });
  }

  const clearStagedPreparedResultsSnapshot = React.useCallback((transactionId?: string) => {
    stagingCoordinatorRef.current!.clear(transactionId);
  }, []);

  const maybeCommitStagedPreparedResultsSnapshot = React.useCallback(() => {
    return stagingCoordinatorRef.current!.maybeCommit({
      ...preparedResultsStagingInputs,
      resultsSnapshotKey: preparedResultsResultsSnapshotKey,
    });
  }, [
    preparedResultsResultsSnapshotKey,
    preparedResultsStagingInputs.isShortcutCoverageLoading,
    preparedResultsStagingInputs.listFirstPaintReady,
    preparedResultsStagingInputs.mapPreparedLabelSourcesReady,
  ]);

  const stagePreparedResultsSnapshot = React.useCallback(
    (snapshot: PreparedResultsPresentationSnapshot) => {
      stagingCoordinatorRef.current!.stage(snapshot, preparedResultsResultsSnapshotKey);
    },
    [preparedResultsResultsSnapshotKey]
  );

  const handlePageOneResultsCommitted = React.useCallback(() => {
    stagingCoordinatorRef.current!.handlePageOneResultsCommitted({
      ...preparedResultsStagingInputs,
      resultsSnapshotKey: preparedResultsResultsSnapshotKey,
    });
  }, [preparedResultsResultsSnapshotKey, preparedResultsStagingInputs]);

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
