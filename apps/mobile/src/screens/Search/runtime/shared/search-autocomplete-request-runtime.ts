import type React from 'react';

import type { AutocompleteMatch } from '../../../../services/autocomplete';
import type { Coordinate, MapBounds } from '../../../../types';
import { foldSuggestionText } from '../../utils/suggestion-match-highlight';

/**
 * F6005: ONE DECLARATION OF THE AUTOCOMPLETE CALL SHAPE.
 *
 * This 7-line signature was transcribed VERBATIM at five hops of the request
 * tower, so changing the call shape was a five-file edit with no compiler
 * forcing the fifth. It lives here, beside the family's other shared pure
 * helpers, and the sites that need it import it.
 */
export type RunAutocomplete = (
  value: string,
  options?: {
    debounceMs?: number;
    bounds?: MapBounds | null;
    userLocation?: Coordinate | null;
  }
) => Promise<AutocompleteMatch[]>;

// F1304: the cache key must fold the same way the placeholder filter and
// highlighter do (foldSuggestionText — case AND accent insensitive), or an
// accented query mints a cache key its own filter would never have produced,
// and the query can never hit the entry it just populated. `.trim()` first —
// foldSuggestionText is not itself whitespace-aware.
export const normalizeAutocompleteQuery = (value: string): string =>
  foldSuggestionText(value.trim());

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
