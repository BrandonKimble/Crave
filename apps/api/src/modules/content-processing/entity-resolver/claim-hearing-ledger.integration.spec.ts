import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { addSurfaces } from './entity-surface.service';
import { identityInsertData } from './entity-identity';
import { WordClaimAdjudicatorService } from './word-claim-adjudicator.service';
import {
  ClaimVerdictLedgerService,
  VerdictReasonMissingError,
} from './claim-verdict-ledger.service';
import {
  ClaimRehearingBudgetService,
  DrainExceedsStandingCapError,
  StaleDrainApprovalError,
  STANDING_REHEARING_CAP,
} from './claim-rehearing-budget.service';
import { CLAIM_JUDGE_PROMPT_VERSION } from './claim-judge-rule';
import { WORD_CLAIM_LANE, wordClaimLane } from './word-claim-lane';
import { entityDedupeLane } from './entity-dedupe-lane.adapter';
import { BaseClaimLaneAdapter } from './claim-lane-adapter';

/**
 * THE ONE HEARING ABSTRACTION — proven against a real database.
 *
 * Five properties, each of which was false before H5 and each of which the
 * corpus was actually harmed by:
 *
 *   1. the VERDICT commits before the EFFECT, so a crash between them leaves
 *      work to finish rather than a paid answer that vanished;
 *   2. the retain (retraction) hearing is the same shape as the grant, so
 *      "take this word back" is not a second mechanism;
 *   3. a rule bump re-opens a past GRANT as well as a past LOSS — the
 *      asymmetry that made a wrong YES permanent — and draining beyond the
 *      standing cap REFUSES with an estimate;
 *   4. a verdict states its ground, enforced at the write layer AND the
 *      database;
 *   5. a second (and third) lane can state its own claim identity without
 *      touching the base.
 */
describe('the one hearing abstraction — live database', () => {
  const prisma = new PrismaClient();
  const madeEntities: string[] = [];
  const madeKeys: string[] = [];

  const ledger = new ClaimVerdictLedgerService(prisma as never);
  const budget = new ClaimRehearingBudgetService(prisma as never);

  const logger = () =>
    ({
      setContext: jest.fn().mockReturnThis(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }) as never;

  const judgeSaying = (verdict: {
    a_owns_word: boolean;
    incumbents_own_word?: boolean[];
    reason?: string;
  }) => ({
    generateForCaller: jest.fn().mockResolvedValue(
      JSON.stringify({
        items: [
          {
            n: 1,
            incumbents_own_word: [],
            reason: 'stated ground',
            ...verdict,
          },
        ],
      }),
    ),
  });

  const adjudicatorWith = (judge: unknown): WordClaimAdjudicatorService =>
    new WordClaimAdjudicatorService(
      prisma as never,
      judge as never,
      logger(),
      ledger,
    );

  /** The same adjudicator, with the EFFECT step killed — the crash seam. */
  class CrashingAdjudicator extends WordClaimAdjudicatorService {
    protected applyEffect(): Promise<boolean> {
      return Promise.reject(new Error('process died before the effect ran'));
    }
  }

  const mintFood = async (name: string): Promise<string> => {
    const id = randomUUID();
    const identity = identityInsertData(name, 'food' as never);
    await prisma.$executeRawUnsafe(
      `INSERT INTO core_entities (entity_id, name, type, status, identity_key, identity_key_sorted)
       VALUES ($1::uuid, $2, 'food'::entity_type, 'active'::entity_status, $3, $4)`,
      id,
      name,
      identity.identityKey,
      identity.identityKeySorted,
    );
    madeEntities.push(id);
    return id;
  };

  const verdictRow = async (
    claimKey: string,
  ): Promise<{
    outcome: string;
    reason: string;
    rule_version: number;
    executed_at: Date | null;
  } | null> => {
    madeKeys.push(claimKey);
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        outcome: string;
        reason: string;
        rule_version: number;
        executed_at: Date | null;
      }>
    >(
      `SELECT outcome, reason, rule_version, executed_at FROM claim_verdicts
        WHERE lane = $1 AND claim_key = $2 ORDER BY rule_version DESC`,
      WORD_CLAIM_LANE,
      claimKey,
    );
    return rows[0] ?? null;
  };

  const surfacesOf = async (
    entityId: string,
  ): Promise<Array<{ form: string; role: string; status: string }>> =>
    prisma.$queryRawUnsafe(
      `SELECT form, role::text, status::text FROM entity_surface
        WHERE entity_id = $1::uuid ORDER BY form`,
      entityId,
    );

  afterAll(async () => {
    if (madeKeys.length) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM claim_verdicts WHERE claim_key = ANY($1::text[])`,
        madeKeys,
      );
    }
    if (madeEntities.length) {
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

  /**
   * PROOF 1 — the verdict outlives the crash, and the effect resumes.
   *
   * The hearing is paid for the moment the judge answers. If the process dies
   * while the corpus is being written, the OLD shape lost the answer entirely:
   * nothing had been recorded, so the next run re-asked and re-paid. Here the
   * decision is already durable and unexecuted, and resuming replays the
   * STORED effect — which is why a resumed effect cannot drift from the
   * verdict that ordered it.
   */
  it('commits the verdict BEFORE the effect, and resumes a decided-but-unexecuted one', async () => {
    const suffix = randomUUID().slice(0, 8);
    const word = `zzq crash ${suffix}`;
    const claimant = await mintFood(`zzq crash claimant ${suffix}`);
    const claim = {
      form: word,
      locale: 'es',
      entityId: claimant,
      source: 'vocabulary' as const,
    };
    const claimKey = wordClaimLane.canonicalClaimKey(claim);

    const crashing = new CrashingAdjudicator(
      prisma as never,
      judgeSaying({ a_owns_word: true }) as never,
      logger(),
      ledger,
    );
    await expect(crashing.adjudicate([claim])).rejects.toThrow(
      'process died before the effect ran',
    );

    // THE ANSWER SURVIVED. Decided, with its ground, and NOT executed.
    const decided = await verdictRow(claimKey);
    expect(decided).toMatchObject({
      outcome: 'bothUpheld',
      rule_version: CLAIM_JUDGE_PROMPT_VERSION,
      executed_at: null,
    });
    expect(decided?.reason.length).toBeGreaterThan(0);
    // ...and the corpus has NOT been mutated yet.
    expect(await surfacesOf(claimant)).toEqual([]);

    // A resume finishes it without asking the judge anything.
    const forbidden = adjudicatorWith({
      generateForCaller: jest.fn(() => {
        throw new Error('a resume must not pay for a new hearing');
      }),
    });
    expect(await forbidden.resumePendingEffects()).toBeGreaterThanOrEqual(1);
    expect(await surfacesOf(claimant)).toMatchObject([{ form: word }]);
    expect((await verdictRow(claimKey))?.executed_at).not.toBeNull();

    // IDEMPOTENT: resuming again is a no-op, not a second bank.
    expect(await forbidden.resumePendingEffects()).toBe(0);
    expect(await surfacesOf(claimant)).toHaveLength(1);
  });

  /**
   * PROOF 2 — the retain hearing is the same shape.
   *
   * A claim the concept ALREADY HOLDS is heard on its own, and a NO takes the
   * word back. The verdict lands first, under the same key the grant would
   * have used — which is what makes a retraction visible as the successor of
   * the grant that banked it, rather than an unrelated event.
   */
  it('records a retraction the same way, verdict first', async () => {
    const suffix = randomUUID().slice(0, 8);
    const word = `zzq retain ${suffix}`;
    const holder = await mintFood(`zzq retain holder ${suffix}`);
    await prisma.$transaction((tx) =>
      addSurfaces(tx, holder, [
        { form: word, locale: 'es', source: 'vocabulary', role: 'recall' },
      ]),
    );

    const claim = {
      form: word,
      locale: 'es',
      entityId: holder,
      source: 'vocabulary' as const,
      hearing: 'retain' as const,
    };
    const summary = await adjudicatorWith(
      judgeSaying({
        a_owns_word: false,
        reason: 'a speaker of this locale does not use this word for it',
      }),
    ).adjudicate([claim]);

    expect(summary.claimsRetracted).toBe(1);
    const key = wordClaimLane.canonicalClaimKey(claim);
    expect(await verdictRow(key)).toMatchObject({
      outcome: 'claimRetracted',
      reason: 'a speaker of this locale does not use this word for it',
    });
    expect((await verdictRow(key))?.executed_at).not.toBeNull();
    // The word stopped grounding.
    expect((await surfacesOf(holder))[0]).toMatchObject({
      status: 'deprecated',
    });
  });

  /**
   * PROOF 3 — a rule bump re-opens BOTH a past grant and a past loss.
   *
   * This is the defect that named the redesign. The stamp could only remember
   * a claim that LOST, so a wrong YES was permanent — `bánh cuộn` sat on
   * `wrap` grounding vi mentions at 0.95 and no mechanism could ever ask about
   * it. Aging the verdicts stands in for a rule bump (the version is derived
   * from the rule text, so it cannot be poked directly): the grant and the
   * loss must BOTH come due.
   */
  it('re-opens a past GRANT and a past LOSS alike when the rule moves', async () => {
    const suffix = randomUUID().slice(0, 8);
    const granted = `zzq granted ${suffix}`;
    const lost = `zzq lost ${suffix}`;
    const winner = await mintFood(`zzq winner ${suffix}`);
    const loser = await mintFood(`zzq loser ${suffix}`);

    // A grant: uncontested, banked, recorded.
    await adjudicatorWith(judgeSaying({ a_owns_word: true })).adjudicate([
      { form: granted, locale: 'es', entityId: winner, source: 'vocabulary' },
    ]);
    // A loss: refused and remembered.
    const rival = await mintFood(`zzq rival ${suffix}`);
    await prisma.$transaction((tx) =>
      addSurfaces(tx, rival, [
        { form: lost, locale: 'es', source: 'vocabulary', role: 'recall' },
      ]),
    );
    await adjudicatorWith(
      judgeSaying({
        a_owns_word: false,
        incumbents_own_word: [true],
        reason: 'factually wrong for this concept',
      }),
    ).adjudicate([
      { form: lost, locale: 'es', entityId: loser, source: 'vocabulary' },
    ]);

    const judge = adjudicatorWith(judgeSaying({ a_owns_word: true }));
    const settled = await judge.dueClaims('es', { forms: [granted, lost] });
    const settledIds = settled.map((c) => c.entityId);
    expect(settledIds).not.toContain(winner);
    expect(settledIds).not.toContain(loser);

    // The rule moves on.
    await prisma.$executeRawUnsafe(
      `UPDATE claim_verdicts SET rule_version = rule_version - 1
        WHERE lane = $1 AND subject->>'entityId' = ANY($2::text[])`,
      WORD_CLAIM_LANE,
      [winner, loser],
    );
    madeKeys.push(
      wordClaimLane.canonicalClaimKey({
        form: granted,
        locale: 'es',
        entityId: winner,
      }),
      wordClaimLane.canonicalClaimKey({
        form: lost,
        locale: 'es',
        entityId: loser,
      }),
    );

    const due = await judge.dueClaims('es', { forms: [granted, lost] });
    const dueIds = due.map((c) => c.entityId);
    // THE WHOLE POINT: the upheld grant is due, not just the refusal.
    expect(dueIds).toContain(winner);
    expect(dueIds).toContain(loser);
    // ...and each is asked the question its row can actually answer.
    expect(due.find((c) => c.entityId === winner)?.hearing).toBe('retain');
    expect(due.find((c) => c.entityId === loser)?.hearing).toBe('grant');
  });

  /**
   * PROOF 3b — a bump that re-opens a large population REFUSES to drain.
   *
   * The predicate is free to ask; the drain is a spend event. One line in a
   * source file can make the entire judged corpus due, and the nightly must
   * not quietly start re-buying it. The refusal carries the quote, priced from
   * this caller's OWN metered spend — no invented rate.
   */
  it('refuses a drain beyond the standing cap, with an estimate, and honours its hash', async () => {
    const runKey = `zzq-budget-${randomUUID().slice(0, 8)}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO api_usage_ledger
         (service, operation, model, mode, input_tokens, output_tokens,
          cached_tokens, caller, run_key)
       VALUES ('gemini', 'generateContent', 'gemini-3-flash-preview',
               'interactive', 40000, 4000, 0, 'aliases.claim_judge', $1)`,
      runKey,
    );
    try {
      const dueCount = STANDING_REHEARING_CAP * 10;
      let refusal: DrainExceedsStandingCapError | null = null;
      try {
        await budget.authorizeDrain({
          lane: WORD_CLAIM_LANE,
          ruleVersion: CLAIM_JUDGE_PROMPT_VERSION,
          dueCount,
        });
      } catch (error) {
        refusal = error as DrainExceedsStandingCapError;
      }
      expect(refusal).toBeInstanceOf(DrainExceedsStandingCapError);
      expect(refusal?.estimate.dueCount).toBe(dueCount);
      // A REAL quote: a positive price derived from metered spend.
      expect(refusal?.estimate.estimateMicros).toBeGreaterThan(0);
      expect(refusal?.message).toContain('--approve-drain');

      // A wrong hash is refused too — approving $40 and spending $400 is the
      // failure the hash exists to prevent.
      await expect(
        budget.authorizeDrain({
          lane: WORD_CLAIM_LANE,
          ruleVersion: CLAIM_JUDGE_PROMPT_VERSION,
          dueCount,
          approvedHash: 'not-the-hash',
        }),
      ).rejects.toBeInstanceOf(StaleDrainApprovalError);

      // The exact hash drains.
      const approved = await budget.authorizeDrain({
        lane: WORD_CLAIM_LANE,
        ruleVersion: CLAIM_JUDGE_PROMPT_VERSION,
        dueCount,
        approvedHash: refusal?.estimate.estimateHash,
      });
      expect(approved.allowed).toBe(dueCount);

      // Within the cap, no estimate and no approval is needed — a nightly
      // that needs a human for routine work is one that stops running.
      const routine = await budget.authorizeDrain({
        lane: WORD_CLAIM_LANE,
        ruleVersion: CLAIM_JUDGE_PROMPT_VERSION,
        dueCount: STANDING_REHEARING_CAP,
      });
      expect(routine).toEqual({
        allowed: STANDING_REHEARING_CAP,
        estimate: null,
      });
    } finally {
      await prisma.$executeRawUnsafe(
        `DELETE FROM api_usage_ledger WHERE run_key = $1`,
        runKey,
      );
    }
  });

  /**
   * PROOF 4 — a verdict states its ground, at the write layer and in the
   * database. Two independent refusals, because the service is bypassable by
   * any future raw writer and the constraint is not.
   */
  it('refuses a verdict with no stated reason', async () => {
    const claimKey = `zzq-reasonless-${randomUUID().slice(0, 8)}`;
    madeKeys.push(claimKey);
    await expect(
      ledger.record({
        lane: WORD_CLAIM_LANE,
        claimKey,
        ruleVersion: CLAIM_JUDGE_PROMPT_VERSION,
        outcome: 'bothUpheld',
        reason: '   ',
        subject: {},
      }),
    ).rejects.toBeInstanceOf(VerdictReasonMissingError);

    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO claim_verdicts (lane, claim_key, rule_version, outcome, reason)
         VALUES ($1, $2, $3, 'bothUpheld', '')`,
        WORD_CLAIM_LANE,
        claimKey,
        CLAIM_JUDGE_PROMPT_VERSION,
      ),
    ).rejects.toThrow(/claim_verdicts_reason_stated/);

    // And the persisted reason on a real hearing is the judge's own words.
    const suffix = randomUUID().slice(0, 8);
    const word = `zzq reasoned ${suffix}`;
    const entity = await mintFood(`zzq reasoned concept ${suffix}`);
    const claim = {
      form: word,
      locale: 'es',
      entityId: entity,
      source: 'vocabulary' as const,
    };
    await adjudicatorWith(
      judgeSaying({ a_owns_word: true, reason: 'translation counts' }),
    ).adjudicate([claim]);
    const stored = await verdictRow(wordClaimLane.canonicalClaimKey(claim));
    expect(stored?.reason.trim().length).toBeGreaterThan(0);
  });

  /**
   * PROOF 5 — THE SEAM. Two more lanes state their own claim identity against
   * the SAME contract, and neither of their shapes is the word lane's.
   *
   * Dedupe decides about an unordered PAIR, so its key sorts: "is A the same
   * as B" and "is B the same as A" are one question, and keying them apart
   * would re-hear and re-pay every time the candidate generator flipped the
   * order. The restaurant-name lane (C4a) is sketched here only as a THIRD
   * shape — a proper-noun surface that never faced a judge — to hold the base
   * honest: nothing in it may assume an entity type or a surface row.
   */
  it('lets another lane declare a different claim identity', () => {
    const a = '11111111-1111-1111-1111-111111111111';
    const b = '22222222-2222-2222-2222-222222222222';
    expect(
      entityDedupeLane.canonicalClaimKey({ entityId: b, otherEntityId: a }),
    ).toBe(
      entityDedupeLane.canonicalClaimKey({ entityId: a, otherEntityId: b }),
    );
    expect(entityDedupeLane.lane).not.toBe(WORD_CLAIM_LANE);

    interface RestaurantNameClaim {
      restaurantId: string;
      surface: string;
    }
    class RestaurantNameLaneAdapter extends BaseClaimLaneAdapter<RestaurantNameClaim> {
      readonly lane = 'restaurant_name';
      canonicalClaimKey(claim: RestaurantNameClaim): string {
        return `${claim.restaurantId}|${claim.surface.toLowerCase()}`;
      }
    }
    const restaurantLane = new RestaurantNameLaneAdapter();
    expect(
      restaurantLane.canonicalClaimKey({ restaurantId: a, surface: 'Best' }),
    ).toBe(
      restaurantLane.canonicalClaimKey({ restaurantId: a, surface: 'best' }),
    );
  });
});
