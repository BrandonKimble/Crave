import type React from 'react';

import type { AutocompleteMatch } from '../../../../services/autocomplete';

export const normalizeAutocompleteQuery = (value: string): string =>
  value.trim().toLowerCase();

export const writeAutocompleteSuggestions = (
  setSuggestions: React.Dispatch<React.SetStateAction<AutocompleteMatch[]>>,
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>,
  matches: AutocompleteMatch[]
): void => {
  setSuggestions(matches);
  setShowSuggestions(matches.length > 0);
};
