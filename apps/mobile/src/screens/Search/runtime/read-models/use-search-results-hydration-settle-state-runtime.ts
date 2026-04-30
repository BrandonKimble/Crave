import React from 'react';

type SearchResultsHydrationSettleStateRuntimeArgs = {
  dishesCount: number;
  restaurantsCount: number;
  resultsHydrationKey: string | null;
  hydratedResultsKey: string | null;
};

export const useSearchResultsHydrationSettleStateRuntime = ({
  dishesCount,
  restaurantsCount,
  resultsHydrationKey,
  hydratedResultsKey,
}: SearchResultsHydrationSettleStateRuntimeArgs) => {
  const hydrationRowsReleaseVersionToken =
    resultsHydrationKey == null
      ? null
      : `${resultsHydrationKey}:d${dishesCount}:r${restaurantsCount}`;
  const [
    hydrationFinalizeRowsReleaseCompletedToken,
    setHydrationFinalizeRowsReleaseCompletedToken,
  ] = React.useState<string | null>(null);

  const isHydrationPending =
    resultsHydrationKey != null && resultsHydrationKey !== hydratedResultsKey;
  const isResultsHydrationSettled =
    !isHydrationPending &&
    hydrationFinalizeRowsReleaseCompletedToken === hydrationRowsReleaseVersionToken;

  return React.useMemo(
    () => ({
      hydrationFinalizeRowsReleaseCompletedToken,
      hydrationRowsReleaseVersionToken,
      isHydrationPending,
      isResultsHydrationSettled,
      setHydrationFinalizeRowsReleaseCompletedToken,
    }),
    [
      hydrationFinalizeRowsReleaseCompletedToken,
      hydrationRowsReleaseVersionToken,
      isHydrationPending,
      isResultsHydrationSettled,
    ]
  );
};
