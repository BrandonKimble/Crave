import type React from 'react';

import type { AutocompleteMatch } from '../../../../services/autocomplete';

export const normalizeAutocompleteQuery = (value: string): string => value.trim().toLowerCase();

export const writeAutocompleteSuggestions = (
  setSuggestions: React.Dispatch<React.SetStateAction<AutocompleteMatch[]>>,
  matches: AutocompleteMatch[]
): void => {
  // F1308: this used to also call `setShowSuggestions(matches.length > 0)`. That state had
  // ZERO readers anywhere in the app (repo-wide grep for `showSuggestions` minus the setter
  // returned empty) — the suggestion surface derives its visibility from
  // shouldRenderAutocompleteSection / shouldRenderSuggestionPanel instead. Writing the array
  // is the whole job; the companion write only scheduled a root re-render to publish a value
  // nothing could observe.
  setSuggestions(matches);
};
