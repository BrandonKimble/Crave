import type { SearchRootForegroundInputRuntime } from '../shared/search-root-control-ports-runtime-contract';

export const createSearchRootForegroundInputRuntimeValue = ({
  captureSearchSessionQuery,
  focusSearchInput,
  handleQueryChange,
}: SearchRootForegroundInputRuntime): SearchRootForegroundInputRuntime => ({
  captureSearchSessionQuery,
  focusSearchInput,
  handleQueryChange,
});
