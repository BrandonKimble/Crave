import {
  damerauLevenshtein,
  deletionVariants,
  editBudgetForLength,
  lexiconWords,
} from './entity-lexicon';

describe('entity lexicon (delete dictionary + Damerau-Levenshtein)', () => {
  it('transposition costs 1 (the class plain Levenshtein priced out)', () => {
    expect(damerauLevenshtein('vgean', 'vegan')).toBe(1);
    expect(damerauLevenshtein('brekfast', 'breakfast')).toBe(1);
    expect(damerauLevenshtein('piza', 'pizza')).toBe(1);
    expect(damerauLevenshtein('taco', 'taco')).toBe(0);
    expect(damerauLevenshtein('ham', 'rum')).toBe(2);
  });

  it('edit budget keeps the recall lattice bands (0/1/2 by length)', () => {
    expect(editBudgetForLength(2)).toBe(0);
    expect(editBudgetForLength(5)).toBe(1);
    expect(editBudgetForLength(6)).toBe(2);
  });

  it('a term and its 1-transposition share a deletion neighborhood', () => {
    // SymSpell property: dl(a,b) ≤ 2 ⇒ deletes(a,2) ∩ deletes(b,2) ≠ ∅
    const a = new Set(deletionVariants('vgean', 1));
    const b = new Set(deletionVariants('vegan', 1));
    const overlap = [...a].some((x) => b.has(x));
    expect(overlap).toBe(true);
  });

  it('deletion variants include the word itself and are bounded', () => {
    const variants = deletionVariants('pizza', 2);
    expect(variants).toContain('pizza');
    expect(variants.length).toBeLessThanOrEqual(1 + 5 + 10);
  });

  it('lexicon words: lowercased, apostrophes stripped, 3+ chars, deduped', () => {
    expect(lexiconWords("Phil's Icehouse & BBQ")).toEqual(
      expect.arrayContaining(['phils', 'icehouse', 'bbq']),
    );
    expect(lexiconWords('a la')).toEqual([]);
  });
});
