import { AttributeOntologyService } from './attribute-ontology.service';
import type {
  CanonicalizationPlan,
  AttributeEntityType,
} from './attribute-ontology.service';
import { identityInsertData } from '../content-processing/entity-resolver/entity-identity';

// The alias writer touches the DB; the applyPlan unit test only cares that the
// rename UPDATE carries the RIGHT identity, so stub the alias fold.
jest.mock(
  '../content-processing/entity-resolver/entity-surface.service',
  () => ({
    addSurfaces: jest.fn().mockResolvedValue(undefined),
    foldSurfacesFromMerge: jest.fn().mockResolvedValue(undefined),
  }),
);

const logger = {
  setContext: () => logger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

function makePlan(
  type: AttributeEntityType,
  rename: { entityId: string; from: string; to: string },
): CanonicalizationPlan {
  return {
    type,
    scope: 'all',
    candidateCount: 0,
    promotions: [],
    merges: [],
    rejections: [],
    renames: [rename],
  };
}

describe('buildPlan tuning knobs are refused non-positive at the boundary (F4946)', () => {
  const service = new AttributeOntologyService(
    {} as never,
    {} as never,
    {} as never,
    logger,
  );

  it.each([
    ['batchSize', { batchSize: 0 }],
    ['batchSize negative', { batchSize: -4 }],
    ['batchSize fractional', { batchSize: 2.5 }],
    ['shortlistK', { shortlistK: 0 }],
    ['concurrency', { concurrency: -1 }],
  ])(
    'rejects %s instead of silently running the whole set unbatched',
    async (_label, options) => {
      await expect(
        service.buildPlan('restaurant_attribute', 'all', options as never),
      ).rejects.toThrow(/positive integer/);
    },
  );
});

describe('applyPlan rename derives identity from plan.type (F4947)', () => {
  it('writes a restaurant_attribute-keyed identity WITHOUT re-querying the row type', async () => {
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };
    const prisma = {
      $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
    };
    const service = new AttributeOntologyService(
      prisma as never,
      {} as never,
      {} as never,
      logger,
    );

    const rename = { entityId: 'e-1', from: 'old label', to: 'new label' };
    await service.applyPlan(makePlan('restaurant_attribute', rename), {
      apply: true,
    });

    // The type is DERIVED from plan.type — the old `SELECT type::text` lookup
    // (whose `?? 'food_attribute'` fallback could mislabel a restaurant_attribute
    // when the read returned []) is gone. Reverting to it reds this assertion.
    expect(tx.$queryRawUnsafe).not.toHaveBeenCalled();

    const calls = tx.$executeRawUnsafe.mock.calls as unknown[][];
    const renameUpdate = calls.find((call) =>
      String(call[0]).includes('identity_key ='),
    );
    expect(renameUpdate).toBeDefined();
    const expected = identityInsertData('new label', 'restaurant_attribute');
    // args: (sql, entityId, to, identityKey, identityKeySorted)
    expect(renameUpdate?.[3]).toBe(expected.identityKey);
    expect(renameUpdate?.[4]).toBe(expected.identityKeySorted);
  });
});
