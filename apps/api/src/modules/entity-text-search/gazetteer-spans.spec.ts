import { EntityType } from '@prisma/client';
import {
  admitsAtExactTier,
  groupEntitySpans,
  pickSpanWinner,
} from './gazetteer-spans';
import {
  canonicalFold,
  diacriticFold,
} from '../content-processing/entity-resolver/entity-identity';

const span = (
  start: number,
  end: number,
  entityId: string,
  type: EntityType,
  name = entityId,
) => ({ start, end, text: name, entityId, name, type });

/**
 * Pins the round-2 review's central defect: the old greedy filter dropped
 * same-span duplicates, so a multi-type name survived as ONE arbitrary
 * winner decided by DB row order. Each spec here fails against that
 * behavior.
 */
describe('groupEntitySpans', () => {
  it('keeps EVERY entity sharing a span — the multi-type grounding law', () => {
    // "breakfast" is genuinely three entities in production data.
    const groups = groupEntitySpans([
      span(0, 9, 'bf-food', EntityType.food, 'breakfast'),
      span(0, 9, 'bf-fattr', EntityType.food_attribute, 'breakfast'),
      span(0, 9, 'bf-rattr', EntityType.restaurant_attribute, 'breakfast'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].entities.map((e) => e.entityId).sort()).toEqual([
      'bf-fattr',
      'bf-food',
      'bf-rattr',
    ]);
  });

  it('longest span still wins ACROSS groups (overlap policy is span-level)', () => {
    // "breakfast taco" (0-14) must suppress both "breakfast" (0-9) and
    // "taco" (10-14) — sub-phrases lose, but nothing within the winning
    // span is dropped.
    const groups = groupEntitySpans([
      span(0, 14, 'bt', EntityType.food, 'breakfast taco'),
      span(0, 9, 'bf-food', EntityType.food, 'breakfast'),
      span(0, 9, 'bf-rattr', EntityType.restaurant_attribute, 'breakfast'),
      span(10, 14, 'taco', EntityType.food, 'taco'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].entities.map((e) => e.entityId)).toEqual(['bt']);
  });

  it('non-overlapping groups all survive, in text order', () => {
    const groups = groupEntitySpans([
      span(16, 21, 'vegan', EntityType.food_attribute, 'vegan'),
      span(0, 14, 'bt', EntityType.food, 'breakfast taco'),
    ]);
    expect(groups.map((g) => g.entities[0].entityId)).toEqual(['bt', 'vegan']);
  });

  it('entity order inside a group is deterministic (type, then id)', () => {
    const a = groupEntitySpans([
      span(0, 5, 'z-id', EntityType.food, 'pizza'),
      span(0, 5, 'a-id', EntityType.food, 'pizza'),
    ]);
    const b = groupEntitySpans([
      span(0, 5, 'a-id', EntityType.food, 'pizza'),
      span(0, 5, 'z-id', EntityType.food, 'pizza'),
    ]);
    expect(a[0].entities.map((e) => e.entityId)).toEqual(
      b[0].entities.map((e) => e.entityId),
    );
  });

  it('deduplicates the same entity matched via both name and alias', () => {
    const groups = groupEntitySpans([
      span(0, 5, 'taco-id', EntityType.food, 'taco'),
      span(0, 5, 'taco-id', EntityType.food, 'taco'),
    ]);
    expect(groups[0].entities).toHaveLength(1);
  });
});

describe('pickSpanWinner', () => {
  const group = groupEntitySpans([
    span(0, 9, 'bf-food', EntityType.food, 'breakfast'),
    span(0, 9, 'bf-rattr', EntityType.restaurant_attribute, 'breakfast'),
    span(0, 9, 'bf-rest', EntityType.restaurant, 'Breakfast'),
  ])[0];

  it("follows the CALLER's type priority (polls: restaurant first)", () => {
    const winner = pickSpanWinner(group, [
      EntityType.restaurant,
      EntityType.food,
      EntityType.food_attribute,
      EntityType.restaurant_attribute,
    ]);
    expect(winner.entityId).toBe('bf-rest');
  });

  it('a different priority order picks a different, still-deterministic winner', () => {
    const winner = pickSpanWinner(group, [
      EntityType.food,
      EntityType.restaurant,
    ]);
    expect(winner.entityId).toBe('bf-food');
  });

  it('never depends on input order (the arbitrary-winner defect, pinned)', () => {
    const reversed = {
      ...group,
      entities: [...group.entities].reverse(),
    };
    const a = pickSpanWinner(group, [EntityType.restaurant]);
    const b = pickSpanWinner(reversed, [EntityType.restaurant]);
    expect(a.entityId).toBe(b.entityId);
  });
});

/**
 * DIACRITIC EVIDENCE — the exact-tier admission rule (2026-08-09).
 *
 * The vi launch gate found three confident wrong answers with one root cause:
 * the fold strips accents (so 'pho' finds phở), which also collapses words
 * that are ONLY distinguished by their accents — and the exact tier then
 * grounded them at confidence 1.0. 'bò' (beef) → avocado, via the banked
 * surface 'bơ'.
 *
 * The FIRST cut of the rule compared the whole span and was refuted by the red
 * team with executed evidence: partial accenting ('phở bo') is the normal way
 * Vietnamese is typed, and a whole-span test refused all of it. The scope is
 * PER TOKEN. Both regimes are pinned below.
 */
describe('admitsAtExactTier — typed accents are evidence, token by token', () => {
  /** A banked surface, in the shape the recall query hands the rule. */
  const spell = (...forms: string[]) =>
    forms.map((form) => ({
      folded: canonicalFold(form),
      diacritic: diacriticFold(form),
    }));
  /** The accent-free strings the registry banks as whole surfaces. */
  const banked = (...forms: string[]) => new Set(forms);
  /** A typed span, in the shape the analyzer hands the rule. */
  const typed = (query: string) => ({
    folded: canonicalFold(query),
    diacritic: diacriticFold(query),
  });

  describe('fully accented — the tone reds this rule exists for', () => {
    it('refuses a fold-only neighbour (bò beef is not bơ avocado)', () => {
      expect(admitsAtExactTier(typed('bò'), spell('bơ'))).toBe(false);
    });

    it('admits the surface that agrees on the accents', () => {
      expect(admitsAtExactTier(typed('bò'), spell('bơ', 'bò'))).toBe(true);
    });

    it('parks a phrase no surface spells that way (cơm chay ≠ cơm cháy)', () => {
      // 'chay' (vegetarian) is banked accent-free, so the second token is a
      // WORD the user spelled, not an accent they skipped — see the
      // accent-complete arm.
      expect(
        admitsAtExactTier(typed('cơm chay'), spell('cơm cháy'), banked('chay')),
      ).toBe(false);
    });

    it('refuses mỹ (American) reaching mỳ (noodle)', () => {
      expect(admitsAtExactTier(typed('mỹ'), spell('mỳ'))).toBe(false);
    });
  });

  describe('fully plain — de-diacritized typing is untouched', () => {
    it('admits an accented surface for a plain query (pho → phở)', () => {
      expect(admitsAtExactTier(typed('pho'), spell('phở'))).toBe(true);
      expect(admitsAtExactTier(typed('bo'), spell('bơ'))).toBe(true);
    });

    it('admits a plain multi-word query against an accented surface', () => {
      expect(
        admitsAtExactTier(typed('ca phe sua da'), spell('cà phê sữa đá')),
      ).toBe(true);
    });
  });

  describe('PARTIALLY accented — the normal vi input mode (red team, executed)', () => {
    it('admits a phrase whose accented tokens agree and whose plain ones ask nothing', () => {
      // 'phở bo': token 0 typed with accents and agrees; token 1 typed plain,
      // so it matched on the fold and nothing more is asked of it.
      expect(admitsAtExactTier(typed('phở bo'), spell('phở bò'))).toBe(true);
      expect(admitsAtExactTier(typed('bún bò hue'), spell('bún bò huế'))).toBe(
        true,
      );
      expect(
        admitsAtExactTier(typed('cà phê sữa da'), spell('cà phê sữa đá')),
      ).toBe(true);
      expect(admitsAtExactTier(typed('gỏi cuon'), spell('gỏi cuốn'))).toBe(
        true,
      );
    });

    it('still refuses when an ACCENTED token disagrees, however plain the rest', () => {
      expect(admitsAtExactTier(typed('phở bò'), spell('phở bơ'))).toBe(false);
    });

    it("does not let a plain token borrow the accented one's agreement", () => {
      // 'bánh bo' against 'bánh bơ' — token 1 is plain, so this IS admitted;
      // the point of the pair is that reversing which token carries accents
      // flips the verdict, i.e. the rule is genuinely positional.
      expect(admitsAtExactTier(typed('bánh bo'), spell('bánh bơ'))).toBe(true);
      expect(admitsAtExactTier(typed('banh bò'), spell('bánh bơ'))).toBe(false);
    });
  });

  describe('the accent-complete arm — a plain token that is itself a word', () => {
    it('holds a plain token to the surface when the registry banks it plain', () => {
      // THE cơm chay / cơm cháy separation, and the reason it is not a word
      // list: 'chay' is banked accent-free, 'bo' is not.
      expect(
        admitsAtExactTier(typed('cơm chay'), spell('cơm cháy'), banked('chay')),
      ).toBe(false);
      expect(
        admitsAtExactTier(typed('phở bo'), spell('phở bò'), banked('chay')),
      ).toBe(true);
    });

    it('still admits when the accent-complete token AGREES with the surface', () => {
      expect(
        admitsAtExactTier(typed('cơm chay'), spell('cơm chay'), banked('chay')),
      ).toBe(true);
    });
  });

  describe('the evidence set is wider than the match', () => {
    it('ignores a spelling that does not fold to THIS span', () => {
      // An entity carries every spelling it has; only the ones that folded to
      // the matched key can be its exact match.
      expect(admitsAtExactTier(typed('bò'), spell('bò kho', 'bơ'))).toBe(false);
    });
  });

  describe('normalization', () => {
    it('is NFC/NFD-blind on both sides', () => {
      expect(
        admitsAtExactTier(
          typed('phở bò'.normalize('NFD')),
          spell('phở bò'.normalize('NFC')),
        ),
      ).toBe(true);
    });

    it('is case-blind', () => {
      expect(admitsAtExactTier(typed('Phở Bò'), spell('phở bò'))).toBe(true);
    });
  });

  it('is language-neutral — the same rule over Spanish', () => {
    expect(admitsAtExactTier(typed('café'), spell('café'))).toBe(true);
    expect(admitsAtExactTier(typed('café'), spell('cafe'))).toBe(false);
    expect(admitsAtExactTier(typed('cafe'), spell('café'))).toBe(true);
    // Partial accenting in Spanish behaves identically.
    expect(
      admitsAtExactTier(
        typed('cocina mediterranea'),
        spell('cocina mediterránea'),
      ),
    ).toBe(true);
  });

  /**
   * IDENTITY IS UNIVERSAL; ACCENT LENIENCY IS NOT (2026-08-12).
   *
   * Grounding is locale-blind now — the typed characters carry their own
   * identity, whoever is holding the phone. The scan keeps that honest by
   * splitting this rule's evidence in two: spellings written in a language
   * the query is in (the reader's chain plus the analyzer's verdict) get the
   * per-token leniency pinned above; everything else must match what was
   * actually TYPED. The service owns the split; these two lines pin the two
   * behaviours it composes, which is what makes the split meaningful.
   *
   * The case that forced it: 'dê' is Vietnamese for goat and folds to 'de',
   * the Spanish preposition — so under leniency, 'pastel de arroz' ground
   * GOAT. The strict arm refuses it while still admitting 牛肉面 for every
   * requester, because Han carries no accents to strip and its
   * accent-preserving fold IS its canonical fold.
   */
  describe('the strict arm — a foreign spelling must match what was typed', () => {
    const strictlyMatches = (query: string, form: string) => {
      const [spelling] = spell(form);
      const span = typed(query);
      return (
        spelling.folded === span.folded && spelling.diacritic === span.diacritic
      );
    };

    it('refuses an accent the user never typed', () => {
      expect(strictlyMatches('de', 'dê')).toBe(false);
      // ...which the lenient arm, correctly, would have admitted.
      expect(admitsAtExactTier(typed('de'), spell('dê'))).toBe(true);
    });

    it('admits an unaccented script unconditionally — Han needs no favour', () => {
      expect(strictlyMatches('牛肉面', '牛肉面')).toBe(true);
      expect(strictlyMatches('珍珠奶茶', '珍珠奶茶')).toBe(true);
      // And still refuses a different word, as identity demands.
      expect(strictlyMatches('牛肉面', '牛肉')).toBe(false);
    });

    it('admits a fully accented typing of a foreign word', () => {
      expect(strictlyMatches('phở bò', 'phở bò')).toBe(true);
      expect(strictlyMatches('pho bo', 'phở bò')).toBe(false);
    });
  });
});

/**
 * THE COVER LINKER (2026-08-10). Selection maximizes how much of the query a
 * reading explains, tie-broken by exactly today's greedy. Two things must be
 * true and both are pinned here: the IDENTITY property (wherever greedy
 * already covered the most, the output is unchanged span-for-span) and the
 * RECOVERY (where greedy stranded words, they come back).
 */
describe('span selection — the cover linker', () => {
  /** Build the raw matches a query+registry would produce: every occurrence
   *  of every banked phrase, at its real character offsets. */
  const matchesFor = (query: string, banked: string[]) => {
    const raw: ReturnType<typeof span>[] = [];
    for (const phrase of banked) {
      for (
        let at = query.indexOf(phrase);
        at >= 0;
        at = query.indexOf(phrase, at + 1)
      ) {
        raw.push({
          start: at,
          end: at + phrase.length,
          text: phrase,
          entityId: `e:${phrase}`,
          name: phrase,
          type: EntityType.food,
        });
      }
    }
    return raw;
  };

  /** THE OLD SELECTION, verbatim: sort longest-first (ties earliest start),
   *  accept greedily non-overlapping. The identity property is stated against
   *  this reference, so a mutated tie-break cannot pass. */
  const greedyReading = (raw: ReturnType<typeof matchesFor>): string[] => {
    const keys = new Map<string, { start: number; end: number }>();
    for (const m of raw) keys.set(`${m.start}:${m.end}`, m);
    const ordered = [...keys.values()].sort(
      (a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start,
    );
    const accepted: Array<{ start: number; end: number }> = [];
    for (const candidate of ordered) {
      if (
        !accepted.some(
          (a) => candidate.start < a.end && candidate.end > a.start,
        )
      ) {
        accepted.push(candidate);
      }
    }
    return accepted
      .sort((a, b) => a.start - b.start)
      .map((a) => `${a.start}:${a.end}`);
  };

  const reading = (query: string, banked: string[]) =>
    groupEntitySpans(matchesFor(query, banked)).map((g) => g.text);

  const keyed = (query: string, banked: string[]) =>
    groupEntitySpans(matchesFor(query, banked)).map(
      (g) => `${g.start}:${g.end}`,
    );

  describe('THE IDENTITY PROPERTY — greedy-covering queries do not move', () => {
    // Every one of these is a query where greedy already explains the whole
    // string. Drawn from the 24-query battery shapes plus es/vi analogues,
    // with 'chicken over rice' banked (the seeded overlap crux).
    const battery: Array<[string, string[]]> = [
      ['al pastor tacos', ['al pastor', 'tacos', 'taco']],
      ['mac and cheese burger', ['mac and cheese', 'burger', 'cheese']],
      ['fish and chips', ['fish and chips', 'fish', 'chips']],
      ['buffalo chicken pizza', ['buffalo chicken', 'pizza', 'chicken']],
      ['steak and eggs breakfast', ['steak and eggs', 'breakfast', 'steak']],
      [
        'halal chicken over rice',
        ['halal', 'chicken over rice', 'chicken', 'rice'],
      ],
      ['tacos al pastor', ['tacos', 'al pastor', 'taco']],
      ['tacos vegetarianos', ['tacos vegetarianos', 'tacos', 'vegetarianos']],
      [
        'hamburguesa con queso',
        ['hamburguesa con queso', 'hamburguesa', 'queso'],
      ],
      ['banh mi chay', ['banh mi', 'chay', 'banh']],
      ['bun bo hue', ['bun bo hue', 'bun bo', 'bun']],
      [
        'banh mi burger thuc vat',
        ['banh mi', 'banh mi burger', 'burger thuc vat', 'burger', 'thuc vat'],
      ],
    ];

    it.each(battery)('%s reads exactly as greedy read it', (query, banked) => {
      const raw = matchesFor(query, banked);
      const greedy = greedyReading(raw);
      // Precondition: this entry really is one greedy covers maximally —
      // otherwise the identity claim would be vacuous here.
      const covered = greedy.reduce((sum, key) => {
        const [start, end] = key.split(':').map(Number);
        return sum + query.slice(start, end).replace(/\s+/g, '').length;
      }, 0);
      expect(covered).toBe(query.replace(/\s+/g, '').length);
      expect(keyed(query, banked)).toEqual(greedy);
    });
  });

  describe('RECOVERY — a bridging span no longer strands the words beside it', () => {
    it('reads both dishes when the longest span sits across the seam', () => {
      // 'burger thực vật' (veggie burger) and 'bánh mì burger' (burger) are
      // both real banked surfaces; the seam is between them. Greedy takes the
      // longest, 'burger thuc vat', and strands 'banh mi burger' entirely.
      const query = 'banh mi burger thuc vat';
      const banked = ['banh mi burger', 'burger thuc vat', 'thuc vat'];
      expect(greedyReading(matchesFor(query, banked))).toEqual(['8:23']);
      expect(reading(query, banked)).toEqual(['banh mi burger', 'thuc vat']);
    });

    it('recovers a stranded head word', () => {
      const query = 'mac and cheese burger';
      const banked = ['mac and cheese', 'cheese burger', 'mac'];
      expect(greedyReading(matchesFor(query, banked))).toEqual(['0:14']);
      expect(reading(query, banked)).toEqual(['mac', 'cheese burger']);
    });
  });

  describe('ZH PREVIEW — the rule is script-neutral (no zh corpus exists yet)', () => {
    it('chooses [style]+[dish] over the bridge that strands both', () => {
      // 川味 (Sichuan-style) + 牛肉面 (beef noodle soup); 味牛肉 straddles the
      // seam and is the longest-tied span, so greedy takes it and explains
      // three of five characters.
      const query = '川味牛肉面';
      const banked = ['川味', '牛肉面', '味牛肉'];
      expect(greedyReading(matchesFor(query, banked))).toEqual(['1:4']);
      expect(reading(query, banked)).toEqual(['川味', '牛肉面']);
    });

    it('does NOT shred a compound into more spans of the same coverage', () => {
      // The counterweight: coverage is characters, not span count, so the
      // whole dish beats its own pieces on the tie-break.
      const query = '牛肉面';
      expect(reading(query, ['牛肉面', '牛肉', '面'])).toEqual(['牛肉面']);
    });
  });
});
