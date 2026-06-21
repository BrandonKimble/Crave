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
      if (match.entityType === 'restaurant' && match.entityId) {
        pendingRestaurantSelectionRef.current = {
          restaurantId: match.entityId,
        };
        openRestaurantProfilePreview(match.entityId, match.name);
      } else {
        pendingRestaurantSelectionRef.current = null;
      }
      setRestaurantOnlyIntent(
        match.entityType === 'restaurant' && match.entityId ? match.entityId : null
      );
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
