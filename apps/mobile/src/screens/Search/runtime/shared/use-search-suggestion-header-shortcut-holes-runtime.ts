import React from 'react';
import type { LayoutRectangle } from 'react-native';

import {
  cloneSuggestionMaskedHole,
  createSuggestionHeaderShortcutHole,
} from './search-suggestion-header-hole-runtime';
import type { SearchSuggestionMaskedHole } from './use-search-suggestion-surface-runtime-contract';

type SearchSuggestionShortcutHoleState = {
  restaurants: SearchSuggestionMaskedHole | null;
  dishes: SearchSuggestionMaskedHole | null;
};

export const useSearchSuggestionHeaderShortcutHolesRuntime = ({
  shouldDriveSuggestionLayout,
  shouldFreezeSuggestionHeader,
  shouldIncludeShortcutHoles,
  resolvedSearchShortcutsFrame,
  resolvedSearchShortcutChipFrames,
}: {
  shouldDriveSuggestionLayout: boolean;
  shouldFreezeSuggestionHeader: boolean;
  shouldIncludeShortcutHoles: boolean;
  resolvedSearchShortcutsFrame: LayoutRectangle | null;
  resolvedSearchShortcutChipFrames: Record<string, LayoutRectangle>;
}): SearchSuggestionShortcutHoleState => {
  const suggestionHeaderShortcutHolesRef =
    React.useRef<SearchSuggestionShortcutHoleState>({
      restaurants: null,
      dishes: null,
    });

  const suggestionHeaderShortcutHoleCandidates =
    React.useMemo<SearchSuggestionShortcutHoleState>(() => {
      if (
        !shouldDriveSuggestionLayout ||
        !shouldIncludeShortcutHoles ||
        !resolvedSearchShortcutsFrame
      ) {
        return { restaurants: null, dishes: null };
      }

      return {
        restaurants: createSuggestionHeaderShortcutHole({
          resolvedSearchShortcutsFrame,
          chipFrame: resolvedSearchShortcutChipFrames.restaurants,
        }),
        dishes: createSuggestionHeaderShortcutHole({
          resolvedSearchShortcutsFrame,
          chipFrame: resolvedSearchShortcutChipFrames.dishes,
        }),
      };
    }, [
      resolvedSearchShortcutChipFrames,
      resolvedSearchShortcutsFrame,
      shouldDriveSuggestionLayout,
      shouldIncludeShortcutHoles,
    ]);

  React.useEffect(() => {
    if (shouldFreezeSuggestionHeader) {
      return;
    }

    const { restaurants, dishes } = suggestionHeaderShortcutHoleCandidates;
    if (restaurants) {
      suggestionHeaderShortcutHolesRef.current.restaurants =
        cloneSuggestionMaskedHole(restaurants);
    }
    if (dishes) {
      suggestionHeaderShortcutHolesRef.current.dishes = cloneSuggestionMaskedHole(dishes);
    }
  }, [shouldFreezeSuggestionHeader, suggestionHeaderShortcutHoleCandidates]);

  return React.useMemo(() => {
    if (!shouldIncludeShortcutHoles) {
      return { restaurants: null, dishes: null };
    }

    const cached = suggestionHeaderShortcutHolesRef.current;
    if (shouldFreezeSuggestionHeader) {
      return cached;
    }

    return {
      restaurants: suggestionHeaderShortcutHoleCandidates.restaurants ?? cached.restaurants,
      dishes: suggestionHeaderShortcutHoleCandidates.dishes ?? cached.dishes,
    };
  }, [
    shouldFreezeSuggestionHeader,
    shouldIncludeShortcutHoles,
    suggestionHeaderShortcutHoleCandidates,
  ]);
};
