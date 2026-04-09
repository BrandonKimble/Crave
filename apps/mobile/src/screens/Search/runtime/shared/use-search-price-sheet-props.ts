import React from 'react';

import type { SearchPriceSheetProps } from '../../components/SearchPriceSheet';
import { ACTIVE_TAB_COLOR } from '../../constants/search';

type UseSearchPriceSheetPropsArgs = Omit<SearchPriceSheetProps, 'activeTabColor'>;

export const useSearchPriceSheetProps = ({
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
}: UseSearchPriceSheetPropsArgs): SearchPriceSheetProps =>
  React.useMemo(
    () => ({
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
      activeTabColor: ACTIVE_TAB_COLOR,
    }),
    [
      closePriceSelector,
      dismissPriceSelector,
      handlePriceDone,
      handlePriceSliderCommit,
      isPriceSelectorVisible,
      isPriceSheetContentReady,
      onMeasureSummaryCandidateWidth,
      priceSheetRef,
      priceSliderHighValue,
      priceSliderLowValue,
      summaryCandidates,
      summaryLabel,
      summaryPillPaddingX,
      summaryPillWidth,
      summaryReelItems,
      summaryReelNearestIndex,
      summaryReelNeighborVisibility,
      summaryReelPosition,
    ]
  );
