import type { FlashListProps } from '@shopify/flash-list';

import type { ResultsListItem } from '../read-models/read-model-selectors';

export type ResultsSheetInteractionModel = {
  handleResultsListScrollBegin: () => void;
  handleResultsListScrollEnd: () => void;
  handleResultsListMomentumBegin: () => void;
  handleResultsListMomentumEnd: () => void;
  handleResultsSheetDragStateChange: (isDragging: boolean) => void;
  handleResultsSheetSettlingChange: (isSettling: boolean) => void;
  handleResultsEndReached: FlashListProps<ResultsListItem>['onEndReached'];
  resetResultsListScrollProgress: () => void;
};
