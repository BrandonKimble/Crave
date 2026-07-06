import React from 'react';

import type {
  SearchForegroundInteractionSubmitHandlers,
  SearchForegroundSubmitRuntimeArgs,
} from './use-search-foreground-interaction-runtime-contract';
import { resolveForegroundSearchSubmitEntrySurface } from './search-submit-entry-surface-contract';
import type { useSearchForegroundSubmitPreparationRuntime } from './use-search-foreground-submit-preparation-runtime';
import { SHORTCUT_QUERY_LABEL_BY_TAB } from './shortcut-toggle-display-query';

type UseSearchForegroundViewportShortcutRuntimeArgs = Pick<
  SearchForegroundSubmitRuntimeArgs,
  'submitRuntime' | 'isSuggestionPanelActive' | 'shouldShowDockedPollsRef' | 'setQuery'
> & {
  submitPreparationRuntime: ReturnType<typeof useSearchForegroundSubmitPreparationRuntime>;
};

type SearchForegroundViewportShortcutRuntime = Pick<
  SearchForegroundInteractionSubmitHandlers,
  'handleBestDishesHere' | 'handleBestRestaurantsHere'
>;

export const useSearchForegroundViewportShortcutRuntime = ({
  submitRuntime,
  isSuggestionPanelActive,
  shouldShowDockedPollsRef,
  setQuery,
  submitPreparationRuntime,
}: UseSearchForegroundViewportShortcutRuntimeArgs): SearchForegroundViewportShortcutRuntime => {
  const { submitViewportShortcut } = submitRuntime;
  const entrySurface = resolveForegroundSearchSubmitEntrySurface({ isSuggestionPanelActive });

  const handleBestDishesHere = React.useCallback(() => {
    submitPreparationRuntime.prepareSubmitChrome({ captureOrigin: true });
    setQuery(SHORTCUT_QUERY_LABEL_BY_TAB.dishes);
    void submitViewportShortcut('dishes', SHORTCUT_QUERY_LABEL_BY_TAB.dishes, {
      transitionFromDockedPolls: shouldShowDockedPollsRef.current.shouldShowDockedPolls,
      entrySurface,
      forceFreshBounds: true,
    });
  }, [
    entrySurface,
    setQuery,
    shouldShowDockedPollsRef,
    submitPreparationRuntime,
    submitViewportShortcut,
  ]);

  const handleBestRestaurantsHere = React.useCallback(() => {
    submitPreparationRuntime.prepareSubmitChrome({ captureOrigin: true });
    setQuery(SHORTCUT_QUERY_LABEL_BY_TAB.restaurants);
    void submitViewportShortcut('restaurants', SHORTCUT_QUERY_LABEL_BY_TAB.restaurants, {
      transitionFromDockedPolls: shouldShowDockedPollsRef.current.shouldShowDockedPolls,
      entrySurface,
      forceFreshBounds: true,
    });
  }, [
    entrySurface,
    setQuery,
    shouldShowDockedPollsRef,
    submitPreparationRuntime,
    submitViewportShortcut,
  ]);

  return React.useMemo(
    () => ({
      handleBestDishesHere,
      handleBestRestaurantsHere,
    }),
    [handleBestDishesHere, handleBestRestaurantsHere]
  );
};
