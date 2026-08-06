/* eslint-disable @typescript-eslint/require-await -- the `async` on these jest.fn mocks is
   not decoration: each stands in for a genuinely async method, so the mock must return a
   promise to match the interface it replaces. The rule targets a function that only
   PRETENDS to be async; that is not this. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import 'reflect-metadata';
import { EntityType } from '@prisma/client';
import { EntityResolutionService } from './entity-resolution.service';
import { AliasManagementService } from './alias-management.service';
import { MetroAdoptionService } from './metro-adoption.service';
import { LoggerService } from '../../../shared';
import { EntityResolutionInput } from './entity-resolution.types';

/**
 * THE DECISION CORE, DIRECTLY EXERCISED.
 *
 * F1870: entity-resolution.service.ts's ~900-line three-tier cascade, the
 * metro-adoption gate, and the intra-batch near-duplicate dedupe had zero
 * direct tests — only peripheral pure helpers (canonicalFold, foodNameVariants,
 * trigramSimilarity) were covered. Every case below is picked because it sits
 * ON a tier or gate BOUNDARY: the inputs that should resolve one way and must
 * NOT resolve the adjacent way. Each is mutation-proven (see the report).
 *
 * Drives the PUBLIC `resolveBatch` entrypoint end to end (never a private
 * method directly) so what's asserted is the OBSERVABLE decision — match /
 * adopt / dedupe / mint — not an internal call shape.
 */

function fakeLogger(): LoggerService {
  const self = {
    setContext: () => self,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  };
  return self as unknown as LoggerService;
}

interface FakeEntityRow {
  entityId: string;
  name: string;
  aliases: string[];
  status?: string;
}

/** Minimal PrismaService double: only the calls entity-resolution.service.ts
 *  actually issues (entity.findMany for exact + alias tiers). */
function fakePrisma(entities: FakeEntityRow[]) {
  return {
    entity: {
      findMany: jest.fn(async (args: any) => {
        const where = args.where ?? {};
        const type = where.type;
        const nameIn: string[] | undefined = where.name?.in?.map((n: string) =>
          n.toLowerCase().trim(),
        );
        const aliasHasSome: string[] | undefined = where.aliases?.hasSome;
        return entities
          .filter((e) => (e.status ?? 'active') !== 'archived')
          .filter((row) => {
            if (nameIn) {
              return nameIn.includes(row.name.toLowerCase().trim());
            }
            if (aliasHasSome) {
              return row.aliases.some((a) => aliasHasSome.includes(a));
            }
            return true;
          })
          .map((row) => ({
            entityId: row.entityId,
            name: row.name,
            aliases: row.aliases,
          }))
          .filter(() => type !== undefined || true);
      }),
      findUnique: jest.fn(),
    },
  } as any;
}

function fakeConfigService(): any {
  return { get: () => ({}) };
}

function fakeRedisService(): any {
  return { getOrThrow: () => null };
}

function baseInput(
  overrides: Partial<EntityResolutionInput>,
): EntityResolutionInput {
  return {
    tempId: overrides.tempId ?? 'temp-1',
    normalizedName: overrides.normalizedName ?? '',
    originalText: overrides.originalText ?? overrides.normalizedName ?? '',
    entityType: overrides.entityType ?? EntityType.food,
    aliases: overrides.aliases,
    engineId: overrides.engineId,
  };
}

/** Builds a service with fully-substitutable collaborators. `llmMatch` /
 *  `llmMatchBatch` and `metroAdoption` are jest mocks the caller configures
 *  per test; `entityTextSearch.retrieveCandidates` defaults to returning no
 *  candidates (LLM matcher tier stays a no-op unless a test wires recall). */
function buildService(opts: {
  entities: FakeEntityRow[];
  llmMatch?: jest.Mock;
  llmMatchBatch?: jest.Mock;
  retrieveCandidates?: jest.Mock;
  metroAdoption?: Partial<Record<keyof MetroAdoptionService, jest.Mock>>;
}) {
  const prisma = fakePrisma(opts.entities);
  const aliasManagementService = new AliasManagementService(fakeLogger());
  (aliasManagementService as any).logger = fakeLogger();

  const llmService = {
    matchEntity:
      opts.llmMatch ??
      jest.fn(async () => ({ decision: 'new', candidateId: null })),
    matchEntitiesBatch:
      opts.llmMatchBatch ??
      jest.fn(async ({ items }: any) =>
        items.map(() => ({ decision: 'new', candidateId: null })),
      ),
  } as any;

  const entityTextSearch = {
    retrieveCandidates: opts.retrieveCandidates ?? jest.fn(async () => []),
  } as any;

  const metroAdoption = {
    anchorForEngine: jest.fn(async () => null),
    geoVerdicts: jest.fn(async () => new Map()),
    findLocalByNameOrAlias: jest.fn(async () => null),
    globallyUniqueExactNames: jest.fn(async () => new Set()),
    ...opts.metroAdoption,
  } as any;

  const service = new EntityResolutionService(
    prisma,
    aliasManagementService,
    fakeConfigService(),
    fakeRedisService(),
    llmService,
    entityTextSearch,
    fakeLogger(),
    metroAdoption,
  );
  service.onModuleInit();
  return { service, prisma, llmService, metroAdoption };
}

const CONFIG_NO_LLM = {
  batchSize: 100,
  enableFuzzyMatching: true,
  allowEntityCreation: true,
  useLlmMatcher: false,
};

describe('EntityResolutionService — exact-tier number-variant boundary (food vs restaurant)', () => {
  it('FOOD: "tacos" exact-matches the existing singular "taco" via the number-variant probe', async () => {
    const { service } = buildService({
      entities: [{ entityId: 'food-1', name: 'taco', aliases: [] }],
    });
    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({
          tempId: 't1',
          normalizedName: 'tacos',
          entityType: EntityType.food,
        }),
      ],
      CONFIG_NO_LLM,
    );
    expect(resolutionResults[0].resolutionTier).toBe('exact');
    expect(resolutionResults[0].entityId).toBe('food-1');
  });

  it('RESTAURANT: "Torchy\'s Taco" does NOT exact-match "Torchy\'s Tacos" — number variance is branding for restaurants, not decided in code', async () => {
    const { service } = buildService({
      entities: [{ entityId: 'rest-1', name: "Torchy's Tacos", aliases: [] }],
    });
    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({
          tempId: 't1',
          normalizedName: "Torchy's Taco",
          entityType: EntityType.restaurant,
        }),
      ],
      { ...CONFIG_NO_LLM, allowEntityCreation: false },
    );
    // With creation disabled and no tier match, an unmatched result is
    // simply DROPPED from the output (only matched/demoted/created entities
    // populate resolutionResults) — the observable fact under test is that
    // no entry links this tempId to "Torchy's Tacos".
    expect(resolutionResults).toHaveLength(0);
  });
});

describe('EntityResolutionService — alias tier only fires when the exact tier misses', () => {
  it('an input whose normalizedName is banked as an ALIAS (not the primary name) resolves at tier "alias", confidence 0.95', async () => {
    const { service } = buildService({
      entities: [
        { entityId: 'food-1', name: 'bacon egg and cheese', aliases: ['bec'] },
      ],
    });
    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({
          tempId: 't1',
          normalizedName: 'bec',
          entityType: EntityType.food,
        }),
      ],
      CONFIG_NO_LLM,
    );
    expect(resolutionResults[0].resolutionTier).toBe('alias');
    expect(resolutionResults[0].entityId).toBe('food-1');
    expect(resolutionResults[0].confidence).toBe(0.95);
  });

  it('an EXACT name match wins over an alias hit on a DIFFERENT entity — exact tier has priority', async () => {
    const { service } = buildService({
      entities: [
        { entityId: 'food-exact', name: 'bec', aliases: [] },
        {
          entityId: 'food-alias',
          name: 'bacon egg and cheese',
          aliases: ['bec'],
        },
      ],
    });
    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({
          tempId: 't1',
          normalizedName: 'bec',
          entityType: EntityType.food,
        }),
      ],
      CONFIG_NO_LLM,
    );
    expect(resolutionResults[0].resolutionTier).toBe('exact');
    expect(resolutionResults[0].entityId).toBe('food-exact');
  });
});

describe('EntityResolutionService — metro adoption gate (the "Rudy\'s" class)', () => {
  const engineId = 'r/austinfood';

  it('demotes a REMOTE ALIAS match to unmatched (nickname reaching a bar 1500mi away)', async () => {
    const { service, metroAdoption } = buildService({
      entities: [
        {
          entityId: 'nyc-bar',
          name: "Rudy's Bar & Grill",
          aliases: ["rudy's"],
        },
      ],
      metroAdoption: {
        anchorForEngine: jest.fn(async () => ({ lat: 30.27, lng: -97.74 })),
        geoVerdicts: jest.fn(async () => new Map([['nyc-bar', 'remote']])),
      },
    });
    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({
          tempId: 't1',
          normalizedName: "rudy's",
          entityType: EntityType.restaurant,
          engineId,
        }),
      ],
      { ...CONFIG_NO_LLM, allowEntityCreation: false },
    );
    expect(resolutionResults[0].resolutionTier).toBe('unmatched');
    expect(resolutionResults[0].entityId).toBeNull();
    expect(metroAdoption.geoVerdicts).toHaveBeenCalled();
  });

  it('a REMOTE but GLOBALLY-UNIQUE EXACT name survives (a full name can travel across the country)', async () => {
    const { service } = buildService({
      entities: [
        { entityId: 'austin-bbq', name: 'Franklin Barbecue', aliases: [] },
      ],
      metroAdoption: {
        anchorForEngine: jest.fn(async () => ({ lat: 40.71, lng: -74.0 })),
        geoVerdicts: jest.fn(async () => new Map([['austin-bbq', 'remote']])),
        globallyUniqueExactNames: jest.fn(
          async () => new Set(['franklin barbecue']),
        ),
      },
    });
    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({
          tempId: 't1',
          normalizedName: 'Franklin Barbecue',
          entityType: EntityType.restaurant,
          engineId: 'r/FoodNYC',
        }),
      ],
      { ...CONFIG_NO_LLM, allowEntityCreation: false },
    );
    expect(resolutionResults[0].resolutionTier).toBe('exact');
    expect(resolutionResults[0].entityId).toBe('austin-bbq');
  });

  it('a REMOTE match with a LOCAL sibling re-resolves LOCALLY instead of minting a duplicate', async () => {
    const { service } = buildService({
      entities: [{ entityId: 'remote-id', name: "rudy's", aliases: [] }],
      metroAdoption: {
        anchorForEngine: jest.fn(async () => ({ lat: 30.27, lng: -97.74 })),
        geoVerdicts: jest.fn(async () => new Map([['remote-id', 'remote']])),
        findLocalByNameOrAlias: jest.fn(async () => 'local-sibling-id'),
      },
    });
    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({
          tempId: 't1',
          normalizedName: "rudy's",
          entityType: EntityType.restaurant,
          engineId,
        }),
      ],
      { ...CONFIG_NO_LLM, allowEntityCreation: false },
    );
    expect(resolutionResults[0].entityId).toBe('local-sibling-id');
    expect(resolutionResults[0].resolutionTier).not.toBe('unmatched');
  });

  it('an UNKNOWN (ungrounded) verdict stands the gate DOWN — the match is kept, not demoted', async () => {
    const { service } = buildService({
      entities: [{ entityId: 'ungrounded-id', name: "rudy's", aliases: [] }],
      metroAdoption: {
        anchorForEngine: jest.fn(async () => ({ lat: 30.27, lng: -97.74 })),
        geoVerdicts: jest.fn(
          async () => new Map([['ungrounded-id', 'unknown']]),
        ),
      },
    });
    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({
          tempId: 't1',
          normalizedName: "rudy's",
          entityType: EntityType.restaurant,
          engineId,
        }),
      ],
      { ...CONFIG_NO_LLM, allowEntityCreation: false },
    );
    expect(resolutionResults[0].entityId).toBe('ungrounded-id');
  });
});

describe('EntityResolutionService — intra-batch near-duplicate dedupe (markEntitiesForCreation)', () => {
  it('collapses a within-batch near-duplicate pair when the judge says match ("beef bulgogi" / "bulgogi beef" — a word-order twin, NOT a number variant)', async () => {
    const llmMatch = jest.fn(async () => ({
      decision: 'match',
      candidateId: 0,
    }));
    const { service } = buildService({ entities: [], llmMatch });

    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({
          tempId: 't1',
          normalizedName: 'beef bulgogi',
          entityType: EntityType.food,
        }),
        baseInput({
          tempId: 't2',
          normalizedName: 'bulgogi beef',
          entityType: EntityType.food,
        }),
      ],
      CONFIG_NO_LLM,
    );

    const first = resolutionResults.find((r) => r.tempId === 't1')!;
    const second = resolutionResults.find((r) => r.tempId === 't2')!;
    expect(first.isNewEntity).toBe(true);
    expect(second.isNewEntity).toBe(false);
    expect(second.primaryTempId).toBe('t1');
    expect(llmMatch).toHaveBeenCalledTimes(1);
  });

  it('does NOT collapse when the judge says new — fail-closed, two separate mints ("chicken sandwich" is nominated as a candidate for "chicken parm sandwich" by containment, but the judge correctly refuses to fuse the specific dish into the general one)', async () => {
    const llmMatch = jest.fn(async () => ({
      decision: 'new',
      candidateId: null,
    }));
    const { service } = buildService({ entities: [], llmMatch });

    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({
          tempId: 't1',
          normalizedName: 'chicken sandwich',
          entityType: EntityType.food,
        }),
        baseInput({
          tempId: 't2',
          normalizedName: 'chicken parm sandwich',
          entityType: EntityType.food,
        }),
      ],
      CONFIG_NO_LLM,
    );

    const first = resolutionResults.find((r) => r.tempId === 't1')!;
    const second = resolutionResults.find((r) => r.tempId === 't2')!;
    expect(first.isNewEntity).toBe(true);
    expect(second.isNewEntity).toBe(true);
    expect(second.primaryTempId).toBeUndefined();
    // The pair WAS nominated (containment) and judged — proving this is a
    // real fail-closed decision, not an absence of candidates.
    expect(llmMatch).toHaveBeenCalledTimes(1);
  });

  it('ADVERSARIAL: two NEAR-DUPLICATE restaurant names in DIFFERENT engine (metro) scopes are never dedupe-candidates, even though the SAME pair in the SAME scope would be nominated and judged', async () => {
    // The overlay lane is keyed by entityType:engineScope:, so a near-named
    // restaurant registered under a different metro can never enter the
    // OTHER metro's candidate list — this is a lane-prefix guarantee, not a
    // judge call. Proven two ways: cross-scope never asks the judge; the
    // identical pair WITHIN one scope does (and a permissive judge collapses it).
    const llmMatch = jest.fn(async () => ({
      decision: 'match',
      candidateId: 0,
    }));
    const { service } = buildService({ entities: [], llmMatch });

    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({
          tempId: 't1',
          normalizedName: "Mario's Pizza",
          entityType: EntityType.restaurant,
          engineId: 'r/austinfood',
        }),
        baseInput({
          tempId: 't2',
          normalizedName: 'Marios Pizza', // near-dup: apostrophe dropped
          entityType: EntityType.restaurant,
          engineId: 'r/FoodNYC',
        }),
      ],
      CONFIG_NO_LLM,
    );

    const first = resolutionResults.find((r) => r.tempId === 't1')!;
    const second = resolutionResults.find((r) => r.tempId === 't2')!;
    expect(first.isNewEntity).toBe(true);
    expect(second.isNewEntity).toBe(true);
    expect(second.primaryTempId).toBeUndefined();
    // Never asked the judge — the lanes never overlapped, so no candidates
    // were nominated for either entity, even though they are edit-distance-1.
    expect(llmMatch).not.toHaveBeenCalled();
  });

  it('CONTROL for the adversarial case above: the SAME near-duplicate pair in the SAME engine scope IS nominated and judged', async () => {
    const llmMatch = jest.fn(async () => ({
      decision: 'match',
      candidateId: 0,
    }));
    const { service } = buildService({ entities: [], llmMatch });

    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({
          tempId: 't1',
          normalizedName: "Mario's Pizza",
          entityType: EntityType.restaurant,
          engineId: 'r/austinfood',
        }),
        baseInput({
          tempId: 't2',
          normalizedName: 'Marios Pizza',
          entityType: EntityType.restaurant,
          engineId: 'r/austinfood',
        }),
      ],
      CONFIG_NO_LLM,
    );

    const second = resolutionResults.find((r) => r.tempId === 't2')!;
    expect(second.isNewEntity).toBe(false);
    expect(second.primaryTempId).toBe('t1');
    expect(llmMatch).toHaveBeenCalledTimes(1);
  });
});
