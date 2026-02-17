import React from 'react';
import { Pressable, View } from 'react-native';
import Reanimated, { LinearTransition, type SharedValue } from 'react-native-reanimated';

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

type SearchPriceSheetProps = {
  priceSheetRef: React.RefObject<OverlayModalSheetHandle | null>;
  isPriceSelectorVisible: boolean;
  closePriceSelector: () => void;
  summaryCandidates: readonly string[];
  onMeasureSummaryCandidateWidth: (width: number) => void;
  summaryPillPaddingX: number;
  summaryPillWidth: number | null;
  summaryLabel: string;
  summaryReelItems: React.ReactNode;
  isPriceSheetContentReady: boolean;
  priceSliderLowValue: SharedValue<number>;
  priceSliderHighValue: SharedValue<number>;
  handlePriceSliderCommit: (range: PriceRangeTuple) => void;
  dismissPriceSelector: () => void;
  handlePriceDone: () => void;
  activeTabColor: string;
};

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
            {summaryReelItems}
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
