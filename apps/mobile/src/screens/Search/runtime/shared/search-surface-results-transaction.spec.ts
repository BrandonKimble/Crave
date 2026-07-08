// S4c-1c model tests: the coordinator's world-ready latch makes the gate
// level-triggered in BOTH orders (stage→ready and ready→stage). RED-provable:
// break the latch and the ready-first case never reaches dataReady.

import {
  createSearchSurfaceResultsEnterTransaction,
  createSearchSurfaceResultsTransactionCoordinator,
  type SearchSurfaceResultsTransactionGateInputs,
} from './search-surface-results-transaction';

const gateInputs = (
  overrides: Partial<SearchSurfaceResultsTransactionGateInputs> = {}
): SearchSurfaceResultsTransactionGateInputs => ({
  resultsSnapshotKey: null,
  hydratedResultsKey: null,
  listPreparedRowsReady: false,
  mountedPreparedRowsActiveCount: 0,
  mountedPreparedRowsReadyKey: null,
  mountedPreparedRowsTargetKey: null,
  hasNoRenderableResults: false,
  shouldHydrateResultsForRender: false,
  isResultsHydrationSettled: false,
  isShortcutCoverageLoading: false,
  mapSearchSurfaceResultsSourcesReady: false,
  mapSearchSurfaceResultsSourcesReadyKey: null,
  visualRevealTransactionId: null,
  visualRevealCardsReady: false,
  visualRevealSheetReady: false,
  visualRevealNativeMarkerFrameReady: false,
  visualRevealSource: null,
  ...overrides,
});

const createCoordinator = () => {
  const rowsReady: string[] = [];
  const coordinator = createSearchSurfaceResultsTransactionCoordinator({
    applyStagingCoverState: () => {},
    publishSearchSurfaceResultsTransactionKey: () => {},
    publishMapSearchSurfaceResultsSourcesReady: () => {},
    onRowsReadyForPresentation: (snapshot) => {
      rowsReady.push(snapshot.transactionId);
    },
    commitSearchSurfaceResultsEnterPresentation: () => {},
    clearCommittedSearchSurfaceResultsTransactionKey: () => {},
  });
  return { coordinator, rowsReady };
};

const enterTx = (id: string) =>
  createSearchSurfaceResultsEnterTransaction(id, 'initial_search', 'initial_loading');

describe('search-surface-results-transaction coordinator (world-ready latch)', () => {
  it('stage then world_ready promotes to dataReady with the committed key', () => {
    const { coordinator } = createCoordinator();
    coordinator.stage(enterTx('tx:1'), null);
    expect(coordinator.getStagedTransaction()?.dataReady).toBe(false);
    coordinator.handlePageOneResultsCommitted(
      gateInputs({ resultsSnapshotKey: 'world:A', listPreparedRowsReady: true }),
      'world:A',
      'network',
      null
    );
    const staged = coordinator.getStagedTransaction();
    expect(staged?.dataReady).toBe(true);
    expect(staged?.snapshot.expectedResultsDataKey).toBe('world:A');
    expect(staged?.snapshot.dataReadyFrom).toBe('network');
  });

  it('world_ready BEFORE the (deferred) stage latches and merges at stage time', () => {
    const { coordinator, rowsReady } = createCoordinator();
    // Cache hit resolves synchronously inside the reconciler kick — world_ready first.
    coordinator.handlePageOneResultsCommitted(gateInputs(), 'world:A', 'cache', 'input:A');
    expect(coordinator.getStagedTransaction()).toBeNull();
    coordinator.stage(enterTx('tx:1'), null);
    const staged = coordinator.getStagedTransaction();
    expect(staged?.dataReady).toBe(true);
    expect(staged?.snapshot.expectedResultsDataKey).toBe('world:A');
    expect(staged?.snapshot.dataReadyFrom).toBe('cache');
    expect(staged?.snapshot.searchInputKey).toBe('input:A');
    expect(rowsReady).toEqual(['tx:1']);
  });

  it('a full clear drops the latch — a superseded world never leaks into the next stage', () => {
    const { coordinator } = createCoordinator();
    coordinator.handlePageOneResultsCommitted(gateInputs(), 'world:A', 'cache', null);
    coordinator.clear();
    coordinator.stage(enterTx('tx:2'), null);
    const staged = coordinator.getStagedTransaction();
    expect(staged?.dataReady).toBe(false);
    expect(staged?.snapshot.expectedResultsDataKey).toBeUndefined();
  });

  it('stage consumes the latch exactly once', () => {
    const { coordinator } = createCoordinator();
    coordinator.handlePageOneResultsCommitted(gateInputs(), 'world:A', 'cache', null);
    coordinator.stage(enterTx('tx:1'), null);
    coordinator.clear();
    coordinator.stage(enterTx('tx:2'), null);
    expect(coordinator.getStagedTransaction()?.dataReady).toBe(false);
  });
});
