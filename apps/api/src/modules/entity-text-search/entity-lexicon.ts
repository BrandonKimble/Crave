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
 */

export function editBudgetForLength(len: number): number {
  return len <= 2 ? 0 : len <= 5 ? 1 : 2;
}

/** All strings reachable from `word` by deleting up to `maxDeletes` chars
 *  (including the word itself). Bounded: a 20-char word at d=2 yields
 *  1 + 20 + 190 = 211 variants. */
export function deletionVariants(word: string, maxDeletes: number): string[] {
  const seen = new Set<string>([word]);
  let frontier = [word];
  for (let d = 0; d < maxDeletes; d++) {
    const next: string[] = [];
    for (const w of frontier) {
      for (let i = 0; i < w.length; i++) {
        const v = w.slice(0, i) + w.slice(i + 1);
        if (!seen.has(v)) {
          seen.add(v);
          next.push(v);
        }
      }
    }
    frontier = next;
  }
  return Array.from(seen);
}

/** Damerau-Levenshtein (optimal string alignment): substitution, insertion,
 *  deletion, and ADJACENT TRANSPOSITION each cost 1. */
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
        .filter((w) => w.length >= 3 && w.length <= 64),
    ),
  );
}
