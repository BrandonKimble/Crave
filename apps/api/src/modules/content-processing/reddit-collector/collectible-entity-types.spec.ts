/**
 * COLLECTIBLE_ENTITY_TYPES covers every live entity type (coverage audit
 * F-1). The constant shipped with the pre-R14 literals 'restaurant'/'food';
 * its ONLY consumer, SignalDemandReadService.territoryEntityDemand, compares
 * `e.type::text = ANY(${entityTypes}::text[])` — text against text, so the
 * stale names errored nothing and simply matched no row. Place and item
 * demand (74% of on-demand rows, ~93% of entities) silently never selected:
 * the demand slice returned attributes only, and the collector never went
 * looking for the dishes and restaurants users actually asked for.
 *
 * The list now DERIVES from the Prisma enum, so these asserts can only fail
 * if someone re-hand-lists it — which is exactly the moment they should fail.
 */
import { EntityType } from '@prisma/client';
import { COLLECTIBLE_ENTITY_TYPES } from './keyword-slice-selection.service';

describe('COLLECTIBLE_ENTITY_TYPES (F-1)', () => {
  it('contains every EntityType enum value — place and item demand selects', () => {
    expect([...COLLECTIBLE_ENTITY_TYPES].sort()).toEqual(
      [...Object.values(EntityType)].sort(),
    );
    // The two types users ask for most, named so a regression reads loudly:
    expect(COLLECTIBLE_ENTITY_TYPES).toContain('place');
    expect(COLLECTIBLE_ENTITY_TYPES).toContain('item');
    // Ingredient demand is a collection seed too (audit F-1 decision).
    expect(COLLECTIBLE_ENTITY_TYPES).toContain('ingredient');
  });

  it('never regresses to the pre-rename literals that match no row', () => {
    expect(COLLECTIBLE_ENTITY_TYPES).not.toContain('restaurant');
    expect(COLLECTIBLE_ENTITY_TYPES).not.toContain('food');
  });
});
