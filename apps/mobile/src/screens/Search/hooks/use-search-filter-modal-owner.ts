import React from 'react';
import {
  Extrapolation,
  interpolate,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';

import type { OverlayModalSheetHandle } from '../../../overlays/OverlayModalSheet';
import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';
import type { ScoreInfoPayload } from '../components/SearchRankAndScoreSheets';
import { useQueryMutationOrchestrator } from '../runtime/mutations/query-mutation-orchestrator';
import {
  formatPriceRangeSummary,
  getRangeFromLevels,
  priceSliderRange,
  type PriceSliderRange,
} from '../utils/price';
import {
  PRICE_SUMMARY_CANDIDATES,
  PRICE_SUMMARY_REEL_ENTRIES,
  getPriceSummaryReelIndexFromBoundaries,
} from '../utils/price-summary-reel';

type UseSearchFilterModalOwnerArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  risingActive: boolean;
  priceLevels: readonly number[];
  panelVisible: boolean;
  captureFreshTupleBounds: Parameters<
    typeof useQueryMutationOrchestrator
  >[0]['captureFreshTupleBounds'];
  registerTransientDismissor: (handler: () => void) => () => void;
  onMechanismEvent?: (event: 'query_mutation_coalesced', payload?: Record<string, unknown>) => void;
};

const arePriceRangesEqual = (a: PriceSliderRange, b: PriceSliderRange) =>
  Math.abs(a[0] - b[0]) < 0.001 && Math.abs(a[1] - b[1]) < 0.001;

const PRICE_SUMMARY_PILL_PADDING_X = 12;

export type SearchSortMode = 'best' | 'rising';

type SearchFilterModalOwner = {
  priceSheetRef: React.RefObject<OverlayModalSheetHandle | null>;
  isPriceSelectorVisible: boolean;
  /** Sort dropdown (toggle-strip primitive): 'best' is the silent default; 'rising'
   *  rides the EXISTING rising filter through the chip-rerun choreography. */
  isSortSelectorVisible: boolean;
  sortMode: SearchSortMode;
  toggleSortSelector: () => void;
  closeSortSelector: () => void;
  handleSortSelect: (mode: SearchSortMode) => void;
  isPriceSheetContentReady: boolean;
  pendingPriceRange: PriceSliderRange;
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
  handlePriceSliderCommit: (range: PriceSliderRange) => void;
  summaryReelItems: readonly {
    key: string;
    label: string;
    index: number;
  }[];
  priceSheetSummaryReelPosition: ReturnType<typeof useDerivedValue<number>>;
  priceSheetSummaryReelNearestIndex: ReturnType<typeof useDerivedValue<number>>;
  priceSheetSummaryNeighborVisibility: ReturnType<typeof useDerivedValue<number>>;
  togglePriceSelector: () => void;
  toggleIncludeSimilar: () => void;
  toggleRising: () => void;
  toggleOpenNow: () => void;
  /** Toggle ONE canonical dietary wall (server-curated vocabulary). */
  toggleDietary: (name: string) => void;
  closePriceSelector: () => void;
  dismissPriceSelector: () => void;
  handlePriceDone: () => void;
};

export const useSearchFilterModalOwner = ({
  searchRuntimeBus,
  risingActive,
  priceLevels,
  panelVisible,
  captureFreshTupleBounds,
  registerTransientDismissor,
  onMechanismEvent,
}: UseSearchFilterModalOwnerArgs): SearchFilterModalOwner => {
  const [isPriceSelectorVisible, setIsPriceSelectorVisible] = React.useState(false);
  const [isSortSelectorVisible, setIsSortSelectorVisible] = React.useState(false);
  const [isPriceSheetContentReady, setIsPriceSheetContentReady] = React.useState(false);
  const priceSheetRef = React.useRef<OverlayModalSheetHandle | null>(null);
  const [pendingPriceRange, setPendingPriceRange] = React.useState<PriceSliderRange>(() =>
    priceSliderRange(Math.min(...priceLevels), Math.max(...priceLevels))
  );
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

  const priceSliderLowValue = useSharedValue<number>(pendingPriceRange[0]);
  const priceSliderHighValue = useSharedValue<number>(pendingPriceRange[1]);
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

  const handlePriceSliderCommit = React.useCallback((range: PriceSliderRange) => {
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
    toggleIncludeSimilar,
    toggleRising,
    toggleOpenNow,
    toggleDietary,
    closePriceSelector,
    dismissPriceSelector,
    handlePriceDone,
  } = useQueryMutationOrchestrator({
    searchRuntimeBus,
    pendingPriceRange,
    setPendingPriceRange,
    isPriceSelectorVisible,
    setIsPriceSelectorVisible,
    priceLevels,
    priceSheetRef,
    captureFreshTupleBounds,
    onMechanismEvent,
  });

  React.useEffect(() => {
    if (!panelVisible && isPriceSelectorVisible) {
      setIsPriceSelectorVisible(false);
    }
  }, [isPriceSelectorVisible, panelVisible]);

  const sortMode: SearchSortMode = risingActive ? 'rising' : 'best';
  const toggleSortSelector = React.useCallback(() => {
    setIsSortSelectorVisible((prev) => !prev);
  }, []);
  const closeSortSelector = React.useCallback(() => {
    setIsSortSelectorVisible(false);
  }, []);
  const handleSortSelect = React.useCallback(
    (mode: SearchSortMode) => {
      // The dropdown is a REMOTE CONTROL for the existing rising filter — a change
      // rides toggleRising's chip-rerun choreography (press-up fade + re-reveal).
      if ((mode === 'rising') !== risingActive) {
        toggleRising();
      }
    },
    [risingActive, toggleRising]
  );
  React.useEffect(() => {
    if (!panelVisible && isSortSelectorVisible) {
      setIsSortSelectorVisible(false);
    }
  }, [isSortSelectorVisible, panelVisible]);

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
      closeSortSelector();
      closeScoreInfo();
    });
  }, [closePriceSelector, closeSortSelector, closeScoreInfo, registerTransientDismissor]);

  return React.useMemo(
    () => ({
      priceSheetRef,
      isPriceSelectorVisible,
      isSortSelectorVisible,
      sortMode,
      toggleSortSelector,
      closeSortSelector,
      handleSortSelect,
      isPriceSheetContentReady,
      pendingPriceRange,
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
      toggleIncludeSimilar,
      toggleRising,
      toggleOpenNow,
      toggleDietary,
      closePriceSelector,
      dismissPriceSelector,
      handlePriceDone,
    }),
    [
      clearScoreInfo,
      closePriceSelector,
      closeScoreInfo,
      dismissPriceSelector,
      handlePriceDone,
      handlePriceSliderCommit,
      isPriceSelectorVisible,
      isSortSelectorVisible,
      sortMode,
      toggleSortSelector,
      closeSortSelector,
      handleSortSelect,
      isPriceSheetContentReady,
      isScoreInfoVisible,
      measureSummaryCandidateWidth,
      openScoreInfo,
      pendingPriceRange,
      priceButtonLabelText,
      priceSheetSummary,
      priceSheetSummaryNeighborVisibility,
      priceSheetSummaryReelNearestIndex,
      priceSheetSummaryReelPosition,
      priceSheetRef,
      priceSliderHighValue,
      priceSliderLowValue,
      priceSummaryPillWidth,
      scoreInfo,
      summaryReelItems,
      toggleIncludeSimilar,
      toggleOpenNow,
      toggleDietary,
      togglePriceSelector,
      toggleRising,
    ]
  );
};
