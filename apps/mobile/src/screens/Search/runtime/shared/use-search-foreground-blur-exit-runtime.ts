import React from 'react';

import type {
  SearchForegroundEditingRuntimeArgs,
  SearchForegroundInteractionEditingHandlers,
} from './use-search-foreground-interaction-runtime-contract';
import type { useSearchForegroundExitPresentationRuntime } from './use-search-foreground-exit-presentation-runtime';

type UseSearchForegroundBlurExitRuntimeArgs = Pick<
  SearchForegroundEditingRuntimeArgs,
  | 'isSuggestionPanelActive'
  | 'allowSearchBlurExitRef'
  | 'ignoreNextSearchBlurRef'
  | 'inputRef'
  | 'setIsSearchFocused'
> & {
  exitPresentationRuntime: ReturnType<typeof useSearchForegroundExitPresentationRuntime>;
};

type SearchForegroundBlurExitRuntime = Pick<
  SearchForegroundInteractionEditingHandlers,
  'handleSearchBlur'
>;

export const useSearchForegroundBlurExitRuntime = ({
  isSuggestionPanelActive,
  allowSearchBlurExitRef,
  ignoreNextSearchBlurRef,
  inputRef,
  setIsSearchFocused,
  exitPresentationRuntime,
}: UseSearchForegroundBlurExitRuntimeArgs): SearchForegroundBlurExitRuntime => {
  const handleSearchBlur = React.useCallback(() => {
    if (!allowSearchBlurExitRef.current && isSuggestionPanelActive) {
      ignoreNextSearchBlurRef.current = true;
      requestAnimationFrame(() => {
        inputRef.current?.focus?.();
      });
      return;
    }
    allowSearchBlurExitRef.current = false;
    setIsSearchFocused(false);
    if (ignoreNextSearchBlurRef.current) {
      ignoreNextSearchBlurRef.current = false;
      return;
    }
    const shouldDeferSuggestionClear = exitPresentationRuntime.requestExitEditingPresentation();
    exitPresentationRuntime.clearSuggestionsIfReady(shouldDeferSuggestionClear);
  }, [
    allowSearchBlurExitRef,
    exitPresentationRuntime,
    ignoreNextSearchBlurRef,
    inputRef,
    isSuggestionPanelActive,
    setIsSearchFocused,
  ]);

  return React.useMemo(
    () => ({
      handleSearchBlur,
    }),
    [handleSearchBlur]
  );
};
