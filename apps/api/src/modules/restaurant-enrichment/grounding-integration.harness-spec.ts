/**
 * SHARED HARNESS for the grounding integration specs (2026-09-04 red team
 * items E-3/E-4/E-6/E-7 and the shadow-grounding rederivation).
 *
 * File name, deliberately: it ends in `spec.ts` so tsconfig.build's
 * `**\/*spec.ts` exclude keeps it out of dist, and it lacks the `.spec.ts`
 * suffix jest's testRegex requires so it is never run as a test. No jest
 * globals here — plain counters — so it is a normal module either way.
 *
 * Every collaborator that TOUCHES THE DATABASE is real (Prisma, the claim
 * ledger, the place-merge service with its anchor rehome, the alias
 * merger); Google and the chooser are deterministic stubs that COUNT their
 * calls, because "how many Places calls did this cost" is the assertion
 * these specs exist to make.
 */
import { PrismaClient } from '@prisma/client';
import { ClaimVerdictLedgerService } from '../content-processing/entity-resolver/claim-verdict-ledger.service';
import { AliasManagementService } from '../content-processing/entity-resolver/alias-management.service';
import { EntityAnchorRehomeService } from '../content-processing/entity-resolver/entity-anchor-rehome.service';
import { PlaceEntityMergeService } from './restaurant-entity-merge.service';
import { PlaceLocationEnrichmentService } from './restaurant-location-enrichment.service';

export const noopLogger = (): Record<string, unknown> => {
  const logger: Record<string, unknown> = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
  logger.setContext = () => logger;
  return logger;
};

export interface StubPlace {
  name: string;
  formattedAddress?: string;
  websiteUri?: string;
  businessStatus?: string;
  movedPlaceId?: string;
  latitude?: number;
  longitude?: number;
}

export function placeDetailsFor(placeId: string, spec: StubPlace) {
  return {
    place: {
      id: placeId,
      displayName: { text: spec.name, languageCode: 'en' },
      formattedAddress:
        spec.formattedAddress ?? '123 Zzq St, Austin, TX 78701, USA',
      location: {
        latitude: spec.latitude ?? 30.2672,
        longitude: spec.longitude ?? -97.7431,
      },
      addressComponents: [
        { longText: 'Austin', types: ['locality'] },
        { shortText: 'TX', types: ['administrative_area_level_1'] },
        { shortText: 'US', types: ['country'] },
        { longText: '78701', types: ['postal_code'] },
      ],
      businessStatus: spec.businessStatus ?? 'OPERATIONAL',
      ...(spec.websiteUri ? { websiteUri: spec.websiteUri } : {}),
      ...(spec.movedPlaceId ? { movedPlaceId: spec.movedPlaceId } : {}),
    },
    metadata: { fieldMask: 'id,displayName,formattedAddress,location' },
  };
}

/**
 * A deterministic Google. `catalog` is every place id Google knows;
 * `autocomplete` maps a query to the candidate place ids it returns (default:
 * every catalog id, in insertion order). Every call is counted.
 */
export class GoogleStub {
  readonly autocompleteCalls: string[] = [];
  readonly detailsCalls: string[] = [];
  private forbidden = false;

  constructor(
    private readonly catalog: Record<string, StubPlace>,
    private readonly autocomplete?: (query: string) => string[],
  ) {}

  /** After this, ANY Google call throws — the zero-spend assertion. */
  forbidAll(): void {
    this.forbidden = true;
  }

  autocompletePlace(query: string): Promise<{
    suggestions: Array<{
      placePrediction: {
        placeId: string;
        structuredFormat: {
          mainText: { text: string };
          secondaryText: { text: string };
        };
        types: string[];
      };
    }>;
  }> {
    if (this.forbidden) {
      throw new Error(`forbidden Google call: autocompletePlace(${query})`);
    }
    this.autocompleteCalls.push(query);
    const ids = this.autocomplete
      ? this.autocomplete(query)
      : Object.keys(this.catalog);
    return Promise.resolve({
      suggestions: ids.map((placeId) => ({
        placePrediction: {
          placeId,
          structuredFormat: {
            mainText: { text: this.catalog[placeId]?.name ?? placeId },
            secondaryText: { text: 'Austin, TX' },
          },
          types: ['restaurant'],
        },
      })),
    });
  }

  getPlaceDetails(
    placeId: string,
  ): Promise<ReturnType<typeof placeDetailsFor>> {
    if (this.forbidden) {
      throw new Error(`forbidden Google call: getPlaceDetails(${placeId})`);
    }
    this.detailsCalls.push(placeId);
    const spec = this.catalog[placeId];
    if (!spec) {
      return Promise.resolve({
        place: null as never,
        metadata: { fieldMask: '' },
      });
    }
    return Promise.resolve(placeDetailsFor(placeId, spec));
  }

  findPlaceFromText(): Promise<{ places: never[] }> {
    if (this.forbidden) {
      throw new Error('forbidden Google call: findPlaceFromText');
    }
    return Promise.resolve({ places: [] });
  }
}

/** A chooser that always selects the first candidate, counting hearings. */
export class ChooserStub {
  hearings = 0;
  choosePlaceCandidate(): Promise<{
    decision: 'select';
    candidateId: string;
    reason: string;
  }> {
    this.hearings += 1;
    return Promise.resolve({
      decision: 'select',
      candidateId: 'c1',
      reason: 'source names the Austin location; candidate address matches',
    });
  }
}

export interface Harness {
  prisma: PrismaClient;
  ledger: ClaimVerdictLedgerService;
  merge: PlaceEntityMergeService;
  service: PlaceLocationEnrichmentService;
  expansions: string[];
  extractions: string[];
  rebuilt: string[][];
  alerts: Array<{ kind: string; severity: string }>;
}

export function buildHarness(params: {
  prisma: PrismaClient;
  google: GoogleStub;
  chooser: ChooserStub;
  /** Default false: the hold's durable window is stubbed to zero so an
   *  unrelated dev-database state cannot hold these lanes. The hold spec
   *  itself passes true. */
  realHold?: boolean;
}): Harness {
  const { prisma } = params;
  const logger = noopLogger() as never;
  const ledger = new ClaimVerdictLedgerService(prisma as never);
  const rebuilt: string[][] = [];
  const merge = new PlaceEntityMergeService(
    prisma as never,
    {
      rebuildForPlaces: (ids: string[]) => {
        rebuilt.push(ids);
        return Promise.resolve();
      },
    } as never,
    new EntityAnchorRehomeService(logger),
    ledger,
    {
      generateForCaller: () => {
        throw new Error('the same-business court must not be reached');
      },
    } as never,
    logger,
  );
  const aliasManagement = new AliasManagementService(logger);
  aliasManagement.onModuleInit();
  const expansions: string[] = [];
  const extractions: string[] = [];
  const alerts: Array<{ kind: string; severity: string }> = [];
  const service = new PlaceLocationEnrichmentService(
    prisma as never,
    params.google as never,
    params.chooser as never,
    aliasManagement as never,
    merge,
    {} as never,
    { markDirty: () => Promise.resolve(undefined) } as never,
    {
      queueExtraction: (id: string) => {
        extractions.push(id);
        return Promise.resolve(null);
      },
    } as never,
    {
      queueExpansion: (id: string) => {
        expansions.push(id);
        return Promise.resolve(undefined);
      },
    } as never,
    {
      get: (key: string) =>
        key === 'locationLifecycle.noMatchAttemptThreshold' ? 3 : undefined,
    } as never,
    {
      emit: (alert: { kind: string; severity: string }) => {
        alerts.push(alert);
      },
    } as never,
    ledger,
    { reconcile: () => Promise.resolve(0) } as never,
    logger,
    { embedEntities: () => Promise.resolve(0) } as never,
  );
  if (!params.realHold) {
    (service as unknown as Record<string, unknown>).readWorkerLaneWindowCounts =
      () => Promise.resolve({ declines: 0, successes: 0 });
  }
  return {
    prisma,
    ledger,
    merge,
    service,
    expansions,
    extractions,
    rebuilt,
    alerts,
  };
}

/** `enrichPlace` is private by design; the specs reach it structurally, the
 *  standard way this module's siblings drive private lanes. */
export type EnrichDriveable = {
  enrichPlace(
    entity: unknown,
    options: { sourceText?: string },
  ): Promise<{
    entityId: string;
    status: string;
    reason?: string;
    placeId?: string;
    mergedInto?: string;
  }>;
};

export async function mintPlace(
  prisma: PrismaClient,
  spec: {
    name: string;
    status?: 'active' | 'archived' | 'rehearsal';
    bornRunId?: string | null;
    canonicalDomain?: string | null;
    createdAt?: string;
  },
): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<Array<{ entity_id: string }>>(
    `INSERT INTO core_entities (name, type, status, born_extraction_run_id, canonical_domain, created_at)
     VALUES ($1, 'place', $2::entity_status, $3::uuid, $4, COALESCE($5::timestamptz, now()))
     RETURNING entity_id`,
    spec.name,
    spec.status ?? 'active',
    spec.bornRunId ?? null,
    spec.canonicalDomain ?? null,
    spec.createdAt ?? null,
  );
  return row.entity_id;
}

export async function loadPlace(prisma: PrismaClient, entityId: string) {
  const entity = await prisma.entity.findUniqueOrThrow({
    where: { entityId },
    include: { primaryLocation: true, locations: true },
  });
  return entity;
}

/** Ground an entity at a Google place: one primary location row + the FK. */
export async function groundAt(
  prisma: PrismaClient,
  entityId: string,
  googlePlaceId: string,
  extra: {
    movedPlaceId?: string | null;
    businessStatus?: string | null;
    address?: string | null;
  } = {},
): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<Array<{ location_id: string }>>(
    `INSERT INTO core_restaurant_locations
       (restaurant_id, google_place_id, is_primary, moved_place_id, business_status, address)
     VALUES ($1::uuid, $2, true, $3, $4, $5)
     RETURNING location_id`,
    entityId,
    googlePlaceId,
    extra.movedPlaceId ?? null,
    extra.businessStatus ?? 'OPERATIONAL',
    extra.address ?? '1 Old Rd, Austin, TX 78701, USA',
  );
  await prisma.$executeRawUnsafe(
    `UPDATE core_entities SET primary_location_id = $2::uuid WHERE entity_id = $1::uuid`,
    entityId,
    row.location_id,
  );
  return row.location_id;
}

export async function mintRun(
  prisma: PrismaClient,
  tag: string,
): Promise<string> {
  const [row] = await prisma.$queryRawUnsafe<
    Array<{ extraction_run_id: string }>
  >(
    `INSERT INTO collection_extraction_runs (pipeline, model, system_prompt_hash, status)
     VALUES ('collection', $1, 'itest-hash', 'completed')
     RETURNING extraction_run_id`,
    `itest-${tag}`,
  );
  return row.extraction_run_id;
}

export async function redirectOf(
  prisma: PrismaClient,
  fromEntityId: string,
): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ to_entity_id: string }>>(
    `SELECT to_entity_id FROM entity_redirects WHERE from_entity_id = $1::uuid`,
    fromEntityId,
  );
  return rows[0]?.to_entity_id ?? null;
}

export async function verdict(
  prisma: PrismaClient,
  lane: string,
  claimKey: string,
): Promise<{ outcome: string; executed_at: Date | null } | null> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ outcome: string; executed_at: Date | null }>
  >(
    `SELECT outcome, executed_at FROM claim_verdicts WHERE lane = $1 AND claim_key = $2`,
    lane,
    claimKey,
  );
  return rows[0] ?? null;
}

/** Everything a spec tagged, gone — names carry the tag; verdict subjects
 *  carry the names. */
export async function cleanupTag(
  prisma: PrismaClient,
  tag: string,
): Promise<void> {
  const like = `${tag}%`;
  await prisma.$executeRawUnsafe(
    `DELETE FROM entity_redirects r USING core_entities e
      WHERE (r.from_entity_id = e.entity_id OR r.to_entity_id = e.entity_id)
        AND e.name LIKE $1`,
    like,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM claim_verdicts WHERE subject::text LIKE $1
        OR claim_key IN (SELECT 'place|' || a.entity_id || '|' || b.entity_id
                           FROM core_entities a, core_entities b
                          WHERE a.name LIKE $1 AND b.name LIKE $1)`,
    `%${tag}%`,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE core_entities SET primary_location_id = NULL WHERE name LIKE $1`,
    like,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM core_restaurant_locations l USING core_entities e
      WHERE l.restaurant_id = e.entity_id AND e.name LIKE $1`,
    like,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM core_restaurant_attribute_evidence a USING core_entities e
      WHERE a.restaurant_id = e.entity_id AND e.name LIKE $1`,
    like,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM entity_surface s USING core_entities e
      WHERE s.entity_id = e.entity_id AND e.name LIKE $1`,
    like,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM core_entities WHERE name LIKE $1`,
    like,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM collection_extraction_runs WHERE model LIKE $1`,
    `itest-${tag}%`,
  );
}
