export type ResultsPresentationEnterMutationKind =
  | 'initial_search'
  | 'search_this_area'
  | 'shortcut_rerun';

export type ResultsPresentationCoverState = 'hidden' | 'initial_loading' | 'interaction_loading';

export type SearchSurfaceResultsDataReadyFrom = 'pending' | 'network' | 'cache' | 'in_flight';

export type SearchSurfaceResultsEnterTransaction = {
  transactionId: string;
  kind: 'results_enter';
  mutationKind: ResultsPresentationEnterMutationKind;
  coverState: Exclude<ResultsPresentationCoverState, 'hidden'>;
  dataReadyFrom: SearchSurfaceResultsDataReadyFrom;
  expectedResultsDataKey?: string | null;
  searchInputKey?: string | null;
  searchThisAreaSubmitId?: string | null;
};

export type SearchSurfaceResultsExitTransaction = {
  transactionId: string;
  kind: 'results_exit';
  terminalDismissSource: 'results' | 'profile';
};

export type SearchSurfaceResultsTransaction =
  | SearchSurfaceResultsEnterTransaction
  | SearchSurfaceResultsExitTransaction;

export type SearchSurfaceResultsStagedTransaction = {
  snapshot: SearchSurfaceResultsEnterTransaction;
  dataReady: boolean;
  presentationCommitted: boolean;
  stagingResultsSnapshotKey: string | null;
};

export type SearchSurfaceResultsTransactionGateInputs = {
  resultsSnapshotKey: string | null;
  hydratedResultsKey: string | null;
  listPreparedRowsReady: boolean;
  mountedPreparedRowsActiveCount: number;
  mountedPreparedRowsReadyKey: string | null;
  mountedPreparedRowsTargetKey: string | null;
  hasNoRenderableResults: boolean;
  shouldHydrateResultsForRender: boolean;
  isResultsHydrationSettled: boolean;
  isShortcutCoverageLoading: boolean;
  mapSearchSurfaceResultsSourcesReady: boolean;
  mapSearchSurfaceResultsSourcesReadyKey: string | null;
  visualRevealTransactionId: string | null;
  visualRevealCardsReady: boolean;
  visualRevealSheetReady: boolean;
  visualRevealNativeMarkerFrameReady: boolean;
  visualRevealSource: 'active' | 'completed' | null;
};

export type SearchSurfaceResultsTransactionCoordinatorOptions = {
  applyStagingCoverState: (coverState: Exclude<ResultsPresentationCoverState, 'hidden'>) => void;
  publishSearchSurfaceResultsTransactionKey: (key: string | null) => void;
  publishMapSearchSurfaceResultsSourcesReady: (value: boolean, key: string | null) => void;
  onRowsReadyForPresentation?: (snapshot: SearchSurfaceResultsEnterTransaction) => void;
  commitSearchSurfaceResultsTransaction: (snapshot: SearchSurfaceResultsEnterTransaction) => void;
  clearCommittedSearchSurfaceResultsTransactionKey: () => void;
  onStagedTransactionChanged?: () => void;
};

export type SearchSurfaceResultsTransactionCoordinator = {
  getStagedTransaction: () => SearchSurfaceResultsStagedTransaction | null;
  getSearchSurfaceResultsTransactionKey: (
    committedSearchSurfaceResultsTransactionKey: string | null
  ) => string | null;
  stage: (
    snapshot: SearchSurfaceResultsEnterTransaction,
    stagingResultsSnapshotKey: string | null
  ) => void;
  clear: (transactionId?: string) => void;
  maybeCommit: (inputs: SearchSurfaceResultsTransactionGateInputs) => boolean;
  handlePageOneResultsCommitted: (
    inputs: SearchSurfaceResultsTransactionGateInputs,
    expectedResultsDataKey?: string | null,
    dataReadyFrom?: Exclude<SearchSurfaceResultsDataReadyFrom, 'pending'>,
    searchInputKey?: string | null
  ) => void;
};

export const createSearchSurfaceResultsEnterTransaction = (
  transactionId: string,
  mutationKind: ResultsPresentationEnterMutationKind,
  coverState: Exclude<ResultsPresentationCoverState, 'hidden'>,
  expectedResultsDataKey?: string | null,
  dataReadyFrom: SearchSurfaceResultsDataReadyFrom = 'pending',
  searchInputKey?: string | null,
  searchThisAreaSubmitId?: string | null
): SearchSurfaceResultsEnterTransaction => ({
  transactionId,
  kind: 'results_enter',
  mutationKind,
  coverState,
  dataReadyFrom,
  expectedResultsDataKey,
  searchInputKey,
  searchThisAreaSubmitId,
});

export const createSearchSurfaceResultsExitTransaction = (
  transactionId: string,
  terminalDismissSource: SearchSurfaceResultsExitTransaction['terminalDismissSource'] = 'results'
): SearchSurfaceResultsExitTransaction => ({
  transactionId,
  kind: 'results_exit',
  terminalDismissSource,
});

export const resolveSearchSurfaceResultsEnterCoverState = (
  preserveSheetState: boolean
): Exclude<ResultsPresentationCoverState, 'hidden'> =>
  preserveSheetState ? 'interaction_loading' : 'initial_loading';

export const resolveSearchSurfaceResultsTransactionCoverState = (
  snapshot: SearchSurfaceResultsTransaction
): Exclude<ResultsPresentationCoverState, 'hidden'> =>
  snapshot.kind === 'results_exit' ? 'interaction_loading' : snapshot.coverState;

export const resolveCommittedSearchSurfaceResultsCoverState = (
  snapshot: SearchSurfaceResultsTransaction
): ResultsPresentationCoverState =>
  snapshot.kind === 'results_exit' ? 'hidden' : snapshot.coverState;

export const isSearchSurfaceResultsTransactionHydratedForPresentation = ({
  hydratedResultsKey,
  isResultsHydrationSettled,
  resultsSnapshotKey,
  shouldHydrateResultsForRender,
}: Pick<
  SearchSurfaceResultsTransactionGateInputs,
  | 'hydratedResultsKey'
  | 'isResultsHydrationSettled'
  | 'resultsSnapshotKey'
  | 'shouldHydrateResultsForRender'
>): boolean =>
  resultsSnapshotKey != null &&
  hydratedResultsKey === resultsSnapshotKey &&
  isResultsHydrationSettled &&
  !shouldHydrateResultsForRender;

export const areSearchSurfaceResultsRowsReadyForPresentation = (
  inputs: Pick<
    SearchSurfaceResultsTransactionGateInputs,
    | 'hydratedResultsKey'
    | 'isResultsHydrationSettled'
    | 'listPreparedRowsReady'
    | 'hasNoRenderableResults'
    | 'resultsSnapshotKey'
    | 'isResultsHydrationSettled'
    | 'shouldHydrateResultsForRender'
  >,
  expectedResultsDataKey?: string | null
): boolean => {
  if (inputs.resultsSnapshotKey == null) {
    return false;
  }
  if (expectedResultsDataKey != null && inputs.resultsSnapshotKey !== expectedResultsDataKey) {
    return false;
  }
  if (
    inputs.hasNoRenderableResults &&
    inputs.isResultsHydrationSettled &&
    !inputs.shouldHydrateResultsForRender
  ) {
    return true;
  }
  return inputs.listPreparedRowsReady;
};

export const isSearchSurfaceResultsTransactionReadyForCommit = (
  stagedTransaction: SearchSurfaceResultsStagedTransaction | null,
  inputs: SearchSurfaceResultsTransactionGateInputs
): boolean => {
  if (
    stagedTransaction == null ||
    !isSearchSurfaceResultsTransactionReadyForPresentationCommit(stagedTransaction, inputs)
  ) {
    return false;
  }
  return (
    stagedTransaction.presentationCommitted &&
    inputs.visualRevealTransactionId === stagedTransaction.snapshot.transactionId &&
    inputs.visualRevealCardsReady &&
    inputs.visualRevealSheetReady &&
    inputs.visualRevealNativeMarkerFrameReady
  );
};

export const isSearchSurfaceResultsTransactionReadyForPresentationCommit = (
  stagedTransaction: SearchSurfaceResultsStagedTransaction | null,
  inputs: SearchSurfaceResultsTransactionGateInputs
): boolean => {
  if (!stagedTransaction?.dataReady) {
    return false;
  }
  const expectedResultsDataKey = stagedTransaction.snapshot.expectedResultsDataKey ?? null;
  if (expectedResultsDataKey != null && inputs.resultsSnapshotKey !== expectedResultsDataKey) {
    return false;
  }
  const expectedMapSearchSurfaceResultsSourcesReadyKey = stagedTransaction.snapshot.transactionId;
  return (
    inputs.mapSearchSurfaceResultsSourcesReady &&
    expectedMapSearchSurfaceResultsSourcesReadyKey != null &&
    inputs.mapSearchSurfaceResultsSourcesReadyKey === expectedMapSearchSurfaceResultsSourcesReadyKey
  );
};

export const createSearchSurfaceResultsTransactionCoordinator = (
  options: SearchSurfaceResultsTransactionCoordinatorOptions
): SearchSurfaceResultsTransactionCoordinator => {
  let stagedTransaction: SearchSurfaceResultsStagedTransaction | null = null;

  const notifyChanged = () => {
    options.onStagedTransactionChanged?.();
  };

  const setStagedTransaction = (nextSnapshot: SearchSurfaceResultsStagedTransaction | null) => {
    stagedTransaction = nextSnapshot;
    notifyChanged();
  };

  const promoteDataReady = (inputs: SearchSurfaceResultsTransactionGateInputs) => {
    if (
      stagedTransaction == null ||
      stagedTransaction.dataReady ||
      inputs.resultsSnapshotKey == null
    ) {
      return stagedTransaction;
    }
    const expectedResultsDataKey = stagedTransaction.snapshot.expectedResultsDataKey ?? null;
    const hasRowsReadyForPresentation = areSearchSurfaceResultsRowsReadyForPresentation(
      inputs,
      expectedResultsDataKey
    );
    if (!hasRowsReadyForPresentation) {
      return stagedTransaction;
    }
    const promotedSnapshot = {
      ...stagedTransaction,
      snapshot: {
        ...stagedTransaction.snapshot,
        dataReadyFrom:
          stagedTransaction.snapshot.dataReadyFrom === 'pending'
            ? 'network'
            : stagedTransaction.snapshot.dataReadyFrom,
      },
      dataReady: true,
    };
    setStagedTransaction(promotedSnapshot);
    options.onRowsReadyForPresentation?.(promotedSnapshot.snapshot);
    return promotedSnapshot;
  };

  const coordinator: SearchSurfaceResultsTransactionCoordinator = {
    getStagedTransaction: () => stagedTransaction,
    getSearchSurfaceResultsTransactionKey(committedSearchSurfaceResultsTransactionKey) {
      return (
        committedSearchSurfaceResultsTransactionKey ??
        stagedTransaction?.snapshot.transactionId ??
        null
      );
    },
    stage(snapshot, stagingResultsSnapshotKey) {
      options.applyStagingCoverState(resolveSearchSurfaceResultsTransactionCoverState(snapshot));
      options.publishSearchSurfaceResultsTransactionKey(snapshot.transactionId);
      const nextStagedTransaction = {
        snapshot,
        dataReady: snapshot.dataReadyFrom !== 'pending',
        presentationCommitted: false,
        stagingResultsSnapshotKey,
      };
      setStagedTransaction(nextStagedTransaction);
      if (nextStagedTransaction.dataReady) {
        options.onRowsReadyForPresentation?.(snapshot);
      }
    },
    clear(transactionId) {
      if (stagedTransaction == null) {
        return;
      }
      if (transactionId != null && stagedTransaction?.snapshot.transactionId !== transactionId) {
        return;
      }
      options.publishSearchSurfaceResultsTransactionKey(null);
      setStagedTransaction(null);
      options.publishMapSearchSurfaceResultsSourcesReady(false, null);
    },
    maybeCommit(inputs) {
      const nextSnapshot = promoteDataReady(inputs) ?? stagedTransaction;
      if (nextSnapshot == null) {
        return false;
      }
      if (!isSearchSurfaceResultsTransactionReadyForCommit(nextSnapshot, inputs)) {
        if (
          !nextSnapshot.presentationCommitted &&
          isSearchSurfaceResultsTransactionReadyForPresentationCommit(nextSnapshot, inputs)
        ) {
          const presentationCommittedSnapshot = {
            ...nextSnapshot,
            presentationCommitted: true,
          };
          setStagedTransaction(presentationCommittedSnapshot);
          options.commitSearchSurfaceResultsTransaction(presentationCommittedSnapshot.snapshot);
        }
        return false;
      }
      setStagedTransaction(null);
      options.clearCommittedSearchSurfaceResultsTransactionKey();
      return true;
    },
    handlePageOneResultsCommitted(inputs, expectedResultsDataKey, dataReadyFrom, searchInputKey) {
      if (stagedTransaction == null) {
        return;
      }
      const committedExpectedResultsDataKey =
        expectedResultsDataKey ?? stagedTransaction.snapshot.expectedResultsDataKey ?? null;
      stagedTransaction = {
        ...stagedTransaction,
        snapshot: {
          ...stagedTransaction.snapshot,
          dataReadyFrom: dataReadyFrom ?? stagedTransaction.snapshot.dataReadyFrom,
          expectedResultsDataKey: committedExpectedResultsDataKey,
          searchInputKey: searchInputKey ?? stagedTransaction.snapshot.searchInputKey ?? null,
        },
        stagingResultsSnapshotKey: null,
      };
      promoteDataReady(inputs);
    },
  };
  return coordinator;
};
