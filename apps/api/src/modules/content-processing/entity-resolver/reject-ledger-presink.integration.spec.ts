/**
 * THE COURT'S MEMORY IS THE LEDGER — the reject sink keyed on the ledger,
 * proven against a real database (owner-approved rederivation, 2026-09-04).
 *
 * The defect (staging, v23 shadow): the tombstone pre-sink read
 * `status = 'archived' AND no redirect` AS the reject verdict, so every
 * archive made for another reason masqueraded as a judge reject — 134
 * janitor-archived UNGROUNDABLE places swallowed 632 place mentions
 * ("Arlo's" ate every vouch meant for the live "Arlo's Junior"); 714 items
 * archived with no verdict anywhere swallowed 428 dish mentions ("hard
 * shell taco" sank, and the place vouch riding on it vanished silently).
 *
 * Each proof carries its RED half against the old law:
 *   (i)   a fold owned by an ungroundable-archived place with NO verdict
 *         reaches recall + judge and lands on the live twin — old law: sunk
 *         before recall, judge never called;
 *   (ii)  a fold with a LEDGERED reject at the rule in force IS sunk (judge
 *         forbidden) — and the same row at a superseded rule version is NOT
 *         (the `=` law): old law had no ledger read at all;
 *   (iii) a Google-CLOSED place's OBSERVED spelling still sinks without any
 *         ledger row (closure is Google's verdict, not the judge's);
 *   (iv)  an item archive with no verdict no longer swallows the dish: the
 *         mention reaches the judge, and at write time the same row
 *         classifies as PARKED and revives (so the entity event the place
 *         vouch rides on is written, not dropped) — old law dropped it;
 *   (v)   a live judge REJECT is now a ledger row (lane entity_reject, rule
 *         version + fingerprint of the entity-match contract) with a landing
 *         row minted after it, and the next mention sinks for free;
 *   (vi)  a REHEARSAL reject ledgers under its run's source and mints no
 *         live landing row.
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ClaimVerdictLedgerService } from './claim-verdict-ledger.service';
import { EntityResolutionService } from './entity-resolution.service';
import {
  ENTITY_DEDUPE_RULE_FINGERPRINT,
  ENTITY_DEDUPE_RULE_VERSION,
} from './entity-dedupe-rule';
import { identityInsertData } from './entity-identity';
import {
  classifyArchivedRedirectFree,
  ENTITY_REJECT_FOLD_VERSION,
  ENTITY_REJECT_LANE,
  entityRejectClaimKey,
  reviveParkedName,
} from './entity-reject-lane';
import { addSurfaces } from './entity-surface.service';
import type { EntityResolutionInput } from './entity-resolution.types';
import type { RecallCandidate } from '../../entity-text-search/entity-text-search.service';

const prisma = new PrismaClient();
const ledger = new ClaimVerdictLedgerService(prisma as never);
const made: string[] = [];
const madeKeys: string[] = [];
const sfx = randomUUID().slice(0, 8);

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

type Kind = 'place' | 'item';

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
    {} as never,
    ledger,
  );
  (service as unknown as { logger: unknown }).logger = noopLogger();
  return service;
}

type Driveable = {
  performLlmMatches: (
    entities: EntityResolutionInput[],
    entityType: Kind,
    engineId: string | null,
    documentLocale: string | null,
    rehearsalRunId: string | null,
  ) => Promise<
    Array<{
      tempId: string;
      entityId: string | null;
      resolutionTier: string;
      matchedVia?: { tier: string };
    }>
  >;
};

const drive = (
  service: EntityResolutionService,
  kind: Kind,
  term: string,
  rehearsalRunId: string | null = null,
) =>
  (service as unknown as Driveable).performLlmMatches(
    [
      {
        tempId: randomUUID(),
        normalizedName: term,
        originalText: term,
        entityType: kind,
      },
    ],
    kind,
    null,
    null,
    rehearsalRunId,
  );

async function mint(
  kind: Kind,
  name: string,
  status: 'active' | 'archived',
  extra: { failureCount?: number } = {},
): Promise<string> {
  const id = randomUUID();
  const identity = identityInsertData(name, kind as never);
  await prisma.$executeRawUnsafe(
    `INSERT INTO core_entities
       (entity_id, name, type, status, identity_key, identity_key_sorted,
        fold_version, enrichment_failure_count)
     VALUES ($1::uuid, $2, $3::entity_type, $4::entity_status, $5, $6, $7, $8)`,
    id,
    name,
    kind,
    status,
    identity.identityKey,
    identity.identityKeySorted,
    identity.foldVersion,
    extra.failureCount ?? 0,
  );
  made.push(id);
  return id;
}

async function addLocation(
  placeId: string,
  opts: { grounded: boolean; businessStatus: string | null },
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO core_restaurant_locations
       (restaurant_id, google_place_id, business_status)
     VALUES ($1::uuid, $2, $3)`,
    placeId,
    opts.grounded ? `itest-reject-ledger-${placeId}` : null,
    opts.businessStatus,
  );
}

const candidate = (entityId: string, name: string): RecallCandidate => ({
  entityId,
  name,
  type: 'place',
  rrf: 1,
  sparseRank: 1,
  sparseSimilarity: 0.9,
  sparseEvidence: null,
  denseRank: null,
  denseCosine: null,
});

const forbiddenJudge = (): jest.Mock =>
  jest.fn(() => {
    throw new Error('a sunk mention must never reach the judge');
  });

const judgeSaying = (verdict: {
  decision: 'match' | 'new' | 'reject';
  candidateId?: number | null;
  reason: string;
}): jest.Mock =>
  jest.fn(({ items }: { items: unknown[] }) =>
    Promise.resolve(
      items.map(() => ({
        decision: verdict.decision,
        candidateId: verdict.candidateId ?? null,
        reason: verdict.reason,
      })),
    ),
  );

async function recordReject(
  kind: Kind,
  term: string,
  ruleVersion: number,
): Promise<void> {
  const claimKey = entityRejectClaimKey(kind, term);
  madeKeys.push(claimKey);
  await prisma.$executeRawUnsafe(
    `INSERT INTO claim_verdicts
       (lane, claim_key, rule_version, fold_version, outcome, reason,
        rule_fingerprint, subject, source, decided_at, executed_at)
     VALUES ($1, $2, $3, $4, 'reject', 'itest: junk', $5, '{}'::jsonb,
             'steady', now(), now())`,
    ENTITY_REJECT_LANE,
    claimKey,
    ruleVersion,
    ENTITY_REJECT_FOLD_VERSION,
    ENTITY_DEDUPE_RULE_FINGERPRINT,
  );
}

async function rejectRow(kind: Kind, term: string) {
  const claimKey = entityRejectClaimKey(kind, term);
  if (!madeKeys.includes(claimKey)) madeKeys.push(claimKey);
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      outcome: string;
      reason: string;
      rule_version: number;
      rule_fingerprint: string | null;
      source: string;
      executed_at: Date | null;
    }>
  >(
    `SELECT outcome, reason, rule_version, rule_fingerprint, source, executed_at
       FROM claim_verdicts WHERE lane = $1 AND claim_key = $2`,
    ENTITY_REJECT_LANE,
    claimKey,
  );
  return rows.length ? rows[0] : null;
}

async function statusOf(entityId: string): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<Array<{ status: string }>>(
    `SELECT status::text FROM core_entities WHERE entity_id = $1::uuid`,
    entityId,
  );
  return rows[0]?.status ?? 'missing';
}

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — this spec proves the ledger-keyed reject sink and must not be skipped',
    );
  }
});

afterAll(async () => {
  // Landing rows the live reject path minted are found by name.
  const minted = await prisma.$queryRawUnsafe<Array<{ entity_id: string }>>(
    `SELECT entity_id FROM core_entities WHERE name LIKE $1`,
    `zzq rl ${sfx}%`,
  );
  const ids = Array.from(new Set([...made, ...minted.map((r) => r.entity_id)]));
  if (madeKeys.length) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM claim_verdicts WHERE lane = $1 AND claim_key = ANY($2::text[])`,
      ENTITY_REJECT_LANE,
      madeKeys,
    );
  }
  await prisma.$executeRawUnsafe(
    `DELETE FROM claim_verdicts WHERE source = $1`,
    `rehearsal:${sfx}`,
  );
  if (ids.length) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM entity_surface WHERE entity_id = ANY($1::uuid[])`,
      ids,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM core_restaurant_locations WHERE restaurant_id = ANY($1::uuid[])`,
      ids,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM core_entities WHERE entity_id = ANY($1::uuid[])`,
      ids,
    );
  }
  await prisma.$disconnect();
});

describe('the reject sink keyed on the ledger — live database', () => {
  it('(i) an UNGROUNDABLE-archived place with no verdict is a parked name: its fold reaches recall + judge and lands on the live twin', async () => {
    const parked = await mint('place', `zzq rl ${sfx} arlos`, 'archived', {
      failureCount: 99,
    });
    await addLocation(parked, { grounded: false, businessStatus: null });
    const junior = await mint('place', `zzq rl ${sfx} arlos junior`, 'active');
    const judge = judgeSaying({
      decision: 'match',
      candidateId: 0,
      reason: 'the mention names the same taqueria',
    });
    const result = await drive(
      serviceWith({
        judge,
        candidatesByTerm: new Map([
          [
            `zzq rl ${sfx} arlos`,
            [candidate(junior, `zzq rl ${sfx} arlos junior`)],
          ],
        ]),
      }),
      'place',
      `zzq rl ${sfx} arlos`,
    );
    // RED under the old law: judge never called, entityId === parked.
    expect(judge).toHaveBeenCalledTimes(1);
    expect(result[0].entityId).toBe(junior);
    expect(result[0].matchedVia?.tier).toBe('fuzzy:judge');
  });

  it('(ii) a fold with a LEDGERED reject at the rule in force sinks without a hearing — and NOT at a superseded rule version', async () => {
    const junk = await mint('item', `zzq rl ${sfx} five piece`, 'archived');
    await recordReject(
      'item',
      `zzq rl ${sfx} five piece`,
      ENTITY_DEDUPE_RULE_VERSION,
    );
    const sunk = await drive(
      serviceWith({ judge: forbiddenJudge(), candidatesByTerm: new Map() }),
      'item',
      `zzq rl ${sfx} five piece`,
    );
    expect(sunk[0].entityId).toBe(junk);
    expect(sunk[0].matchedVia?.tier).toBe('tombstone-sink');

    // The `=` law: the same verdict under a rule no longer in force does
    // not sink — the question is open again and the judge is paid.
    const stale = await mint('item', `zzq rl ${sfx} stale junk`, 'archived');
    await recordReject(
      'item',
      `zzq rl ${sfx} stale junk`,
      ENTITY_DEDUPE_RULE_VERSION - 1,
    );
    const judge = judgeSaying({ decision: 'new', reason: 'a real dish now' });
    const shortlist = await mint(
      'item',
      `zzq rl ${sfx} stale bystander`,
      'active',
    );
    const reopened = await drive(
      serviceWith({
        judge,
        candidatesByTerm: new Map([
          [
            `zzq rl ${sfx} stale junk`,
            [candidate(shortlist, `zzq rl ${sfx} stale bystander`)],
          ],
        ]),
      }),
      'item',
      `zzq rl ${sfx} stale junk`,
    );
    expect(judge).toHaveBeenCalledTimes(1);
    expect(reopened[0].entityId).not.toBe(stale);
  });

  it("(iii) a GOOGLE-CLOSED place's observed spelling still sinks, with no ledger row at all", async () => {
    const closed = await mint(
      'place',
      `zzq rl ${sfx} mandala kitchen`,
      'archived',
    );
    await addLocation(closed, {
      grounded: true,
      businessStatus: 'CLOSED_PERMANENTLY',
    });
    await prisma.$transaction((tx) =>
      addSurfaces(
        tx,
        closed,
        [
          {
            form: `zzq rl ${sfx} mandala`,
            source: 'extraction',
            claimGrade: 'observed',
          },
        ],
        { touchLastUpdated: false },
      ),
    );
    const result = await drive(
      serviceWith({ judge: forbiddenJudge(), candidatesByTerm: new Map() }),
      'place',
      `zzq rl ${sfx} mandala`,
    );
    expect(result[0].entityId).toBe(closed);
    expect(result[0].matchedVia?.tier).toBe('tombstone-sink');
  });

  it('(iv) an item archive with no verdict no longer swallows the dish: it reaches the judge, and at write time it is PARKED and revives — the entity event the place vouch rides on is written, not dropped', async () => {
    const taco = await mint(
      'item',
      `zzq rl ${sfx} hard shell taco`,
      'archived',
    );
    const judge = judgeSaying({ decision: 'new', reason: 'a dish, not junk' });
    const shortlist = await mint(
      'item',
      `zzq rl ${sfx} taco bystander`,
      'active',
    );
    const result = await drive(
      serviceWith({
        judge,
        candidatesByTerm: new Map([
          [
            `zzq rl ${sfx} hard shell taco`,
            [candidate(shortlist, `zzq rl ${sfx} taco bystander`)],
          ],
        ]),
      }),
      'item',
      `zzq rl ${sfx} hard shell taco`,
    );
    // RED under the old law: entityId === taco (sunk), judge never called.
    expect(judge).toHaveBeenCalledTimes(1);
    expect(result[0].entityId).toBeNull();
    expect(result[0].resolutionTier).toBe('unmatched');

    // The write-time half (unified-processing's revalidation and mint block
    // both call exactly these): the archived id classifies as PARKED, and
    // the live batch revives it before writing onto it. Under the old law
    // the id was deleted from the temp-id map and the event never written.
    const fate = await prisma.$transaction((tx) =>
      classifyArchivedRedirectFree(tx, [taco], null),
    );
    expect(fate.get(taco)).toBe('parked');
    const revived = await prisma.$transaction((tx) =>
      reviveParkedName(tx, taco),
    );
    expect(revived).toBe(true);
    expect(await statusOf(taco)).toBe('active');
  });

  it('(v) a live judge REJECT is a ledger row first, a landing row second — and the next mention sinks for free', async () => {
    const term = `zzq rl ${sfx} south lamar location`;
    const bystander = await mint('item', `zzq rl ${sfx} bystander`, 'active');
    const judge = judgeSaying({
      decision: 'reject',
      reason: 'a street name, not a dish',
    });
    const first = await drive(
      serviceWith({
        judge,
        candidatesByTerm: new Map([
          [term, [candidate(bystander, `zzq rl ${sfx} bystander`)]],
        ]),
      }),
      'item',
      term,
    );
    expect(judge).toHaveBeenCalledTimes(1);
    expect(first[0].matchedVia?.tier).toBe('fuzzy:reject-tombstoned');
    const landing = first[0].entityId!;
    expect(await statusOf(landing)).toBe('archived');

    const row = await rejectRow('item', term);
    expect(row).not.toBeNull();
    expect(row!.outcome).toBe('reject');
    expect(row!.reason).toBe('a street name, not a dish');
    expect(row!.rule_version).toBe(ENTITY_DEDUPE_RULE_VERSION);
    expect(row!.rule_fingerprint).toBe(ENTITY_DEDUPE_RULE_FINGERPRINT);
    expect(row!.source).toBe('steady');
    expect(row!.executed_at).not.toBeNull();

    // And the landing row now classifies as a SINK at write time.
    const fate = await prisma.$transaction((tx) =>
      classifyArchivedRedirectFree(tx, [landing], null),
    );
    expect(fate.get(landing)).toBe('sink');

    const second = await drive(
      serviceWith({ judge: forbiddenJudge(), candidatesByTerm: new Map() }),
      'item',
      term,
    );
    expect(second[0].entityId).toBe(landing);
    expect(second[0].matchedVia?.tier).toBe('tombstone-sink');
  });

  it('(vi) a REHEARSAL reject ledgers under its run and mints NO live landing row', async () => {
    const term = `zzq rl ${sfx} shadow junk`;
    const judge = judgeSaying({
      decision: 'reject',
      reason: 'junk in a shadow',
    });
    const shortlist = await mint(
      'item',
      `zzq rl ${sfx} shadow bystander`,
      'active',
    );
    const result = await drive(
      serviceWith({
        judge,
        candidatesByTerm: new Map([
          [term, [candidate(shortlist, `zzq rl ${sfx} shadow bystander`)]],
        ]),
      }),
      'item',
      term,
      sfx,
    );
    expect(judge).toHaveBeenCalledTimes(1);
    expect(result[0].entityId).toBeNull();
    const row = await rejectRow('item', term);
    expect(row?.source).toBe(`rehearsal:${sfx}`);
    const landing = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(*) AS n FROM core_entities WHERE name = $1`,
      term,
    );
    expect(Number(landing[0].n)).toBe(0);
  });
});
