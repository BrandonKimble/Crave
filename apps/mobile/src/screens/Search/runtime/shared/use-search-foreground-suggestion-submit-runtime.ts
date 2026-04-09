import React from 'react';

import type { AutocompleteMatch } from '../../../../services/autocomplete';

import type {
  SearchForegroundInteractionSubmitHandlers,
  UseSearchForegroundInteractionRuntimeArgs,
} from './use-search-foreground-interaction-runtime-contract';

type UseSearchForegroundSuggestionSubmitRuntimeArgs = Pick<
  UseSearchForegroundInteractionRuntimeArgs,
  | 'submitRuntime'
  | 'query'
  | 'captureSearchSessionOrigin'
  | 'ensureSearchOverlay'
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
>;

export type SearchForegroundSuggestionSubmitRuntime = Pick<
  SearchForegroundInteractionSubmitHandlers,
  'handleSuggestionPress'
>;

export const useSearchForegroundSuggestionSubmitRuntime = ({
  submitRuntime,
  query,
  captureSearchSessionOrigin,
  ensureSearchOverlay,
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
}: UseSearchForegroundSuggestionSubmitRuntimeArgs): SearchForegroundSuggestionSubmitRuntime => {
  const { submitSearch } = submitRuntime;

  const handleSuggestionPress = React.useCallback(
    (match: AutocompleteMatch) => {
      captureSearchSessionOrigin();
      ensureSearchOverlay();
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
        { submission: { source: 'autocomplete', context: submissionContext } },
        nextQuery
      );
    },
    [
      allowSearchBlurExitRef,
      beginSubmitTransition,
      cancelAutocomplete,
      captureSearchSessionOrigin,
      dismissSearchKeyboard,
      ensureSearchOverlay,
      ignoreNextSearchBlurRef,
      isSearchEditingRef,
      openRestaurantProfilePreview,
      pendingRestaurantSelectionRef,
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

  return {
    handleSuggestionPress,
  };
};
