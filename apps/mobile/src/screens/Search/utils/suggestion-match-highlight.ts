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

// ── Presentation POLICY over the one match (F2302) ──────────────────────────
// The result card used to carry its OWN matcher (plain toLowerCase, first
// occurrence only, no spec), so typing "cafe" bolded "Café con Leche" in the
// suggestion list and highlighted nothing on the card — one screen giving two
// answers to "what did the user type". There is one matcher now
// (splitSuggestionMatchSegments, above); the card's extra rules are POLICY over
// that same match, expressed here.

export type SuggestionMatchPolicy = {
  /** Refuse to match a needle shorter than this many characters. */
  minLength: number;
  /** Refuse to match a needle containing whitespace. */
  singleWordOnly: boolean;
  /** When a match is a word PREFIX and the rest of that word is 's'/'es',
   *  extend the match over the whole word ("taco" highlights all of "tacos"). */
  expandPluralSuffix: boolean;
};

const isMatchWordChar = (char: string | undefined): boolean =>
  typeof char === 'string' && /[A-Za-z0-9]/.test(char);

/**
 * Expand each match segment that starts a word and is followed only by a
 * plural suffix ('s' / 'es') so the whole word reads as matched.
 */
const expandPluralSuffixes = (
  segments: SuggestionMatchSegment[],
  displayText: string
): SuggestionMatchSegment[] => {
  const matchRanges: Array<[number, number]> = [];
  let cursor = 0;
  for (const segment of segments) {
    const start = cursor;
    cursor += segment.text.length;
    if (segment.isMatch) {
      matchRanges.push([start, cursor]);
    }
  }

  const expandedRanges = matchRanges.map(([start, end]): [number, number] => {
    if (isMatchWordChar(displayText[start - 1])) {
      return [start, end];
    }
    let wordEnd = end;
    while (wordEnd < displayText.length && isMatchWordChar(displayText[wordEnd])) {
      wordEnd += 1;
    }
    const suffix = displayText.slice(end, wordEnd);
    return suffix === 's' || suffix === 'es' ? [start, wordEnd] : [start, end];
  });

  const expanded: SuggestionMatchSegment[] = [];
  let position = 0;
  for (const [start, end] of expandedRanges) {
    if (end <= position) {
      continue;
    }
    const from = Math.max(start, position);
    if (from > position) {
      expanded.push({ text: displayText.slice(position, from), isMatch: false });
    }
    expanded.push({ text: displayText.slice(from, end), isMatch: true });
    position = end;
  }
  if (position < displayText.length) {
    expanded.push({ text: displayText.slice(position), isMatch: false });
  }
  return expanded;
};

export const splitMatchSegmentsWithPolicy = (
  query: string,
  displayText: string,
  policy: SuggestionMatchPolicy
): SuggestionMatchSegment[] => {
  const trimmed = query.trim();
  if (
    trimmed.length < policy.minLength ||
    (policy.singleWordOnly && /\s/u.test(trimmed)) ||
    !displayText
  ) {
    return displayText ? [{ text: displayText, isMatch: false }] : [];
  }
  const segments = splitSuggestionMatchSegments(trimmed, displayText);
  if (!policy.expandPluralSuffix) {
    return segments;
  }
  return expandPluralSuffixes(segments, displayText);
};
