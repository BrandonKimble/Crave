import React from 'react';
import type {
  SearchSuggestionHeaderHolesRuntime,
  SearchSuggestionHeaderHolesRuntimeArgs,
  SearchSuggestionMaskedHole,
} from './use-search-suggestion-surface-runtime-contract';
import { cloneSuggestionMaskedHoleArray } from './search-suggestion-header-hole-runtime';
import { useSearchSuggestionHeaderSearchHoleRuntime } from './use-search-suggestion-header-search-hole-runtime';
import { useSearchSuggestionHeaderShortcutHolesRuntime } from './use-search-suggestion-header-shortcut-holes-runtime';

export const useSearchSuggestionHeaderHolesRuntime = ({
  shouldDriveSuggestionLayout,
  shouldFreezeSuggestionHeader,
  shouldIncludeShortcutHoles,
  resolvedSearchContainerFrame,
  resolvedSearchShortcutsFrame,
  resolvedSearchShortcutChipFrames,
}: SearchSuggestionHeaderHolesRuntimeArgs): SearchSuggestionHeaderHolesRuntime => {
  const suggestionHeaderHolesRef = React.useRef<SearchSuggestionMaskedHole[]>([]);
  const suggestionHeaderSearchHole = useSearchSuggestionHeaderSearchHoleRuntime({
    shouldDriveSuggestionLayout,
    shouldFreezeSuggestionHeader,
    resolvedSearchContainerFrame,
  });
  const suggestionHeaderShortcutHoles = useSearchSuggestionHeaderShortcutHolesRuntime({
    shouldDriveSuggestionLayout,
    shouldFreezeSuggestionHeader,
    shouldIncludeShortcutHoles,
    resolvedSearchShortcutsFrame,
    resolvedSearchShortcutChipFrames,
  });
  const suggestionHeaderHoles = React.useMemo<SearchSuggestionMaskedHole[]>(() => {
    if (!shouldDriveSuggestionLayout) {
      return [];
    }
    const holes: SearchSuggestionMaskedHole[] = [];
    if (suggestionHeaderSearchHole) {
      holes.push(suggestionHeaderSearchHole);
    }
    if (suggestionHeaderShortcutHoles.restaurants) {
      holes.push(suggestionHeaderShortcutHoles.restaurants);
    }
    if (suggestionHeaderShortcutHoles.dishes) {
      holes.push(suggestionHeaderShortcutHoles.dishes);
    }
    return holes;
  }, [shouldDriveSuggestionLayout, suggestionHeaderSearchHole, suggestionHeaderShortcutHoles]);
  const resolvedSuggestionHeaderHoles = React.useMemo(() => {
    if (shouldFreezeSuggestionHeader) {
      return cloneSuggestionMaskedHoleArray(suggestionHeaderHolesRef.current);
    }
    if (suggestionHeaderHoles.length > 0) {
      const nextHoles = cloneSuggestionMaskedHoleArray(suggestionHeaderHoles);
      suggestionHeaderHolesRef.current = nextHoles;
      return nextHoles;
    }
    return cloneSuggestionMaskedHoleArray(suggestionHeaderHolesRef.current);
  }, [shouldFreezeSuggestionHeader, suggestionHeaderHoles]);

  return {
    resolvedSuggestionHeaderHoles,
  };
};
