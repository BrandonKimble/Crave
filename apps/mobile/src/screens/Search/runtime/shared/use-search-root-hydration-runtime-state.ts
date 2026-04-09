import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';
import type { SearchRootHydrationRuntimeState } from './use-search-root-session-runtime-contract';
import { useSearchRuntimeOwner } from '../../hooks/use-search-runtime-owner';

type UseSearchRootHydrationRuntimeStateArgs = {
  searchRuntimeBus: ReturnType<typeof useSearchRuntimeOwner>['searchRuntimeBus'];
};

export const useSearchRootHydrationRuntimeState = ({
  searchRuntimeBus,
}: UseSearchRootHydrationRuntimeStateArgs): SearchRootHydrationRuntimeState =>
  useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      resultsHydrationKey: state.resultsHydrationKey,
      hydratedResultsKey: state.hydratedResultsKey,
    }),
    (a, b) =>
      a.resultsHydrationKey === b.resultsHydrationKey &&
      a.hydratedResultsKey === b.hydratedResultsKey,
    ['resultsHydrationKey', 'hydratedResultsKey'] as const
  );
