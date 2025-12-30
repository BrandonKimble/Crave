import React from 'react';

type SearchInteractionSnapshot = {
  isInteracting: boolean;
  isResultsSheetDragging: boolean;
  isResultsListScrolling: boolean;
  isResultsSheetSettling: boolean;
};

type SearchInteractionState = {
  interactionRef: React.MutableRefObject<SearchInteractionSnapshot>;
};

const defaultSnapshot: SearchInteractionSnapshot = {
  isInteracting: false,
  isResultsSheetDragging: false,
  isResultsListScrolling: false,
  isResultsSheetSettling: false,
};

const defaultInteractionRef = {
  current: defaultSnapshot,
} as React.MutableRefObject<SearchInteractionSnapshot>;

const SearchInteractionContext = React.createContext<SearchInteractionState>({
  interactionRef: defaultInteractionRef,
});

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
  <SearchInteractionContext.Provider value={value}>{children}</SearchInteractionContext.Provider>
);

/**
 * Hook for card components to consume interaction state.
 *
 * Cards read from a ref so they don't re-render on drag state changes.
 *
 * @example
 * ```tsx
 * const RestaurantResultCard = React.memo(({ ... }) => {
 *   const { interactionRef } = useSearchInteraction();
 *
 *   // Use interactionRef.current to skip expensive operations during drag
 *   const { visibleTopFoods } = useTopFoodMeasurement({
 *     isDraggingRef: interactionRef,
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
  type SearchInteractionSnapshot,
  type SearchInteractionState,
};
