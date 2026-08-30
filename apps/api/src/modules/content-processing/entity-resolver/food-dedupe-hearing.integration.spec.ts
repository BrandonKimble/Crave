/**
 * THE DEDUPE LANE ON THE HEARING LEDGER — proven against a real database
 * (H5 adoption, 2026-08-12).
 *
 * Four properties, each of which was false while the judge lanes ran without
 * verdict memory:
 *
 *   1. the VERDICT (with its FULL merge plan) commits before the merge
 *      executes — a crash between them leaves work to finish, and the resume
 *      replays the STORED plan without paying a judge;
 *   2. a judge REJECTION persists — a nightly re-scan skips the judged pair
 *      instead of re-buying the same 'no' forever, and it skips it in EITHER
 *      pair order (the sorted claim key). NEUTERED-MEMORY CONTROL: delete
 *      the verdict row and the same scan pays again — the skip assertion
 *      would go red, so the memory is load-bearing, not decorative;
 *   3. a verdict with no stated ground is NOT a ruling (amendment (d)) — the
 *      pair is left unjudged and re-offered, nothing is recorded, nothing
 *      merges. matchEntitiesBatch's fail-closed 'new' carries no reason, so
 *      a judge outage can never mint a 'hold';
 *   4. the activation gate holds the lanes OFF by default — no judge call,
 *      no verdict, no merge — until DEDUPE_JUDGE_LANES_ENABLED flips
 *      (post-v8 sequencing, plans/iteration-phase-open-items.md).
 *
 * CRASH-SEAM MUTATION: swap settleDedupeVerdict's order (effect before
 * record) and proof 1's assertions go red — the loser would already be
 * archived while claim_verdicts holds nothing.
 *
 * `run()` is not used (it scans the whole database);
 * `adjudicateDedupeCandidates` is driven directly with seeded pairs, the
 * standard way this file's siblings test private lanes.
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ClaimVerdictLedgerService } from './claim-verdict-ledger.service';
import {
  DedupeMergeSummary,
  DedupeVerdictSubject,
  ItemDedupeMergeService,
} from './food-dedupe-merge.service';
import { EntityAnchorRehomeService } from './entity-anchor-rehome.service';
import {
  ENTITY_DEDUPE_LANE,
  entityDedupeLane,
} from './entity-dedupe-lane.adapter';
import { ENTITY_DEDUPE_RULE_VERSION } from './entity-dedupe-rule';
import { canonicalFold } from './entity-identity';
import { LLMService } from '../../external-integrations/llm/llm.service';
import { LoggerService } from '../../../shared';

const prisma = new PrismaClient();
const madeEntities: string[] = [];
const madeKeys: string[] = [];
const ledger = new ClaimVerdictLedgerService(prisma as never);

function noopLogger(): LoggerService {
  const logger: Partial<LoggerService> = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
  logger.setContext = () => logger as LoggerService;
  return logger as LoggerService;
}

const judgeSaying = (verdict: {
  decision: 'match' | 'new';
  reason?: string;
}): LLMService =>
  ({
    matchEntitiesBatch: jest
      .fn()
      .mockImplementation((input: { items: unknown[] }) =>
        Promise.resolve(
          input.items.map(() => ({
            ...verdict,
            candidateId: verdict.decision === 'match' ? 1 : null,
          })),
        ),
      ),
  }) as unknown as LLMService;

const forbiddenJudge = (): LLMService =>
  ({
    matchEntitiesBatch: jest.fn(() => {
      throw new Error('a remembered pair must not pay for a new hearing');
    }),
  }) as unknown as LLMService;

const serviceWith = (llm: LLMService): ItemDedupeMergeService =>
  new ItemDedupeMergeService(
    prisma as never,
    llm,
    new EntityAnchorRehomeService(noopLogger()),
    ledger,
    noopLogger(),
  );

/** The same service with the EFFECT step killed — the crash seam. */
class CrashingDedupe extends ItemDedupeMergeService {
  protected applyDedupeEffect(): Promise<void> {
    return Promise.reject(new Error('process died before the merge ran'));
  }
}

type Driveable = {
  adjudicateDedupeCandidates: (
    sweepType: 'item' | 'ingredient',
    candidates: Array<{
      a_id: string;
      a_name: string;
      b_id: string;
      b_name: string;
    }>,
    via: 'token-multiset+judge' | 'similarity+judge',
    summary: DedupeMergeSummary,
    consumed: Set<string>,
  ) => Promise<void>;
};

const drive = (
  service: ItemDedupeMergeService,
  pairs: Array<{ a_id: string; a_name: string; b_id: string; b_name: string }>,
  summary: DedupeMergeSummary,
): Promise<void> =>
  (service as unknown as Driveable).adjudicateDedupeCandidates(
    'item',
    pairs,
    'similarity+judge',
    summary,
    new Set(),
  );

const emptySummary = (): DedupeMergeSummary => ({
  candidatePairs: 0,
  autoMerged: 0,
  judgeMerged: 0,
  judgeRejected: 0,
  judgeAlreadyDecided: 0,
  judgeHeld: 0,
  judgeUnjudged: 0,
});

async function mintItem(name: string): Promise<string> {
  const entity = await prisma.entity.create({
    data: { name, type: 'item', identityKey: canonicalFold(name) },
  });
  madeEntities.push(entity.entityId);
  return entity.entityId;
}

async function mintPair(suffix: string): Promise<{
  a_id: string;
  a_name: string;
  b_id: string;
  b_name: string;
}> {
  const aName = `zzq dedupe a ${suffix}`;
  const bName = `zzq dedupe b longer ${suffix}`;
  const [a, b] = [await mintItem(aName), await mintItem(bName)];
  madeKeys.push(
    entityDedupeLane.canonicalClaimKey({ entityId: a, otherEntityId: b }),
  );
  return { a_id: a, a_name: aName, b_id: b, b_name: bName };
}

async function verdictRow(claimKey: string): Promise<{
  outcome: string;
  reason: string;
  rule_version: number;
  executed_at: Date | null;
  subject: DedupeVerdictSubject;
} | null> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      outcome: string;
      reason: string;
      rule_version: number;
      executed_at: Date | null;
      subject: DedupeVerdictSubject;
    }>
  >(
    `SELECT outcome, reason, rule_version, executed_at, subject
       FROM claim_verdicts WHERE lane = $1 AND claim_key = $2
      ORDER BY rule_version DESC`,
    ENTITY_DEDUPE_LANE,
    claimKey,
  );
  return rows[0] ?? null;
}

async function statusOf(entityId: string): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<Array<{ status: string }>>(
    `SELECT status::text FROM core_entities WHERE entity_id = $1::uuid`,
    entityId,
  );
  return rows[0].status;
}

const priorGateValue = process.env.DEDUPE_JUDGE_LANES_ENABLED;

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — this spec proves the dedupe hearing memory and must not be skipped',
    );
  }
  // The gate is proven OFF-by-default in its own test below; every other
  // proof needs the lanes live.
  process.env.DEDUPE_JUDGE_LANES_ENABLED = 'true';
});

afterAll(async () => {
  if (priorGateValue === undefined) {
    delete process.env.DEDUPE_JUDGE_LANES_ENABLED;
  } else {
    process.env.DEDUPE_JUDGE_LANES_ENABLED = priorGateValue;
  }
  if (madeKeys.length) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM claim_verdicts WHERE lane = $1 AND claim_key = ANY($2::text[])`,
      ENTITY_DEDUPE_LANE,
      madeKeys,
    );
  }
  if (madeEntities.length) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM entity_redirects WHERE from_entity_id = ANY($1::uuid[])
          OR to_entity_id = ANY($1::uuid[])`,
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

describe('the dedupe lane on the hearing ledger — live database', () => {
  it('holds the judge lanes OFF by default — no judge call, no verdict, no merge', async () => {
    process.env.DEDUPE_JUDGE_LANES_ENABLED = 'false';
    try {
      const pair = await mintPair(randomUUID().slice(0, 8));
      const summary = emptySummary();
      // A judge that throws proves the gate never reaches it.
      await drive(serviceWith(forbiddenJudge()), [pair], summary);
      expect(summary.judgeHeld).toBe(1);
      expect(summary.judgeMerged).toBe(0);
      const key = entityDedupeLane.canonicalClaimKey({
        entityId: pair.a_id,
        otherEntityId: pair.b_id,
      });
      expect(await verdictRow(key)).toBeNull();
      expect(await statusOf(pair.a_id)).toBe('active');
      expect(await statusOf(pair.b_id)).toBe('active');
    } finally {
      process.env.DEDUPE_JUDGE_LANES_ENABLED = 'true';
    }
  });

  /**
   * PROOF 1 — the verdict (with its full merge plan) outlives the crash, and
   * the resume replays the STORED plan without a judge.
   */
  it('commits the verdict with the FULL plan BEFORE the merge, and resumes it', async () => {
    const pair = await mintPair(randomUUID().slice(0, 8));
    const key = entityDedupeLane.canonicalClaimKey({
      entityId: pair.a_id,
      otherEntityId: pair.b_id,
    });

    const crashing = new CrashingDedupe(
      prisma as never,
      judgeSaying({ decision: 'match', reason: 'same dish, spelling variant' }),
      new EntityAnchorRehomeService(noopLogger()),
      ledger,
      noopLogger(),
    );
    await expect(drive(crashing, [pair], emptySummary())).rejects.toThrow(
      'process died before the merge ran',
    );

    // THE ANSWER SURVIVED: decided, grounded, NOT executed — and the plan is
    // the whole effect, stored before anything moved.
    const decided = await verdictRow(key);
    expect(decided).toMatchObject({
      outcome: 'merge',
      reason: 'same dish, spelling variant',
      rule_version: ENTITY_DEDUPE_RULE_VERSION,
      executed_at: null,
    });
    // Winner selection is part of the DECISION: zero connections each, so
    // the shorter name wins the tie-break, fixed in the stored plan.
    expect(decided?.subject.plan).toMatchObject({
      winnerId: pair.a_id,
      loserId: pair.b_id,
    });
    // ...and the corpus has NOT been mutated yet.
    expect(await statusOf(pair.a_id)).toBe('active');
    expect(await statusOf(pair.b_id)).toBe('active');

    // A resume finishes it without asking the judge anything.
    const resumer = serviceWith(forbiddenJudge());
    expect(await resumer.resumePendingDedupeEffects()).toBeGreaterThanOrEqual(
      1,
    );
    expect(await statusOf(pair.a_id)).toBe('active');
    expect(await statusOf(pair.b_id)).toBe('archived');
    expect((await verdictRow(key))?.executed_at).not.toBeNull();
    const redirect = await prisma.entityRedirect.findUnique({
      where: { fromEntityId: pair.b_id },
    });
    expect(redirect?.toEntityId).toBe(pair.a_id);

    // IDEMPOTENT: resuming again is a no-op, not a second fold.
    expect(await resumer.resumePendingDedupeEffects()).toBe(0);
  });

  /**
   * PROOF 2 — a rejection is REMEMBERED, in either pair order, and the
   * memory is load-bearing: neuter it and the same scan pays again.
   */
  it('skips a judged (held) pair on re-scan — and re-buys it when the memory is neutered', async () => {
    const pair = await mintPair(randomUUID().slice(0, 8));
    const key = entityDedupeLane.canonicalClaimKey({
      entityId: pair.a_id,
      otherEntityId: pair.b_id,
    });

    const first = emptySummary();
    await drive(
      serviceWith(
        judgeSaying({
          decision: 'new',
          reason: 'distinct dishes, not variants',
        }),
      ),
      [pair],
      first,
    );
    expect(first.judgeRejected).toBe(1);
    expect(await verdictRow(key)).toMatchObject({
      outcome: 'hold',
      reason: 'distinct dishes, not variants',
    });
    // A 'hold' has no effect to run — it is finished the moment it lands.
    expect((await verdictRow(key))?.executed_at).not.toBeNull();
    expect(await statusOf(pair.a_id)).toBe('active');
    expect(await statusOf(pair.b_id)).toBe('active');

    // RE-SCAN, pair emitted THE OTHER WAY ROUND: one claim, one memory —
    // a judge that throws proves no re-buy.
    const rescan = emptySummary();
    await drive(
      serviceWith(forbiddenJudge()),
      [
        {
          a_id: pair.b_id,
          a_name: pair.b_name,
          b_id: pair.a_id,
          b_name: pair.a_name,
        },
      ],
      rescan,
    );
    expect(rescan.judgeAlreadyDecided).toBe(1);
    expect(rescan.judgeRejected).toBe(0);

    // NEUTERED-MEMORY CONTROL — the red the skip assertion is capable of.
    // Delete the verdict row and the identical re-scan reaches the judge
    // again: the skip above was the ledger working, not a coincidence.
    await prisma.$executeRawUnsafe(
      `DELETE FROM claim_verdicts WHERE lane = $1 AND claim_key = $2`,
      ENTITY_DEDUPE_LANE,
      key,
    );
    const neutered = emptySummary();
    const countingJudge = judgeSaying({
      decision: 'new',
      reason: 'distinct dishes, not variants',
    });
    await drive(serviceWith(countingJudge), [pair], neutered);
    expect(neutered.judgeAlreadyDecided).toBe(0);
    expect(neutered.judgeRejected).toBe(1);
    expect(
      (countingJudge as unknown as { matchEntitiesBatch: jest.Mock })
        .matchEntitiesBatch,
    ).toHaveBeenCalledTimes(1);
  });

  /**
   * PROOF 3 — a reasonless answer is not a ruling (amendment (d)): nothing
   * recorded, nothing merged, the pair stays due.
   */
  it('drops a reasonless verdict as unjudged — no row, no merge', async () => {
    const pair = await mintPair(randomUUID().slice(0, 8));
    const summary = emptySummary();
    await drive(
      serviceWith(judgeSaying({ decision: 'match' })), // no reason
      [pair],
      summary,
    );
    expect(summary.judgeUnjudged).toBe(1);
    expect(summary.judgeMerged).toBe(0);
    const key = entityDedupeLane.canonicalClaimKey({
      entityId: pair.a_id,
      otherEntityId: pair.b_id,
    });
    expect(await verdictRow(key)).toBeNull();
    expect(await statusOf(pair.a_id)).toBe('active');
    expect(await statusOf(pair.b_id)).toBe('active');
  });
});
