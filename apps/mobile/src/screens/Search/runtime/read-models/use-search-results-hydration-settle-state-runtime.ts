import React from 'react';

type SearchResultsHydrationSettleStateRuntimeArgs = {
  dishesCount: number;
  restaurantsCount: number;
  resultsIdentityKey: string | null;
  hydratedResultsKey: string | null;
};

export const useSearchResultsHydrationSettleStateRuntime = ({
  dishesCount,
  restaurantsCount,
  resultsIdentityKey,
  hydratedResultsKey,
}: SearchResultsHydrationSettleStateRuntimeArgs) => {
  const hydrationRowsReleaseVersionToken =
    resultsIdentityKey == null
      ? null
      : `${resultsIdentityKey}:d${dishesCount}:r${restaurantsCount}`;
  const [
    hydrationFinalizeRowsReleaseCompletedToken,
    setHydrationFinalizeRowsReleaseCompletedToken,
  ] = React.useState<string | null>(null);

  const isHydrationPending =
    resultsIdentityKey != null && resultsIdentityKey !== hydratedResultsKey;
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
