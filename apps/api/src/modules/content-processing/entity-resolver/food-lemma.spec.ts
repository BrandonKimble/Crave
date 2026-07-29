import { foodNameVariants, isSameFoodUpToNumber } from './food-lemma';

describe('isSameFoodUpToNumber', () => {
  it('collapses the real split pairs found in production', () => {
    // Every pair below is an ACTUAL duplicate entity in the database
    // (186 such pairs, 3,121 events stranded on the minority twin).
    const pairs: Array<[string, string]> = [
      ['tacos', 'taco'],
      ['fajitas', 'fajita'],
      ['dumplings', 'dumpling'],
      ['cocktails', 'cocktail'],
      ['burgers', 'burger'],
      ['desserts', 'dessert'],
      ['cookies', 'cookie'],
      ['bagels', 'bagel'],
      ['salads', 'salad'],
      ['burritos', 'burrito'],
      ['breakfast tacos', 'breakfast taco'],
      ['cakes', 'cake'],
      ['sandwiches', 'sandwich'],
      ['curries', 'curry'],
      ['potatoes', 'potato'],
      ['chicharrones', 'chicharron'],
      ['tamales', 'tamal'],
    ];
    for (const [plural, singular] of pairs) {
      expect(isSameFoodUpToNumber(plural, singular)).toBe(true);
      expect(isSameFoodUpToNumber(singular, plural)).toBe(true);
    }
  });

  it('resolves the -ies ambiguity BOTH ways (cookie and curry, not cooky)', () => {
    // A single-valued lemma key cannot do this: it must guess -ie or -y.
    expect(foodNameVariants('cookies')).toEqual(
      expect.arrayContaining(['cookie']),
    );
    expect(foodNameVariants('curries')).toEqual(
      expect.arrayContaining(['curry']),
    );
  });

  it('is head-final: only the last word carries number', () => {
    expect(isSameFoodUpToNumber('chicken tacos', 'beef tacos')).toBe(false);
    expect(isSameFoodUpToNumber('chicken tacos', 'chicken taco')).toBe(true);
  });

  it('NEVER invents a singular for mass nouns and plural-named dishes', () => {
    // Over-collapsing is the one failure worse than a duplicate: it fuses
    // genuinely distinct foods and no later pass can tell them apart.
    for (const word of [
      'hummus',
      'couscous',
      'grits',
      'fries',
      'wings',
      'nachos',
      'ribs',
      'beans',
      'chips',
    ]) {
      expect(foodNameVariants(word)).toEqual([word]);
    }
  });

  it('does not collapse two genuinely different foods', () => {
    expect(isSameFoodUpToNumber('pho', 'poke')).toBe(false);
    expect(isSameFoodUpToNumber('glass noodle', 'rice noodle')).toBe(false);
    expect(isSameFoodUpToNumber('taco', 'tostada')).toBe(false);
  });

  it('normalizes whitespace and case without changing identity', () => {
    expect(isSameFoodUpToNumber('  Breakfast   TACOS ', 'breakfast taco')).toBe(
      true,
    );
  });

  it('returns nothing for an empty name and never matches it', () => {
    expect(foodNameVariants('   ')).toEqual([]);
    expect(isSameFoodUpToNumber('', 'taco')).toBe(false);
  });
});
