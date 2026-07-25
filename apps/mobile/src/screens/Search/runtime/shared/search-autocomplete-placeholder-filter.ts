import type { AutocompleteMatch } from '../../../../services/autocomplete';
import { foldSuggestionText } from '../../utils/suggestion-match-highlight';

// Never-blank rule (a) (plans/suggest-ideal-shape.md — "fix the unfiltered
// prefix-cache placeholder"): a longest-prefix cache entry can carry rows that no
// longer match what the user has typed — they flash, then vanish when the fresh
// response lands. Placeholder rows are filtered CLIENT-SIDE to those whose visible
// text (name, or an alias — alias-recalled rows keep their seat) contains the
// current query, case- AND accent-insensitive (the same fold the highlighter
// uses, so filter and highlight agree on what "matches" — an accented row must
// not vanish from the placeholder only to reappear when the fresh response
// lands). Pure — spec-covered in search-autocomplete-placeholder-filter.spec.ts.
export const filterAutocompletePlaceholderMatches = (
  matches: AutocompleteMatch[],
  rawQuery: string
): AutocompleteMatch[] => {
  const normalized = foldSuggestionText(rawQuery.trim());
  if (!normalized) {
    return matches;
  }
  return matches.filter(
    (match) =>
      foldSuggestionText(match.name).includes(normalized) ||
      (match.aliases ?? []).some((alias) => foldSuggestionText(alias).includes(normalized))
  );
};
