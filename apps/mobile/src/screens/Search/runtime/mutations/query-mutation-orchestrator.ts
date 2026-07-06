import React from 'react';

import { logger } from '../../../../utils';
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
  openNow: boolean;
  includeSimilarActive: boolean;
  risingActive: boolean;
  pendingPriceRange: PriceRangeTuple;
  setPendingPriceRange: (next: PriceRangeTuple) => void;
  isPriceSelectorVisible: boolean;
  setIsPriceSelectorVisible: (next: boolean) => void;
  priceLevels: number[];
  setIncludeSimilar: (next: boolean) => void;
  setRisingActive: (next: boolean) => void;
  setOpenNow: (next: boolean) => void;
  setPriceLevels: (next: number[]) => void;
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
    openNow,
    includeSimilarActive,
    risingActive,
    pendingPriceRange,
    setPendingPriceRange,
    isPriceSelectorVisible,
    setIsPriceSelectorVisible,
    priceLevels,
    setIncludeSimilar,
    setRisingActive,
    setOpenNow,
    setPriceLevels,
    scheduleToggleCommit,
    rerunActiveSearch,
    applyIncludeSimilarLocalSwap,
    resultsRuntimeOwner,
    priceSheetRef,
    onMechanismEvent,
  } = args;

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

  const toggleIncludeSimilar = React.useCallback(() => {
    setIsPriceSelectorVisible(false);
    clearPendingTabSwitchDraft();
    // R1c single-writer: read the current value from the bus at press time (see toggleOpenNow) —
    // the chip flip publishes optimistically on press-up.
    const nextValue = !searchRuntimeBus.getState().includeSimilarActive;
    setIncludeSimilar(nextValue);
    if (!canRerunForCurrentQuery()) {
      return;
    }
    scheduleToggleCommit(
      ({ intentId }) => {
        // Page-1 flip is ZERO-NETWORK: the client already holds the exact + similar sets
        // from the page-1 response — swap the committed variant locally and drive the
        // shared toggle choreography exactly like the (also zero-network) tab toggle:
        // redraw transaction + staged enter transaction, then await visual sync.
        const nextTab = searchRuntimeBus.getState().activeTab;
        const swappedLocally = applyIncludeSimilarLocalSwap({
          nextIncludeSimilar: nextValue,
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
        // Mid-pagination (page > 1) or no local similar data: reset to top via a fresh
        // network rerun carrying the new includeSimilar value (the shared variant-rerun shape).
        return runVariantRerunToggleCommit({
          intentId,
          filters: { includeSimilar: nextValue },
        });
      },
      { kind: 'filter_include_similar' }
    );
  }, [
    activeTab,
    applyIncludeSimilarLocalSwap,
    canRerunForCurrentQuery,
    clearPendingTabSwitchDraft,
    fireRerunActiveSearch,
    includeSimilarActive,
    isSearchSessionActive,
    query,
    resultsRuntimeOwner,
    scheduleToggleCommit,
    searchRuntimeBus,
    searchMode,
    setIncludeSimilar,
    setIsPriceSelectorVisible,
    submittedQuery,
  ]);

  const toggleRising = React.useCallback(() => {
    setIsPriceSelectorVisible(false);
    clearPendingTabSwitchDraft();
    // R1c single-writer: read the current value from the bus at press time (see toggleOpenNow).
    const nextValue = !searchRuntimeBus.getState().risingActive;
    setRisingActive(nextValue);
    if (!canRerunForCurrentQuery()) {
      return;
    }
    scheduleToggleCommit(
      ({ intentId }) =>
        runVariantRerunToggleCommit({
          intentId,
          filters: { rising: nextValue },
        }),
      { kind: 'filter_rising' }
    );
  }, [
    activeTab,
    canRerunForCurrentQuery,
    clearPendingTabSwitchDraft,
    fireRerunActiveSearch,
    isSearchSessionActive,
    query,
    risingActive,
    scheduleToggleCommit,
    searchRuntimeBus,
    searchMode,
    setIsPriceSelectorVisible,
    setRisingActive,
    submittedQuery,
  ]);

  const toggleOpenNow = React.useCallback(() => {
    setIsPriceSelectorVisible(false);
    clearPendingTabSwitchDraft();
    // R1c single-writer: the CURRENT value is read from the bus at press time (same source the
    // setter writes and the request lane reads) — the `openNow` prop threads through lane memos
    // that proved stale across variant-rerun commits, which froze the flip (every tap recomputed
    // the same nextValue). commitPriceSelection already reads the bus this way.
    const nextValue = !searchRuntimeBus.getState().openNow;
    setOpenNow(nextValue);
    if (!canRerunForCurrentQuery()) {
      return;
    }
    scheduleToggleCommit(
      ({ intentId }) =>
        runVariantRerunToggleCommit({
          intentId,
          filters: { openNow: nextValue },
        }),
      { kind: 'filter_open_now' }
    );
  }, [
    activeTab,
    canRerunForCurrentQuery,
    clearPendingTabSwitchDraft,
    fireRerunActiveSearch,
    isSearchSessionActive,
    openNow,
    query,
    scheduleToggleCommit,
    searchRuntimeBus,
    searchMode,
    setIsPriceSelectorVisible,
    setOpenNow,
    submittedQuery,
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
    const currentLevels = searchRuntimeBus.getState().priceLevels;
    const hasChanged =
      nextLevels.length !== currentLevels.length ||
      nextLevels.some((value, index) => value !== currentLevels[index]);

    if (!hasChanged) {
      emitMutationCoalesced({ reason: 'price_filter_duplicate_intent' });
      return;
    }
    clearPendingTabSwitchDraft();

    if (!canRerunForCurrentQuery()) {
      setPriceLevels(nextLevels);
      return;
    }

    scheduleToggleCommit(
      ({ intentId }) => {
        setPriceLevels(nextLevels);
        return runVariantRerunToggleCommit({
          intentId,
          filters: { priceLevels: nextLevels },
        });
      },
      { kind: 'filter_price' }
    );
  }, [
    activeTab,
    canRerunForCurrentQuery,
    clearPendingTabSwitchDraft,
    emitMutationCoalesced,
    fireRerunActiveSearch,
    isSearchSessionActive,
    priceSheetRef,
    query,
    scheduleToggleCommit,
    searchMode,
    searchRuntimeBus,
    setIsPriceSelectorVisible,
    setPriceLevels,
    submittedQuery,
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
