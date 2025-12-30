import React from 'react';

/**
 * State shape for search interaction context.
 * This allows cards to access interaction state without prop drilling,
 * which keeps the parent's renderItem callback stable.
 */
type SearchInteractionState = {
  /** Whether any interaction (dragging or scrolling) is in progress */
  isInteracting: boolean;
  /** Whether the results sheet is currently being dragged */
  isResultsSheetDragging: boolean;
  /** Whether the results list is currently scrolling */
  isResultsListScrolling: boolean;
};

const defaultState: SearchInteractionState = {
  isInteracting: false,
  isResultsSheetDragging: false,
  isResultsListScrolling: false,
};

const SearchInteractionContext = React.createContext<SearchInteractionState>(defaultState);

/**
 * Provider component that wraps the results list.
 * The value should be memoized in the parent to prevent unnecessary re-renders.
 */
type SearchInteractionProviderProps = {
  value: SearchInteractionState;
  children: React.ReactNode;
};

const SearchInteractionProvider: React.FC<SearchInteractionProviderProps> = ({
  value,
  children,
}) => (
  <SearchInteractionContext.Provider value={value}>
    {children}
  </SearchInteractionContext.Provider>
);

/**
 * Hook for card components to consume interaction state.
 *
 * This allows cards to access isDragging/isScrolling state without
 * requiring the parent's renderItem callback to depend on that state.
 *
 * @example
 * ```tsx
 * const RestaurantResultCard = React.memo(({ ... }) => {
 *   const { isInteracting } = useSearchInteraction();
 *
 *   // Use isInteracting to skip expensive operations during drag
 *   const { visibleTopFoods } = useTopFoodMeasurement({
 *     isDragging: isInteracting,
 *     ...
 *   });
 * });
 * ```
 */
const useSearchInteraction = (): SearchInteractionState =>
  React.useContext(SearchInteractionContext);

export {
  SearchInteractionContext,
  SearchInteractionProvider,
  useSearchInteraction,
  type SearchInteractionState,
};
