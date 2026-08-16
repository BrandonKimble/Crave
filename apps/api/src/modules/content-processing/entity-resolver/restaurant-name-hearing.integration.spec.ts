import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { identityInsertData, canonicalFold } from './entity-identity';
import {
  RestaurantNameHearingService,
  type RestaurantNameEffect,
} from './restaurant-name-hearing.service';
import { ClaimVerdictLedgerService } from './claim-verdict-ledger.service';
import { ClaimRehearingBudgetService } from './claim-rehearing-budget.service';
import {
  RESTAURANT_NAME_RULE_FINGERPRINT,
  RESTAURANT_NAME_RULE_VERSION,
} from './restaurant-name-rule';
import {
  RESTAURANT_NAME_LANE,
  restaurantNameLane,
} from './restaurant-name-lane';

/**
 * THE RESTAURANT-NAME COURT (C4a) — proven against a real database.
 *
 * The lane exists because restaurant recall surfaces never faced a judge: the
 * ghost "Best" held the surface `best` and hard-ANDed every "best X" search to
 * zero. These proofs pin the contract the court makes with the ledger:
 *
 *   1. a notAName verdict deprecates the SURFACE and never touches the ENTITY
 *      (entity survival is the enrichment lifecycle's job);
 *   2. an isName verdict moves nothing — real names that are generic words
 *      (Chili's, Favorite) survive on evidence, never hand-deleted;
 *   3. a decided claim is not re-bought (due-predicate at the chokepoint);
 *   4. the verdict outlives a crash between decision and effect, and the
 *      resumed effect replays the STORED subject byte-identically;
 *   5. dry-run consults the judge but writes NOTHING, and a blank-reason
 *      answer leaves the claim unjudged — both able to show RED.
 */
describe('the restaurant-name hearing lane (C4a) — live database', () => {
  const prisma = new PrismaClient();
  const madeEntities: string[] = [];
  const madeKeys: string[] = [];

  const ledger = new ClaimVerdictLedgerService(prisma as never);

  /** Budget with the rolling window read as empty — these proofs hear one or
   *  two claims and are not about the allowance (same shape as the ledger
   *  spec's UnspentWindowBudget). */
  class UnspentWindowBudget extends ClaimRehearingBudgetService {
    hearingsSpentInWindow(): Promise<number> {
      return Promise.resolve(0);
    }
  }
  const budget = new UnspentWindowBudget(prisma as never, ledger);

  const logger = () =>
    ({
      setContext: jest.fn().mockReturnThis(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }) as never;

  const judgeSaying = (
    verdicts: Array<{ is_name: boolean; reason?: string }>,
  ) => ({
    generateForCaller: jest.fn().mockResolvedValue(
      JSON.stringify({
        items: verdicts.map((v, i) => ({
          n: i + 1,
          is_name: v.is_name,
          reason: v.reason ?? 'stated ground',
        })),
      }),
    ),
  });

  const courtWith = (judge: unknown): RestaurantNameHearingService =>
    new RestaurantNameHearingService(
      prisma as never,
      judge as never,
      logger(),
      ledger,
      budget,
    );

  /** The court with the EFFECT step killed — the crash seam. */
  class CrashingCourt extends RestaurantNameHearingService {
    protected applyEffect(): Promise<void> {
      return Promise.reject(new Error('process died before the effect ran'));
    }
  }

  const mintRestaurant = async (
    name: string,
    options: { grounded?: boolean } = {},
  ): Promise<string> => {
    const id = randomUUID();
    const identity = identityInsertData(name, 'restaurant' as never);
    await prisma.$executeRawUnsafe(
      `INSERT INTO core_entities (entity_id, name, type, status, identity_key, identity_key_sorted)
       VALUES ($1::uuid, $2, 'restaurant'::entity_type, 'active'::entity_status, $3, $4)`,
      id,
      name,
      identity.identityKey,
      identity.identityKeySorted,
    );
    if (options.grounded) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO core_restaurant_locations (restaurant_id, google_place_id, latitude, longitude)
         VALUES ($1::uuid, $2, 40.7, -73.9)`,
        id,
        `zzq-place-${randomUUID().slice(0, 12)}`,
      );
    }
    madeEntities.push(id);
    return id;
  };

  const mintSurface = async (
    entityId: string,
    form: string,
    role: 'recall' | 'both' = 'recall',
  ): Promise<string> => {
    const rows = await prisma.$queryRawUnsafe<Array<{ surface_id: string }>>(
      `INSERT INTO entity_surface (entity_id, form, form_folded, locale, role, status, source)
       VALUES ($1::uuid, $2, $3, 'und', $4, 'active', 'extraction')
       RETURNING surface_id::text`,
      entityId,
      form,
      canonicalFold(form),
      role,
    );
    return rows[0].surface_id;
  };

  const trackKey = (claim: { entityId: string; form: string }): string => {
    const key = restaurantNameLane.canonicalClaimKey(claim);
    madeKeys.push(key);
    return key;
  };

  const verdictRow = async (
    claimKey: string,
  ): Promise<{
    outcome: string;
    reason: string;
    rule_version: number;
    fold_version: number;
    rule_fingerprint: string | null;
    subject: RestaurantNameEffect;
    executed_at: Date | null;
  } | null> => {
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        outcome: string;
        reason: string;
        rule_version: number;
        fold_version: number;
        rule_fingerprint: string | null;
        subject: RestaurantNameEffect;
        executed_at: Date | null;
      }>
    >(
      `SELECT outcome, reason, rule_version, fold_version, rule_fingerprint,
              subject, executed_at
         FROM claim_verdicts WHERE lane = $1 AND claim_key = $2`,
      RESTAURANT_NAME_LANE,
      claimKey,
    );
    return rows[0] ?? null;
  };

  const surfaceState = async (
    surfaceId: string,
  ): Promise<{ role: string; status: string; updated_at: Date }> => {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ role: string; status: string; updated_at: Date }>
    >(
      `SELECT role::text, status::text, updated_at FROM entity_surface
        WHERE surface_id = $1::uuid`,
      surfaceId,
    );
    return rows[0];
  };

  afterAll(async () => {
    if (madeKeys.length) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM claim_verdicts WHERE lane = $1 AND claim_key = ANY($2::text[])`,
        RESTAURANT_NAME_LANE,
        madeKeys,
      );
    }
    if (madeEntities.length) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM entity_surface WHERE entity_id = ANY($1::uuid[])`,
        madeEntities,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM core_restaurant_locations WHERE restaurant_id = ANY($1::uuid[])`,
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
   * PROOF 1 — the Best-ghost shape: notAName deprecates the surface,
   * records why, and NEVER touches the entity.
   */
  it('notAName: surface deprecated with an audited verdict; the entity survives untouched', async () => {
    const suffix = randomUUID().slice(0, 8);
    const ghost = await mintRestaurant(`Zzq Best ${suffix}`);
    const form = `zzqbest${suffix}`;
    const surfaceId = await mintSurface(ghost, form, 'recall');
    const claim = { entityId: ghost, form };
    const key = trackKey(claim);

    const summary = await courtWith(
      judgeSaying([
        {
          is_name: false,
          reason:
            'ungrounded, no corroborating surface — shorthand taken literally',
        },
      ]),
    ).hear([claim], { dryRun: false });

    expect(summary.namesDenied).toBe(1);
    const stored = await verdictRow(key);
    expect(stored?.outcome).toBe('notAName');
    expect(stored?.rule_version).toBe(RESTAURANT_NAME_RULE_VERSION);
    expect(stored?.rule_fingerprint).toBe(RESTAURANT_NAME_RULE_FINGERPRINT);
    expect(stored?.reason).toContain('shorthand');
    expect(stored?.executed_at).not.toBeNull();

    // The surface lost its recall claim…
    expect(await surfaceState(surfaceId)).toMatchObject({
      status: 'deprecated',
      role: 'recall',
    });
    // …and the ENTITY was not touched: survival is the lifecycle's job.
    const entity = await prisma.$queryRawUnsafe<Array<{ status: string }>>(
      `SELECT status::text FROM core_entities WHERE entity_id = $1::uuid`,
      ghost,
    );
    expect(entity[0].status).toBe('active');
  });

  /**
   * PROOF 2 — a real name that is a generic word survives on evidence, and a
   * role='both' loser keeps its label (word dies, label lives).
   */
  it('isName moves nothing; a notAName on a both-row degrades to display instead of deprecating', async () => {
    const suffix = randomUUID().slice(0, 8);
    const chilis = await mintRestaurant(`Zzq Chilis ${suffix}`, {
      grounded: true,
    });
    const nameForm = `zzqchili${suffix}`;
    const nameSurface = await mintSurface(chilis, nameForm, 'recall');

    const labeled = await mintRestaurant(`Zzq Favorite ${suffix}`);
    const labelForm = `zzqfavorite${suffix}`;
    const labelSurface = await mintSurface(labeled, labelForm, 'both');

    const summary = await courtWith(
      judgeSaying([
        { is_name: true, reason: 'grounded venue really called this' },
        { is_name: false, reason: 'bare shorthand not attested on its own' },
      ]),
    ).hear(
      [
        { entityId: chilis, form: nameForm },
        { entityId: labeled, form: labelForm },
      ],
      { dryRun: false },
    );
    trackKey({ entityId: chilis, form: nameForm });
    trackKey({ entityId: labeled, form: labelForm });

    expect(summary.namesUpheld).toBe(1);
    expect(summary.namesDenied).toBe(1);
    // The upheld name is exactly where it was.
    expect(await surfaceState(nameSurface)).toMatchObject({
      status: 'active',
      role: 'recall',
    });
    // The denied 'both' row keeps its label life: display, still active.
    expect(await surfaceState(labelSurface)).toMatchObject({
      status: 'active',
      role: 'display',
    });
  });

  /** PROOF 3 — decided is not due: a second hearing never consults the judge. */
  it('skips already-decided claims without paying', async () => {
    const suffix = randomUUID().slice(0, 8);
    const venue = await mintRestaurant(`Zzq Decided ${suffix}`, {
      grounded: true,
    });
    const form = `zzqdecided${suffix}`;
    await mintSurface(venue, form);
    const claim = { entityId: venue, form };
    trackKey(claim);

    await courtWith(judgeSaying([{ is_name: true, reason: 'attested' }])).hear(
      [claim],
      { dryRun: false },
    );

    const silentJudge = judgeSaying([]);
    const summary = await courtWith(silentJudge).hear([claim], {
      dryRun: false,
    });
    expect(summary.alreadyDecided).toBe(1);
    expect(summary.judged).toBe(0);
    expect(silentJudge.generateForCaller).not.toHaveBeenCalled();
  });

  /**
   * PROOF 4 — the crash seam: the verdict outlives the death of the effect,
   * and the resumed effect replays the STORED subject byte-identically (a
   * second replay of the same subject touches NO bytes).
   */
  it('commits the verdict before the effect, resumes it, and replays byte-identically', async () => {
    const suffix = randomUUID().slice(0, 8);
    const ghost = await mintRestaurant(`Zzq Crash ${suffix}`);
    const form = `zzqcrash${suffix}`;
    const surfaceId = await mintSurface(ghost, form);
    const claim = { entityId: ghost, form };
    const key = trackKey(claim);

    const crashing = new CrashingCourt(
      prisma as never,
      judgeSaying([
        { is_name: false, reason: 'ungrounded bare generic' },
      ]) as never,
      logger(),
      ledger,
      budget,
    );
    await expect(crashing.hear([claim], { dryRun: false })).rejects.toThrow(
      'process died before the effect ran',
    );

    // The paid decision is durable and unexecuted; the corpus has not moved.
    const undecidedRow = await verdictRow(key);
    expect(undecidedRow?.outcome).toBe('notAName');
    expect(undecidedRow?.executed_at).toBeNull();
    expect(undecidedRow?.subject.takeName).toHaveLength(1);
    expect((await surfaceState(surfaceId)).status).toBe('active');

    // Resume replays the stored subject and finishes the hearing.
    const court = courtWith(judgeSaying([]));
    expect(await court.resumePendingEffects()).toBeGreaterThanOrEqual(1);
    const executed = await verdictRow(key);
    expect(executed?.executed_at).not.toBeNull();
    const afterFirst = await surfaceState(surfaceId);
    expect(afterFirst.status).toBe('deprecated');

    // BYTE-IDENTICAL REPLAY: re-open the executed flag and resume again —
    // the IS DISTINCT FROM guard writes nothing, so updated_at is unchanged.
    await prisma.$executeRawUnsafe(
      `UPDATE claim_verdicts SET executed_at = NULL
        WHERE lane = $1 AND claim_key = $2`,
      RESTAURANT_NAME_LANE,
      key,
    );
    expect(await court.resumePendingEffects()).toBeGreaterThanOrEqual(1);
    const afterSecond = await surfaceState(surfaceId);
    expect(afterSecond.status).toBe('deprecated');
    expect(afterSecond.updated_at.getTime()).toBe(
      afterFirst.updated_at.getTime(),
    );
  });

  /**
   * PROOF 5 — the gates can show RED: dry-run writes nothing, and a ruling
   * with no stated ground is not a ruling (the claim stays undecided and the
   * corpus stays unmoved).
   */
  it('dry-run consults the judge but writes nothing; a blank-reason answer leaves the claim unjudged', async () => {
    const suffix = randomUUID().slice(0, 8);
    const venue = await mintRestaurant(`Zzq Dry ${suffix}`);
    const form = `zzqdry${suffix}`;
    const surfaceId = await mintSurface(venue, form);
    const claim = { entityId: venue, form };
    const key = trackKey(claim);

    // Dry run (the default): ruling printed, zero writes.
    const dryJudge = judgeSaying([
      { is_name: false, reason: 'would be denied' },
    ]);
    const dry = await courtWith(dryJudge).hear([claim]);
    expect(dryJudge.generateForCaller).toHaveBeenCalledTimes(1);
    expect(dry.namesDenied).toBe(1);
    expect(dry.cases[0].surfacesTaken).toBe(0);
    expect(await verdictRow(key)).toBeNull();
    expect((await surfaceState(surfaceId)).status).toBe('active');

    // Blank reason: unjudged, still due, corpus untouched.
    const mute = await courtWith(
      judgeSaying([{ is_name: false, reason: '   ' }]),
    ).hear([claim], { dryRun: false });
    expect(mute.unjudged).toBe(1);
    expect(mute.judged).toBe(0);
    expect(await verdictRow(key)).toBeNull();
    expect((await surfaceState(surfaceId)).status).toBe('active');
  });
});
