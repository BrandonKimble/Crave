import React from 'react';

type ResultsSheetInteractionResult = {
  /** Whether the results sheet is currently being dragged */
  isResultsSheetDragging: boolean;

  /** Whether the results list is currently scrolling */
  isResultsListScrolling: boolean;

  /** Whether any interaction is occurring (dragging or scrolling) */
  isInteracting: boolean;

  /** Handler for sheet drag state changes */
  handleDragStateChange: (isDragging: boolean) => void;

  /** Handler for scroll begin */
  handleScrollBegin: () => void;

  /** Handler for scroll end (takes momentum state into account) */
  handleScrollEnd: (hasMomentum: boolean) => void;

  /** Handler for momentum scroll begin */
  handleMomentumBegin: () => void;

  /** Handler for momentum scroll end */
  handleMomentumEnd: () => void;
};

/**
 * Hook to manage results sheet interaction state.
 *
 * Consolidates drag and scroll state tracking for the results sheet,
 * which is used to:
 * 1. Freeze the map during interactions
 * 2. Defer layout measurements in list items (isDragging prop)
 * 3. Optimize rendering during gestures
 *
 * @param onScrollBeginDrag - External callback for scroll begin (optional)
 * @param onScrollEndDrag - External callback for scroll end (optional)
 *
 * @example
 * ```tsx
 * const {
 *   isResultsSheetDragging,
 *   isInteracting,
 *   handleDragStateChange,
 *   handleScrollBegin,
 *   handleScrollEnd,
 * } = useResultsSheetInteraction();
 *
 * // Pass to sheet
 * <SearchResultsSheet
 *   onDragStateChange={handleDragStateChange}
 *   onScrollBegin={handleScrollBegin}
 *   onScrollEnd={handleScrollEnd}
 * />
 *
 * // Pass to cards
 * <RestaurantResultCard isDragging={isInteracting} />
 * ```
 */
function useResultsSheetInteraction(
  onScrollBeginDrag?: () => void,
  onScrollEndDrag?: () => void
): ResultsSheetInteractionResult {
  const [isResultsSheetDragging, setIsResultsSheetDragging] = React.useState(false);
  const [isResultsListScrolling, setIsResultsListScrolling] = React.useState(false);

  // Derived state - any interaction in progress
  const isInteracting = isResultsSheetDragging || isResultsListScrolling;

  const handleDragStateChange = React.useCallback((isDragging: boolean) => {
    setIsResultsSheetDragging(isDragging);
  }, []);

  const handleScrollBegin = React.useCallback(() => {
    onScrollBeginDrag?.();
    setIsResultsListScrolling(true);
  }, [onScrollBeginDrag]);

  const handleScrollEnd = React.useCallback(
    (hasMomentum: boolean) => {
      onScrollEndDrag?.();
      // Only clear scrolling state if there's no momentum
      // (momentum events will handle it otherwise)
      if (!hasMomentum) {
        setIsResultsListScrolling(false);
      }
    },
    [onScrollEndDrag]
  );

  const handleMomentumBegin = React.useCallback(() => {
    setIsResultsListScrolling(true);
  }, []);

  const handleMomentumEnd = React.useCallback(() => {
    setIsResultsListScrolling(false);
  }, []);

  return {
    isResultsSheetDragging,
    isResultsListScrolling,
    isInteracting,
    handleDragStateChange,
    handleScrollBegin,
    handleScrollEnd,
    handleMomentumBegin,
    handleMomentumEnd,
  };
}

export { useResultsSheetInteraction, type ResultsSheetInteractionResult };
