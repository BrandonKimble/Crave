import React from 'react';

import type {
  SearchForegroundInteractionSubmitHandlers,
  SearchForegroundSubmitRuntimeArgs,
} from './use-search-foreground-interaction-runtime-contract';
import type { useSearchForegroundSubmitPreparationRuntime } from './use-search-foreground-submit-preparation-runtime';

type UseSearchForegroundQuerySubmitRuntimeArgs = Pick<
  SearchForegroundSubmitRuntimeArgs,
  'submitRuntime' | 'query' | 'shouldShowDockedPollsRef'
> & {
  submitPreparationRuntime: ReturnType<typeof useSearchForegroundSubmitPreparationRuntime>;
};

type SearchForegroundQuerySubmitRuntime = Pick<
  SearchForegroundInteractionSubmitHandlers,
  'handleSubmit'
>;

export const useSearchForegroundQuerySubmitRuntime = ({
  submitRuntime,
  query,
  shouldShowDockedPollsRef,
  submitPreparationRuntime,
}: UseSearchForegroundQuerySubmitRuntimeArgs): SearchForegroundQuerySubmitRuntime => {
  const { submitSearch } = submitRuntime;

  const handleSubmit = React.useCallback(() => {
    const trimmed = query.trim();
    if (trimmed.length > 0) {
      submitPreparationRuntime.prepareSubmitChrome({ captureOrigin: true });
    } else {
      submitPreparationRuntime.prepareSubmitChrome();
    }
    void submitSearch({
      transitionFromDockedPolls: shouldShowDockedPollsRef.current.shouldShowDockedPolls,
    });
  }, [query, shouldShowDockedPollsRef, submitPreparationRuntime, submitSearch]);

  return React.useMemo(
    () => ({
      handleSubmit,
    }),
    [handleSubmit]
  );
};
