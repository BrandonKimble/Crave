import type { FlashListProps } from '@shopify/flash-list';

import type { OverlaySheetSnap } from '../../../../overlays/types';
import type { ResultsListItem } from '../read-models/read-model-selectors';

export type ResultsSheetInteractionModel = {
  handleResultsSheetSnapStart: (
    snap: OverlaySheetSnap | 'hidden',
    meta?: { source?: 'gesture' | 'programmatic' | 'restore' }
  ) => void;
  handleResultsListScrollBegin: () => void;
  handleResultsListScrollEnd: () => void;
  handleResultsListMomentumBegin: () => void;
  handleResultsListMomentumEnd: () => void;
  handleResultsSheetDragStateChange: (isDragging: boolean) => void;
  handleResultsSheetSettlingChange: (isSettling: boolean) => void;
  handleResultsEndReached: FlashListProps<ResultsListItem>['onEndReached'];
  handleResultsSheetSnapChange: (snap: OverlaySheetSnap) => void;
  resetResultsListScrollProgress: () => void;
};
