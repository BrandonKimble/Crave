import type { UseSearchSuggestionSurfaceRuntimeResult } from './search-suggestion-surface-runtime-contract';

export type SearchRootSuggestionRuntime = UseSearchSuggestionSurfaceRuntimeResult & {
  isSuggestionScreenActive: boolean;
};
