import React from 'react';

import type { AutocompleteMatch } from '../../../../services/autocomplete';
import type {
  SearchForegroundInteractionSubmitHandlers,
  SearchForegroundSubmitRuntimeArgs,
} from './use-search-foreground-interaction-runtime-contract';

type UseSearchForegroundSuggestionSubmitRuntimeArgs = Pick<
  SearchForegroundSubmitRuntimeArgs,
  | 'submitRuntime'
  | 'query'
  | 'prepareSearchSessionEntry'
  | 'suppressAutocompleteResults'
  | 'cancelAutocomplete'
  | 'dismissSearchKeyboard'
  | 'beginSubmitTransition'
  | 'setIsSearchFocused'
  | 'setIsSuggestionPanelActive'
  | 'setShowSuggestions'
  | 'setSuggestions'
  | 'setQuery'
  | 'setRestaurantOnlyIntent'
  | 'pendingRestaurantSelectionRef'
  | 'isSearchEditingRef'
  | 'allowSearchBlurExitRef'
  | 'ignoreNextSearchBlurRef'
  | 'openRestaurantProfilePreview'
  | 'openPollDetail'
>;

type SearchForegroundSuggestionSubmitRuntime = Pick<
  SearchForegroundInteractionSubmitHandlers,
  'handleSuggestionPress'
>;

export const useSearchForegroundSuggestionSubmitRuntime = ({
  submitRuntime,
  query,
  prepareSearchSessionEntry,
  suppressAutocompleteResults,
  cancelAutocomplete,
  dismissSearchKeyboard,
  beginSubmitTransition,
  setIsSearchFocused,
  setIsSuggestionPanelActive,
  setShowSuggestions,
  setSuggestions,
  setQuery,
  setRestaurantOnlyIntent,
  pendingRestaurantSelectionRef,
  isSearchEditingRef,
  allowSearchBlurExitRef,
  ignoreNextSearchBlurRef,
  openRestaurantProfilePreview,
  openPollDetail,
}: UseSearchForegroundSuggestionSubmitRuntimeArgs): SearchForegroundSuggestionSubmitRuntime => {
  const { submitSearch } = submitRuntime;

  const handleSuggestionPress = React.useCallback(
    (match: AutocompleteMatch) => {
      if (match.matchType === 'poll' || match.entityType === 'poll') {
        // §8.1 poll lane: this isn't a search — tear down the suggestion surface
        // and open the poll's detail (via the polls home, the same cross-surface
        // entry the profile screen uses). match.entityId is the pollId.
        isSearchEditingRef.current = false;
        allowSearchBlurExitRef.current = true;
        ignoreNextSearchBlurRef.current = true;
        suppressAutocompleteResults();
        cancelAutocomplete();
        setIsSearchFocused(false);
        setIsSuggestionPanelActive(false);
        dismissSearchKeyboard();
        setShowSuggestions(false);
        setSuggestions([]);
        openPollDetail(match.entityId);
        return;
      }
      prepareSearchSessionEntry({ captureOrigin: true });
      isSearchEditingRef.current = false;
      allowSearchBlurExitRef.current = true;
      ignoreNextSearchBlurRef.current = true;
      suppressAutocompleteResults();
      const typedPrefix = query;
      const nextQuery = match.name;
      const shouldDeferSuggestionClear = beginSubmitTransition();
      cancelAutocomplete();
      setIsSearchFocused(false);
      setIsSuggestionPanelActive(false);
      dismissSearchKeyboard();
      setQuery(nextQuery);
      if (!shouldDeferSuggestionClear) {
        setShowSuggestions(false);
        setSuggestions([]);
      }
      // Restaurant fast-path: we already know the exact entity, so open the profile DIRECTLY and
      // skip the results search entirely. Profile content comes from hydration; the map pin comes
      // from the seeded marker source published on hydration. No results sheet ever mounts — the
      // "never a results-list-first" guarantee is structural, not a race.
      if (match.entityType === 'restaurant' && match.entityId) {
        pendingRestaurantSelectionRef.current = null;
        setRestaurantOnlyIntent(null);
        openRestaurantProfilePreview(match.entityId, match.name);
        return;
      }
      pendingRestaurantSelectionRef.current = null;
      setRestaurantOnlyIntent(null);
      const matchType =
        match.matchType === 'query' || match.entityType === 'query' ? 'query' : 'entity';
      const submissionContext: Record<string, unknown> = {
        typedPrefix,
        matchType,
      };
      if (matchType === 'entity' && match.entityId && match.entityType) {
        submissionContext.selectedEntityId = match.entityId;
        submissionContext.selectedEntityType = match.entityType;
      }
      void submitSearch(
        {
          entrySurface: 'search_mode',
          submission: { source: 'autocomplete', context: submissionContext },
        },
        nextQuery
      );
    },
    [
      allowSearchBlurExitRef,
      beginSubmitTransition,
      cancelAutocomplete,
      dismissSearchKeyboard,
      ignoreNextSearchBlurRef,
      isSearchEditingRef,
      openPollDetail,
      openRestaurantProfilePreview,
      pendingRestaurantSelectionRef,
      prepareSearchSessionEntry,
      query,
      setIsSearchFocused,
      setIsSuggestionPanelActive,
      setQuery,
      setRestaurantOnlyIntent,
      setShowSuggestions,
      setSuggestions,
      submitSearch,
      suppressAutocompleteResults,
    ]
  );

  return React.useMemo(
    () => ({
      handleSuggestionPress,
    }),
    [handleSuggestionPress]
  );
};
