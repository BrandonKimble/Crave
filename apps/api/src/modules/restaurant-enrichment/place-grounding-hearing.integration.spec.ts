/**
 * THE PLACE-GROUNDING LANE ON THE HEARING LEDGER — proven against a real
 * database (hearing-ledger adoption, 2026-08-13).
 *
 * The chooser's select writes `google_place_id` — the repo's most expensive
 * irreversible judgment (~$0.045 of Places spend, and every downstream
 * photo/address/pin inherits it, on an entity that is never deleted) — and
 * until this lane it had NO seam: a crash after the select lost the paid
 * verdict, and a rejection evaporated so re-enrichment re-bought the same
 * 'no'.
 *
 * The proofs, each with its RED half:
 *
 *   1. VERDICT BEFORE EFFECT. The select commits to the ledger — with the
 *      ABSOLUTE location target as its subject — before the location
 *      transaction runs; a crash between them leaves a decided, unexecuted
 *      hearing and NO location row (swap the order and this assertion goes
 *      red: the row would exist while the ledger held nothing).
 *      `resumePendingGroundingEffects` then finishes it from the STORED
 *      subject — no judge, no Places call — and a second replay writes
 *      NOTHING: the row text is byte-identical, `updated_at` included.
 *   2. a chooser REJECTION of an exact candidate set is remembered — the
 *      same set skips the judge (a chooser that THROWS proves it).
 *      NEUTERED-MEMORY CONTROL: delete the verdict row and the same set
 *      pays a judge again.
 *   3. a remembered SELECTION re-selects its candidate without a hearing.
 *   4. a reasonless rejection (the fail-closed paths) records NOTHING —
 *      an outage is not a ruling (amendment (d)).
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ClaimVerdictLedgerService } from '../content-processing/entity-resolver/claim-verdict-ledger.service';
import { AliasManagementService } from '../content-processing/entity-resolver/alias-management.service';
import {
  PlaceLocationEnrichmentService,
  type PlaceGroundingVerdictSubject,
} from './restaurant-location-enrichment.service';
import {
  PLACE_GROUNDING_LANE,
  placeGroundingLane,
} from './place-grounding-lane';
import {
  PLACE_GROUNDING_RULE_FINGERPRINT,
  PLACE_GROUNDING_RULE_VERSION,
} from './place-grounding-rule';

const prisma = new PrismaClient();
const ledger = new ClaimVerdictLedgerService(prisma as never);
const madeEntities: string[] = [];
const madePlaceIds: string[] = [];
const madeKeys: string[] = [];

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

function placeDetailsFor(placeId: string, name: string) {
  return {
    place: {
      id: placeId,
      displayName: { text: name, languageCode: 'en' },
      formattedAddress: '123 Zzq St, Austin, TX 78701, USA',
      location: { latitude: 30.2672, longitude: -97.7431 },
      addressComponents: [
        { longText: 'Austin', types: ['locality'] },
        { shortText: 'TX', types: ['administrative_area_level_1'] },
        { shortText: 'US', types: ['country'] },
        { longText: '78701', types: ['postal_code'] },
      ],
      businessStatus: 'OPERATIONAL',
    },
    metadata: { fieldMask: 'id,displayName,formattedAddress,location' },
  };
}

function autocompleteFor(placeId: string, name: string) {
  return {
    suggestions: [
      {
        placePrediction: {
          placeId,
          structuredFormat: {
            mainText: { text: name },
            secondaryText: { text: 'Austin, TX' },
          },
          types: ['restaurant'],
        },
      },
    ],
  };
}

function serviceWith(opts: {
  chooser: jest.Mock;
  placeId: string;
  name: string;
  crashTheEffect?: boolean;
}): PlaceLocationEnrichmentService {
  const googlePlaces = {
    autocompletePlace: jest.fn(() =>
      Promise.resolve(autocompleteFor(opts.placeId, opts.name)),
    ),
    getPlaceDetails: jest.fn(() =>
      Promise.resolve(placeDetailsFor(opts.placeId, opts.name)),
    ),
  };
  const Ctor = opts.crashTheEffect
    ? class CrashingGrounding extends PlaceLocationEnrichmentService {
        protected executeGroundingTransaction(): Promise<void> {
          return Promise.reject(
            new Error('process died before the grounding ran'),
          );
        }
      }
    : PlaceLocationEnrichmentService;
  return new Ctor(
    prisma as never,
    googlePlaces as never,
    { choosePlaceCandidate: opts.chooser } as never,
    aliasManagement as never,
    {} as never,
    {} as never,
    { markDirty: jest.fn() } as never,
    { queueExtraction: jest.fn() } as never,
    { queueExpansion: jest.fn() } as never,
    {
      get: (key: string) =>
        key === 'locationLifecycle.noMatchAttemptThreshold' ? 3 : undefined,
    } as never,
    { emit: jest.fn() } as never,
    ledger,
    { reconcile: () => Promise.resolve(0) } as never,
    noopLogger() as never,
  );
}

async function mintRestaurant(name: string) {
  const entity = await prisma.entity.create({
    data: {
      name,
      type: 'place',
      status: 'active',
      city: 'Austin',
      region: 'TX',
    },
  });
  madeEntities.push(entity.entityId);
  return {
    ...entity,
    restaurantMetadata: null,
    primaryLocation: null,
    locations: [],
  };
}

const trackKey = (key: string): string => {
  if (!madeKeys.includes(key)) madeKeys.push(key);
  return key;
};

const groundingKey = (restaurantId: string, placeId: string): string =>
  trackKey(
    placeGroundingLane.canonicalClaimKey({
      kind: 'grounding',
      placeEntityId: restaurantId,
      googlePlaceId: placeId,
    }),
  );

async function verdictRow(claimKey: string): Promise<{
  outcome: string;
  reason: string;
  rule_version: number;
  rule_fingerprint: string | null;
  executed_at: Date | null;
  subject: PlaceGroundingVerdictSubject;
} | null> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      outcome: string;
      reason: string;
      rule_version: number;
      rule_fingerprint: string | null;
      executed_at: Date | null;
      subject: PlaceGroundingVerdictSubject;
    }>
  >(
    `SELECT outcome, reason, rule_version, rule_fingerprint, executed_at, subject
       FROM claim_verdicts WHERE lane = $1 AND claim_key = $2`,
    PLACE_GROUNDING_LANE,
    claimKey,
  );
  return rows[0] ?? null;
}

async function locationRowBytes(placeId: string): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<Array<{ row: string }>>(
    `SELECT core_restaurant_locations::text AS row FROM core_restaurant_locations
      WHERE google_place_id = $1`,
    placeId,
  );
  return rows[0]?.row ?? '';
}

// A real alias merger: `computeNameAndAliasUpdate` runs before the verdict
// records, and a stubbed-out merger would crash the path this spec is
// actually proving.
const aliasManagement = new AliasManagementService(noopLogger() as never);
aliasManagement.onModuleInit();

const forbiddenChooser = (): jest.Mock =>
  jest.fn(() => {
    throw new Error('a remembered candidate set must not pay for a hearing');
  });

const mintPlaceId = (suffix: string): string => {
  const placeId = `zzq-place-${suffix}`;
  madePlaceIds.push(placeId);
  return placeId;
};

type EvaluateDriveable = {
  evaluateGeminiCandidateSet: (
    params: {
      autocompleteRanked: Array<{
        candidate: {
          placeId: string;
          description: string;
          mainText?: string;
          types?: string[];
        };
      }>;
      searchTextRanked: [];
      entity: unknown;
      context?: unknown;
    },
    strategy: 'gemini_staged',
  ) => Promise<{
    selection: {
      selected?: { entry: { candidate: { placeId: string } } };
      adjudicationTrail: Array<{ reason?: string }>;
    };
  }>;
};

const rankedFor = (placeId: string, name: string) => [
  {
    candidate: {
      placeId,
      description: `${name}, Austin, TX`,
      mainText: name,
      types: ['restaurant'],
    },
  },
];

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — this spec proves the grounding hearing memory and must not be skipped',
    );
  }
});

afterAll(async () => {
  if (madeKeys.length) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM claim_verdicts WHERE lane = $1 AND claim_key = ANY($2::text[])`,
      PLACE_GROUNDING_LANE,
      madeKeys,
    );
  }
  if (madeEntities.length) {
    await prisma.$executeRawUnsafe(
      `UPDATE core_entities SET primary_location_id = NULL
        WHERE entity_id = ANY($1::uuid[])`,
      madeEntities,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM core_restaurant_locations WHERE restaurant_id = ANY($1::uuid[])`,
      madeEntities,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM core_restaurant_attribute_evidence WHERE restaurant_id = ANY($1::uuid[])`,
      madeEntities,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM entity_surface WHERE entity_id = ANY($1::uuid[])`,
      madeEntities,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM core_entities WHERE entity_id = ANY($1::uuid[])`,
      madeEntities,
    );
  }
  await prisma.$disconnect();
});

describe('the place-grounding lane on the hearing ledger — live database', () => {
  it('commits the verdict BEFORE the effect, resumes the crash from stored bytes, and replays to byte-identical bytes', async () => {
    const suffix = randomUUID().slice(0, 8);
    const name = `Zzq Grounding Grill ${suffix}`;
    const placeId = mintPlaceId(suffix);
    const entity = await mintRestaurant(name);
    const key = groundingKey(entity.entityId, placeId);

    const chooser = jest.fn(() =>
      Promise.resolve({
        decision: 'select',
        candidateId: 'c1',
        reason: 'source names the Austin location; candidate address matches',
      }),
    );

    // THE CRASH: the judge selects, the verdict records, the process dies
    // before the location transaction. (`enrichPlace` is private by
    // design; the spec reaches it structurally, the standard way this file's
    // siblings drive private lanes.)
    const crashed = await (
      serviceWith({
        chooser,
        placeId,
        name,
        crashTheEffect: true,
      }) as unknown as {
        enrichPlace(
          entity: unknown,
          options: { sourceText?: string },
        ): Promise<{ status: string }>;
      }
    ).enrichPlace(entity, { sourceText: 'zzq source text' });
    expect(crashed.status).toBe('error');

    // The hearing SURVIVED the crash: decided, unexecuted, with the
    // ABSOLUTE target state as its subject — and NO location row exists.
    // (Swap the verdict/effect order and both halves of this go red.)
    const pendingVerdict = await verdictRow(key);
    expect(pendingVerdict).not.toBeNull();
    expect(pendingVerdict!.outcome).toBe('selected');
    expect(pendingVerdict!.rule_version).toBe(PLACE_GROUNDING_RULE_VERSION);
    expect(pendingVerdict!.rule_fingerprint).toBe(
      PLACE_GROUNDING_RULE_FINGERPRINT,
    );
    expect(pendingVerdict!.executed_at).toBeNull();
    expect(pendingVerdict!.subject.location?.googlePlaceId).toBe(placeId);
    expect(pendingVerdict!.subject.location?.city).toBe('Austin');
    expect(await locationRowBytes(placeId)).toBe('');

    // THE RESUME replays the STORED subject — a chooser that throws proves
    // no judge is paid, and the fake Places mocks are never consulted
    // because the resume constructor's googlePlaces would throw on use.
    const resumer = serviceWith({
      chooser: forbiddenChooser(),
      placeId,
      name,
    });
    expect(await resumer.resumePendingGroundingEffects()).toBe(1);

    const grounded = await prisma.placeLocation.findUnique({
      where: { googlePlaceId: placeId },
    });
    expect(grounded).not.toBeNull();
    expect(grounded!.placeId).toBe(entity.entityId);
    expect(grounded!.isPrimary).toBe(true);
    const connected = await prisma.entity.findUnique({
      where: { entityId: entity.entityId },
      select: { primaryLocationId: true },
    });
    expect(connected?.primaryLocationId).toBe(grounded!.locationId);
    expect((await verdictRow(key))!.executed_at).not.toBeNull();

    // REPLAYED, THE SAME BYTES — updated_at included: a replay of an obeyed
    // grounding touches nothing (the wave-1 IS DISTINCT FROM doctrine).
    const afterResume = await locationRowBytes(placeId);
    const applied = await (
      resumer as unknown as {
        applyGroundingEffect(
          subject: PlaceGroundingVerdictSubject,
        ): Promise<boolean>;
      }
    ).applyGroundingEffect(pendingVerdict!.subject);
    expect(applied).toBe(false);
    expect(await locationRowBytes(placeId)).toBe(afterResume);

    // ...and the resume queue is empty: resuming again finds nothing.
    expect(await resumer.resumePendingGroundingEffects()).toBe(0);
  });

  it('remembers a rejection of an exact candidate set — and pays again when the memory is neutered', async () => {
    const suffix = randomUUID().slice(0, 8);
    const name = `Zzq Rejected Bistro ${suffix}`;
    const placeId = mintPlaceId(suffix);
    const entity = await mintRestaurant(name);
    const setKey = trackKey(
      placeGroundingLane.canonicalClaimKey({
        kind: 'rejection',
        placeEntityId: entity.entityId,
        candidatePlaceIds: [placeId],
      }),
    );

    // FIRST ASK — the chooser declines with a stated ground.
    const chooser = jest.fn(() =>
      Promise.resolve({
        decision: 'reject',
        candidateId: null,
        reason: 'source says Austin, candidate is Dallas',
      }),
    );
    const service = serviceWith({ chooser, placeId, name });
    const evaluate = (svc: PlaceLocationEnrichmentService) =>
      (svc as unknown as EvaluateDriveable).evaluateGeminiCandidateSet(
        {
          autocompleteRanked: rankedFor(placeId, name),
          searchTextRanked: [],
          entity,
          context: { query: name, city: 'Austin', region: 'TX' },
        },
        'gemini_staged',
      );
    const first = await evaluate(service);
    expect(first.selection.selected).toBeUndefined();
    expect(chooser).toHaveBeenCalledTimes(1);

    const rejection = await verdictRow(setKey);
    expect(rejection).not.toBeNull();
    expect(rejection!.outcome).toBe('rejected');
    expect(rejection!.reason).toBe('source says Austin, candidate is Dallas');
    expect(rejection!.executed_at).not.toBeNull();

    // SECOND ASK, identical set — a chooser that throws proves no LLM call.
    const remembered = await evaluate(
      serviceWith({ chooser: forbiddenChooser(), placeId, name }),
    );
    expect(remembered.selection.selected).toBeUndefined();
    expect(remembered.selection.adjudicationTrail[0]?.reason).toContain(
      'remembered rejection',
    );

    // NEUTERED-MEMORY CONTROL (the RED half): delete the verdict and the
    // same set pays a judge again.
    await prisma.$executeRawUnsafe(
      `DELETE FROM claim_verdicts WHERE lane = $1 AND claim_key = $2`,
      PLACE_GROUNDING_LANE,
      setKey,
    );
    const paidAgain = jest.fn(() =>
      Promise.resolve({
        decision: 'reject',
        candidateId: null,
        reason: 'still Dallas',
      }),
    );
    await evaluate(serviceWith({ chooser: paidAgain, placeId, name }));
    expect(paidAgain).toHaveBeenCalledTimes(1);
  });

  it('re-selects from a remembered selection without paying a judge', async () => {
    const suffix = randomUUID().slice(0, 8);
    const name = `Zzq Remembered Cantina ${suffix}`;
    const placeId = mintPlaceId(suffix);
    const entity = await mintRestaurant(name);
    const key = groundingKey(entity.entityId, placeId);
    await ledger.record<PlaceGroundingVerdictSubject>({
      lane: PLACE_GROUNDING_LANE,
      claimKey: key,
      ruleVersion: PLACE_GROUNDING_RULE_VERSION,
      foldVersion: placeGroundingLane.keyFoldVersion,
      outcome: 'selected',
      reason: 'identity and geography both established',
      ruleFingerprint: PLACE_GROUNDING_RULE_FINGERPRINT,
      subject: {
        kind: 'grounding',
        restaurantId: entity.entityId,
        restaurantName: name,
        placeId,
        location: null,
      },
    });
    await ledger.markExecuted(
      PLACE_GROUNDING_LANE,
      key,
      PLACE_GROUNDING_RULE_VERSION,
      placeGroundingLane.keyFoldVersion,
    );

    const result = await (
      serviceWith({
        chooser: forbiddenChooser(),
        placeId,
        name,
      }) as unknown as EvaluateDriveable
    ).evaluateGeminiCandidateSet(
      {
        autocompleteRanked: rankedFor(placeId, name),
        searchTextRanked: [],
        entity,
        context: { query: name, city: 'Austin', region: 'TX' },
      },
      'gemini_staged',
    );
    expect(result.selection.selected?.entry.candidate.placeId).toBe(placeId);
  });

  it('records NOTHING for a reasonless rejection — an outage is not a ruling', async () => {
    const suffix = randomUUID().slice(0, 8);
    const name = `Zzq Outage Diner ${suffix}`;
    const placeId = mintPlaceId(suffix);
    const entity = await mintRestaurant(name);
    const setKey = trackKey(
      placeGroundingLane.canonicalClaimKey({
        kind: 'rejection',
        placeEntityId: entity.entityId,
        candidatePlaceIds: [placeId],
      }),
    );

    // The chooser's real fail-closed shape: reject, no reason.
    const outage = jest.fn(() =>
      Promise.resolve({ decision: 'reject', candidateId: null }),
    );
    await (
      serviceWith({
        chooser: outage,
        placeId,
        name,
      }) as unknown as EvaluateDriveable
    ).evaluateGeminiCandidateSet(
      {
        autocompleteRanked: rankedFor(placeId, name),
        searchTextRanked: [],
        entity,
        context: { query: name, city: 'Austin', region: 'TX' },
      },
      'gemini_staged',
    );
    expect(await verdictRow(setKey)).toBeNull();
  });
});
