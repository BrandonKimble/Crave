import React from 'react';

import type { SearchRuntimeBus } from './search-runtime-bus';
import type { SearchResultsPanelHydrationKeyRuntime } from './search-results-panel-hydration-runtime-contract';
import type { SearchResultsPayload } from './search-results-panel-runtime-state-contract';

type UseSearchResultsPanelHydrationKeyRuntimeArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  resolvedResults: SearchResultsPayload;
  runtimeHydratedResultsKey: string | null;
  activeOverlayKey: string | null;
};

export const useSearchResultsPanelHydrationKeyRuntime = ({
  searchRuntimeBus,
  resolvedResults,
  runtimeHydratedResultsKey,
  activeOverlayKey,
}: UseSearchResultsPanelHydrationKeyRuntimeArgs): SearchResultsPanelHydrationKeyRuntime => {
  const [hydratedResultsKey, setHydratedResultsKey] = React.useState<string | null>(null);
  const hydratedResultsKeyRef = React.useRef<string | null>(hydratedResultsKey);
  hydratedResultsKeyRef.current = hydratedResultsKey;

  const setHydratedResultsKeySync = React.useCallback(
    (nextHydrationKey: string | null) => {
      hydratedResultsKeyRef.current = nextHydrationKey;
      if (typeof React.startTransition === 'function') {
        React.startTransition(() => {
          setHydratedResultsKey(nextHydrationKey);
        });
      } else {
        setHydratedResultsKey(nextHydrationKey);
      }
      searchRuntimeBus.publish({
        hydratedResultsKey: nextHydrationKey,
      });
    },
    [searchRuntimeBus]
  );

  const resultsPage = resolvedResults?.metadata?.page ?? 1;
  const ungatedDishesLength = resolvedResults?.dishes?.length ?? 0;
  const ungatedRestaurantsLength = resolvedResults?.restaurants?.length ?? 0;
  const resultsHydrationCandidate = React.useMemo(() => {
    if (!resolvedResults) {
      return null;
    }
    const requestKey = resolvedResults?.metadata?.searchRequestId ?? 'no-request';
    const totalFoodResults =
      typeof resolvedResults.metadata?.totalFoodResults === 'number'
        ? resolvedResults.metadata.totalFoodResults
        : 'na';
    const totalRestaurantResults =
      typeof resolvedResults.metadata?.totalRestaurantResults === 'number'
        ? resolvedResults.metadata.totalRestaurantResults
        : 'na';
    return `${requestKey}:page:${resultsPage}:dishes:${ungatedDishesLength}:restaurants:${ungatedRestaurantsLength}:totalFood:${totalFoodResults}:totalRestaurants:${totalRestaurantResults}`;
  }, [resolvedResults, resultsPage, ungatedDishesLength, ungatedRestaurantsLength]);
  const resultsHydrationKey =
    resolvedResults == null
      ? null
      : resultsPage === 1
        ? resultsHydrationCandidate
        : hydratedResultsKey;
  const isHydrationPendingForRuntime =
    resultsHydrationKey != null &&
    resultsHydrationKey !== (hydratedResultsKeyRef.current ?? hydratedResultsKey);
  const shouldHydrateResultsForRender =
    isHydrationPendingForRuntime && activeOverlayKey === 'search';
  const requestVersionKey = React.useMemo(
    () =>
      `${resolvedResults?.metadata?.searchRequestId ?? 'no-request'}::${
        resultsHydrationKey ?? 'no-hydration'
      }`,
    [resolvedResults?.metadata?.searchRequestId, resultsHydrationKey]
  );

  React.useEffect(() => {
    if (
      runtimeHydratedResultsKey != null &&
      runtimeHydratedResultsKey !== hydratedResultsKeyRef.current
    ) {
      hydratedResultsKeyRef.current = runtimeHydratedResultsKey;
      setHydratedResultsKey(runtimeHydratedResultsKey);
    }
  }, [runtimeHydratedResultsKey]);

  React.useEffect(() => {
    if (!resolvedResults) {
      setHydratedResultsKeySync(null);
    }
  }, [resolvedResults, setHydratedResultsKeySync]);

  return React.useMemo(
    () => ({
      resultsHydrationKey,
      hydratedResultsKey,
      shouldHydrateResultsForRender,
      setHydratedResultsKeySync,
      requestVersionKey,
    }),
    [
      hydratedResultsKey,
      requestVersionKey,
      resultsHydrationKey,
      setHydratedResultsKeySync,
      shouldHydrateResultsForRender,
    ]
  );
};
