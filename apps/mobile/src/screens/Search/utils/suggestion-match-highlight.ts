// Refit layer 2 (plans/suggest-ideal-shape.md — "Highlight the match"): split a
// suggestion row's display text into typed-match vs predictive-completion segments
// so the row can BOLD the completion (the Baymard guideline: emphasize what the
// engine added, render what the user typed at regular weight). Pure string math —
// spec-covered in suggestion-match-highlight.spec.ts.

export type SuggestionMatchSegment = {
  text: string;
  /** true = this span is the typed query occurring in the display text
   *  (regular weight); false = the predictive remainder (bold). */
  isMatch: boolean;
};

/**
 * Diacritic-folding character normalizer with a 1:1 length guarantee: each
 * input character maps to exactly ONE output character, so an index into the
 * folded haystack is an index into the original display text. Characters
 * whose fold would change length (rare — ß, İ) keep their lowercased self
 * (or themselves), trading their foldability for index safety.
 */
const foldChar = (char: string): string => {
  const folded = char.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (folded.length === 1) {
    return folded;
  }
  const lowered = char.toLowerCase();
  return lowered.length === 1 ? lowered : char;
};

/** Shared case+accent fold for suggestion-surface text comparison (also used
 *  by the placeholder cache filter so filter and highlight agree on what
 *  "matches"). 1:1 length-preserving — see foldChar. */
export const foldSuggestionText = (value: string): string => {
  let folded = '';
  for (const char of value) {
    folded += foldChar(char);
  }
  return folded;
};

/**
 * Case- and accent-insensitive, non-overlapping, left-to-right occurrence
 * split ("cafe" highlights inside "Café du Monde"). When the query is empty
 * or never occurs (fuzzy/semantic rows), the whole text comes back as ONE
 * non-match segment — `hasSuggestionMatchSegments` tells renderers whether a
 * typed-vs-completion distinction exists at all (no distinction means no
 * bolding, not an all-bold title).
 */
export const splitSuggestionMatchSegments = (
  query: string,
  displayText: string
): SuggestionMatchSegment[] => {
  const normalizedQuery = foldSuggestionText(query.trim());
  if (!displayText) {
    return [];
  }
  if (!normalizedQuery) {
    return [{ text: displayText, isMatch: false }];
  }

  const normalizedText = foldSuggestionText(displayText);
  const segments: SuggestionMatchSegment[] = [];
  let cursor = 0;
  while (cursor < displayText.length) {
    const matchIndex = normalizedText.indexOf(normalizedQuery, cursor);
    if (matchIndex === -1) {
      segments.push({ text: displayText.slice(cursor), isMatch: false });
      break;
    }
    if (matchIndex > cursor) {
      segments.push({ text: displayText.slice(cursor, matchIndex), isMatch: false });
    }
    segments.push({
      text: displayText.slice(matchIndex, matchIndex + normalizedQuery.length),
      isMatch: true,
    });
    cursor = matchIndex + normalizedQuery.length;
  }
  return segments;
};

export const hasSuggestionMatchSegments = (segments: SuggestionMatchSegment[]): boolean =>
  segments.some((segment) => segment.isMatch);
