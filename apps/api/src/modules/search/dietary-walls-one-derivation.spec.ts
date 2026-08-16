import 'reflect-metadata';
import { DietaryConstraintRegistry } from './dietary-constraints';
import { SearchCoverageService } from './search-coverage.service';

/**
 * ONE WALL DERIVATION — THE MAP SLICES WITH THE CARDS.
 *
 * A dietary wall can be raised two ways: the toggle strip (`dietary: ['vegan']`)
 * or the QUERY TEXT grounding to a dietary attribute ("vegan tacos"). The ranked
 * card lane honoured both. Map coverage read the toggle only. So a user who typed
 * "vegan tacos" and never touched the strip got a walled list of cards beside a
 * map showing every restaurant in view — the same search answering "is this
 * vegan?" two different ways, with the map the one lying.
 *
 * The fix is that both lanes call `resolveDietaryWalls`, so the axis this test
 * pins is GROUNDING-ONLY: no `dietary` array anywhere below.
 *
 * MUTATION: drop `foodAttributeIds`/`restaurantAttributeIds` from either
 * caller's `resolveDietaryWalls` argument — i.e. restore the toggle-only read —
 * and both cases go RED.
 */

const VEGAN_FOOD = '33333333-0000-4000-8000-000000000001';
const VEGAN_VENUE = '33333333-0000-4000-8000-000000000002';

function createLogger() {
  const logger = {
    setContext: () => logger,
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return logger;
}

/** The curated vocabulary, as the registry reads it out of core_entities. */
function createRegistry() {
  const prisma = {
    entity: {
      findMany: () =>
        Promise.resolve([
          { entityId: VEGAN_FOOD, name: 'vegan', type: 'item_attribute' },
          {
            entityId: VEGAN_VENUE,
            name: 'vegan',
            type: 'place_attribute',
          },
        ]),
    },
  };
  return new DietaryConstraintRegistry(
    prisma as never,
    { setContext: () => createLogger() } as never,
  );
}

describe('one dietary wall derivation', () => {
  it('raises the wall from GROUNDING alone, with no toggle set', async () => {
    const walls = await createRegistry().resolveDietaryWalls({
      // Exactly what "vegan tacos" produces: the word grounded to the dietary
      // attribute, and the strip untouched.
      itemAttributeIds: [VEGAN_FOOD],
    });

    expect(walls).toEqual([
      {
        name: 'vegan',
        itemAttributeId: VEGAN_FOOD,
        placeAttributeId: VEGAN_VENUE,
      },
    ]);
  });

  it('activates the WHOLE pair, not just the side that grounded', async () => {
    // A venue-side match must still wall dishes, and vice versa — otherwise
    // the two projections disagree about what "vegan" means.
    const walls = await createRegistry().resolveDietaryWalls({
      placeAttributeIds: [VEGAN_VENUE],
    });

    expect(walls[0].itemAttributeId).toBe(VEGAN_FOOD);
  });

  it('binds the wall into the MAP COVERAGE query on grounding alone', async () => {
    const capturedValues: unknown[][] = [];
    const prisma = {
      $queryRaw: jest.fn((sql: { values: unknown[] }) => {
        capturedValues.push(sql.values);
        return Promise.resolve([]);
      }),
    };
    const service = new SearchCoverageService(
      prisma as never,
      createRegistry() as never,
      { setContext: () => createLogger() } as never,
    );

    await service.buildShortcutCoverageGeoJson({
      bounds: {
        northEast: { lat: 30.4, lng: -97.6 },
        southWest: { lat: 30.1, lng: -97.9 },
      },
      entities: { itemAttributes: [{ entityIds: [VEGAN_FOOD] }] },
    } as never);

    // The wall reaches the database as a BOUND VALUE — asserting on the id in
    // the parameter list rather than on SQL text, which is the vacuity trap
    // the neighbouring row-cap spec calls out.
    const bound = capturedValues.flat();
    expect(bound).toContain(VEGAN_FOOD);
    expect(bound).toContain(VEGAN_VENUE);
  });
});
