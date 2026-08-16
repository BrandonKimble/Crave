import React from 'react';

import type { AutocompleteMatch } from '../../../../services/autocomplete';
import type {
  SearchForegroundInteractionSubmitHandlers,
  SearchForegroundSubmitRuntimeArgs,
} from './search-foreground-interaction-runtime-contract';

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
  | 'setSuggestions'
  | 'setQuery'
  | 'setIsAutocompleteSuppressed'
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
  setSuggestions,
  setQuery,
  setIsAutocompleteSuppressed,
  pendingRestaurantSelectionRef,
  isSearchEditingRef,
  allowSearchBlurExitRef,
  ignoreNextSearchBlurRef,
  openRestaurantProfilePreview,
  openPollDetail,
  openUserProfile,
}: UseSearchForegroundSuggestionSubmitRuntimeArgs): SearchForegroundSuggestionSubmitRuntime => {
  const { submitSearch, runRestaurantEntitySearch } = submitRuntime;

  // F1029: this teardown prologue used to be transcribed three times (user lane, poll
  // lane, entity lane) and had silently diverged — the user/poll copies cleared
  // `suggestions` unconditionally while the entity copy alone consulted
  // `beginSubmitTransition()`'s hold. Investigated: it is NOT drift. User/poll rows PUSH
  // a full child screen (userProfile / poll detail) that covers the search surface, so
  // there is nothing for the suggestion-panel close animation to hold visually open —
  // `beginSubmitTransition()` exists to freeze suggestion content while search's OWN
  // panel animates closed in place, which only the entity lane (query submit, staying on
  // the search surface) does. One shared prologue now takes that as an explicit,
  // documented parameter instead of three copies that could still drift unnoticed.
  const tearDownSuggestionSurfaceForCommit = React.useCallback(
    (holdList: boolean): boolean => {
      isSearchEditingRef.current = false;
      allowSearchBlurExitRef.current = true;
      ignoreNextSearchBlurRef.current = true;
      // F6000: committing a suggestion suppresses the panel until focus
      // returns — the STATE carries that, not a ref the next render erased.
      setIsAutocompleteSuppressed(true);
      suppressAutocompleteResults();
      const shouldDeferSuggestionClear = holdList ? beginSubmitTransition() : false;
      cancelAutocomplete();
      setIsSearchFocused(false);
      setIsSuggestionPanelActive(false);
      dismissSearchKeyboard();
      if (!shouldDeferSuggestionClear) {
        setSuggestions([]);
      }
      return shouldDeferSuggestionClear;
    },
    [
      allowSearchBlurExitRef,
      beginSubmitTransition,
      cancelAutocomplete,
      dismissSearchKeyboard,
      ignoreNextSearchBlurRef,
      isSearchEditingRef,
      setIsAutocompleteSuppressed,
      setIsSearchFocused,
      setIsSuggestionPanelActive,
      setSuggestions,
      suppressAutocompleteResults,
    ]
  );

  const handleSuggestionPress = React.useCallback(
    (match: AutocompleteMatch, options?: { seeLocations?: boolean }) => {
      if (match.matchType === 'user' || match.entityType === 'user') {
        // Person row (user lane): not a search — tear down the suggestion surface and
        // PUSH the userProfile page (the follow-drill child push; origin capture and
        // pop-back ride the standard rails). match.entityId is the userId. No hold: the
        // pushed screen covers the search surface, so nothing needs the list preserved.
        tearDownSuggestionSurfaceForCommit(false);
        openUserProfile(match.entityId);
        return;
      }
      if (match.matchType === 'poll' || match.entityType === 'poll') {
        // §8.1 poll lane: this isn't a search — tear down the suggestion surface
        // and open the poll's detail (via the polls home, the same cross-surface
        // entry the profile screen uses). match.entityId is the pollId. No hold, same
        // reason as the user lane above.
        tearDownSuggestionSurfaceForCommit(false);
        openPollDetail(match.entityId);
        return;
      }
      const typedPrefix = query;
      // MATCHING ≠ DISPLAY (i18n N10): submit the canonical token when the
      // server provides one — a localized display name must never become
      // the matcher's input.
      const nextQuery = match.submitToken ?? match.name;
      // Entity/query lane: search stays on the search surface and animates its own
      // panel closed, so it holds the suggestion list open across that animation.
      tearDownSuggestionSurfaceForCommit(true);
      setQuery(nextQuery);
      // "See locations" chip (multi-location places): a committed
      // see-locations search — the server's lean variant returns the
      // restaurant's IN-VIEW locations as pins, the single-restaurant collapse
      // opens the profile panel (its all-locations rows), and the pending-
      // selection ref primes the warm auto-open — the same committed-entity
      // lane the recently-viewed tap uses, with the mode discriminator.
      if (options?.seeLocations && match.entityType === 'place' && match.entityId) {
        pendingRestaurantSelectionRef.current = { placeId: match.entityId };
        openRestaurantProfilePreview(match.entityId, match.name);
        void runRestaurantEntitySearch({
          placeId: match.entityId,
          placeName: nextQuery,
          submissionSource: 'autocomplete',
          typedPrefix,
          seeLocations: true,
        });
        return;
      }
      // Restaurant fast-path: we already know the exact entity, so open the profile DIRECTLY and
      // skip the results search entirely. Profile content comes from hydration; the map pin comes
      // from the seeded marker source published on hydration. No results sheet ever mounts — the
      // "never a results-list-first" guarantee is structural, not a race.
      if (match.entityType === 'place' && match.entityId) {
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
        (match.entityType === 'item' ||
          match.entityType === 'item_attribute' ||
          match.entityType === 'place_attribute' ||
          match.entityType === 'ingredient');
      void submitSearch(
        {
          ...(isTypedEntitySelection && match.entityId
            ? {
                selectedEntity: {
                  entityId: match.entityId,
                  entityType: match.entityType as
                    | 'item'
                    | 'item_attribute'
                    | 'place_attribute'
                    | 'ingredient',
                },
              }
            : null),
          submission: { source: 'autocomplete', context: { typedPrefix, matchType } },
        },
        nextQuery
      );
    },
    [
      openPollDetail,
      openUserProfile,
      openRestaurantProfilePreview,
      pendingRestaurantSelectionRef,
      query,
      runRestaurantEntitySearch,
      setQuery,
      submitSearch,
      tearDownSuggestionSurfaceForCommit,
    ]
  );

  return React.useMemo(
    () => ({
      handleSuggestionPress,
    }),
    [handleSuggestionPress]
  );
};
