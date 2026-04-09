import type { SearchRootActionLanes } from './search-root-action-runtime-contract';
import {
  useSearchRootModalSheetRenderRuntime,
  type SearchRootModalSheetRenderRuntime,
} from './use-search-root-modal-sheet-render-runtime';
import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';

type UseSearchRootModalSheetRenderOwnerRuntimeArgs = {
  rootScaffoldRuntime: SearchRootScaffoldRuntime;
} & Pick<SearchRootActionLanes, 'sessionActionRuntime'>;

export const useSearchRootModalSheetRenderOwnerRuntime = ({
  rootScaffoldRuntime,
  sessionActionRuntime,
}: UseSearchRootModalSheetRenderOwnerRuntimeArgs): SearchRootModalSheetRenderRuntime =>
  useSearchRootModalSheetRenderRuntime({
    rankAndScoreSheetsArgs: {
      rankSheetRef: sessionActionRuntime.filterModalRuntime.rankSheetRef,
      isRankSelectorVisible: sessionActionRuntime.filterModalRuntime.isRankSelectorVisible,
      closeRankSelector: sessionActionRuntime.filterModalRuntime.closeRankSelector,
      dismissRankSelector: sessionActionRuntime.filterModalRuntime.dismissRankSelector,
      pendingScoreMode: sessionActionRuntime.filterModalRuntime.pendingScoreMode,
      setPendingScoreMode: sessionActionRuntime.filterModalRuntime.setPendingScoreMode,
      handleRankDone: sessionActionRuntime.filterModalRuntime.handleRankDone,
      isScoreInfoVisible: sessionActionRuntime.filterModalRuntime.isScoreInfoVisible,
      scoreInfo: sessionActionRuntime.filterModalRuntime.scoreInfo,
      closeScoreInfo: sessionActionRuntime.filterModalRuntime.closeScoreInfo,
      clearScoreInfo: sessionActionRuntime.filterModalRuntime.clearScoreInfo,
      onProfilerRender: rootScaffoldRuntime.instrumentationRuntime.handleProfilerRender,
    },
    priceSheetArgs: {
      priceSheetRef: sessionActionRuntime.filterModalRuntime.priceSheetRef,
      isPriceSelectorVisible: sessionActionRuntime.filterModalRuntime.isPriceSelectorVisible,
      closePriceSelector: sessionActionRuntime.filterModalRuntime.closePriceSelector,
      summaryCandidates: sessionActionRuntime.filterModalRuntime.priceSummaryCandidates,
      onMeasureSummaryCandidateWidth:
        sessionActionRuntime.filterModalRuntime.measureSummaryCandidateWidth,
      summaryPillPaddingX: sessionActionRuntime.filterModalRuntime.priceSummaryPillPaddingX,
      summaryPillWidth: sessionActionRuntime.filterModalRuntime.priceSummaryPillWidth,
      summaryLabel: sessionActionRuntime.filterModalRuntime.priceSheetSummary,
      summaryReelItems: sessionActionRuntime.filterModalRuntime.summaryReelItems,
      summaryReelPosition: sessionActionRuntime.filterModalRuntime.priceSheetSummaryReelPosition,
      summaryReelNearestIndex:
        sessionActionRuntime.filterModalRuntime.priceSheetSummaryReelNearestIndex,
      summaryReelNeighborVisibility:
        sessionActionRuntime.filterModalRuntime.priceSheetSummaryNeighborVisibility,
      isPriceSheetContentReady: sessionActionRuntime.filterModalRuntime.isPriceSheetContentReady,
      priceSliderLowValue: sessionActionRuntime.filterModalRuntime.priceSliderLowValue,
      priceSliderHighValue: sessionActionRuntime.filterModalRuntime.priceSliderHighValue,
      handlePriceSliderCommit: sessionActionRuntime.filterModalRuntime.handlePriceSliderCommit,
      dismissPriceSelector: sessionActionRuntime.filterModalRuntime.dismissPriceSelector,
      handlePriceDone: sessionActionRuntime.filterModalRuntime.handlePriceDone,
    },
  });
