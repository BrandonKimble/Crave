import 'reflect-metadata';
import { SearchQueryInterpretationService } from './search-query-interpretation.service';
import type { EntityType } from '@prisma/client';

/**
 * AUDIT M9, SECOND COPY (foundational red team): rankIn() fixed the
 * -1-becomes-winner bug where it was found, but pickPlacedWinner kept a raw
 * CROSS_TYPE_PLACEMENT_ORDER.indexOf — so an EntityType not yet placed in
 * the order would have won every linker tie instead of degrading to the
 * back. This pins the unknown-type case at BOTH consumers' shared law:
 * a type missing from the placement order loses to every listed type.
 *
 * pickPlacedWinner is pure over its arguments (plus class statics), so it is
 * exercised directly off the prototype — no dependency harness needed.
 */

type Candidate = { entityId: string; type: EntityType; name: string };

const pick = (
  candidates: Candidate[],
  dietary: string[] = [],
  cuisine: string[] = [],
): Candidate => {
  const svc = Object.create(
    SearchQueryInterpretationService.prototype,
  ) as unknown as {
    pickPlacedWinner: (
      c: Candidate[],
      d: ReadonlySet<string>,
      k: ReadonlySet<string>,
    ) => Candidate;
  };
  return svc.pickPlacedWinner(candidates, new Set(dietary), new Set(cuisine));
};

const c = (id: string, type: string): Candidate => ({
  entityId: id,
  type: type as EntityType,
  name: id,
});

describe('pickPlacedWinner — unknown types go to the BACK (M9, second copy)', () => {
  it('an EntityType absent from CROSS_TYPE_PLACEMENT_ORDER never beats a listed one', () => {
    const winner = pick([c('new', 'brand_new_type'), c('taco', 'item')]);
    expect(winner.entityId).toBe('taco');
  });

  it('order of arrival does not rescue the unlisted type', () => {
    const winner = pick([c('r1', 'place'), c('new', 'brand_new_type')]);
    expect(winner.entityId).toBe('r1');
  });

  it('the placement order still decides among listed types', () => {
    const winner = pick([c('r1', 'place'), c('fa', 'item_attribute')]);
    expect(winner.entityId).toBe('fa');
  });

  it('the dietary flag still wins by rule, even for an unlisted type', () => {
    const winner = pick(
      [c('taco', 'item'), c('vegan-x', 'brand_new_type')],
      ['vegan-x'],
    );
    expect(winner.entityId).toBe('vegan-x');
  });
});

describe('pickPlacedWinner — cuisine FACET beats the type order (v17 S4)', () => {
  it('a facet=cuisine attribute beats a same-named junk dish entity', () => {
    const winner = pick(
      [c('junk-dish-mexican', 'item'), c('cuisine-mexican', 'place_attribute')],
      [],
      ['cuisine-mexican'],
    );
    expect(winner.entityId).toBe('cuisine-mexican');
  });

  it('dietary still outranks cuisine', () => {
    const winner = pick(
      [c('cuisine-x', 'place_attribute'), c('vegan-x', 'item_attribute')],
      ['vegan-x'],
      ['cuisine-x'],
    );
    expect(winner.entityId).toBe('vegan-x');
  });

  it('without a cuisine flag the type order is unchanged', () => {
    const winner = pick([
      c('junk-dish-mexican', 'item'),
      c('cuisine-mexican', 'place_attribute'),
    ]);
    expect(winner.entityId).toBe('junk-dish-mexican');
  });
});
