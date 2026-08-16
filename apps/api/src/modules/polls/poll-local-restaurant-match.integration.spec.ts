/**
 * THE FREE PATH IS ACTUALLY FREE — asked of Postgres.
 *
 * F3501 / D76. `matchKnownRestaurant` is the "ask ourselves first" pre-check:
 * if our own catalog already holds this restaurant near the poll's place, bind
 * to it and never pay Google. Its geographic-confirmation query was written
 * `WHERE e.entity_id IN (${Prisma.join(ids)}::uuid[])`, which casts the IN's
 * BOOLEAN result to uuid[] and therefore throws on every input Postgres has
 * ever been handed. The catch turned that crash into "no local match", which
 * is indistinguishable from the honest answer — so the free path never once
 * ran and every poll restaurant creation with a typed name paid the vendor.
 *
 * WHY THIS SHAPE. A spec asserting the SQL TEXT contains `= ANY(` passes on a
 * query that is well-formed and wrong, and fails on any equivalent rewrite. The
 * only thing worth asserting is the money: seed a restaurant we already own,
 * ask for it by name at its own coordinates, and assert the answer came back
 * WITH THE VENDOR SEAM UNTOUCHED — zero calls to resolvePlaceForInput.
 *
 * Run: yarn test:db  (needs DATABASE_URL — a dev database, never prod)
 */
import { EntityType, PrismaClient } from '@prisma/client';
import { PollEntitySeedService } from './poll-entity-seed.service';
import { identityInsertData } from '../content-processing/entity-resolver/entity-identity';
import { EntityTextSearchService } from '../entity-text-search/entity-text-search.service';

const LOG = {
  setContext: () => ({
    info() {},
    warn() {},
    error() {},
    debug() {},
  }),
} as never;

const ENTITY = '00000000-0000-4000-8000-000000f35010';
const LOCATION = '00000000-0000-4000-8000-000000f35011';
// A name lexically distinctive enough that exact/prefix recall can only mean
// this fixture — a common word would let a real corpus row answer for it.
const NAME = 'Zzyzx Pollseed Taqueria F3501';
// Its own doorstep: well inside the 50km metro radius the pre-check allows.
const CENTER = { lat: 30.2672, lng: -97.7431 };

const prisma = new PrismaClient();

/** The paid seam. Any call here is a poll creation that cost money. */
const resolvePlaceForInput = jest.fn();
const restaurantEnrichment = {
  resolvePlaceForInput,
  buildRestaurantCreateInput: jest.fn(),
} as never;

const seed = new PollEntitySeedService(
  prisma as never,
  LOG,
  { validateScopeConstraints: () => ({ violations: [] }) } as never,
  restaurantEnrichment,
  { enqueue: jest.fn() } as never,
  // Real recall core: lexical only (denseMode 'none'), so the embedding
  // service must never be reached — a stub that throws proves it.
  new EntityTextSearchService(
    prisma as never,
    {
      generateEmbedding: () => {
        throw new Error('the free path must not embed');
      },
    } as never,
    LOG,
    {
      deniedNamePairs: () => Promise.resolve([]),
      isDeniedName: () => Promise.resolve(false),
    } as never,
  ),
);

const UNKNOWN_NAME = 'Qqxwv Nonexistent Pollseed F3501';

async function cleanup() {
  // The vendor-miss memory OUTLIVES the process (that is its whole point), so
  // a previous run's remembered miss would short-circuit the second case and
  // make a red mutation look green. Clear it with the fixtures.
  await prisma.$executeRaw`DELETE FROM vendor_lookup_misses WHERE lookup_key LIKE '%pollseed f3501%'`;
  await prisma.$executeRaw`DELETE FROM core_restaurant_locations WHERE location_id = ${LOCATION}::uuid`;
  await prisma.$executeRaw`DELETE FROM core_entities WHERE entity_id = ${ENTITY}::uuid`;
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — a skipped money test proves nothing.',
    );
  }
  await prisma.$connect();
  await cleanup();

  const identity = identityInsertData(NAME, EntityType.restaurant);
  await prisma.$executeRaw`
    INSERT INTO core_entities (entity_id, name, type, identity_key, identity_key_sorted)
    VALUES (${ENTITY}::uuid, ${NAME}, 'restaurant',
            ${identity.identityKey}, ${identity.identityKeySorted})
  `;
  await prisma.$executeRaw`
    INSERT INTO core_restaurant_locations (location_id, restaurant_id, latitude, longitude, is_primary)
    VALUES (${LOCATION}::uuid, ${ENTITY}::uuid, ${CENTER.lat}, ${CENTER.lng}, true)
  `;
});

afterEach(() => {
  resolvePlaceForInput.mockClear();
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('poll restaurant seeding asks our own catalog before it pays', () => {
  it('resolves a restaurant we already own without calling the vendor', async () => {
    const resolved = await seed.resolveRestaurant({
      name: NAME,
      place: {
        center: CENTER,
        city: 'Austin',
        region: 'TX',
        countryCode: 'US',
      },
    });

    expect(resolved.entityId).toBe(ENTITY);
    expect(resolved.created).toBe(false);
    // THE ASSERTION THAT IS THE FINDING: not one vendor call.
    expect(resolvePlaceForInput).not.toHaveBeenCalled();
  });

  it('still sends a name we do NOT own to the vendor', async () => {
    resolvePlaceForInput.mockResolvedValue(null);

    await expect(
      seed.resolveRestaurant({
        name: UNKNOWN_NAME,
        place: { center: CENTER },
      }),
    ).rejects.toThrow();

    // The pre-check must be conservative, not greedy: an unknown name is
    // exactly what a vendor is for.
    expect(resolvePlaceForInput).toHaveBeenCalledTimes(1);
  });
});
