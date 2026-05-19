import React from 'react';

import type { SearchSuggestionHeldDisplayRuntime } from './use-search-suggestion-surface-runtime-contract';

type UseSearchSuggestionHeldDisplayPresentationRuntimeArgs = {
  shouldFreezeSuggestionDisplayForSearchSurfaceRedraw: boolean;
  currentDisplayRuntime: SearchSuggestionHeldDisplayRuntime;
};

export const useSearchSuggestionHeldDisplayPresentationRuntime = ({
  shouldFreezeSuggestionDisplayForSearchSurfaceRedraw,
  currentDisplayRuntime,
}: UseSearchSuggestionHeldDisplayPresentationRuntimeArgs): SearchSuggestionHeldDisplayRuntime => {
  const frozenDisplayRuntimeRef = React.useRef<SearchSuggestionHeldDisplayRuntime | null>(null);

  if (
    !shouldFreezeSuggestionDisplayForSearchSurfaceRedraw ||
    frozenDisplayRuntimeRef.current == null
  ) {
    frozenDisplayRuntimeRef.current = currentDisplayRuntime;
  }

  return shouldFreezeSuggestionDisplayForSearchSurfaceRedraw
    ? (frozenDisplayRuntimeRef.current ?? currentDisplayRuntime)
    : currentDisplayRuntime;
};
