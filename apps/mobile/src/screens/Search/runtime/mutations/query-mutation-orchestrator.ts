import React from 'react';
import { InteractionManager } from 'react-native';

import { useSearchStore } from '../../../../store/searchStore';
import {
  buildLevelsFromRange,
  getRangeFromLevels,
  isFullPriceRange,
  normalizePriceRangeValues,
  type PriceRangeTuple,
} from '../../utils/price';

type SearchMode = 'natural' | 'shortcut' | null;
type SegmentValue = 'dishes' | 'restaurants';
type ScoreMode = 'coverage_display' | 'global_quality';

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
  scoreMode?: ScoreMode;
};

type QueryMutationMechanismEmitter = (
  event: 'query_mutation_coalesced',
  payload?: Record<string, unknown>
) => void;

type UseQueryMutationOrchestratorArgs = {
  searchMode: SearchMode;
  activeTab: SegmentValue;
  submittedQuery: string;
  query: string;
  isSearchSessionActive: boolean;
  scoreMode: ScoreMode;
  pendingPriceRange: PriceRangeTuple;
  setPendingPriceRange: (next: PriceRangeTuple) => void;
  pendingScoreMode: ScoreMode;
  setPendingScoreMode: (next: ScoreMode) => void;
  isPriceSelectorVisible: boolean;
  setIsPriceSelectorVisible: (next: boolean) => void;
  isRankSelectorVisible: boolean;
  setIsRankSelectorVisible: (next: boolean) => void;
  priceLevels: number[];
  setVotes100Plus: (next: boolean) => void;
  setOpenNow: (next: boolean) => void;
  setPriceLevels: (next: number[]) => void;
  setPreferredScoreMode: (next: ScoreMode) => void;
  setIsFilterTogglePending: (next: boolean) => void;
  rerunActiveSearch: (options: RerunActiveSearchOptions) => Promise<boolean>;
  priceSheetRef: React.MutableRefObject<{ requestClose: () => void } | null>;
  rankSheetRef: React.MutableRefObject<{ requestClose: () => void } | null>;
  minimumVotesFilter: number;
  onMechanismEvent?: QueryMutationMechanismEmitter;
  filterToggleDebounceMs?: number;
  priceSelectionDebounceMs?: number;
};

type QueryMutationOrchestrator = {
  togglePriceSelector: () => void;
  toggleVotesFilter: () => void;
  toggleOpenNow: () => void;
  commitPriceSelection: () => void;
  closePriceSelector: () => void;
  dismissPriceSelector: () => void;
  commitRankSelection: () => void;
  closeRankSelector: () => void;
  dismissRankSelector: () => void;
  toggleRankSelector: () => void;
  handlePriceDone: () => void;
  handleScoreModeChange: (nextMode: ScoreMode) => void;
  cancelPendingMutationWork: () => void;
};

export const useQueryMutationOrchestrator = (
  args: UseQueryMutationOrchestratorArgs
): QueryMutationOrchestrator => {
  const {
    searchMode,
    activeTab,
    submittedQuery,
    query,
    isSearchSessionActive,
    scoreMode,
    pendingPriceRange,
    setPendingPriceRange,
    pendingScoreMode,
    setPendingScoreMode,
    isPriceSelectorVisible,
    setIsPriceSelectorVisible,
    isRankSelectorVisible,
    setIsRankSelectorVisible,
    priceLevels,
    setVotes100Plus,
    setOpenNow,
    setPriceLevels,
    setPreferredScoreMode,
    setIsFilterTogglePending,
    rerunActiveSearch,
    priceSheetRef,
    rankSheetRef,
    minimumVotesFilter,
    onMechanismEvent,
    filterToggleDebounceMs = 600,
    priceSelectionDebounceMs = 150,
  } = args;

  const pendingPriceRangeRef = React.useRef<PriceRangeTuple>(pendingPriceRange);
  const pendingScoreModeRef = React.useRef<ScoreMode>(pendingScoreMode);
  const filterDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggleFilterDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterToggleRequestRef = React.useRef(0);

  React.useEffect(() => {
    pendingPriceRangeRef.current = pendingPriceRange;
  }, [pendingPriceRange]);

  React.useEffect(() => {
    pendingScoreModeRef.current = pendingScoreMode;
  }, [pendingScoreMode]);

  React.useEffect(() => {
    if (!isPriceSelectorVisible) {
      const nextRange = getRangeFromLevels(priceLevels);
      const currentRange = pendingPriceRangeRef.current;
      if (currentRange[0] !== nextRange[0] || currentRange[1] !== nextRange[1]) {
        setPendingPriceRange(nextRange);
      }
    }
  }, [isPriceSelectorVisible, priceLevels, setPendingPriceRange]);

  React.useEffect(() => {
    if (!isRankSelectorVisible && pendingScoreModeRef.current !== scoreMode) {
      setPendingScoreMode(scoreMode);
    }
  }, [isRankSelectorVisible, scoreMode, setPendingScoreMode]);

  const emitMutationCoalesced = React.useCallback(
    (payload: Record<string, unknown>) => {
      onMechanismEvent?.('query_mutation_coalesced', payload);
    },
    [onMechanismEvent]
  );

  const cancelPendingMutationWork = React.useCallback(() => {
    if (filterDebounceRef.current) {
      clearTimeout(filterDebounceRef.current);
      filterDebounceRef.current = null;
    }
    if (toggleFilterDebounceRef.current) {
      clearTimeout(toggleFilterDebounceRef.current);
      toggleFilterDebounceRef.current = null;
    }
  }, []);

  React.useEffect(() => () => cancelPendingMutationWork(), [cancelPendingMutationWork]);

  const canRerunForCurrentQuery = React.useCallback(() => {
    const hasCommittedQuery = Boolean((isSearchSessionActive ? submittedQuery : query).trim());
    return searchMode === 'shortcut' || hasCommittedQuery;
  }, [isSearchSessionActive, query, searchMode, submittedQuery]);

  const scheduleFilterToggleSearch = React.useCallback(
    (runSearch: () => Promise<void>, options?: { showOverlay?: boolean }) => {
      const shouldShowOverlay = options?.showOverlay !== false;
      if (shouldShowOverlay) {
        setIsFilterTogglePending(true);
      }
      const previousRequestId = filterToggleRequestRef.current;
      const requestId = (filterToggleRequestRef.current += 1);
      if (toggleFilterDebounceRef.current) {
        clearTimeout(toggleFilterDebounceRef.current);
        emitMutationCoalesced({
          reason: 'toggle_debounce_superseded',
          previousRequestId,
          requestId,
        });
      }
      toggleFilterDebounceRef.current = setTimeout(() => {
        toggleFilterDebounceRef.current = null;
        const execute = async () => {
          try {
            await runSearch();
          } finally {
            if (shouldShowOverlay && filterToggleRequestRef.current === requestId) {
              setIsFilterTogglePending(false);
            }
          }
        };
        void execute();
      }, filterToggleDebounceMs);
    },
    [emitMutationCoalesced, filterToggleDebounceMs, setIsFilterTogglePending]
  );

  const toggleVotesFilter = React.useCallback(() => {
    setIsPriceSelectorVisible(false);
    setIsRankSelectorVisible(false);
    const nextValue = !useSearchStore.getState().votes100Plus;
    setVotes100Plus(nextValue);
    if (!canRerunForCurrentQuery()) {
      return;
    }
    const minimumVotes = nextValue ? minimumVotesFilter : null;
    scheduleFilterToggleSearch(async () => {
      await rerunActiveSearch({
        searchMode,
        activeTab,
        submittedQuery,
        query,
        isSearchSessionActive,
        preserveSheetState: true,
        filters: { minimumVotes },
      });
    });
  }, [
    activeTab,
    canRerunForCurrentQuery,
    isSearchSessionActive,
    minimumVotesFilter,
    query,
    rerunActiveSearch,
    scheduleFilterToggleSearch,
    searchMode,
    setIsPriceSelectorVisible,
    setIsRankSelectorVisible,
    setVotes100Plus,
    submittedQuery,
  ]);

  const handleScoreModeChange = React.useCallback(
    (nextMode: ScoreMode) => {
      if (nextMode === scoreMode) {
        emitMutationCoalesced({
          reason: 'score_mode_duplicate_intent',
          scoreMode: nextMode,
        });
        return;
      }
      setPreferredScoreMode(nextMode);
      if (!canRerunForCurrentQuery()) {
        return;
      }
      scheduleFilterToggleSearch(
        async () => {
          await rerunActiveSearch({
            searchMode,
            activeTab,
            submittedQuery,
            query,
            isSearchSessionActive,
            preserveSheetState: true,
            scoreMode: nextMode,
          });
        },
        { showOverlay: false }
      );
    },
    [
      activeTab,
      canRerunForCurrentQuery,
      emitMutationCoalesced,
      isSearchSessionActive,
      query,
      rerunActiveSearch,
      scheduleFilterToggleSearch,
      scoreMode,
      searchMode,
      setPreferredScoreMode,
      submittedQuery,
    ]
  );

  const toggleOpenNow = React.useCallback(() => {
    setIsPriceSelectorVisible(false);
    setIsRankSelectorVisible(false);
    const nextValue = !useSearchStore.getState().openNow;
    setOpenNow(nextValue);
    if (!canRerunForCurrentQuery()) {
      return;
    }
    scheduleFilterToggleSearch(async () => {
      await rerunActiveSearch({
        searchMode,
        activeTab,
        submittedQuery,
        query,
        isSearchSessionActive,
        preserveSheetState: true,
        filters: { openNow: nextValue },
      });
    });
  }, [
    activeTab,
    canRerunForCurrentQuery,
    isSearchSessionActive,
    query,
    rerunActiveSearch,
    scheduleFilterToggleSearch,
    searchMode,
    setIsPriceSelectorVisible,
    setIsRankSelectorVisible,
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
    requestAnimationFrame(() => {
      void InteractionManager.runAfterInteractions(() => {
        const normalizedRange = normalizePriceRangeValues(snapshot);
        const shouldClear = isFullPriceRange(normalizedRange);
        const nextLevels = shouldClear ? [] : buildLevelsFromRange(normalizedRange);
        const currentLevels = useSearchStore.getState().priceLevels;
        const hasChanged =
          nextLevels.length !== currentLevels.length ||
          nextLevels.some((value, index) => value !== currentLevels[index]);
        if (!hasChanged) {
          return;
        }
        setPriceLevels(nextLevels);
        if (!canRerunForCurrentQuery()) {
          return;
        }
        if (filterDebounceRef.current) {
          clearTimeout(filterDebounceRef.current);
          emitMutationCoalesced({
            reason: 'price_debounce_superseded',
          });
        }
        filterDebounceRef.current = setTimeout(() => {
          filterDebounceRef.current = null;
          void rerunActiveSearch({
            searchMode,
            activeTab,
            submittedQuery,
            query,
            isSearchSessionActive,
            preserveSheetState: true,
            filters: { priceLevels: nextLevels },
          });
        }, priceSelectionDebounceMs);
      });
    });
  }, [
    activeTab,
    canRerunForCurrentQuery,
    emitMutationCoalesced,
    isSearchSessionActive,
    priceSelectionDebounceMs,
    priceSheetRef,
    query,
    rerunActiveSearch,
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

  const commitRankSelection = React.useCallback(() => {
    const snapshot = pendingScoreModeRef.current;
    const sheet = rankSheetRef.current;
    if (sheet) {
      sheet.requestClose();
    } else {
      setIsRankSelectorVisible(false);
    }
    requestAnimationFrame(() => {
      void InteractionManager.runAfterInteractions(() => {
        handleScoreModeChange(snapshot);
      });
    });
  }, [handleScoreModeChange, rankSheetRef, setIsRankSelectorVisible]);

  const closeRankSelector = React.useCallback(() => {
    setIsRankSelectorVisible(false);
  }, [setIsRankSelectorVisible]);

  const dismissRankSelector = React.useCallback(() => {
    const sheet = rankSheetRef.current;
    if (sheet) {
      sheet.requestClose();
      return;
    }
    closeRankSelector();
  }, [closeRankSelector, rankSheetRef]);

  const toggleRankSelector = React.useCallback(() => {
    if (isRankSelectorVisible) {
      commitRankSelection();
      return;
    }
    setIsPriceSelectorVisible(false);
    if (pendingScoreModeRef.current !== scoreMode) {
      setPendingScoreMode(scoreMode);
    }
    setIsRankSelectorVisible(true);
  }, [
    commitRankSelection,
    isRankSelectorVisible,
    scoreMode,
    setIsPriceSelectorVisible,
    setIsRankSelectorVisible,
    setPendingScoreMode,
  ]);

  const togglePriceSelector = React.useCallback(() => {
    setIsRankSelectorVisible(false);
    if (isPriceSelectorVisible) {
      commitPriceSelection();
      return;
    }
    setIsPriceSelectorVisible(true);
  }, [
    commitPriceSelection,
    isPriceSelectorVisible,
    setIsPriceSelectorVisible,
    setIsRankSelectorVisible,
  ]);

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
    commitRankSelection,
    closeRankSelector,
    dismissRankSelector,
    toggleRankSelector,
    handlePriceDone,
    handleScoreModeChange,
    cancelPendingMutationWork,
  };
};
