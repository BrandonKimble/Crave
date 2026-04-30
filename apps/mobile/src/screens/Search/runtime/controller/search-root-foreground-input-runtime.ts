import type { SearchRootForegroundInputRuntime } from '../shared/search-root-control-ports-runtime-contract';

export const createSearchRootForegroundInputRuntimeValue = ({
  captureSearchSessionQuery,
  focusSearchInput,
  handleSearchPressIn,
  handleQueryChange,
}: SearchRootForegroundInputRuntime): SearchRootForegroundInputRuntime => ({
  captureSearchSessionQuery,
  focusSearchInput,
  handleSearchPressIn,
  handleQueryChange,
});
