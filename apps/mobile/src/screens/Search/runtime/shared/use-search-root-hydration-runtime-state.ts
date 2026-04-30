import React from 'react';

import {
  createSearchRootHydrationRuntimeStateValue,
} from '../controller/search-root-data-plane-runtime';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';
import type {
  SearchRootHydrationRuntimeState,
  SearchRootSessionCoreLane,
} from './use-search-root-session-runtime-contract';

type UseSearchRootHydrationRuntimeStateArgs = {
  rootSessionCoreLane: Pick<SearchRootSessionCoreLane, 'searchRuntimeBus'>;
};

export const useSearchRootHydrationRuntimeState = ({
  rootSessionCoreLane,
}: UseSearchRootHydrationRuntimeStateArgs): SearchRootHydrationRuntimeState => {
  const { searchRuntimeBus } = rootSessionCoreLane;
  const hydrationRuntimeState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) =>
      createSearchRootHydrationRuntimeStateValue({
        resultsHydrationKey: state.resultsHydrationKey,
        hydratedResultsKey: state.hydratedResultsKey,
      }),
    (a, b) =>
      a.resultsHydrationKey === b.resultsHydrationKey &&
      a.hydratedResultsKey === b.hydratedResultsKey,
    ['resultsHydrationKey', 'hydratedResultsKey'] as const
  );

  return React.useMemo(() => hydrationRuntimeState, [hydrationRuntimeState]);
};
