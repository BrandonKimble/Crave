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
});
