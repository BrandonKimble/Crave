import React from 'react';
import Reanimated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { Text } from '../../../components';
import type { PriceRangeTuple } from '../utils/price';
import { formatPriceRangeSummary, getRangeFromLevels } from '../utils/price';
import styles from '../styles';

type UseSearchPriceSheetControllerArgs = {
  priceLevels: number[];
  pendingPriceRange: PriceRangeTuple;
  setPendingPriceRange: React.Dispatch<React.SetStateAction<PriceRangeTuple>>;
  isPriceSelectorVisible: boolean;
};

type UseSearchPriceSheetControllerResult = {
  priceFiltersActive: boolean;
  priceButtonSummary: string;
  priceButtonLabelText: string;
  priceSheetSummary: string;
  priceSummaryPillWidth: number | null;
  measureSummaryCandidateWidth: (nextWidth: number) => void;
  priceSliderLowValue: SharedValue<number>;
  priceSliderHighValue: SharedValue<number>;
  handlePriceSliderCommit: (range: PriceRangeTuple) => void;
  summaryCandidates: readonly string[];
  summaryPillPaddingX: number;
  summaryReelItems: React.ReactNode;
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

const PRICE_SUMMARY_REEL_LABELS = PRICE_SUMMARY_REEL_ENTRIES.map((entry) => entry.label);
const PRICE_SUMMARY_CANDIDATES = PRICE_SUMMARY_REEL_LABELS;
const PRICE_SUMMARY_PILL_PADDING_X = 12;
const PRICE_SUMMARY_REEL_STEP_Y = 16;
const PRICE_SUMMARY_REEL_ROTATE_DEG = 82;
const PRICE_SUMMARY_REEL_PERSPECTIVE = 900;
const PRICE_SUMMARY_REEL_DEFAULT_INDEX = PRICE_SUMMARY_REEL_INDEX_BY_KEY['1-5'] ?? 0;

type PriceSummaryReelItemProps = {
  label: string;
  index: number;
  reelPosition: SharedValue<number>;
  nearestIndex: SharedValue<number>;
  neighborVisibility: SharedValue<number>;
};

const PriceSummaryReelItem: React.FC<PriceSummaryReelItemProps> = React.memo(
  ({ label, index, reelPosition, nearestIndex, neighborVisibility }) => {
    const animatedStyle = useAnimatedStyle(() => {
      const distance = index - reelPosition.value;
      const absDistance = Math.abs(distance);
      const isNearest = index === nearestIndex.value;
      const clampedAbsDistance = Math.min(absDistance, 1.1);
      const baseOpacity = interpolate(
        clampedAbsDistance,
        [0, 0.35, 0.7, 1.1],
        [1, 0.7, 0.3, 0],
        Extrapolation.CLAMP
      );
      const opacity = isNearest ? baseOpacity : baseOpacity * neighborVisibility.value * 0.85;
      const spacingCompensation = 1 - Math.min(absDistance, 1.5) * 0.1;
      return {
        opacity,
        transform: [
          { perspective: PRICE_SUMMARY_REEL_PERSPECTIVE },
          { translateY: distance * PRICE_SUMMARY_REEL_STEP_Y * spacingCompensation },
          { rotateX: `${-distance * PRICE_SUMMARY_REEL_ROTATE_DEG}deg` },
        ],
      };
    });

    return (
      <Reanimated.View pointerEvents="none" style={[styles.priceSheetSummaryReelItem, animatedStyle]}>
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          variant="subtitle"
          weight="semibold"
          style={styles.priceSheetSummaryText}
        >
          {label}
        </Text>
      </Reanimated.View>
    );
  }
);

PriceSummaryReelItem.displayName = 'PriceSummaryReelItem';

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

export const useSearchPriceSheetController = ({
  priceLevels,
  pendingPriceRange,
  setPendingPriceRange,
  isPriceSelectorVisible,
}: UseSearchPriceSheetControllerArgs): UseSearchPriceSheetControllerResult => {
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

  const handlePriceSliderCommit = React.useCallback(
    (range: PriceRangeTuple) => {
      const applyUpdate = () => {
        setPendingPriceRange((prev) => (arePriceRangesEqual(prev, range) ? prev : range));
      };
      if (typeof React.startTransition === 'function') {
        React.startTransition(applyUpdate);
      } else {
        applyUpdate();
      }
    },
    [setPendingPriceRange]
  );

  const summaryReelItems = React.useMemo(
    () =>
      PRICE_SUMMARY_REEL_ENTRIES.map((entry, index) => (
        <PriceSummaryReelItem
          key={entry.key}
          label={entry.label}
          index={index}
          reelPosition={priceSheetSummaryReelPosition}
          nearestIndex={priceSheetSummaryReelNearestIndex}
          neighborVisibility={priceSheetSummaryNeighborVisibility}
        />
      )),
    [
      priceSheetSummaryNeighborVisibility,
      priceSheetSummaryReelNearestIndex,
      priceSheetSummaryReelPosition,
    ]
  );

  return {
    priceFiltersActive,
    priceButtonSummary,
    priceButtonLabelText,
    priceSheetSummary,
    priceSummaryPillWidth,
    measureSummaryCandidateWidth,
    priceSliderLowValue,
    priceSliderHighValue,
    handlePriceSliderCommit,
    summaryCandidates: PRICE_SUMMARY_CANDIDATES,
    summaryPillPaddingX: PRICE_SUMMARY_PILL_PADDING_X,
    summaryReelItems,
  };
};
