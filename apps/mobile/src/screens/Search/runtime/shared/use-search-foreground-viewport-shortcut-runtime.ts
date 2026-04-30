import React from 'react';

import type {
  SearchForegroundInteractionSubmitHandlers,
  SearchForegroundSubmitRuntimeArgs,
} from './use-search-foreground-interaction-runtime-contract';
import type { useSearchForegroundSubmitPreparationRuntime } from './use-search-foreground-submit-preparation-runtime';

type UseSearchForegroundViewportShortcutRuntimeArgs = Pick<
  SearchForegroundSubmitRuntimeArgs,
  'submitRuntime' | 'shouldShowDockedPollsRef' | 'setQuery'
> & {
  submitPreparationRuntime: ReturnType<typeof useSearchForegroundSubmitPreparationRuntime>;
};

type SearchForegroundViewportShortcutRuntime = Pick<
  SearchForegroundInteractionSubmitHandlers,
  'handleBestDishesHere' | 'handleBestRestaurantsHere'
>;

export const useSearchForegroundViewportShortcutRuntime = ({
  submitRuntime,
  shouldShowDockedPollsRef,
  setQuery,
  submitPreparationRuntime,
}: UseSearchForegroundViewportShortcutRuntimeArgs): SearchForegroundViewportShortcutRuntime => {
  const { submitViewportShortcut } = submitRuntime;

  const handleBestDishesHere = React.useCallback(() => {
    submitPreparationRuntime.prepareSubmitChrome({ captureOrigin: true });
    setQuery('Best dishes');
    void submitViewportShortcut('dishes', 'Best dishes', {
      transitionFromDockedPolls: shouldShowDockedPollsRef.current.shouldShowDockedPolls,
    });
  }, [setQuery, shouldShowDockedPollsRef, submitPreparationRuntime, submitViewportShortcut]);

  const handleBestRestaurantsHere = React.useCallback(() => {
    submitPreparationRuntime.prepareSubmitChrome({ captureOrigin: true });
    setQuery('Best restaurants');
    void submitViewportShortcut('restaurants', 'Best restaurants', {
      transitionFromDockedPolls: shouldShowDockedPollsRef.current.shouldShowDockedPolls,
    });
  }, [setQuery, shouldShowDockedPollsRef, submitPreparationRuntime, submitViewportShortcut]);

  return React.useMemo(
    () => ({
      handleBestDishesHere,
      handleBestRestaurantsHere,
    }),
    [handleBestDishesHere, handleBestRestaurantsHere]
  );
};
