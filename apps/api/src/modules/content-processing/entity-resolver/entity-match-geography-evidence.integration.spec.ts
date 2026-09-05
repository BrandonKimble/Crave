/**
 * THE JUDGE SEES GEOGRAPHY — proven against a real database.
 *
 * Identity is global (owner ruling, 2026-09-04): the entity-match judge's
 * recall no longer hides far places, so the judge must be SHOWN where each
 * place candidate is and where the mention was written — otherwise a
 * Chicagoan's "Ema" in r/austinfood is judged against Chicago's Ema with no
 * way to weigh the distance, and "Rudy's" against "Rudy's Bar & Grill" (NYC)
 * with no way to see it is far.
 *
 * The proofs:
 *   1. on a PLACE hearing every shown candidate carries `location` — the
 *      city/region of its primary geocoded location, or "ungrounded" when it
 *      has none — and the judgment carries `community`, the engine's metro
 *      name;
 *   2. on an ITEM hearing candidates carry NO location (items are
 *      corpus-global, they have homes, not addresses);
 *   3. with no engine, `community` is null and the wire omits it.
 *
 * RED half: against 1277f1944 the batch judge's items had neither field.
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ClaimVerdictLedgerService } from './claim-verdict-ledger.service';
import { EntityResolutionService } from './entity-resolution.service';
import { ENTITY_MATCH_LANE, entityMatchLane } from './entity-match-lane';
import { canonicalFold } from './entity-identity';
import { entityMatchContextWire } from '../../external-integrations/llm/entity-match-prompt';
import { entityMatchCandidateWire } from '../../external-integrations/llm/entity-match-prompt';
import type { EntityResolutionInput } from './entity-resolution.types';
import type { RecallCandidate } from '../../entity-text-search/entity-text-search.service';

const prisma = new PrismaClient();
const ledger = new ClaimVerdictLedgerService(prisma as never);
const madeEntities: string[] = [];
const madeKeys: string[] = [];
const ENGINE_ID = randomUUID();

const noopLogger = () => {
  const logger: Record<string, unknown> = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
  logger.setContext = () => logger;
  return logger;
};

type JudgeItem = {
  term: string;
  community?: string | null;
  candidates: Array<{ id: number; name: string; location?: string | null }>;
};

function serviceWith(opts: {
  judge: jest.Mock;
  candidatesByTerm: Map<string, RecallCandidate[]>;
}): EntityResolutionService {
  const service = new EntityResolutionService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    { matchEntitiesBatch: opts.judge } as never,
    {
      retrieveCandidates: jest.fn(async (term: string) =>
        Promise.resolve(opts.candidatesByTerm.get(term) ?? []),
      ),
    } as never,
    noopLogger() as never,
    // The metro service, as the resolver consumes it: the engine's anchor
    // and the community's name. Both stubbed — the fact under proof is what
    // reaches the judge, not how the anchor is looked up.
    {
      anchorForEngine: jest.fn(() =>
        Promise.resolve({ lat: 30.2672, lng: -97.7431 }),
      ),
      communityForEngine: jest.fn((engineId: string) =>
        Promise.resolve(engineId === ENGINE_ID ? 'Austin' : null),
      ),
    } as never,
    ledger,
  );
  (service as unknown as { logger: unknown }).logger = noopLogger();
  return service;
}

type Driveable = {
  performLlmMatches: (
    entities: EntityResolutionInput[],
    entityType: 'place' | 'item',
    engineId: string | null,
    documentLocale: string | null,
    rehearsalRunId: string | null,
  ) => Promise<unknown>;
};

const drive = (
  service: EntityResolutionService,
  inputs: EntityResolutionInput[],
  entityType: 'place' | 'item',
  engineId: string | null,
) =>
  (service as unknown as Driveable).performLlmMatches(
    inputs,
    entityType,
    engineId,
    null,
    null,
  );

const inputFor = (
  term: string,
  entityType: 'place' | 'item',
): EntityResolutionInput => ({
  tempId: randomUUID(),
  normalizedName: term,
  originalText: term,
  entityType,
});

async function mint(
  name: string,
  type: 'place' | 'item',
  location?: {
    city: string | null;
    region: string | null;
    lat: number;
    lng: number;
  },
): Promise<RecallCandidate> {
  const entity = await prisma.entity.create({
    data: { name, type, identityKey: canonicalFold(name) },
  });
  madeEntities.push(entity.entityId);
  if (location) {
    await prisma.placeLocation.create({
      data: {
        placeId: entity.entityId,
        latitude: location.lat,
        longitude: location.lng,
        city: location.city,
        region: location.region,
        isPrimary: true,
      },
    });
  }
  return {
    entityId: entity.entityId,
    name,
    type,
    rrf: 1,
    sparseRank: 1,
    sparseSimilarity: 0.9,
    sparseEvidence: null,
    denseRank: null,
    denseCosine: null,
    metroLocal: null,
  };
}

const rememberKeys = (
  kind: 'place' | 'item',
  term: string,
  candidates: RecallCandidate[],
) => {
  for (const c of candidates) {
    madeKeys.push(
      entityMatchLane.canonicalClaimKey({
        kind,
        term,
        candidateEntityId: c.entityId,
      }),
    );
  }
};

/** The first judged item of the one batch the judge was asked. */
const judgedItem = (judge: jest.Mock): JudgeItem => {
  const calls = judge.mock.calls as Array<[{ items: JudgeItem[] }]>;
  return calls[0][0].items[0];
};

const judgeSayingNew = (): jest.Mock =>
  jest.fn(({ items }: { items: unknown[] }) =>
    Promise.resolve(
      items.map(() => ({
        decision: 'new',
        candidateId: null,
        reason: 'different brand tokens',
      })),
    ),
  );

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — this spec proves what the judge is shown against real location rows',
    );
  }
});

afterAll(async () => {
  if (madeKeys.length) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM claim_verdicts WHERE lane = $1 AND claim_key = ANY($2::text[])`,
      ENTITY_MATCH_LANE,
      madeKeys,
    );
  }
  if (madeEntities.length) {
    await prisma.placeLocation.deleteMany({
      where: { placeId: { in: madeEntities } },
    });
    await prisma.entitySurface.deleteMany({
      where: { entityId: { in: madeEntities } },
    });
    await prisma.entity.deleteMany({
      where: { entityId: { in: madeEntities } },
    });
  }
  await prisma.$disconnect();
});

describe('the entity-match judge is shown geography — live database', () => {
  it('place hearing: every candidate carries its location (city/region or "ungrounded") and the judgment carries the community', async () => {
    const suffix = randomUUID().slice(0, 8);
    const term = `zzq geo ema ${suffix}`;
    const chicago = await mint(`zzq geo ema chicago ${suffix}`, 'place', {
      city: 'Chicago',
      region: 'IL',
      lat: 41.8781,
      lng: -87.6298,
    });
    const ungrounded = await mint(`zzq geo ema nowhere ${suffix}`, 'place');
    const cityless = await mint(`zzq geo ema cityless ${suffix}`, 'place', {
      city: null,
      region: 'TX',
      lat: 30.5083,
      lng: -97.6789,
    });
    const shortlist = [chicago, ungrounded, cityless];
    rememberKeys('place', term, shortlist);

    const judge = judgeSayingNew();
    await drive(
      serviceWith({ judge, candidatesByTerm: new Map([[term, shortlist]]) }),
      [inputFor(term, 'place')],
      'place',
      ENGINE_ID,
    );

    expect(judge).toHaveBeenCalledTimes(1);
    const item = judgedItem(judge);
    expect(item.term).toBe(term);
    expect(item.community).toBe('Austin');
    expect(item.candidates.map((c) => c.location)).toEqual([
      'Chicago, IL',
      EntityResolutionService.UNGROUNDED_LOCATION,
      'TX',
    ]);
    // ...and the wire carries both, under the names the prompt teaches.
    expect(entityMatchContextWire(item)).toMatchObject({
      community: 'Austin',
    });
    expect(entityMatchCandidateWire(item.candidates[0])).toMatchObject({
      location: 'Chicago, IL',
    });
  });

  it('item hearing: candidates carry no location (items are corpus-global); the community still rides along', async () => {
    const suffix = randomUUID().slice(0, 8);
    const term = `zzq geo dish ${suffix}`;
    const dish = await mint(`zzq geo dish cand ${suffix}`, 'item');
    rememberKeys('item', term, [dish]);

    const judge = judgeSayingNew();
    await drive(
      serviceWith({ judge, candidatesByTerm: new Map([[term, [dish]]]) }),
      [inputFor(term, 'item')],
      'item',
      ENGINE_ID,
    );
    const item = judgedItem(judge);
    expect(item.community).toBe('Austin');
    expect('location' in item.candidates[0]).toBe(false);
  });

  it('no engine: community is null and the wire omits it', async () => {
    const suffix = randomUUID().slice(0, 8);
    const term = `zzq geo noengine ${suffix}`;
    const place = await mint(`zzq geo noengine cand ${suffix}`, 'place');
    rememberKeys('place', term, [place]);

    const judge = judgeSayingNew();
    await drive(
      serviceWith({ judge, candidatesByTerm: new Map([[term, [place]]]) }),
      [inputFor(term, 'place')],
      'place',
      null,
    );
    const item = judgedItem(judge);
    expect(item.community).toBeNull();
    expect('community' in entityMatchContextWire(item)).toBe(false);
    expect(item.candidates[0].location).toBe(
      EntityResolutionService.UNGROUNDED_LOCATION,
    );
  });
});
