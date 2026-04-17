import type { UseSearchSuggestionSurfaceRuntimeResult } from './use-search-suggestion-surface-runtime-contract';

export type SearchRootSuggestionRuntime = UseSearchSuggestionSurfaceRuntimeResult & {
  isSuggestionScreenActive: boolean;
};
