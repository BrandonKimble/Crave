import React from 'react';
import {
  Extrapolation,
  interpolate,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';

import type { OverlayModalSheetHandle } from '../../../overlays/OverlayModalSheet';
import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';
import { MINIMUM_VOTES_FILTER } from '../constants/search';
import type { ScoreInfoPayload } from '../components/SearchRankAndScoreSheets';
import { useQueryMutationOrchestrator } from '../runtime/mutations/query-mutation-orchestrator';
import { formatPriceRangeSummary, getRangeFromLevels, type PriceRangeTuple } from '../utils/price';
import type { SearchScoreMode } from '../../../store/searchStore';

type SearchMode = 'natural' | 'shortcut' | null;
type SegmentValue = 'dishes' | 'restaurants';

type StructuredSearchFilters = {
  minimumVotes?: number | null;
  openNow?: boolean;
  priceLevels?: number[];
};

type UseSearchFilterModalOwnerArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  searchMode: SearchMode;
  activeTab: SegmentValue;
  submittedQuery: string;
  query: string;
  isSearchSessionActive: boolean;
  openNow: boolean;
  votesFilterActive: boolean;
  scoreMode: SearchScoreMode;
  priceLevels: number[];
  panelVisible: boolean;
  setVotes100Plus: (next: boolean) => void;
  setOpenNow: (next: boolean) => void;
  setPriceLevels: (next: number[]) => void;
  setPreferredScoreMode: (next: SearchScoreMode) => void;
  scheduleToggleCommit: Parameters<typeof useQueryMutationOrchestrator>[0]['scheduleToggleCommit'];
  rerunActiveSearch: (options: {
    searchMode: SearchMode;
    activeTab: SegmentValue;
    submittedQuery: string;
    query: string;
    isSearchSessionActive: boolean;
    preserveSheetState?: boolean;
    replaceResultsInPlace?: boolean;
    filters?: StructuredSearchFilters;
    scoreMode?: SearchScoreMode;
  }) => Promise<void>;
  registerTransientDismissor: (handler: () => void) => () => void;
  onMechanismEvent?: (event: 'query_mutation_coalesced', payload?: Record<string, unknown>) => void;
};

const arePriceRangesEqual = (a: PriceRangeTuple, b: PriceRangeTuple) =>
  Math.abs(a[0] - b[0]) < 0.001 && Math.abs(a[1] - b[1]) < 0.001;

const PRICE_SUMMARY_REEL_RANGES: PriceRangeTuple[] = [
  [1, 2],
  [1, 3],
  [1, 4],
  [1, 5],
  [2, 3],
  [2, 4],
  [2, 5],
  [3, 4],
  [3, 5],
  [4, 5],
];

const PRICE_SUMMARY_REEL_ENTRIES = PRICE_SUMMARY_REEL_RANGES.map((range) => ({
  range,
  key: `${range[0]}-${range[1]}`,
  label: formatPriceRangeSummary(range),
}));

const PRICE_SUMMARY_REEL_INDEX_BY_KEY = PRICE_SUMMARY_REEL_ENTRIES.reduce<Record<string, number>>(
  (acc, entry, index) => {
    acc[entry.key] = index;
    return acc;
  },
  {}
);

const PRICE_SUMMARY_CANDIDATES = PRICE_SUMMARY_REEL_ENTRIES.map((entry) => entry.label);
const PRICE_SUMMARY_PILL_PADDING_X = 12;
const PRICE_SUMMARY_REEL_DEFAULT_INDEX = PRICE_SUMMARY_REEL_INDEX_BY_KEY['1-5'] ?? 0;

const getPriceSummaryReelIndexFromBoundaries = (
  lowBoundary: number,
  highBoundary: number
): number => {
  'worklet';
  const low = Math.min(4, Math.max(1, lowBoundary));
  const high = Math.min(5, Math.max(low + 1, highBoundary));
  const lowFloor = Math.floor(low);
  const lowCeil = Math.min(4, lowFloor + 1);
  const highFloor = Math.floor(high);
  const highCeil = Math.min(5, highFloor + 1);
  const lowFraction = low - lowFloor;
  const highFraction = high - highFloor;

  let weightedIndex = 0;
  let totalWeight = 0;

  const applyCorner = (cornerLow: number, cornerHigh: number, weight: number) => {
    'worklet';
    if (weight <= 0) {
      return;
    }
    const key = `${cornerLow}-${cornerHigh}`;
    const cornerIndex = PRICE_SUMMARY_REEL_INDEX_BY_KEY[key];
    const resolvedIndex = cornerIndex == null ? PRICE_SUMMARY_REEL_DEFAULT_INDEX : cornerIndex;
    weightedIndex += resolvedIndex * weight;
    totalWeight += weight;
  };

  applyCorner(lowFloor, highFloor, (1 - lowFraction) * (1 - highFraction));
  applyCorner(lowFloor, highCeil, (1 - lowFraction) * highFraction);
  applyCorner(lowCeil, highFloor, lowFraction * (1 - highFraction));
  applyCorner(lowCeil, highCeil, lowFraction * highFraction);

  if (totalWeight <= 0) {
    return PRICE_SUMMARY_REEL_DEFAULT_INDEX;
  }

  return weightedIndex / totalWeight;
};

type SearchFilterModalOwner = {
  priceSheetRef: React.RefObject<OverlayModalSheetHandle | null>;
  rankSheetRef: React.RefObject<OverlayModalSheetHandle | null>;
  isPriceSelectorVisible: boolean;
  isRankSelectorVisible: boolean;
  isPriceSheetContentReady: boolean;
  pendingPriceRange: PriceRangeTuple;
  pendingScoreMode: SearchScoreMode;
  setPendingScoreMode: React.Dispatch<React.SetStateAction<SearchScoreMode>>;
  scoreInfo: ScoreInfoPayload | null;
  isScoreInfoVisible: boolean;
  openScoreInfo: (payload: ScoreInfoPayload) => void;
  closeScoreInfo: () => void;
  clearScoreInfo: () => void;
  priceButtonLabelText: string;
  priceSheetSummary: string;
  priceSummaryCandidates: readonly string[];
  priceSummaryPillPaddingX: number;
  priceSummaryPillWidth: number | null;
  measureSummaryCandidateWidth: (nextWidth: number) => void;
  priceSliderLowValue: ReturnType<typeof useSharedValue<number>>;
  priceSliderHighValue: ReturnType<typeof useSharedValue<number>>;
  handlePriceSliderCommit: (range: PriceRangeTuple) => void;
  summaryReelItems: readonly {
    key: string;
    label: string;
    index: number;
  }[];
  priceSheetSummaryReelPosition: ReturnType<typeof useDerivedValue<number>>;
  priceSheetSummaryReelNearestIndex: ReturnType<typeof useDerivedValue<number>>;
  priceSheetSummaryNeighborVisibility: ReturnType<typeof useDerivedValue<number>>;
  togglePriceSelector: () => void;
  toggleVotesFilter: () => void;
  toggleOpenNow: () => void;
  closePriceSelector: () => void;
  dismissPriceSelector: () => void;
  closeRankSelector: () => void;
  dismissRankSelector: () => void;
  toggleRankSelector: () => void;
  handlePriceDone: () => void;
  handleRankDone: () => void;
};

export const useSearchFilterModalOwner = ({
  searchRuntimeBus,
  searchMode,
  activeTab,
  submittedQuery,
  query,
  isSearchSessionActive,
  openNow,
  votesFilterActive,
  scoreMode,
  priceLevels,
  panelVisible,
  setVotes100Plus,
  setOpenNow,
  setPriceLevels,
  setPreferredScoreMode,
  scheduleToggleCommit,
  rerunActiveSearch,
  registerTransientDismissor,
  onMechanismEvent,
}: UseSearchFilterModalOwnerArgs): SearchFilterModalOwner => {
  const [isPriceSelectorVisible, setIsPriceSelectorVisible] = React.useState(false);
  const [isRankSelectorVisible, setIsRankSelectorVisible] = React.useState(false);
  const [isPriceSheetContentReady, setIsPriceSheetContentReady] = React.useState(false);
  const rankSheetRef = React.useRef<OverlayModalSheetHandle | null>(null);
  const priceSheetRef = React.useRef<OverlayModalSheetHandle | null>(null);
  const [pendingPriceRange, setPendingPriceRange] = React.useState<PriceRangeTuple>(
    () => [Math.min(...priceLevels), Math.max(...priceLevels)] as PriceRangeTuple
  );
  const [pendingScoreMode, setPendingScoreMode] = React.useState<SearchScoreMode>(scoreMode);
  const [scoreInfo, setScoreInfo] = React.useState<ScoreInfoPayload | null>(null);
  const [isScoreInfoVisible, setScoreInfoVisible] = React.useState(false);

  const openScoreInfo = React.useCallback((payload: ScoreInfoPayload) => {
    setScoreInfo(payload);
    setScoreInfoVisible(true);
  }, []);

  const closeScoreInfo = React.useCallback(() => {
    setScoreInfoVisible(false);
  }, []);

  const clearScoreInfo = React.useCallback(() => {
    setScoreInfo(null);
  }, []);

  const priceFiltersActive = priceLevels.length > 0;
  const priceButtonSummary = React.useMemo(() => {
    if (!priceLevels.length) {
      return 'Any price';
    }
    return formatPriceRangeSummary(getRangeFromLevels(priceLevels));
  }, [priceLevels]);
  const priceButtonLabelText = priceFiltersActive ? priceButtonSummary : 'Price';
  const priceSheetSummary = formatPriceRangeSummary(pendingPriceRange);

  const [priceSummaryPillWidth, setPriceSummaryPillWidth] = React.useState<number | null>(null);
  const measureSummaryCandidateWidth = React.useCallback((nextWidth: number) => {
    setPriceSummaryPillWidth((prev) => (prev != null && prev >= nextWidth ? prev : nextWidth));
  }, []);

  const priceSliderLowValue = useSharedValue(pendingPriceRange[0]);
  const priceSliderHighValue = useSharedValue(pendingPriceRange[1]);
  const priceSheetSummaryReelPosition = useDerivedValue(() =>
    getPriceSummaryReelIndexFromBoundaries(priceSliderLowValue.value, priceSliderHighValue.value)
  );
  const priceSheetSummaryReelNearestIndex = useDerivedValue(() =>
    Math.round(priceSheetSummaryReelPosition.value)
  );
  const priceSheetSummaryNeighborVisibility = useDerivedValue(() => {
    const centerOffset = Math.abs(
      priceSheetSummaryReelPosition.value - priceSheetSummaryReelNearestIndex.value
    );
    if (centerOffset < 0.001) {
      return 0;
    }
    return interpolate(centerOffset, [0, 0.03, 0.2], [0, 0.3, 1], Extrapolation.CLAMP);
  });

  const wasPriceSelectorVisibleRef = React.useRef(false);
  React.useEffect(() => {
    if (isPriceSelectorVisible && !wasPriceSelectorVisibleRef.current) {
      priceSliderLowValue.value = pendingPriceRange[0];
      priceSliderHighValue.value = pendingPriceRange[1];
    }
    wasPriceSelectorVisibleRef.current = isPriceSelectorVisible;
  }, [isPriceSelectorVisible, pendingPriceRange, priceSliderHighValue, priceSliderLowValue]);

  const handlePriceSliderCommit = React.useCallback((range: PriceRangeTuple) => {
    const applyUpdate = () => {
      setPendingPriceRange((prev) => (arePriceRangesEqual(prev, range) ? prev : range));
    };
    if (typeof React.startTransition === 'function') {
      React.startTransition(applyUpdate);
    } else {
      applyUpdate();
    }
  }, []);

  const summaryReelItems = React.useMemo(
    () =>
      PRICE_SUMMARY_REEL_ENTRIES.map((entry, index) => ({
        key: entry.key,
        label: entry.label,
        index,
      })),
    []
  );

  const {
    togglePriceSelector,
    toggleVotesFilter,
    toggleOpenNow,
    commitRankSelection,
    closePriceSelector,
    dismissPriceSelector,
    closeRankSelector,
    dismissRankSelector,
    toggleRankSelector,
    handlePriceDone,
  } = useQueryMutationOrchestrator({
    searchRuntimeBus,
    searchMode,
    activeTab,
    submittedQuery,
    query,
    isSearchSessionActive,
    openNow,
    votesFilterActive,
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
    minimumVotesFilter: MINIMUM_VOTES_FILTER,
    onMechanismEvent,
  });

  React.useEffect(() => {
    if (!panelVisible && isPriceSelectorVisible) {
      setIsPriceSelectorVisible(false);
    }
  }, [isPriceSelectorVisible, panelVisible]);

  React.useEffect(() => {
    if (!panelVisible && isRankSelectorVisible) {
      setIsRankSelectorVisible(false);
    }
  }, [isRankSelectorVisible, panelVisible]);

  React.useEffect(() => {
    if (!isPriceSelectorVisible) {
      setIsPriceSheetContentReady(false);
      return;
    }
    setIsPriceSheetContentReady(false);
    const raf = requestAnimationFrame(() => {
      setIsPriceSheetContentReady(true);
    });
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [isPriceSelectorVisible]);

  React.useEffect(() => {
    return registerTransientDismissor(() => {
      closePriceSelector();
      closeRankSelector();
      closeScoreInfo();
    });
  }, [closePriceSelector, closeRankSelector, closeScoreInfo, registerTransientDismissor]);

  const handleRankDone = React.useCallback(() => {
    commitRankSelection();
  }, [commitRankSelection]);

  return React.useMemo(
    () => ({
      priceSheetRef,
      rankSheetRef,
      isPriceSelectorVisible,
      isRankSelectorVisible,
      isPriceSheetContentReady,
      pendingPriceRange,
      pendingScoreMode,
      setPendingScoreMode,
      scoreInfo,
      isScoreInfoVisible,
      openScoreInfo,
      closeScoreInfo,
      clearScoreInfo,
      priceButtonLabelText,
      priceSheetSummary,
      priceSummaryCandidates: PRICE_SUMMARY_CANDIDATES,
      priceSummaryPillPaddingX: PRICE_SUMMARY_PILL_PADDING_X,
      priceSummaryPillWidth,
      measureSummaryCandidateWidth,
      priceSliderLowValue,
      priceSliderHighValue,
      handlePriceSliderCommit,
      summaryReelItems,
      priceSheetSummaryReelPosition,
      priceSheetSummaryReelNearestIndex,
      priceSheetSummaryNeighborVisibility,
      togglePriceSelector,
      toggleVotesFilter,
      toggleOpenNow,
      closePriceSelector,
      dismissPriceSelector,
      closeRankSelector,
      dismissRankSelector,
      toggleRankSelector,
      handlePriceDone,
      handleRankDone,
    }),
    [
      clearScoreInfo,
      closePriceSelector,
      closeRankSelector,
      closeScoreInfo,
      dismissPriceSelector,
      dismissRankSelector,
      handlePriceDone,
      handlePriceSliderCommit,
      handleRankDone,
      isPriceSelectorVisible,
      isPriceSheetContentReady,
      isRankSelectorVisible,
      isScoreInfoVisible,
      measureSummaryCandidateWidth,
      openScoreInfo,
      pendingPriceRange,
      pendingScoreMode,
      priceButtonLabelText,
      priceSheetSummary,
      priceSheetSummaryNeighborVisibility,
      priceSheetSummaryReelNearestIndex,
      priceSheetSummaryReelPosition,
      priceSheetRef,
      priceSliderHighValue,
      priceSliderLowValue,
      priceSummaryPillWidth,
      rankSheetRef,
      scoreInfo,
      setPendingScoreMode,
      summaryReelItems,
      toggleOpenNow,
      togglePriceSelector,
      toggleRankSelector,
      toggleVotesFilter,
    ]
  );
};
