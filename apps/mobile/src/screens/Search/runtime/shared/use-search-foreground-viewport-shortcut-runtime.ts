import React from 'react';

import type {
  SearchForegroundInteractionSubmitHandlers,
  SearchForegroundSubmitRuntimeArgs,
} from './search-foreground-interaction-runtime-contract';
import type { useSearchForegroundSubmitPreparationRuntime } from './use-search-foreground-submit-preparation-runtime';
import { SHORTCUT_QUERY_LABEL_BY_TAB } from './shortcut-toggle-display-query';

type UseSearchForegroundViewportShortcutRuntimeArgs = Pick<
  SearchForegroundSubmitRuntimeArgs,
  'submitRuntime' | 'setQuery'
> & {
  submitPreparationRuntime: ReturnType<typeof useSearchForegroundSubmitPreparationRuntime>;
};

type SearchForegroundViewportShortcutRuntime = Pick<
  SearchForegroundInteractionSubmitHandlers,
  'handleBestRestaurantsHere'
>;

export const useSearchForegroundViewportShortcutRuntime = ({
  submitRuntime,
  setQuery,
  submitPreparationRuntime,
}: UseSearchForegroundViewportShortcutRuntimeArgs): SearchForegroundViewportShortcutRuntime => {
  const { submitViewportShortcut } = submitRuntime;

  const handleBestRestaurantsHere = React.useCallback(() => {
    submitPreparationRuntime.prepareSubmitChrome();
    setQuery(SHORTCUT_QUERY_LABEL_BY_TAB.restaurants);
    void submitViewportShortcut('restaurants', SHORTCUT_QUERY_LABEL_BY_TAB.restaurants, {
      forceFreshBounds: true,
    });
  }, [setQuery, submitPreparationRuntime, submitViewportShortcut]);

  return React.useMemo(
    () => ({
      handleBestRestaurantsHere,
    }),
    [handleBestRestaurantsHere]
  );
};
