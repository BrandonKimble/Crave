import React from 'react';
import { Pressable, View } from 'react-native';
import Reanimated, {
  Extrapolation,
  LinearTransition,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { Text } from '../../../components';
import type { OverlayModalSheetHandle } from '../../../overlays/OverlayModalSheet';
import OverlayModalSheet from '../../../overlays/OverlayModalSheet';
import { OVERLAY_HORIZONTAL_PADDING } from '../../../overlays/overlaySheetStyles';
import { ACTIVE_TAB_COLOR_DARK } from '../constants/search';
import type { PriceRangeTuple } from '../utils/price';
import PriceRangeSlider from './price-range-slider';
import styles from '../styles';

const MemoOverlayModalSheet = React.memo(
  OverlayModalSheet,
  (prev, next) => !prev.visible && !next.visible
);

export type SearchPriceSheetProps = {
  priceSheetRef: React.RefObject<OverlayModalSheetHandle | null>;
  isPriceSelectorVisible: boolean;
  closePriceSelector: () => void;
  summaryCandidates: readonly string[];
  onMeasureSummaryCandidateWidth: (width: number) => void;
  summaryPillPaddingX: number;
  summaryPillWidth: number | null;
  summaryLabel: string;
  summaryReelItems: ReadonlyArray<{
    key: string;
    label: string;
    index: number;
  }>;
  summaryReelPosition: SharedValue<number>;
  summaryReelNearestIndex: SharedValue<number>;
  summaryReelNeighborVisibility: SharedValue<number>;
  isPriceSheetContentReady: boolean;
  priceSliderLowValue: SharedValue<number>;
  priceSliderHighValue: SharedValue<number>;
  handlePriceSliderCommit: (range: PriceRangeTuple) => void;
  dismissPriceSelector: () => void;
  handlePriceDone: () => void;
  activeTabColor: string;
};

const PRICE_SUMMARY_REEL_STEP_Y = 16;
const PRICE_SUMMARY_REEL_ROTATE_DEG = 82;
const PRICE_SUMMARY_REEL_PERSPECTIVE = 900;

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
      <Reanimated.View
        pointerEvents="none"
        style={[styles.priceSheetSummaryReelItem, animatedStyle]}
      >
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

const SearchPriceSheet = ({
  priceSheetRef,
  isPriceSelectorVisible,
  closePriceSelector,
  summaryCandidates,
  onMeasureSummaryCandidateWidth,
  summaryPillPaddingX,
  summaryPillWidth,
  summaryLabel,
  summaryReelItems,
  summaryReelPosition,
  summaryReelNearestIndex,
  summaryReelNeighborVisibility,
  isPriceSheetContentReady,
  priceSliderLowValue,
  priceSliderHighValue,
  handlePriceSliderCommit,
  dismissPriceSelector,
  handlePriceDone,
  activeTabColor,
}: SearchPriceSheetProps) => {
  return (
    <MemoOverlayModalSheet
      ref={priceSheetRef}
      visible={isPriceSelectorVisible}
      onRequestClose={closePriceSelector}
      maxBackdropOpacity={0.42}
      paddingHorizontal={OVERLAY_HORIZONTAL_PADDING}
      paddingTop={12}
    >
      <View style={styles.priceSheetHeaderRow}>
        <View style={styles.priceSheetSummaryMeasureContainer} pointerEvents="none">
          {summaryCandidates.map((label) => (
            <Text
              key={label}
              variant="subtitle"
              weight="semibold"
              style={styles.priceSheetSummaryText}
              onLayout={(event) => {
                const measuredWidth = Math.ceil(event.nativeEvent.layout.width);
                onMeasureSummaryCandidateWidth(measuredWidth + summaryPillPaddingX * 2);
              }}
            >
              {label}
            </Text>
          ))}
        </View>
        <View style={styles.priceSheetHeaderContentRow} pointerEvents="none">
          <Reanimated.View
            style={[
              styles.priceSheetSummaryPill,
              summaryPillWidth ? { width: summaryPillWidth } : null,
            ]}
            layout={LinearTransition.duration(180)}
            pointerEvents="none"
          >
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              variant="subtitle"
              weight="semibold"
              style={[styles.priceSheetSummaryText, styles.priceSheetSummaryMeasureText]}
            >
              {summaryLabel}
            </Text>
            {summaryReelItems.map((item) => (
              <PriceSummaryReelItem
                key={item.key}
                label={item.label}
                index={item.index}
                reelPosition={summaryReelPosition}
                nearestIndex={summaryReelNearestIndex}
                neighborVisibility={summaryReelNeighborVisibility}
              />
            ))}
          </Reanimated.View>
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            variant="subtitle"
            weight="semibold"
            style={styles.priceSheetHeadlineSuffix}
          >
            per person
          </Text>
        </View>
      </View>
      <View style={styles.priceSheetSliderWrapper}>
        {isPriceSheetContentReady ? (
          <PriceRangeSlider
            motionLow={priceSliderLowValue}
            motionHigh={priceSliderHighValue}
            onRangeCommit={handlePriceSliderCommit}
          />
        ) : (
          <View style={styles.priceTrackContainer} pointerEvents="none" />
        )}
      </View>
      <View style={styles.sheetActionsRow}>
        <Pressable
          onPress={dismissPriceSelector}
          accessibilityRole="button"
          accessibilityLabel="Cancel price changes"
          style={styles.sheetCancelButton}
        >
          <Text
            variant="caption"
            weight="semibold"
            style={[styles.sheetCancelText, { color: ACTIVE_TAB_COLOR_DARK }]}
          >
            Cancel
          </Text>
        </Pressable>
        <Pressable
          onPress={handlePriceDone}
          accessibilityRole="button"
          accessibilityLabel="Apply price filters"
          style={[styles.priceSheetDoneButton, { backgroundColor: activeTabColor }]}
        >
          <Text variant="caption" weight="semibold" style={styles.priceSheetDoneText}>
            Done
          </Text>
        </Pressable>
      </View>
    </MemoOverlayModalSheet>
  );
};

export default SearchPriceSheet;
