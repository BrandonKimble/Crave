import { itemNameVariants, isSameItemUpToNumber } from './food-lemma';

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
      expect(isSameItemUpToNumber(plural, singular)).toBe(true);
      expect(isSameItemUpToNumber(singular, plural)).toBe(true);
    }
  });

  it('resolves the -ies ambiguity BOTH ways (cookie and curry, not cooky)', () => {
    // A single-valued lemma key cannot do this: it must guess -ie or -y.
    expect(itemNameVariants('cookies')).toEqual(
      expect.arrayContaining(['cookie']),
    );
    expect(itemNameVariants('curries')).toEqual(
      expect.arrayContaining(['curry']),
    );
  });

  it('is head-final: only the last word carries number', () => {
    expect(isSameItemUpToNumber('chicken tacos', 'beef tacos')).toBe(false);
    expect(isSameItemUpToNumber('chicken tacos', 'chicken taco')).toBe(true);
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
      expect(itemNameVariants(word)).toEqual([word]);
    }
  });

  it('the deny-list is SYMMETRIC: the singular never proposes a protected plural', () => {
    // Red team R7: 'wings' was protected from singularizing, but 'wing'
    // happily proposed 'wings' and the pair merged anyway — in the merge
    // lane both names are REAL entities, so "a bogus candidate never
    // matches" was no defense.
    for (const [singular, protectedPlural] of [
      ['wing', 'wings'],
      ['fry', 'fries'],
      ['bean', 'beans'],
      ['chip', 'chips'],
      ['green', 'greens'],
    ] as const) {
      expect(itemNameVariants(singular)).not.toContain(protectedPlural);
      expect(isSameItemUpToNumber(singular, protectedPlural)).toBe(false);
    }
  });

  it('does not collapse two genuinely different foods', () => {
    expect(isSameItemUpToNumber('pho', 'poke')).toBe(false);
    expect(isSameItemUpToNumber('glass noodle', 'rice noodle')).toBe(false);
    expect(isSameItemUpToNumber('taco', 'tostada')).toBe(false);
  });

  it('normalizes whitespace and case without changing identity', () => {
    expect(isSameItemUpToNumber('  Breakfast   TACOS ', 'breakfast taco')).toBe(
      true,
    );
  });

  it('NEVER pluralizes a sub-3-char fragment into an exact claim (the jo→jos accident)', () => {
    // R15 defect 1: submitted 'jo' pluralized to 'jos', which exact-matched
    // Jo's Coffee's banked alias — an identity link from a 2-char prefix.
    expect(itemNameVariants('jo')).toEqual(['jo']);
    expect(itemNameVariants('a')).toEqual(['a']);
    expect(isSameItemUpToNumber('jo', 'jos')).toBe(false);
    // 3-char words are real head words and keep their variants.
    expect(itemNameVariants('egg')).toContain('eggs');
    // Head-final: only a short HEAD is floored, not a short first word.
    expect(itemNameVariants('bo ssam')).toContain('bo ssams');
  });

  it('returns nothing for an empty name and never matches it', () => {
    expect(itemNameVariants('   ')).toEqual([]);
    expect(isSameItemUpToNumber('', 'taco')).toBe(false);
  });
});
