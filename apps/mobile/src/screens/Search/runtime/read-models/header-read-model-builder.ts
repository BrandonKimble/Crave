type BuildResultsSurfaceVisibilityArgs = {
  isSearchLoading: boolean;
  hasSystemStatusBanner: boolean;
  shouldRetrySearchOnReconnect: boolean;
  isInteractionLoadingActive: boolean;
  hasResults: boolean;
  safeResultsCount: number;
};

export const buildResultsSurfaceVisibility = ({
  isSearchLoading,
  hasSystemStatusBanner,
  shouldRetrySearchOnReconnect,
  isInteractionLoadingActive,
  hasResults,
  safeResultsCount,
}: BuildResultsSurfaceVisibilityArgs): boolean => {
  const isLoadingWithoutResults =
    (isSearchLoading ||
      hasSystemStatusBanner ||
      shouldRetrySearchOnReconnect ||
      isInteractionLoadingActive) &&
    !hasResults;
  return isLoadingWithoutResults || safeResultsCount > 0 || hasResults;
};

export const buildResultsHeaderTitle = (submittedQuery: string | null | undefined): string =>
  submittedQuery || 'Results';
