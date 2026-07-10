import React from 'react';

import type { AutocompleteMatch } from '../../../../services/autocomplete';
import type {
  SearchForegroundInteractionSubmitHandlers,
  SearchForegroundSubmitRuntimeArgs,
} from './use-search-foreground-interaction-runtime-contract';
import { resolveTypedReturnRestaurantPromotion } from './resolve-typed-return-restaurant-promotion';
import type { useSearchForegroundSubmitPreparationRuntime } from './use-search-foreground-submit-preparation-runtime';

type UseSearchForegroundQuerySubmitRuntimeArgs = Pick<
  SearchForegroundSubmitRuntimeArgs,
  'submitRuntime' | 'query' | 'isSuggestionPanelActive' | 'shouldShowDockedPollsRef'
> & {
  // The autocomplete suggestion list currently shown under the input, so a typed
  // Return can be promoted to the same profile-jump the tap path uses when it
  // uniquely + exactly matches a restaurant entity.
  suggestions: AutocompleteMatch[];
  // Reused verbatim from the suggestion (tap) runtime — this is the profile-jump
  // machinery; the promoter builds nothing new, it just replays the tap.
  handleSuggestionPress: SearchForegroundInteractionSubmitHandlers['handleSuggestionPress'];
  submitPreparationRuntime: ReturnType<typeof useSearchForegroundSubmitPreparationRuntime>;
};

type SearchForegroundQuerySubmitRuntime = Pick<
  SearchForegroundInteractionSubmitHandlers,
  'handleSubmit'
>;

export const useSearchForegroundQuerySubmitRuntime = ({
  submitRuntime,
  query,
  suggestions,
  handleSuggestionPress,
  submitPreparationRuntime,
}: UseSearchForegroundQuerySubmitRuntimeArgs): SearchForegroundQuerySubmitRuntime => {
  const { submitSearch } = submitRuntime;

  const handleSubmit = React.useCallback(() => {
    // Typed-Return promoter (search master plan §Step 5): when the typed query
    // uniquely + exactly matches a restaurant entity in the live suggestion list,
    // jump straight to its profile via the SAME tap machinery instead of running
    // a results search. Otherwise fall through to submitSearch unchanged.
    const promotedMatch = resolveTypedReturnRestaurantPromotion({ query, suggestions });
    if (promotedMatch) {
      handleSuggestionPress(promotedMatch);
      return;
    }

    submitPreparationRuntime.prepareSubmitChrome();
    // S-A: the presentation flags are gone — the reconciler derives the intent from the
    // tuple delta; docked-polls is a view input read at enter time.
    void submitSearch();
  }, [handleSuggestionPress, query, submitPreparationRuntime, submitSearch, suggestions]);

  return React.useMemo(
    () => ({
      handleSubmit,
    }),
    [handleSubmit]
  );
};
