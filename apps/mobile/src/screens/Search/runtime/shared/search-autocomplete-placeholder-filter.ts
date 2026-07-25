import type { AutocompleteMatch } from '../../../../services/autocomplete';

// Never-blank rule (a) (plans/suggest-ideal-shape.md — "fix the unfiltered
// prefix-cache placeholder"): a longest-prefix cache entry can carry rows that no
// longer match what the user has typed — they flash, then vanish when the fresh
// response lands. Placeholder rows are filtered CLIENT-SIDE to those whose visible
// text (name, or an alias — alias-recalled rows keep their seat) contains the
// current query, case-insensitive. Pure — spec-covered in
// search-autocomplete-placeholder-filter.spec.ts.
export const filterAutocompletePlaceholderMatches = (
  matches: AutocompleteMatch[],
  rawQuery: string
): AutocompleteMatch[] => {
  const normalized = rawQuery.trim().toLowerCase();
  if (!normalized) {
    return matches;
  }
  return matches.filter(
    (match) =>
      match.name.toLowerCase().includes(normalized) ||
      (match.aliases ?? []).some((alias) => alias.toLowerCase().includes(normalized))
  );
};
