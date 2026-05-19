import type { SearchRootSearchSurfaceResultsTransactionControlLane } from './use-search-root-control-plane-runtime-contract';

export const useSearchRootSearchSceneResultsTransactionKeyRuntime = ({
  searchSurfaceResultsTransactionControlLane,
}: {
  searchSurfaceResultsTransactionControlLane: SearchRootSearchSurfaceResultsTransactionControlLane;
}): string | null =>
  searchSurfaceResultsTransactionControlLane.searchSurfaceResultsTransactionKey;
