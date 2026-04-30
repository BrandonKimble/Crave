type SearchRootResultsSheetMotionRuntimeValue = {
  handleResultsSheetSnapStart: (
    snap: import('../../../../overlays/types').OverlaySheetSnap | 'hidden'
  ) => void;
  handleResultsListScrollBegin: () => void;
  handleResultsListScrollEnd: () => void;
  handleResultsListMomentumBegin: () => void;
  handleResultsListMomentumEnd: () => void;
  handleResultsSheetDragStateChange: (isDragging: boolean) => void;
  handleResultsSheetSettlingChange: (isSettling: boolean) => void;
  handleResultsSheetSnapChange: (
    snap: import('../../../../overlays/types').OverlaySheetSnap
  ) => void;
};

export const createSearchRootResultsSheetMotionRuntimeValue = ({
  handleResultsSheetSnapStart,
  handleResultsListScrollBegin,
  handleResultsListScrollEnd,
  handleResultsListMomentumBegin,
  handleResultsListMomentumEnd,
  handleResultsSheetDragStateChange,
  handleResultsSheetSettlingChange,
  handleResultsSheetSnapChange,
}: SearchRootResultsSheetMotionRuntimeValue): SearchRootResultsSheetMotionRuntimeValue => ({
  handleResultsSheetSnapStart,
  handleResultsListScrollBegin,
  handleResultsListScrollEnd,
  handleResultsListMomentumBegin,
  handleResultsListMomentumEnd,
  handleResultsSheetDragStateChange,
  handleResultsSheetSettlingChange,
  handleResultsSheetSnapChange,
});
