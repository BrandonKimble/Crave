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
  | 'suppressAutocompleteResults'
  | 'cancelAutocomplete'
  | 'dismissSearchKeyboard'
  | 'beginSubmitTransition'
  | 'setIsSearchFocused'
  | 'setIsSuggestionPanelActive'
  | 'setShowSuggestions'
  | 'setSuggestions'
  | 'setQuery'
  | 'pendingRestaurantSelectionRef'
  | 'isSearchEditingRef'
  | 'allowSearchBlurExitRef'
  | 'ignoreNextSearchBlurRef'
  | 'openRestaurantProfilePreview'
  | 'openPollDetail'
  | 'openUserProfile'
>;

type SearchForegroundSuggestionSubmitRuntime = Pick<
  SearchForegroundInteractionSubmitHandlers,
  'handleSuggestionPress'
>;

export const useSearchForegroundSuggestionSubmitRuntime = ({
  submitRuntime,
  query,
  suppressAutocompleteResults,
  cancelAutocomplete,
  dismissSearchKeyboard,
  beginSubmitTransition,
  setIsSearchFocused,
  setIsSuggestionPanelActive,
  setShowSuggestions,
  setSuggestions,
  setQuery,
  pendingRestaurantSelectionRef,
  isSearchEditingRef,
  allowSearchBlurExitRef,
  ignoreNextSearchBlurRef,
  openRestaurantProfilePreview,
  openPollDetail,
  openUserProfile,
}: UseSearchForegroundSuggestionSubmitRuntimeArgs): SearchForegroundSuggestionSubmitRuntime => {
  const { submitSearch } = submitRuntime;

  const handleSuggestionPress = React.useCallback(
    (match: AutocompleteMatch) => {
      if (match.matchType === 'user' || match.entityType === 'user') {
        // Person row (user lane): not a search — tear down the suggestion surface and
        // PUSH the userProfile page (the follow-drill child push; origin capture and
        // pop-back ride the standard rails). match.entityId is the userId.
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
        openUserProfile(match.entityId);
        return;
      }
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
        openRestaurantProfilePreview(match.entityId, match.name);
        return;
      }
      pendingRestaurantSelectionRef.current = null;
      const matchType =
        match.matchType === 'query' || match.entityType === 'query' ? 'query' : 'entity';
      // S-D.3: the entity selection travels TYPED (the attempt config injects the wire
      // fields); only the non-entity metadata stays in the context record.
      const isTypedEntitySelection =
        matchType === 'entity' &&
        Boolean(match.entityId) &&
        (match.entityType === 'food' ||
          match.entityType === 'food_attribute' ||
          match.entityType === 'restaurant_attribute');
      void submitSearch(
        {
          ...(isTypedEntitySelection && match.entityId
            ? {
                selectedEntity: {
                  entityId: match.entityId,
                  entityType: match.entityType as
                    | 'food'
                    | 'food_attribute'
                    | 'restaurant_attribute',
                },
              }
            : null),
          submission: { source: 'autocomplete', context: { typedPrefix, matchType } },
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
      openUserProfile,
      openRestaurantProfilePreview,
      pendingRestaurantSelectionRef,
      query,
      setIsSearchFocused,
      setIsSuggestionPanelActive,
      setQuery,
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
