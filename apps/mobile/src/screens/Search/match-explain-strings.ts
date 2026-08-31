import type { MatchExplain, SearchNotice } from '../../types';

/**
 * WHY THIS MATCHED — the ONE strings map (owner design 2026-08-30).
 *
 * Every user-facing string for the match-explain feature lives here, written
 * in plain diner language (no "tier", no "widened", no jargon). The principle:
 * explain by affinity, never by deficit — copy says what a result IS or HAS,
 * never what it lacks. Exact matches render nothing at all.
 *
 * One chip per card, already prioritized by the server
 * (similar > contains > partial).
 */
export const MATCH_EXPLAIN_STRINGS = {
  /** similar: the row is a close neighbor of the asked word
   *  ("bar" that admitted the pub; the ring cousin of "omakase"). */
  similar: (word: string) => `Close match for ${word}`,
  /** similar with no resolvable word (defensive — server always tries). */
  similarNoWord: 'Close match',
  /** contains, EVIDENCE basis: a human wrote the ingredient on this dish —
   *  the copy may assert it (owner ruling 2026-08-30). */
  contains: (word: string) => `Has ${word} in it`,
  /** contains, DERIVED basis: our own inference (synthesized canon /
   *  name-twin) — never promise what we inferred; hedge. */
  containsDerived: (word: string) => `May have ${word} in it`,
  /** contains + widening, EVIDENCE basis: testimony matched the asked
   *  ingredient or its judged stand-in ("bacon" admitted the pancetta
   *  carbonara) — assert the family, honestly wide. */
  containsWidened: (word: string) => `Made with ${word} or a close cousin`,
  /** contains + widening, DERIVED basis: inferred AND possibly a stand-in —
   *  hedge on both counts. */
  containsWidenedDerived: (word: string) => `May have ${word} (or a close cousin) in it`,
  /** partial: the words of yours this row DID match (positive framing). */
  partial: (words: string) => `Matches ${words}`,
  /** Page-level line when a word found nothing here and we queued a hunt. */
  starvedNotice: (words: string) =>
    `Nothing here mentions ${words} yet — we're on the lookout. Showing closest matches.`,
} as const;

/** Join the user's words for display: quoted, human-ordered. */
const quoteJoin = (terms: readonly string[]): string =>
  terms.map((term) => `‘${term}’`).join(terms.length === 2 ? ' and ' : ', ');

/**
 * One chip's text for a row, or null when the card should stay silent
 * (exact matches carry no matchExplain at all; empty word lists stay quiet
 * except for the ring's generic "Close match").
 */
export const resolveMatchExplainChipText = (
  explain: MatchExplain | null | undefined
): string | null => {
  if (!explain) {
    return null;
  }
  const terms = (explain.terms ?? []).filter(Boolean);
  switch (explain.kind) {
    case 'similar':
      return terms.length
        ? MATCH_EXPLAIN_STRINGS.similar(quoteJoin(terms))
        : MATCH_EXPLAIN_STRINGS.similarNoWord;
    case 'contains': {
      if (!terms.length) {
        return null;
      }
      const words = quoteJoin(terms);
      // Basis → verb (owner ruling 2026-08-30): only human testimony
      // ('evidence') may assert; anything else — including an absent basis
      // from an older server — hedges.
      const evidence = explain.basis === 'evidence';
      if (explain.widened) {
        return evidence
          ? MATCH_EXPLAIN_STRINGS.containsWidened(words)
          : MATCH_EXPLAIN_STRINGS.containsWidenedDerived(words);
      }
      return evidence
        ? MATCH_EXPLAIN_STRINGS.contains(words)
        : MATCH_EXPLAIN_STRINGS.containsDerived(words);
    }
    case 'partial':
      return terms.length ? MATCH_EXPLAIN_STRINGS.partial(quoteJoin(terms)) : null;
    default:
      return null;
  }
};

/** The page-level starved-and-searching line, or null. */
export const resolveSearchNoticeText = (notice: SearchNotice | null | undefined): string | null => {
  if (!notice || notice.kind !== 'starved_on_demand') {
    return null;
  }
  const terms = (notice.terms ?? []).filter(Boolean);
  if (!terms.length) {
    return null;
  }
  return MATCH_EXPLAIN_STRINGS.starvedNotice(quoteJoin(terms));
};
