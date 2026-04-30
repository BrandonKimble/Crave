import React from 'react';

import type { SearchSuggestionHeldDisplayRuntime } from './use-search-suggestion-surface-runtime-contract';

type UseSearchSuggestionHeldDisplayPresentationRuntimeArgs = {
  shouldFreezeSuggestionDisplayForRunOne: boolean;
  currentDisplayRuntime: SearchSuggestionHeldDisplayRuntime;
};

export const useSearchSuggestionHeldDisplayPresentationRuntime = ({
  shouldFreezeSuggestionDisplayForRunOne,
  currentDisplayRuntime,
}: UseSearchSuggestionHeldDisplayPresentationRuntimeArgs): SearchSuggestionHeldDisplayRuntime => {
  const frozenDisplayRuntimeRef =
    React.useRef<SearchSuggestionHeldDisplayRuntime | null>(null);

  if (!shouldFreezeSuggestionDisplayForRunOne || frozenDisplayRuntimeRef.current == null) {
    frozenDisplayRuntimeRef.current = currentDisplayRuntime;
  }

  return shouldFreezeSuggestionDisplayForRunOne
    ? frozenDisplayRuntimeRef.current ?? currentDisplayRuntime
    : currentDisplayRuntime;
};
