import {
  codePointLength,
  damerauLevenshtein,
  deletionVariants,
  editBudgetForToken,
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
    expect(editBudgetForToken('ab')).toBe(0);
    expect(editBudgetForToken('vegan')).toBe(1);
    expect(editBudgetForToken('pizzas')).toBe(2);
  });

  /**
   * THE ZH PREREQUISITE. One Han character is a MORPHEME, so the Latin
   * premise the whole delete dictionary rests on — that removing a character
   * leaves a misspelling of the same word — is false here: 牛肉面 minus one
   * character is 牛肉 (beef), a different dish that the lane would have
   * offered as a typo recovery.
   */
  describe('morphemic scripts get NO edit budget', () => {
    it('a Han token produces no deletion variants but itself', () => {
      expect(editBudgetForToken('牛肉面')).toBe(0);
      expect(deletionVariants('牛肉面', editBudgetForToken('牛肉面'))).toEqual([
        '牛肉面',
      ]);
      // The specific over-recall this closes.
      expect(deletionVariants('牛肉面', 1)).toContain('牛肉');
    });

    it('kana and hangul answer to the same rule, and so does a mixed token', () => {
      expect(editBudgetForToken('ラーメン')).toBe(0); // moras, not letters
      expect(editBudgetForToken('비빔밥')).toBe(0); // syllable blocks
      // A token that MIXES scripts still carries a morphemic one — the
      // budget must not be shadowed by whichever script is found first.
      expect(editBudgetForToken('тако牛肉面')).toBe(0);
      expect(editBudgetForToken('ramen牛肉')).toBe(0);
    });

    it('Latin is untouched — exact prior outputs', () => {
      expect(editBudgetForToken('vgean')).toBe(1);
      // EXACT prior outputs, order included, proven against the code-unit
      // algorithm this replaced rather than against a hand-copied list.
      const priorImplementation = (word: string, maxDeletes: number) => {
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
      };
      for (const word of ['pizza', 'vgean', 'breakfast', 'phils', 'bbq']) {
        for (const budget of [1, 2]) {
          expect(deletionVariants(word, budget)).toEqual(
            priorImplementation(word, budget),
          );
        }
      }
      // Latin, Cyrillic, Greek, Thai, Devanagari: alphabets and abugidas,
      // all still typo-recoverable.
      expect(editBudgetForToken('камарон')).toBe(2);
      expect(editBudgetForToken('อาหาร')).toBe(1);
    });
  });

  /**
   * A surrogate pair is ONE character. Slicing UTF-16 code units split 𠮷
   * into two lone surrogates — a delete key that matches nothing, is not
   * valid UTF-8, and would still have been written to the column.
   */
  it('an astral character is never split into lone surrogates', () => {
    const astral = '𠮷'; // U+20BB7, two UTF-16 code units
    expect(astral.length).toBe(2);
    expect(codePointLength(astral)).toBe(1);
    // Forced budget: even asked to delete, it deletes the WHOLE character.
    for (const variant of deletionVariants(`a${astral}b`, 2)) {
      expect(variant).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
      expect(variant).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    }
    expect(deletionVariants(`a${astral}b`, 1).sort()).toEqual(
      [`a${astral}b`, `${astral}b`, 'ab', `a${astral}`].sort(),
    );
    // ...and it is Han, so it never gets a budget in the first place.
    expect(editBudgetForToken(astral)).toBe(0);
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
