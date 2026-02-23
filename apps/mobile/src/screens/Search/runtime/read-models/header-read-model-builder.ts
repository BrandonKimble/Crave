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
}: BuildResultsSurfaceVisibilityArgs): boolean => {
  const isLoadingWithoutResults =
    (isSearchLoading ||
      hasSystemStatusBanner ||
      shouldRetrySearchOnReconnect ||
      isFilterTogglePending) &&
    !hasResults;
  return isLoadingWithoutResults || safeResultsCount > 0 || hasResults;
};

export const buildResultsHeaderTitle = (submittedQuery: string | null | undefined): string =>
  submittedQuery || 'Results';
