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
import { canonicalFold, diacriticFold } from './entity-identity';

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
  /**
   * The entity's UND RECALL SURFACE FORMS (entity_surface, status=active,
   * locale='und', role<>'display'). Named `aliases` for continuity with the
   * fixtures written when `core_entities.aliases[]` still existed; that
   * column is gone (§11 item 4 / I-2) and the tier reads the rows, folded.
   */
  aliases: string[];
  /**
   * REQUIRED, and that is the point (F6622). Both tier queries send
   * `type: entityType` in their where clause, and this double used to drop it
   * on the floor — so every case claiming a type-scoped distinction was
   * asserting over a fixture that could not express the dimension under test.
   * Making it required means a fixture cannot silently be type-agnostic.
   */
  type: EntityType;
  status?: string;
}

/** Minimal PrismaService double: only the calls entity-resolution.service.ts
 *  actually issues — `entity.findMany` for the exact tier, and `$queryRaw`
 *  for the surface tier and the LLM judge's candidate context. */
function fakePrisma(entities: FakeEntityRow[]) {
  const live = () =>
    entities.filter((e) => (e.status ?? 'active') !== 'archived');
  return {
    /**
     * THE SURFACE ARM, emulated at the same fidelity as the real SQL: the
     * probe set and every stored form are compared through `canonicalFold`,
     * because fold symmetry IS the behaviour under test. A double that
     * compared raw strings here would pass whether or not the service folded.
     */
    $queryRaw: jest.fn(async (query: any) => {
      // The service composes with `Prisma.sql`, so the double receives ONE
      // Sql object (text + bound values), not a tagged template.
      const sql: string = query?.strings?.join(' ') ?? String(query?.sql ?? '');
      const values: any[] = query?.values ?? [];
      if (sql.includes("replace(e.identity_key, ' ', '')")) {
        // THE JOINED-IDENTITY ARM, emulated at the same fidelity as the real
        // SQL: both the name's identity_key (canonicalFold of the name, as
        // identityInsertData writes it) and every recall surface's
        // form_folded are SQUEEZED (space-removed) and matched against the
        // probe set. Returning `form` verbatim matters: the service's accent
        // guard runs on the stored spelling, so a double that returned
        // pre-folded forms would blind the guard under test.
        const type = values[0] as EntityType;
        const arrays = values.filter((value): value is string[] =>
          Array.isArray(value),
        );
        const probes = new Set(arrays[arrays.length - 1] ?? []);
        const squeeze = (v: string) => canonicalFold(v).replace(/ /g, '');
        const out: any[] = [];
        for (const row of live().filter((r) => r.type === type)) {
          const nameKey = squeeze(row.name);
          if (nameKey && probes.has(nameKey)) {
            out.push({
              entity_id: row.entityId,
              name: row.name,
              form: row.name,
              key: nameKey,
            });
          }
          for (const form of row.aliases) {
            const key = squeeze(form);
            if (key && probes.has(key)) {
              out.push({
                entity_id: row.entityId,
                name: row.name,
                form,
                key,
              });
            }
          }
        }
        return out;
      }
      if (
        sql.includes('FROM core_entities e') &&
        sql.includes('entity_surface')
      ) {
        // POSITION-FREE READ of the bound values. The surface scope is now
        // a COMPOSED fragment (`recallSurfaceScopeSql`) that binds its own
        // locale chain, so the probes are no longer values[1] — they are the
        // LAST bound array. Destructuring by index silently read the locale
        // chain as the probe set (every fixture went 'new'), which is the
        // kind of break a double should not be able to have twice.
        const type = values[0] as EntityType;
        const arrays = values.filter((value): value is string[] =>
          Array.isArray(value),
        );
        const foldedProbes = arrays[arrays.length - 1] ?? [];
        const probes = new Set(foldedProbes);
        return live()
          .filter((row) => row.type === type)
          .filter((row) =>
            row.aliases.some((form) => probes.has(canonicalFold(form))),
          )
          .map((row) => ({
            entity_id: row.entityId,
            name: row.name,
            forms: row.aliases,
          }));
      }
      if (sql.includes('SELECT s.entity_id, s.form')) {
        // THE ACCENT-EVIDENCE ARM. The tier-1 fold refuses an accented input
        // unless the owner PROVES it holds that spelling; this read is the
        // proof. Forms are returned VERBATIM — the service folds them itself
        // with `diacriticFold`, so a double that returned pre-folded forms
        // would blind the very test under test. Role is not filtered here,
        // matching the real query: a display row is the entity's LABEL in
        // that language, which is spelling testimony, not a recall claim.
        const [ids] = values as [string[]];
        const out: any[] = [];
        for (const row of live().filter((r) => ids.includes(r.entityId))) {
          for (const form of row.aliases) {
            out.push({ entity_id: row.entityId, form });
          }
        }
        return out;
      }
      if (sql.includes('SELECT s.entity_id')) {
        const [ids] = values as [string[]];
        return live()
          .filter((row) => ids.includes(row.entityId))
          .map((row) => ({ entity_id: row.entityId, forms: row.aliases }));
      }
      return [];
    }),
    entity: {
      findMany: jest.fn(async (args: any) => {
        const where = args.where ?? {};
        const type = where.type;
        // The exact tier now sends OR: [name-insensitive, identityKey-fold]
        // (the identity-key probe). The double emulates identity_key exactly
        // as identityInsertData writes it: canonicalFold(name).
        const orArms: any[] = Array.isArray(where.OR) ? where.OR : [where];
        const nameIn: string[] | undefined = orArms
          .find((arm) => arm?.name?.in)
          ?.name.in.map((n: string) => n.toLowerCase().trim());
        const identityIn: string[] | undefined = orArms.find(
          (arm) => arm?.identityKey?.in,
        )?.identityKey.in;
        return (
          entities
            .filter((e) => (e.status ?? 'active') !== 'archived')
            // THE TYPE SCOPE, ACTUALLY APPLIED (F6622). Both tier queries send
            // `type: entityType`; this line used to read
            // `.filter(() => type !== undefined || true)` at the END of the
            // chain — `X || true` is true for every X, so it passed everything
            // and existed only to make `type` look used. The double therefore
            // returned candidates regardless of EntityType, and a bug that let
            // restaurants match across the food scope would have been invisible
            // to every case in this file.
            .filter((row) => type === undefined || row.type === type)
            .filter((row) => {
              if (nameIn || identityIn) {
                return (
                  (nameIn?.includes(row.name.toLowerCase().trim()) ?? false) ||
                  (identityIn?.includes(canonicalFold(row.name)) ?? false)
                );
              }
              return true;
            })
            .map((row) => ({
              entityId: row.entityId,
              name: row.name,
              identityKey: canonicalFold(row.name) || null,
              aliases: row.aliases,
            }))
        );
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
  // Its `logger` is set in onModuleInit, not the constructor, so SOMETHING has
  // to supply it here. Calling the real lifecycle hook rather than poking the
  // private field: the collaborator is then in the state Nest would have put
  // it in, and a rename of that field cannot leave a stale key behind.
  aliasManagementService.onModuleInit();

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
      entities: [
        {
          entityId: 'food-1',
          name: 'taco',
          aliases: [],
          type: EntityType.food,
        },
      ],
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
      entities: [
        {
          entityId: 'rest-1',
          name: "Torchy's Tacos",
          aliases: [],
          type: EntityType.restaurant,
        },
        // THE CROSS-TYPE BAIT (F6622). Without it this case's emptiness could
        // not tell "the resolver scoped by type" apart from "nothing matched
        // for any reason": measured, deleting `type: entityType` from BOTH
        // tier where-clauses in the service left the case GREEN. This food row
        // carries the probe name EXACTLY, so if the type scope ever leaks — in
        // the service or in the double that stands in for it — the probe finds
        // it and this case goes red for the right reason.
        {
          entityId: 'food-bait',
          name: "Torchy's Taco",
          aliases: [],
          type: EntityType.food,
        },
      ],
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

  /**
   * THE CONTROL FOR THE CASE ABOVE (F6622). That arm's whole claim rests on an
   * ABSENCE — `resolutionResults` is empty — and an absence is produced by a
   * great many things besides the distinction under test. This case runs THE
   * SAME number-variant pair through the FOOD scope: same names, same probe,
   * same config, one axis changed. It resolves. So the restaurant arm's
   * emptiness is a DISCRIMINATION the resolver makes, not the default answer
   * a misconfigured fixture returns for everything.
   */
  it('CONTROL: the same "Taco"/"Tacos" pair DOES exact-match inside the FOOD scope', async () => {
    const { service } = buildService({
      entities: [
        {
          entityId: 'food-torchys',
          name: "Torchy's Tacos",
          aliases: [],
          type: EntityType.food,
        },
      ],
    });
    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({
          tempId: 't1',
          normalizedName: "Torchy's Taco",
          entityType: EntityType.food,
        }),
      ],
      { ...CONFIG_NO_LLM, allowEntityCreation: false },
    );
    expect(resolutionResults).toHaveLength(1);
    expect(resolutionResults[0].resolutionTier).toBe('exact');
    expect(resolutionResults[0].entityId).toBe('food-torchys');
  });
});

describe('EntityResolutionService — alias tier only fires when the exact tier misses', () => {
  it('an input whose normalizedName is banked as an ALIAS (not the primary name) resolves at tier "alias", confidence 0.95', async () => {
    const { service } = buildService({
      entities: [
        {
          entityId: 'food-1',
          name: 'bacon egg and cheese',
          aliases: ['bec'],
          type: EntityType.food,
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
    expect(resolutionResults[0].resolutionTier).toBe('alias');
    expect(resolutionResults[0].entityId).toBe('food-1');
    expect(resolutionResults[0].confidence).toBe(0.95);
  });

  it('an EXACT name match wins over an alias hit on a DIFFERENT entity — exact tier has priority', async () => {
    const { service } = buildService({
      entities: [
        {
          entityId: 'food-exact',
          name: 'bec',
          aliases: [],
          type: EntityType.food,
        },
        {
          entityId: 'food-alias',
          name: 'bacon egg and cheese',
          aliases: ['bec'],
          type: EntityType.food,
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
          type: EntityType.restaurant,
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
        {
          entityId: 'austin-bbq',
          name: 'Franklin Barbecue',
          aliases: [],
          type: EntityType.restaurant,
        },
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
      entities: [
        {
          entityId: 'remote-id',
          name: "rudy's",
          aliases: [],
          type: EntityType.restaurant,
        },
      ],
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
      entities: [
        {
          entityId: 'ungrounded-id',
          name: "rudy's",
          aliases: [],
          type: EntityType.restaurant,
        },
      ],
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

  it('CONTROL for the adversarial case above: the SAME near-duplicate pair in the SAME engine scope collapses DETERMINISTICALLY — the within-batch key is the identity fold, so an apostrophe twin never needs the judge', async () => {
    // Before 2026-08-11 this pair was nominated to the LLM judge; the folded
    // creation key ("marios pizza" for both) now answers the spelling-variant
    // question in code, the same way the exact tier's identity_key probe does
    // against persisted entities. The judge is reserved for pairs whose FOLDS
    // differ ("beef bulgogi"/"bulgogi beef" above).
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
    expect(llmMatch).not.toHaveBeenCalled();
  });
});

describe('EntityResolutionService — the v7 shadow twin classes (2026-08-10 proven defect)', () => {
  // Each case is one twin CLASS from the 23-duplicate full-corpus replay,
  // resolving DETERMINISTICALLY — the judge mocks in buildService default to
  // 'new', so any green match below is proof the deterministic tiers claimed
  // it without an LLM call.

  it('APOSTROPHE-DROP: "Mcdonalds" exact-matches "McDonald\'s" via the identity_key probe', async () => {
    const { service } = buildService({
      entities: [
        {
          entityId: 'r-mcd',
          name: "McDonald's",
          aliases: [],
          type: EntityType.restaurant,
        },
      ],
    });
    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({
          tempId: 't1',
          normalizedName: 'Mcdonalds',
          entityType: EntityType.restaurant,
        }),
      ],
      { ...CONFIG_NO_LLM, allowEntityCreation: false },
    );
    expect(resolutionResults).toHaveLength(1);
    expect(resolutionResults[0].resolutionTier).toBe('exact');
    expect(resolutionResults[0].entityId).toBe('r-mcd');
  });

  it('ACCENT: "Alamo Springs Cafe" exact-matches "Alamo Springs Café" via the identity_key probe', async () => {
    const { service } = buildService({
      entities: [
        {
          entityId: 'r-alamo',
          name: 'Alamo Springs Café',
          aliases: [],
          type: EntityType.restaurant,
        },
      ],
    });
    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({
          tempId: 't1',
          normalizedName: 'Alamo Springs Cafe',
          entityType: EntityType.restaurant,
        }),
      ],
      { ...CONFIG_NO_LLM, allowEntityCreation: false },
    );
    expect(resolutionResults[0].resolutionTier).toBe('exact');
    expect(resolutionResults[0].entityId).toBe('r-alamo');
  });

  it('TONE-MARK VETO (2026-08-11 multilingual audit): "cơm cháy" must NOT exact-claim "Cơm Chay" — both sides carry accents and their accent-preserving folds disagree (different Vietnamese words, one canonical fold)', async () => {
    // Premise: one shared canonical fold, two different diacritic folds —
    // exactly the pair the diacriticFold doctrine names (vegetarian rice vs
    // scorched rice).
    expect(canonicalFold('cơm cháy')).toBe(canonicalFold('Cơm Chay'));
    expect(diacriticFold('cơm cháy')).not.toBe(diacriticFold('Cơm Chay'));
    const { service } = buildService({
      entities: [
        {
          entityId: 'f-comchay',
          name: 'Cơm Chay',
          aliases: [],
          type: EntityType.food,
        },
      ],
    });
    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({
          tempId: 't1',
          normalizedName: 'cơm cháy',
          entityType: EntityType.food,
        }),
      ],
      { ...CONFIG_NO_LLM, allowEntityCreation: false },
    );
    // With creation disabled and no tier match, an unmatched result is
    // DROPPED from the output — emptiness here means no tier claimed the
    // tone-differing twin (the CONTROL below proves the same fixture shape
    // resolves when the accent evidence agrees).
    expect(resolutionResults).toHaveLength(0);
  });

  it('CONTROL: accentless "pho" still exact-claims "Phở" — de-diacritized typing carries no accent evidence, so the folded key rules', async () => {
    const { service } = buildService({
      entities: [
        {
          entityId: 'f-pho',
          name: 'Phở',
          aliases: [],
          type: EntityType.food,
        },
      ],
    });
    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({
          tempId: 't1',
          normalizedName: 'pho',
          entityType: EntityType.food,
        }),
      ],
      { ...CONFIG_NO_LLM, allowEntityCreation: false },
    );
    expect(resolutionResults[0].resolutionTier).toBe('exact');
    expect(resolutionResults[0].entityId).toBe('f-pho');
  });

  it('ACCENT EVIDENCE (2026-08-12): accented "bún" does NOT exact-claim the de-accented English name "bun" — the entity banks no surface spelled that way', async () => {
    // The defect this rule exists for, and the reason the ORIGINAL guard was
    // inert: it refused only when BOTH sides carried accents, and our names
    // are de-accented English by construction, so `storedAccented` was false
    // for exactly the words it was written for. The premise, asserted so the
    // case cannot silently test something else:
    expect(canonicalFold('bún')).toBe(canonicalFold('bun'));
    expect(diacriticFold('bun')).toBe(canonicalFold('bun')); // stored: unaccented
    const { service } = buildService({
      entities: [
        {
          entityId: 'i-bun',
          name: 'bun',
          // its surfaces spell no accented twin
          aliases: ['bread roll', 'buns'],
          type: EntityType.ingredient,
        },
      ],
    });
    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({
          tempId: 't1',
          normalizedName: 'bún',
          entityType: EntityType.ingredient,
          documentLocale: 'vi',
        }),
      ],
      { ...CONFIG_NO_LLM, allowEntityCreation: false },
    );
    expect(resolutionResults).toHaveLength(0);
  });

  it('ACCENT EVIDENCE, THE ADMITTING SIDE: accented "café" DOES exact-claim the de-accented name "cafe", because the entity banks "café" as a surface', async () => {
    // A rule that only ever refuses is a recall cliff. The evidence the
    // entity itself holds is what separates the two cases — nothing here
    // knows what Vietnamese or French is.
    const { service } = buildService({
      entities: [
        {
          entityId: 'a-cafe',
          name: 'cafe',
          aliases: ['café', 'cafes'],
          type: EntityType.restaurant_attribute,
        },
      ],
    });
    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({
          tempId: 't1',
          normalizedName: 'café',
          entityType: EntityType.restaurant_attribute,
          documentLocale: 'en',
        }),
      ],
      { ...CONFIG_NO_LLM, allowEntityCreation: false },
    );
    expect(resolutionResults[0].resolutionTier).toBe('exact');
    expect(resolutionResults[0].entityId).toBe('a-cafe');
  });

  it('ACCENT EVIDENCE AT TIER 2 (2026-08-12): the SURFACE fold refuses "bún" for the English bread too — and the concept that banks the Vietnamese spelling gets it instead', async () => {
    // The residue the tier-1 fixtures recorded: `form_folded` IS canonicalFold,
    // so refusing at tier 1 only moved the wrong claim from confidence 1.0 to
    // 0.95. Both entities are surface candidates for the same folded probe —
    // only one of them can spell it.
    expect(canonicalFold('bún')).toBe(canonicalFold('bun'));
    const { service } = buildService({
      entities: [
        {
          entityId: 'i-bun',
          name: 'english bread bun',
          aliases: ['bun'], // the de-accented twin only
          type: EntityType.ingredient,
        },
        {
          entityId: 'i-vermicelli',
          name: 'vermicelli',
          aliases: ['bún'], // the entity that says it holds the spelling
          type: EntityType.ingredient,
        },
      ],
    });
    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({
          tempId: 't1',
          normalizedName: 'bún',
          entityType: EntityType.ingredient,
          documentLocale: 'vi',
        }),
      ],
      { ...CONFIG_NO_LLM, allowEntityCreation: false },
    );
    expect(resolutionResults[0].resolutionTier).toBe('alias');
    expect(resolutionResults[0].entityId).toBe('i-vermicelli');
  });

  it('ACCENT EVIDENCE AT TIER 2, THE UNACCENTED CONTROL: "bun" typed without accents still reaches the accented surface — an unaccented input asserts nothing', async () => {
    // De-diacritized typing is how most people type Vietnamese on a US
    // keyboard. The veto reads the INPUT's accents, so this probe is decided
    // by the fold exactly as before, and the tier keeps the recall it earned.
    const { service } = buildService({
      entities: [
        {
          entityId: 'i-vermicelli',
          name: 'vermicelli',
          aliases: ['bún'],
          type: EntityType.ingredient,
        },
      ],
    });
    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({
          tempId: 't1',
          normalizedName: 'bun',
          entityType: EntityType.ingredient,
          documentLocale: 'vi',
        }),
      ],
      { ...CONFIG_NO_LLM, allowEntityCreation: false },
    );
    expect(resolutionResults[0].resolutionTier).toBe('alias');
    expect(resolutionResults[0].entityId).toBe('i-vermicelli');
  });

  it('PUNCTUATION-JOIN: "Pf Changs" claims "P.F. Chang\'s" via the joined-identity tier (folds differ: "pf changs" vs "p f changs")', async () => {
    // Premise check, so the case cannot silently test the wrong tier: the
    // folds genuinely differ, so neither the exact tier nor the surface tier
    // can claim this — only the squeezed key can.
    expect(canonicalFold('Pf Changs')).not.toBe(canonicalFold("P.F. Chang's"));
    const { service } = buildService({
      entities: [
        {
          entityId: 'r-pfc',
          name: "P.F. Chang's",
          aliases: [],
          type: EntityType.restaurant,
        },
      ],
    });
    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({
          tempId: 't1',
          normalizedName: 'Pf Changs',
          entityType: EntityType.restaurant,
        }),
      ],
      { ...CONFIG_NO_LLM, allowEntityCreation: false },
    );
    expect(resolutionResults).toHaveLength(1);
    expect(resolutionResults[0].resolutionTier).toBe('alias');
    expect(resolutionResults[0].confidence).toBe(0.95);
    expect(resolutionResults[0].entityId).toBe('r-pfc');
  });

  it('SPACE/JOIN: "Pulltab Coffee" and "Honeymoon Spiritlounge" claim their split-spelling anchors via the joined-identity tier', async () => {
    const { service } = buildService({
      entities: [
        {
          entityId: 'r-pulltab',
          name: 'Pull-tab Coffee',
          aliases: [],
          type: EntityType.restaurant,
        },
        {
          entityId: 'r-honeymoon',
          name: 'Honey Moon Spirit Lounge',
          aliases: [],
          type: EntityType.restaurant,
        },
      ],
    });
    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({
          tempId: 't1',
          normalizedName: 'Pulltab Coffee',
          entityType: EntityType.restaurant,
        }),
        baseInput({
          tempId: 't2',
          normalizedName: 'Honeymoon Spiritlounge',
          entityType: EntityType.restaurant,
        }),
      ],
      { ...CONFIG_NO_LLM, allowEntityCreation: false },
    );
    const first = resolutionResults.find((r) => r.tempId === 't1')!;
    const second = resolutionResults.find((r) => r.tempId === 't2')!;
    expect(first.entityId).toBe('r-pulltab');
    expect(second.entityId).toBe('r-honeymoon');
  });

  it('SPLIT via a banked SURFACE: "Chi Cha San Chen" claims "ChiCha San Chen" through the surface arm of the joined-identity tier', async () => {
    const { service } = buildService({
      entities: [
        {
          entityId: 'r-chicha',
          name: 'ChiCha San Chen',
          aliases: ['chicha san chen'],
          type: EntityType.restaurant,
        },
      ],
    });
    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({
          tempId: 't1',
          normalizedName: 'Chi Cha San Chen',
          entityType: EntityType.restaurant,
        }),
      ],
      { ...CONFIG_NO_LLM, allowEntityCreation: false },
    );
    expect(resolutionResults[0].entityId).toBe('r-chicha');
    expect(resolutionResults[0].resolutionTier).toBe('alias');
  });

  it('VIETNAMESE TONE-MARK GUARD: "bone" must NOT auto-claim "bò né" — the squeezed keys collide but the stored form carries accent evidence', async () => {
    // Premise check: this IS the collision — squeezed keys are identical,
    // and the accent-evidence invariant is what tells them apart.
    expect(canonicalFold('bò né').replace(/ /g, '')).toBe(
      canonicalFold('bone').replace(/ /g, ''),
    );
    expect(diacriticFold('bò né')).not.toBe(canonicalFold('bò né'));
    const { service, llmService } = buildService({
      entities: [
        {
          entityId: 'food-bo-ne',
          name: 'bò né',
          aliases: [],
          type: EntityType.food,
        },
      ],
    });
    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({
          tempId: 't1',
          normalizedName: 'bone',
          entityType: EntityType.food,
        }),
      ],
      CONFIG_NO_LLM,
    );
    // Not claimed by any deterministic tier — it minted a NEW entity, which
    // is the fail-closed answer this ambiguity deserves (the LLM judge, when
    // enabled, inherits the question; here it is off and defaults to new).
    expect(resolutionResults[0].resolutionTier).toBe('new');
    expect(resolutionResults[0].isNewEntity).toBe(true);
    // And it never sneaked through the judge either.
    expect(llmService.matchEntitiesBatch).not.toHaveBeenCalled();
  });

  it('VIETNAMESE TONE-MARK GUARD, reverse direction: accent-bearing input "bò né" never squeeze-probes, so it cannot claim an existing "bone"', async () => {
    const { service } = buildService({
      entities: [
        {
          entityId: 'food-bone',
          name: 'bone',
          aliases: [],
          type: EntityType.food,
        },
      ],
    });
    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({
          tempId: 't1',
          normalizedName: 'bò né',
          entityType: EntityType.food,
        }),
      ],
      CONFIG_NO_LLM,
    );
    expect(resolutionResults[0].resolutionTier).toBe('new');
    expect(resolutionResults[0].isNewEntity).toBe(true);
  });

  it('AMBIGUITY GUARD: two entities sharing one squeezed key are NEVER auto-claimed — the judge inherits the question', async () => {
    const { service } = buildService({
      entities: [
        {
          entityId: 'r-a',
          name: 'Sun Rise Cafe',
          aliases: [],
          type: EntityType.restaurant,
        },
        {
          entityId: 'r-b',
          name: 'Sunrise Cafe',
          aliases: [],
          type: EntityType.restaurant,
        },
      ],
    });
    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({
          tempId: 't1',
          normalizedName: 'Sunrise Cafe',
          entityType: EntityType.restaurant,
        }),
        baseInput({
          tempId: 't2',
          normalizedName: 'Sun-Rise Cafe',
          entityType: EntityType.restaurant,
        }),
      ],
      { ...CONFIG_NO_LLM, allowEntityCreation: false },
    );
    // t1's own spelling exists — exact tier, correctly, to r-b. t2 folds to
    // "sun rise cafe" = r-a's identity_key, so the EXACT tier claims it; had
    // it reached the squeezed key ("sunrisecafe", owned by BOTH rows) the
    // joined tier would have refused. Prove the refusal directly with a probe
    // that only the squeezed key could match:
    const t2 = resolutionResults.find((r) => r.tempId === 't2')!;
    expect(t2.entityId).toBe('r-a');
    const { resolutionResults: ambiguous } = await service.resolveBatch(
      [
        baseInput({
          tempId: 't3',
          normalizedName: 'SunriseCafe', // squeeze-only: fold "sunrisecafe" matches neither identity_key
          entityType: EntityType.restaurant,
        }),
      ],
      { ...CONFIG_NO_LLM, allowEntityCreation: false },
    );
    expect(ambiguous).toHaveLength(0); // refused: two owners of one squeezed key
  });
});
