import React from 'react';

import { useSearchStore } from '../../../../store/searchStore';
import { logger } from '../../../../utils';
import type { ScheduleToggleCommit } from '../shared/results-toggle-interaction-contract';
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
  minimumVotes?: number | null;
  openNow?: boolean;
  priceLevels?: number[];
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
  votesFilterActive: boolean;
  pendingPriceRange: PriceRangeTuple;
  setPendingPriceRange: (next: PriceRangeTuple) => void;
  isPriceSelectorVisible: boolean;
  setIsPriceSelectorVisible: (next: boolean) => void;
  priceLevels: number[];
  setVotes100Plus: (next: boolean) => void;
  setOpenNow: (next: boolean) => void;
  setPriceLevels: (next: number[]) => void;
  scheduleToggleCommit: ScheduleToggleCommit;
  rerunActiveSearch: (options: RerunActiveSearchOptions) => Promise<void>;
  priceSheetRef: React.MutableRefObject<{ requestClose: () => void } | null>;
  minimumVotesFilter: number;
  onMechanismEvent?: QueryMutationMechanismEmitter;
};

type QueryMutationOrchestrator = {
  togglePriceSelector: () => void;
  toggleVotesFilter: () => void;
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
    votesFilterActive,
    pendingPriceRange,
    setPendingPriceRange,
    isPriceSelectorVisible,
    setIsPriceSelectorVisible,
    priceLevels,
    setVotes100Plus,
    setOpenNow,
    setPriceLevels,
    scheduleToggleCommit,
    rerunActiveSearch,
    priceSheetRef,
    minimumVotesFilter,
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

  const toggleVotesFilter = React.useCallback(() => {
    setIsPriceSelectorVisible(false);
    clearPendingTabSwitchDraft();
    const nextValue = !votesFilterActive;
    searchRuntimeBus.publish({
      votesFilterActive: nextValue,
    });
    if (!canRerunForCurrentQuery()) {
      setVotes100Plus(nextValue);
      return;
    }
    const minimumVotes = nextValue ? minimumVotesFilter : null;
    scheduleToggleCommit(
      () => {
        setVotes100Plus(nextValue);
        fireRerunActiveSearch({
          searchMode,
          activeTab,
          submittedQuery,
          query,
          isSearchSessionActive,
          preserveSheetState: true,
          filters: { minimumVotes },
        });
        return {
          awaitVisualSync: true,
        };
      },
      { kind: 'filter_votes' }
    );
  }, [
    activeTab,
    canRerunForCurrentQuery,
    clearPendingTabSwitchDraft,
    fireRerunActiveSearch,
    isSearchSessionActive,
    minimumVotesFilter,
    query,
    scheduleToggleCommit,
    searchRuntimeBus,
    searchMode,
    setIsPriceSelectorVisible,
    setVotes100Plus,
    submittedQuery,
    votesFilterActive,
  ]);

  const toggleOpenNow = React.useCallback(() => {
    setIsPriceSelectorVisible(false);
    clearPendingTabSwitchDraft();
    const nextValue = !openNow;
    searchRuntimeBus.publish({
      openNow: nextValue,
    });
    if (!canRerunForCurrentQuery()) {
      setOpenNow(nextValue);
      return;
    }
    scheduleToggleCommit(
      () => {
        setOpenNow(nextValue);
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
    const currentLevels = useSearchStore.getState().priceLevels;
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
    toggleVotesFilter,
    toggleOpenNow,
    commitPriceSelection,
    closePriceSelector,
    dismissPriceSelector,
    handlePriceDone,
  };
};
