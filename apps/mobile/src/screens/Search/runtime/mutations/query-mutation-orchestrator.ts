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
    'clearStagedSearchSurfaceResultsTransaction' | 'stageSearchSurfaceResultsTransaction'
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

  const toggleIncludeSimilar = React.useCallback(() => {
    setIsPriceSelectorVisible(false);
    clearPendingTabSwitchDraft();
    const nextValue = !includeSimilarActive;
    // R1c single-writer: the setter publishes to the bus (the runtime authority) — chips and
    // read-models all read the same bus value immediately (optimistic pill flip on press-up).
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
        // network rerun carrying the new includeSimilar value (toggleOpenNow's shape).
        fireRerunActiveSearch({
          searchMode,
          activeTab,
          submittedQuery,
          query,
          isSearchSessionActive,
          preserveSheetState: true,
          filters: { includeSimilar: nextValue },
        });
        return {
          awaitVisualSync: true,
        };
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
    const nextValue = !risingActive;
    // R1c single-writer: the setter publishes to the bus (the runtime authority) — chips and
    // read-models all read the same bus value immediately.
    setRisingActive(nextValue);
    if (!canRerunForCurrentQuery()) {
      return;
    }
    scheduleToggleCommit(
      () => {
        fireRerunActiveSearch({
          searchMode,
          activeTab,
          submittedQuery,
          query,
          isSearchSessionActive,
          preserveSheetState: true,
          filters: { rising: nextValue },
        });
        return {
          awaitVisualSync: true,
        };
      },
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
    const nextValue = !openNow;
    // R1c single-writer: the setter publishes to the bus (the runtime authority) — chips and
    // read-models all read the same bus value immediately.
    setOpenNow(nextValue);
    if (!canRerunForCurrentQuery()) {
      return;
    }
    scheduleToggleCommit(
      () => {
        fireRerunActiveSearch({
          searchMode,
          activeTab,
          submittedQuery,
          query,
          isSearchSessionActive,
          preserveSheetState: true,
          filters: { openNow: nextValue },
        });
        return {
          awaitVisualSync: true,
        };
      },
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
      () => {
        setPriceLevels(nextLevels);
        fireRerunActiveSearch({
          searchMode,
          activeTab,
          submittedQuery,
          query,
          isSearchSessionActive,
          preserveSheetState: true,
          filters: { priceLevels: nextLevels },
        });
        return {
          awaitVisualSync: true,
        };
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
