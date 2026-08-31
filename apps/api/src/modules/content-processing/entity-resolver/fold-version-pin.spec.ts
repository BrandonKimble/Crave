import {
  canonicalFold,
  diacriticFold,
  FOLD_ALGORITHM_VERSION,
} from './entity-identity';

/**
 * THE FOLD VERSION PIN (multilingual ruling R5, 2026-08-12). Golden vectors
 * freeze the OBSERVABLE behavior of fold algorithm v1. Any change to either
 * fold's output for any of these inputs fails here — and the failure message
 * is the law: bump FOLD_ALGORITHM_VERSION, regenerate the vectors in the
 * same commit, and state the corpus-backfill decision ({full:true} heal or a
 * reasoned deferral). The DB-side counterpart is the
 * `identity.stored-keys-match-the-fold` invariant (scripts/check-fold-drift.ts).
 *
 * Mutation proofs: any behavioral edit to foldWithAccentPolicy (or its
 * tables) reddens a vector; editing FOLD_ALGORITHM_VERSION alone reddens the
 * version assertion.
 */
const V2_VECTORS: Array<[input: string, canonical: string, accent: string]> = [
  ["The Joe's Pizza!", 'the joes pizza', 'the joes pizza'],
  ['Phở Bò', 'pho bo', 'phở bò'],
  ['Cơm Cháy', 'com chay', 'cơm cháy'],
  ['Bún Đậu', 'bun dau', 'bún đậu'],
  ['Straße', 'strasse', 'strasse'],
  ['Café Æble', 'cafe aeble', 'café aeble'],
  ['三峡人家', '三峡人家', '三峡人家'],
  ['McDonald’s', 'mcdonalds', 'mcdonalds'],
  // v2 (punctuation-matrix audit 2026-08-30): ™/℠ are separators, never the
  // NFKD letters "tm"/"sm" glued onto the brand token.
  ['Wingstop™', 'wingstop', 'wingstop'],
  ['Brand℠ Café', 'brand cafe', 'brand café'],
  ['Tiny Pies® - Burnet Rd.', 'tiny pies burnet rd', 'tiny pies burnet rd'],
];

describe('fold algorithm version pin', () => {
  it('is version 2 — bump it WITH regenerated vectors, never alone', () => {
    expect(FOLD_ALGORITHM_VERSION).toBe(2);
  });

  it.each(V2_VECTORS)(
    'v2 vector: %s',
    (input, expectedCanonical, expectedAccent) => {
      expect(canonicalFold(input)).toBe(expectedCanonical);
      expect(diacriticFold(input)).toBe(expectedAccent);
    },
  );
});
