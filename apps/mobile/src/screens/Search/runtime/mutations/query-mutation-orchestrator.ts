import React from 'react';

import { useSearchStore } from '../../../../store/searchStore';
import { logger } from '../../../../utils';
import type {
  ToggleCommitOptions,
  ToggleCommitOutcome,
} from './use-toggle-interaction-coordinator';
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
  searchRuntimeBus: SearchRuntimeBus;
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
  scheduleToggleCommit: (
    runner: () => ToggleCommitOutcome | void,
    options?: ToggleCommitOptions
  ) => void;
  rerunActiveSearch: (options: RerunActiveSearchOptions) => Promise<void>;
  priceSheetRef: React.MutableRefObject<{ requestClose: () => void } | null>;
  rankSheetRef: React.MutableRefObject<{ requestClose: () => void } | null>;
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
  commitRankSelection: () => void;
  closeRankSelector: () => void;
  dismissRankSelector: () => void;
  toggleRankSelector: () => void;
  handlePriceDone: () => void;
  handleScoreModeChange: (nextMode: ScoreMode) => void;
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
    scheduleToggleCommit,
    rerunActiveSearch,
    priceSheetRef,
    rankSheetRef,
    minimumVotesFilter,
    onMechanismEvent,
  } = args;

  const pendingPriceRangeRef = React.useRef<PriceRangeTuple>(pendingPriceRange);
  const pendingScoreModeRef = React.useRef<ScoreMode>(pendingScoreMode);

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
    setIsRankSelectorVisible(false);
    clearPendingTabSwitchDraft();
    const runtimeVotesFilterActive = searchRuntimeBus.getState().votesFilterActive;
    const nextValue = !runtimeVotesFilterActive;
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
      clearPendingTabSwitchDraft();
      const nextRankButtonIsActive = nextMode === 'global_quality';
      const nextRankButtonLabelText = nextRankButtonIsActive ? 'Global' : 'Rank';
      if (!canRerunForCurrentQuery()) {
        searchRuntimeBus.publish({
          rankButtonLabelText: nextRankButtonLabelText,
          rankButtonIsActive: nextRankButtonIsActive,
        });
        setPreferredScoreMode(nextMode);
        return;
      }
      scheduleToggleCommit(
        () => {
          setPreferredScoreMode(nextMode);
          fireRerunActiveSearch({
            searchMode,
            activeTab,
            submittedQuery,
            query,
            isSearchSessionActive,
            preserveSheetState: true,
            scoreMode: nextMode,
          });
          return {
            awaitVisualSync: true,
          };
        },
        { kind: 'filter_rank' }
      );
      searchRuntimeBus.publish({
        rankButtonLabelText: nextRankButtonLabelText,
        rankButtonIsActive: nextRankButtonIsActive,
      });
    },
    [
      activeTab,
      canRerunForCurrentQuery,
      clearPendingTabSwitchDraft,
      emitMutationCoalesced,
      fireRerunActiveSearch,
      isSearchSessionActive,
      query,
      scheduleToggleCommit,
      scoreMode,
      searchRuntimeBus,
      searchMode,
      setPreferredScoreMode,
      submittedQuery,
    ]
  );

  const toggleOpenNow = React.useCallback(() => {
    setIsPriceSelectorVisible(false);
    setIsRankSelectorVisible(false);
    clearPendingTabSwitchDraft();
    const runtimeOpenNow = searchRuntimeBus.getState().openNow;
    const nextValue = !runtimeOpenNow;
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
    query,
    scheduleToggleCommit,
    searchRuntimeBus,
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

  const commitRankSelection = React.useCallback(() => {
    const snapshot = pendingScoreModeRef.current;
    const sheet = rankSheetRef.current;
    if (sheet) {
      sheet.requestClose();
    } else {
      setIsRankSelectorVisible(false);
    }
    handleScoreModeChange(snapshot);
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
  };
};
