type BuildResultsEmptyAreaReadModelArgs = {
  screenHeight: number;
  middleSnapPoint: number;
  effectiveResultsHeaderHeight: number;
  effectiveFiltersHeaderHeight: number;
};

export const buildResultsEmptyAreaReadModel = ({
  screenHeight,
  middleSnapPoint,
  effectiveResultsHeaderHeight,
  effectiveFiltersHeaderHeight,
}: BuildResultsEmptyAreaReadModelArgs): {
  emptyAreaMinHeight: number;
  emptyYOffset: number;
} => {
  const visibleSheetHeight = Math.max(0, screenHeight - middleSnapPoint);
  const emptyAreaMinHeight = Math.max(
    0,
    visibleSheetHeight - effectiveResultsHeaderHeight - effectiveFiltersHeaderHeight
  );
  const emptyYOffset = -Math.min(44, Math.max(20, emptyAreaMinHeight * 0.18));
  return {
    emptyAreaMinHeight,
    emptyYOffset,
  };
};

type BuildResultsSurfaceVisibilityArgs = {
  isSearchLoading: boolean;
  hasSystemStatusBanner: boolean;
  shouldRetrySearchOnReconnect: boolean;
  isFilterTogglePending: boolean;
  hasResults: boolean;
  safeResultsCount: number;
};

export const buildResultsSurfaceVisibility = ({
  isSearchLoading,
  hasSystemStatusBanner,
  shouldRetrySearchOnReconnect,
  isFilterTogglePending,
  hasResults,
  safeResultsCount,
}: BuildResultsSurfaceVisibilityArgs): {
  shouldShowResultsLoadingState: boolean;
  shouldShowResultsSurface: boolean;
} => {
  const shouldShowResultsLoadingState =
    (isSearchLoading ||
      hasSystemStatusBanner ||
      shouldRetrySearchOnReconnect ||
      isFilterTogglePending) &&
    !hasResults;
  return {
    shouldShowResultsLoadingState,
    shouldShowResultsSurface: shouldShowResultsLoadingState || safeResultsCount > 0 || hasResults,
  };
};

export const buildResultsHeaderTitle = (submittedQuery: string | null | undefined): string =>
  submittedQuery || 'Results';
