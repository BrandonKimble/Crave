/**
 * SYMSPELL-STYLE DELETE DICTIONARY (round-5 ideal abstraction).
 *
 * The edit-distance recall lane used to be a per-row `levenshtein()` over
 * every word of every active entity name — a seq scan, linear in corpus
 * size, and blind to transpositions ('vgean'→'vegan' costs 2 under plain
 * Levenshtein, over every band's budget). The lexicon precomputes every
 * entity word's deletion variants; lookup is ONE btree probe (constant in
 * corpus size) and the shortlist is verified with Damerau-Levenshtein in
 * JS, where a transposition honestly costs 1.
 *
 * The edit BUDGET is the same length-banded rule the recall lattice has
 * always used (0 edits ≤2 chars, 1 for 3–5, 2 for 6+) — no new constants.
 *
 * ...AND THAT RULE IS ABOUT LETTERS (zh prerequisite, 2026-08-11). Every
 * number above is calibrated on a script where one character is a FRACTION of
 * a word, so deleting one leaves a misspelling of the same word. Han, kana and
 * hangul are not such scripts, and the budget takes the TOKEN rather than a
 * length so it can see that — see `editBudgetForToken`.
 */
import { hasMorphemicScript } from './query-analyzer';

/** Length in CODE POINTS. `String.length` counts UTF-16 code units, so an
 *  astral character (𠮷, U+20BB7 — a real surname character, and this corpus
 *  carries restaurant names) counts as two and a 2-character word reads as
 *  length 4. Every length in this file is a count of user-perceived
 *  characters, which is what `Array.from` iterates. */
export function codePointLength(text: string): number {
  return Array.from(text).length;
}

/**
 * THE EDIT BUDGET, taken over the TOKEN.
 *
 * It used to take a length, which is precisely the information that cannot
 * answer the question: 3 characters buys 1 edit, so '牛肉面' was handed the
 * same allowance as 'tac' — and one deletion from '牛肉面' (beef noodle soup)
 * is '牛肉' (beef) or '肉面' (meat noodles). Those are not misspellings of the
 * dish, they are OTHER DISHES, and the delete-dictionary would have quietly
 * returned them as typo recoveries at the same rank 'vegan' comes back for
 * 'vgean'. A Latin typo lane recovers the word the user meant; the same lane
 * on a morphemic script recovers a word the user did not type.
 *
 * So a token carrying Han, kana or hangul gets budget ZERO — exact matching
 * only, which is also the honest state of the art: a character IS the
 * morpheme, and there is no sub-character slip for a budget to forgive. The
 * three scripts are one rule for one reason, stated at their shared
 * definition in query-analyzer: their unit of writing is a sound or a sense,
 * never a letter. (Kana are syllabic — dropping one drops a whole mora, and
 * ラーメン minus a mora is not a misspelling of ramen. Hangul composes jamo
 * into SYLLABLE BLOCKS before storage, so a mistyped jamo lands as a
 * different composed block, not as a deleted one: the deletion neighbourhood
 * models a slip Korean typing does not produce, while 비빔밥 minus a block is
 * the real word 비빔. Both fail the same test Han fails.)
 *
 * Recall is not lost, it is relocated: exact, prefix, alias and the CJK
 * character n-grams the analyzer emits all still serve these scripts. Only
 * the guess is withdrawn.
 */
export function editBudgetForToken(token: string): number {
  if (hasMorphemicScript(token)) return 0;
  const len = codePointLength(token);
  return len <= 2 ? 0 : len <= 5 ? 1 : 2;
}

/** All strings reachable from `word` by deleting up to `maxDeletes`
 *  CHARACTERS — code points, not UTF-16 code units, so a surrogate pair is
 *  deleted whole and never split into two lone surrogates (a string that
 *  matches nothing, is not valid UTF-8, and would have been written to the
 *  delete-key column as a broken key). Includes the word itself. Bounded: a
 *  20-char word at d=2 yields 1 + 20 + 190 = 211 variants. */
export function deletionVariants(word: string, maxDeletes: number): string[] {
  const seen = new Set<string>([word]);
  let frontier: string[][] = [Array.from(word)];
  for (let d = 0; d < maxDeletes; d++) {
    const next: string[][] = [];
    for (const chars of frontier) {
      for (let i = 0; i < chars.length; i++) {
        const variantChars = chars.slice(0, i).concat(chars.slice(i + 1));
        const v = variantChars.join('');
        if (!seen.has(v)) {
          seen.add(v);
          next.push(variantChars);
        }
      }
    }
    frontier = next;
  }
  return Array.from(seen);
}

/** Damerau-Levenshtein (optimal string alignment): substitution, insertion,
 *  deletion, and ADJACENT TRANSPOSITION each cost 1.
 *
 *  THE ONE PLACE IN THIS FILE THAT COUNTS UTF-16 CODE UNITS, not code points
 *  — `a.length` and `a[i]` are code-unit operations, so an astral character
 *  is two cells of the matrix and two "edits". Stated rather than fixed
 *  because it cannot currently be reached: the only caller
 *  (`fetchLexiconEditRows`) compares a probe against a delete-dictionary
 *  word, and both sides pass through `editBudgetForToken`, which returns 0
 *  for any token carrying a morphemic script — which is where this corpus's
 *  astral characters live (rare CJK ideographs like 𠮷). A budget of 0 means
 *  the lane never runs.
 *
 *  WHAT WOULD MAKE IT REAL: any caller that measures distance WITHOUT the
 *  budget gate, or a future budget that admits an astral-bearing script
 *  (emoji in names, historic scripts, mathematical alphanumerics). Then a
 *  one-character slip in an astral word reads as distance 2 and is silently
 *  refused by a budget of 1. The fix is `Array.from` on both inputs, which
 *  is what every other length in this file already does — it is not done now
 *  because an unreachable allocation on the hot shortlist loop buys
 *  nothing. */
export function damerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (a === b) return 0;
  if (!m || !n) return Math.max(m, n);
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

/** Tokenize an entity name/alias into lexicon words (same char class the
 *  gazetteer tokenizer uses, lowercased; 3+ chars — the 0-edit band needs
 *  no dictionary, exact/prefix lanes already serve it). */
export function lexiconWords(name: string): string[] {
  return Array.from(
    new Set(
      name
        .toLowerCase()
        .split(/[^\p{L}\p{N}']+/u)
        .map((w) => w.replace(/'/g, ''))
        .filter((w) => {
          const len = codePointLength(w);
          return len >= 3 && len <= 64;
        }),
    ),
  );
}
