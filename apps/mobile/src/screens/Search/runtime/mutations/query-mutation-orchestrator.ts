import React from 'react';

import { logger } from '../../../../utils';
import { writeSearchDesiredTuple } from '../shared/search-desired-state-writer';
import type { SearchCommittedBounds } from '../shared/search-desired-state-contract';
import type { ScheduleToggleCommit } from '../shared/results-toggle-interaction-contract';
import { createSearchSurfaceResultsEnterTransaction } from '../shared/search-surface-results-transaction';
import { getSearchSurfaceRuntime } from '../surface/search-surface-runtime';
import type { ResultsPresentationRuntimeOwner } from '../shared/results-presentation-runtime-owner-contract';
import type { SearchRuntimeBus } from '../shared/search-runtime-bus';
import {
  buildLevelsFromRange,
  getRangeFromLevels,
  isFullPriceRange,
  normalizePriceRangeValues,
  type PriceRangeTuple,
} from '../../utils/price';

type SearchMode = 'natural' | 'shortcut' | null;
type SegmentValue = 'dishes' | 'restaurants';

type StructuredSearchFilters = {
  includeSimilar?: boolean;
  openNow?: boolean;
  priceLevels?: number[];
  rising?: boolean;
};

type RerunActiveSearchOptions = {
  searchMode: SearchMode;
  activeTab: SegmentValue;
  submittedQuery: string;
  query: string;
  isSearchSessionActive: boolean;
  preserveSheetState?: boolean;
  filters?: StructuredSearchFilters;
  presentationIntentKind?: 'search_this_area' | 'variant_rerun';
};

type QueryMutationMechanismEmitter = (
  event: 'query_mutation_coalesced',
  payload?: Record<string, unknown>
) => void;

type UseQueryMutationOrchestratorArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  searchMode: SearchMode;
  activeTab: SegmentValue;
  submittedQuery: string;
  query: string;
  isSearchSessionActive: boolean;
  pendingPriceRange: PriceRangeTuple;
  setPendingPriceRange: (next: PriceRangeTuple) => void;
  isPriceSelectorVisible: boolean;
  setIsPriceSelectorVisible: (next: boolean) => void;
  priceLevels: number[];
  scheduleToggleCommit: ScheduleToggleCommit;
  rerunActiveSearch: (options: RerunActiveSearchOptions) => Promise<void>;
  // Page-1 zero-network include-similar flip (use-search-submit-response-owner); returns
  // false when the flip cannot be served locally → the runner falls back to a rerun.
  applyIncludeSimilarLocalSwap: (options: {
    nextIncludeSimilar: boolean;
    targetTab: SegmentValue;
  }) => boolean;
  resultsRuntimeOwner: Pick<
    ResultsPresentationRuntimeOwner,
    | 'clearStagedSearchSurfaceResultsTransaction'
    | 'stageSearchSurfaceResultsTransaction'
    | 'beginVariantRerunPresentationPending'
  >;
  priceSheetRef: React.MutableRefObject<{ requestClose: () => void } | null>;
  /** S3-pre commit-moment adopt: a chip commit re-reads the SETTLED native camera into the
   *  tuple, so a zoom-then-toggle resolves against the CURRENT viewport by construction. */
  captureFreshTupleBounds: () => Promise<SearchCommittedBounds | null>;
  onMechanismEvent?: QueryMutationMechanismEmitter;
};

type QueryMutationOrchestrator = {
  togglePriceSelector: () => void;
  toggleIncludeSimilar: () => void;
  toggleRising: () => void;
  toggleOpenNow: () => void;
  commitPriceSelection: () => void;
  closePriceSelector: () => void;
  dismissPriceSelector: () => void;
  handlePriceDone: () => void;
};

export const useQueryMutationOrchestrator = (
  args: UseQueryMutationOrchestratorArgs
): QueryMutationOrchestrator => {
  const {
    searchRuntimeBus,
    searchMode,
    activeTab,
    submittedQuery,
    query,
    isSearchSessionActive,
    pendingPriceRange,
    setPendingPriceRange,
    isPriceSelectorVisible,
    setIsPriceSelectorVisible,
    priceLevels,
    scheduleToggleCommit,
    rerunActiveSearch,
    applyIncludeSimilarLocalSwap,
    resultsRuntimeOwner,
    priceSheetRef,
    captureFreshTupleBounds,
    onMechanismEvent,
  } = args;

  // Chip commits are COMMIT MOMENTS (charter §2): adopt the settled camera into the tuple
  // in the same write as the variant flip, so the rerun resolves against the viewport the
  // user is looking at — the zoom-then-toggle lane needs no special casing anywhere else.
  // The flip value is read AFTER the capture lands so rapid re-taps stay correct.
  const writeChipVariantTuple = React.useCallback(
    (
      buildFilterVariant: () => {
        openNow?: boolean;
        priceLevels?: number[];
        rising?: boolean;
        includeSimilar?: boolean;
      },
      cause: 'chip_open_now' | 'chip_rising' | 'chip_price' | 'chip_include_similar'
    ) => {
      void captureFreshTupleBounds()
        .catch(() => null)
        .then((committedBounds) => {
          writeSearchDesiredTuple(
            searchRuntimeBus,
            {
              filterVariant: buildFilterVariant(),
              ...(committedBounds != null ? { committedBounds } : {}),
            },
            cause
          );
        });
    },
    [captureFreshTupleBounds, searchRuntimeBus]
  );

  const pendingPriceRangeRef = React.useRef<PriceRangeTuple>(pendingPriceRange);

  React.useEffect(() => {
    pendingPriceRangeRef.current = pendingPriceRange;
  }, [pendingPriceRange]);

  React.useEffect(() => {
    if (!isPriceSelectorVisible) {
      const nextRange = getRangeFromLevels(priceLevels);
      const currentRange = pendingPriceRangeRef.current;
      if (currentRange[0] !== nextRange[0] || currentRange[1] !== nextRange[1]) {
        setPendingPriceRange(nextRange);
      }
    }
  }, [isPriceSelectorVisible, priceLevels, setPendingPriceRange]);

  const emitMutationCoalesced = React.useCallback(
    (payload: Record<string, unknown>) => {
      onMechanismEvent?.('query_mutation_coalesced', payload);
    },
    [onMechanismEvent]
  );

  const canRerunForCurrentQuery = React.useCallback(() => {
    const hasCommittedQuery = Boolean((isSearchSessionActive ? submittedQuery : query).trim());
    return searchMode === 'shortcut' || hasCommittedQuery;
  }, [isSearchSessionActive, query, searchMode, submittedQuery]);

  const clearPendingTabSwitchDraft = React.useCallback(() => {
    searchRuntimeBus.publish({
      pendingTabSwitchTab: null,
    });
  }, [searchRuntimeBus]);

  const fireRerunActiveSearch = React.useCallback(
    (options: RerunActiveSearchOptions) => {
      void rerunActiveSearch(options).catch((error) => {
        logger.warn('Toggle rerun failed', {
          message: error instanceof Error ? error.message : 'unknown error',
        });
      });
    },
    [rerunActiveSearch]
  );

  // TR5-N: the ONE network-chip commit shape (open-now / rising / price / mid-pagination
  // include-similar). The tab toggle is the template: the runner resolves the next variant's
  // DATA before any reveal — here that means arming the pending interaction cover (keyed to
  // the TOGGLE INTENT so the coordinator finalizes at reveal settle) and firing the rerun as a
  // 'variant_rerun' submission. The submit machinery defers ALL staging; the enter transaction
  // is staged at response commit (handlePageOneResultsCommitted), data-keyed — the reveal can
  // never run on stale data.
  const runVariantRerunToggleCommit = React.useCallback(
    ({ intentId, filters }: { intentId: string; filters: StructuredSearchFilters }) => {
      resultsRuntimeOwner.clearStagedSearchSurfaceResultsTransaction();
      resultsRuntimeOwner.beginVariantRerunPresentationPending(intentId);
      // Read the rerun identity from the bus at COMMIT time. The prop copies thread through
      // lane memos that can go stale across commits (the openNow flip bug had the same shape);
      // a stale/empty submittedQuery here silently no-ops the rerun and leaves the cover armed
      // until the watchdog force-commits.
      const busState = searchRuntimeBus.getState();
      fireRerunActiveSearch({
        searchMode: busState.searchMode ?? searchMode,
        activeTab: busState.activeTab ?? activeTab,
        submittedQuery: busState.submittedQuery || submittedQuery,
        query,
        isSearchSessionActive: busState.isSearchSessionActive || isSearchSessionActive,
        preserveSheetState: true,
        presentationIntentKind: 'variant_rerun',
        filters,
      });
      return {
        awaitVisualSync: true as const,
      };
    },
    [
      activeTab,
      fireRerunActiveSearch,
      isSearchSessionActive,
      query,
      resultsRuntimeOwner,
      searchMode,
      searchRuntimeBus,
      submittedQuery,
    ]
  );

  // S2 THIN READER (charter §7): trigger sources WRITE the desired tuple; this subscription
  // adapts each filter-variant change into the existing commit lanes (schedule/debounce/
  // choreography unchanged). It is the only place a filter tuple change becomes a commit —
  // chips, price sheet, deep links, and any future source converge here by construction.
  // Deleted in S4 when the reconciler+resolver own resolution.
  const lastReadDesiredTupleRef = React.useRef(searchRuntimeBus.getState().desiredTuple);
  React.useEffect(() => {
    lastReadDesiredTupleRef.current = searchRuntimeBus.getState().desiredTuple;
    return searchRuntimeBus.subscribe(
      () => {
        const state = searchRuntimeBus.getState();
        const prev = lastReadDesiredTupleRef.current;
        const next = state.desiredTuple;
        if (prev === next) {
          return;
        }
        lastReadDesiredTupleRef.current = next;
        const cause = state.desiredTupleCause;
        if (
          cause !== 'chip_open_now' &&
          cause !== 'chip_rising' &&
          cause !== 'chip_price' &&
          cause !== 'chip_include_similar'
        ) {
          // Only USER VARIANT intents commit through this reader. Seeding restores state,
          // dismiss/submit writes reset the variant as part of their own lanes' choreography
          // (those lanes convert to the reconciler in S4) — none of them re-run a search here.
          return;
        }
        const prevFilters = prev.filterVariant;
        const nextFilters = next.filterVariant;
        const priceChanged =
          prevFilters.priceLevels.length !== nextFilters.priceLevels.length ||
          nextFilters.priceLevels.some((value, index) => value !== prevFilters.priceLevels[index]);
        if (prevFilters.openNow !== nextFilters.openNow) {
          if (!canRerunForCurrentQuery()) {
            return;
          }
          scheduleToggleCommit(
            ({ intentId }) =>
              runVariantRerunToggleCommit({
                intentId,
                filters: { openNow: nextFilters.openNow },
              }),
            { kind: 'filter_open_now' }
          );
          return;
        }
        if (prevFilters.rising !== nextFilters.rising) {
          if (!canRerunForCurrentQuery()) {
            return;
          }
          scheduleToggleCommit(
            ({ intentId }) =>
              runVariantRerunToggleCommit({
                intentId,
                filters: { rising: nextFilters.rising },
              }),
            { kind: 'filter_rising' }
          );
          return;
        }
        if (priceChanged) {
          if (!canRerunForCurrentQuery()) {
            return;
          }
          scheduleToggleCommit(
            ({ intentId }) =>
              runVariantRerunToggleCommit({
                intentId,
                filters: { priceLevels: [...nextFilters.priceLevels] },
              }),
            { kind: 'filter_price' }
          );
          return;
        }
        if (prevFilters.includeSimilar !== nextFilters.includeSimilar) {
          if (!canRerunForCurrentQuery()) {
            return;
          }
          scheduleToggleCommit(
            ({ intentId }) => {
              // Page-1 flip is ZERO-NETWORK: the client already holds the exact + similar
              // sets from the page-1 response — swap the committed variant locally and
              // drive the shared toggle choreography exactly like the tab toggle.
              const nextTab = searchRuntimeBus.getState().activeTab;
              const swappedLocally = applyIncludeSimilarLocalSwap({
                nextIncludeSimilar: nextFilters.includeSimilar,
                targetTab: nextTab,
              });
              if (swappedLocally) {
                resultsRuntimeOwner.clearStagedSearchSurfaceResultsTransaction();
                getSearchSurfaceRuntime().beginRedrawTransaction({
                  reason: 'toggle',
                  transactionId: intentId,
                  targetTab: nextTab,
                  coverState: 'interaction_loading',
                });
                resultsRuntimeOwner.stageSearchSurfaceResultsTransaction(
                  createSearchSurfaceResultsEnterTransaction(
                    intentId,
                    'initial_search',
                    'interaction_loading',
                    null,
                    'cache'
                  )
                );
                return {
                  awaitVisualSync: true,
                };
              }
              // Mid-pagination (page > 1) or no local similar data: fresh network rerun.
              return runVariantRerunToggleCommit({
                intentId,
                filters: { includeSimilar: nextFilters.includeSimilar },
              });
            },
            { kind: 'filter_include_similar' }
          );
        }
      },
      ['desiredTuple'],
      'desired_tuple_filter_reader'
    );
  }, [
    applyIncludeSimilarLocalSwap,
    canRerunForCurrentQuery,
    resultsRuntimeOwner,
    runVariantRerunToggleCommit,
    scheduleToggleCommit,
    searchRuntimeBus,
  ]);

  const toggleIncludeSimilar = React.useCallback(() => {
    setIsPriceSelectorVisible(false);
    clearPendingTabSwitchDraft();
    // S2: the trigger only WRITES the tuple (optimistic chip flip via the legacy
    // projection in the same publish); the desired-tuple reader owns the commit.
    writeChipVariantTuple(
      () => ({
        includeSimilar: !searchRuntimeBus.getState().desiredTuple.filterVariant.includeSimilar,
      }),
      'chip_include_similar'
    );
  }, [
    clearPendingTabSwitchDraft,
    searchRuntimeBus,
    setIsPriceSelectorVisible,
    writeChipVariantTuple,
  ]);

  const toggleRising = React.useCallback(() => {
    setIsPriceSelectorVisible(false);
    clearPendingTabSwitchDraft();
    writeChipVariantTuple(
      () => ({
        rising: !searchRuntimeBus.getState().desiredTuple.filterVariant.rising,
      }),
      'chip_rising'
    );
  }, [
    clearPendingTabSwitchDraft,
    searchRuntimeBus,
    setIsPriceSelectorVisible,
    writeChipVariantTuple,
  ]);

  const toggleOpenNow = React.useCallback(() => {
    setIsPriceSelectorVisible(false);
    clearPendingTabSwitchDraft();
    writeChipVariantTuple(
      () => ({
        openNow: !searchRuntimeBus.getState().desiredTuple.filterVariant.openNow,
      }),
      'chip_open_now'
    );
  }, [
    clearPendingTabSwitchDraft,
    searchRuntimeBus,
    setIsPriceSelectorVisible,
    writeChipVariantTuple,
  ]);

  const commitPriceSelection = React.useCallback(() => {
    const snapshot = pendingPriceRangeRef.current;
    const sheet = priceSheetRef.current;
    if (sheet) {
      sheet.requestClose();
    } else {
      setIsPriceSelectorVisible(false);
    }

    const normalizedRange = normalizePriceRangeValues(snapshot);
    const shouldClear = isFullPriceRange(normalizedRange);
    const nextLevels = shouldClear ? [] : buildLevelsFromRange(normalizedRange);
    const currentLevels = searchRuntimeBus.getState().desiredTuple.filterVariant.priceLevels;
    const hasChanged =
      nextLevels.length !== currentLevels.length ||
      nextLevels.some((value, index) => value !== currentLevels[index]);

    if (!hasChanged) {
      emitMutationCoalesced({ reason: 'price_filter_duplicate_intent' });
      return;
    }
    clearPendingTabSwitchDraft();
    // S2: the price sheet is DRAFT state (widget-owned sliders) committed as ONE tuple
    // write at the Done gesture; the desired-tuple reader owns the rerun commit.
    writeChipVariantTuple(() => ({ priceLevels: nextLevels }), 'chip_price');
  }, [
    writeChipVariantTuple,
    clearPendingTabSwitchDraft,
    emitMutationCoalesced,
    priceSheetRef,
    searchRuntimeBus,
    setIsPriceSelectorVisible,
  ]);

  const closePriceSelector = React.useCallback(() => {
    setIsPriceSelectorVisible(false);
  }, [setIsPriceSelectorVisible]);

  const dismissPriceSelector = React.useCallback(() => {
    const sheet = priceSheetRef.current;
    if (sheet) {
      sheet.requestClose();
      return;
    }
    closePriceSelector();
  }, [closePriceSelector, priceSheetRef]);

  const togglePriceSelector = React.useCallback(() => {
    if (isPriceSelectorVisible) {
      commitPriceSelection();
      return;
    }
    setIsPriceSelectorVisible(true);
  }, [commitPriceSelection, isPriceSelectorVisible, setIsPriceSelectorVisible]);

  const handlePriceDone = React.useCallback(() => {
    commitPriceSelection();
  }, [commitPriceSelection]);

  return {
    togglePriceSelector,
    toggleIncludeSimilar,
    toggleRising,
    toggleOpenNow,
    commitPriceSelection,
    closePriceSelector,
    dismissPriceSelector,
    handlePriceDone,
  };
};
