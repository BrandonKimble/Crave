import React from 'react';

import { ACTIVE_TAB_COLOR } from '../../constants/search';
import type { SearchAppShellPriceModalLayerModel } from './search-app-shell-render-contract';
import type { SearchRootOverlayHostRuntimeParams } from './search-root-overlay-host-runtime-contract';

export const useSearchRootOverlayPriceModalLayerRuntime = ({
  rootOverlayFoundationRuntime,
  filterModalControlLane,
}: Pick<
  SearchRootOverlayHostRuntimeParams,
  'rootOverlayFoundationRuntime' | 'filterModalControlLane'
>): SearchAppShellPriceModalLayerModel =>
  React.useMemo(
    () => ({
      priceSheetProps: {
        priceSheetRef: filterModalControlLane.filterModalRuntime.priceSheetRef,
        isPriceSelectorVisible: filterModalControlLane.filterModalRuntime.isPriceSelectorVisible,
        closePriceSelector: filterModalControlLane.filterModalRuntime.closePriceSelector,
        summaryCandidates: filterModalControlLane.filterModalRuntime.priceSummaryCandidates,
        onMeasureSummaryCandidateWidth:
          filterModalControlLane.filterModalRuntime.measureSummaryCandidateWidth,
        summaryPillPaddingX: filterModalControlLane.filterModalRuntime.priceSummaryPillPaddingX,
        summaryPillWidth: filterModalControlLane.filterModalRuntime.priceSummaryPillWidth,
        summaryLabel: filterModalControlLane.filterModalRuntime.priceSheetSummary,
        summaryReelItems: filterModalControlLane.filterModalRuntime.summaryReelItems,
        summaryReelPosition:
          filterModalControlLane.filterModalRuntime.priceSheetSummaryReelPosition,
        summaryReelNearestIndex:
          filterModalControlLane.filterModalRuntime.priceSheetSummaryReelNearestIndex,
        summaryReelNeighborVisibility:
          filterModalControlLane.filterModalRuntime.priceSheetSummaryNeighborVisibility,
        isPriceSheetContentReady:
          filterModalControlLane.filterModalRuntime.isPriceSheetContentReady,
        priceSliderLowValue: filterModalControlLane.filterModalRuntime.priceSliderLowValue,
        priceSliderHighValue: filterModalControlLane.filterModalRuntime.priceSliderHighValue,
        handlePriceSliderCommit: filterModalControlLane.filterModalRuntime.handlePriceSliderCommit,
        dismissPriceSelector: filterModalControlLane.filterModalRuntime.dismissPriceSelector,
        handlePriceDone: filterModalControlLane.filterModalRuntime.handlePriceDone,
        activeTabColor: ACTIVE_TAB_COLOR,
      },
      onProfilerRender:
        rootOverlayFoundationRuntime.rootInstrumentationRuntime.handleProfilerRender,
    }),
    [
      filterModalControlLane.filterModalRuntime.closePriceSelector,
      filterModalControlLane.filterModalRuntime.dismissPriceSelector,
      filterModalControlLane.filterModalRuntime.handlePriceDone,
      filterModalControlLane.filterModalRuntime.handlePriceSliderCommit,
      filterModalControlLane.filterModalRuntime.isPriceSelectorVisible,
      filterModalControlLane.filterModalRuntime.isPriceSheetContentReady,
      filterModalControlLane.filterModalRuntime.measureSummaryCandidateWidth,
      filterModalControlLane.filterModalRuntime.priceSheetRef,
      filterModalControlLane.filterModalRuntime.priceSheetSummary,
      filterModalControlLane.filterModalRuntime.priceSheetSummaryNeighborVisibility,
      filterModalControlLane.filterModalRuntime.priceSheetSummaryReelNearestIndex,
      filterModalControlLane.filterModalRuntime.priceSheetSummaryReelPosition,
      filterModalControlLane.filterModalRuntime.priceSliderHighValue,
      filterModalControlLane.filterModalRuntime.priceSliderLowValue,
      filterModalControlLane.filterModalRuntime.priceSummaryCandidates,
      filterModalControlLane.filterModalRuntime.priceSummaryPillPaddingX,
      filterModalControlLane.filterModalRuntime.priceSummaryPillWidth,
      filterModalControlLane.filterModalRuntime.summaryReelItems,
      rootOverlayFoundationRuntime.rootInstrumentationRuntime.handleProfilerRender,
    ]
  );
