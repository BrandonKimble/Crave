import type { ResultsSheetInteractionModel } from '../shared/results-sheet-interaction-contract';

export const createSearchRootResultsSheetInteractionModel = ({
  handleResultsListScrollBegin,
  handleResultsListScrollEnd,
  handleResultsListMomentumBegin,
  handleResultsListMomentumEnd,
  handleResultsSheetDragStateChange,
  handleResultsSheetSettlingChange,
  handleResultsEndReached,
  resetResultsListScrollProgress,
  handleResultsListUserScrollActivity,
}: ResultsSheetInteractionModel): ResultsSheetInteractionModel => ({
  handleResultsListScrollBegin,
  handleResultsListScrollEnd,
  handleResultsListMomentumBegin,
  handleResultsListMomentumEnd,
  handleResultsSheetDragStateChange,
  handleResultsSheetSettlingChange,
  handleResultsEndReached,
  resetResultsListScrollProgress,
  handleResultsListUserScrollActivity,
});
