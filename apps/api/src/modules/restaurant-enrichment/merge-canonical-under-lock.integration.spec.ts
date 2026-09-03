/**
 * THE CANONICAL IS RE-RESOLVED UNDER THE IDENTITY LOCK — against a REAL
 * Postgres.
 *
 * THE DEFECT (2026-08-12 red team). Every caller of mergeDuplicateRestaurant
 * chooses its canonical from a read taken OUTSIDE the merge transaction. The
 * newest such caller is the grounding lane's free place-id ownership
 * pre-check (456f74894, restaurant-location-enrichment.service.ts): it reads
 * `restaurant_locations` for the place's owner, reads that entity's status,
 * and then merges into it — three separate statements, no transaction. The
 * nightly same-name sweep and the post-details collision handler have the same
 * shape.
 *
 * Between that read and the merge, another merge can archive the very entity
 * we are about to merge INTO. Nothing crashed when it did: the merge ran to
 * completion, re-keying a live restaurant's whole corpus onto an ARCHIVED
 * winner and writing a redirect whose target is archived — which is exactly
 * the "stranded evidence" state `activeWinnerRedirectMap` deliberately
 * refuses to follow. From a user's seat, a restaurant's reviews, dishes and
 * score go dark and no read path can find them again.
 *
 * THE SHAPE UNDER TEST. Not a pre-flight check (that is the same stale read
 * one line lower). The merge already takes NAME-KEYED identity advisory locks,
 * and a racing merge of the same canonical holds the same key — so it is
 * already serialized against us, and a read taken AFTER the locks is
 * authoritative. The merge takes it there and resolves the canonical through
 * the redirect map, the same way the event ledger's write chokepoint resolves
 * ids: the race stops being damage and becomes the right answer — merge into
 * whoever absorbed our canonical.
 *
 * MUTATION PROOFS (each direction goes RED):
 *  - delete the `activeWinnerRedirectMap` call in runMerge and use
 *    `canonical.entityId` throughout → test 1 fails (the duplicate is
 *    redirected to the ARCHIVED loser, and the winner gets nothing);
 *  - delete the `canonicalRow.status === 'archived'` refusal → test 2 fails
 *    (the merge completes into a stranded tombstone instead of throwing).
 *
 * Run: yarn test:db (needs DATABASE_URL — a dev database, never prod).
 */
import { PrismaClient } from '@prisma/client';
import { PlaceEntityMergeService } from './restaurant-entity-merge.service';
import { EntityAnchorRehomeService } from '../content-processing/entity-resolver/entity-anchor-rehome.service';
import { ClaimVerdictLedgerService } from '../content-processing/entity-resolver/claim-verdict-ledger.service';

const TEST_TAG = 'itest-merge-under-lock';

const prisma = new PrismaClient();

const logger = {
  setContext: () => logger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

/** The projection rebuild runs POST-COMMIT and opens its own transaction over
 *  tables this test never populates; recording the call is the whole contract
 *  that matters here, so it is a spy rather than the real service. */
const rebuilt: string[][] = [];
const projectionRebuild = {
  rebuildForPlaces: (ids: string[]) => {
    rebuilt.push(ids);
    return Promise.resolve();
  },
} as never;

const service = new PlaceEntityMergeService(
  prisma as never,
  projectionRebuild,
  new EntityAnchorRehomeService(logger),
  new ClaimVerdictLedgerService(prisma as never),
  logger,
);

async function seedPlace(
  label: string,
  status: 'active' | 'archived',
): Promise<{ entityId: string; name: string; status: string }> {
  const row = await prisma.entity.create({
    data: { name: `${TEST_TAG}:${label}`, type: 'place', status },
    select: { entityId: true, name: true, status: true },
  });
  return row as { entityId: string; name: string; status: string };
}

async function cleanup(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DELETE FROM entity_redirects r
    USING core_entities e
    WHERE (r.from_entity_id = e.entity_id OR r.to_entity_id = e.entity_id)
      AND e.name LIKE '${TEST_TAG}:%'`);
  await prisma.$executeRawUnsafe(`
    DELETE FROM entity_surface s USING core_entities e
    WHERE s.entity_id = e.entity_id AND e.name LIKE '${TEST_TAG}:%'`);
  // Merge verdicts recorded against test entities (claim_key carries the
  // entity ids, which are random uuids — match on the reason instead).
  await prisma.$executeRawUnsafe(
    `DELETE FROM claim_verdicts WHERE lane = 'place_merge' AND reason LIKE 'integration test:%'`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM core_entities WHERE name LIKE '${TEST_TAG}:%'`,
  );
}

beforeEach(async () => {
  rebuilt.length = 0;
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('mergeDuplicateRestaurant re-resolves its canonical under the lock', () => {
  it('follows the redirect when the chosen canonical was merged away mid-flight', async () => {
    // The state a caller's stale read cannot see: it picked `loser` while
    // another merge was archiving `loser` into `winner`.
    const duplicate = await seedPlace('duplicate', 'active');
    const loser = await seedPlace('stale-canonical', 'active');
    const winner = await seedPlace('true-winner', 'active');

    // The racing merge, already committed.
    await prisma.entity.update({
      where: { entityId: loser.entityId },
      data: { status: 'archived' },
    });
    await prisma.$executeRawUnsafe(
      `INSERT INTO entity_redirects (from_entity_id, to_entity_id) VALUES ($1::uuid, $2::uuid)`,
      loser.entityId,
      winner.entityId,
    );

    const result = await service.mergeDuplicatePlace({
      canonical: loser as never, // the STALE choice — what every caller holds
      duplicate: duplicate as never,
      canonicalUpdate: {},
      reason: 'integration test: stale-canonical redirect follow',
    });

    // The evidence landed on the LIVE winner, not the tombstone.
    expect(result.entityId).toBe(winner.entityId);
    expect(rebuilt).toEqual([[winner.entityId]]);

    const redirect = await prisma.$queryRawUnsafe<
      Array<{ to_entity_id: string }>
    >(
      `SELECT to_entity_id FROM entity_redirects WHERE from_entity_id = $1::uuid`,
      duplicate.entityId,
    );
    expect(redirect).toHaveLength(1);
    // The whole point: the duplicate forwards to an ACTIVE entity. Pointing it
    // at the archived loser is the stranded state no read path follows.
    expect(redirect[0].to_entity_id).toBe(winner.entityId);

    const after = await prisma.entity.findMany({
      where: { entityId: { in: [duplicate.entityId, winner.entityId] } },
      select: { entityId: true, status: true },
    });
    expect(after.find((e) => e.entityId === duplicate.entityId)?.status).toBe(
      'archived',
    );
    expect(after.find((e) => e.entityId === winner.entityId)?.status).toBe(
      'active',
    );

    // A MERGE IS A HEARING (plans/alias-clean-slate.md item 3): the verdict
    // row lands BEFORE the effect and is marked executed after the commit.
    // A merge with no ledger row is the log-line-only class the clean slate
    // exists to end — 35 of 95 audited merges had no accountable ruling.
    const verdicts = await prisma.$queryRawUnsafe<
      Array<{ outcome: string; executed_at: Date | null }>
    >(
      `SELECT outcome, executed_at FROM claim_verdicts
        WHERE lane = 'place_merge' AND claim_key = $1`,
      `place|${duplicate.entityId}|${winner.entityId}`,
    );
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].outcome).toBe('merge');
    expect(verdicts[0].executed_at).not.toBeNull();
  });

  it('refuses when the chosen canonical is archived with nowhere to forward', async () => {
    const duplicate = await seedPlace('duplicate-2', 'active');
    const stranded = await seedPlace('stranded-canonical', 'archived');

    await expect(
      service.mergeDuplicatePlace({
        canonical: stranded as never,
        duplicate: duplicate as never,
        canonicalUpdate: {},
        reason: 'integration test: archived canonical refusal',
      }),
    ).rejects.toThrow(/not active under the identity lock/);

    // Refusing must leave the duplicate INTACT — the sweep re-judges the
    // healed graph next run. A half-merge would be unrecoverable.
    const row = await prisma.entity.findUniqueOrThrow({
      where: { entityId: duplicate.entityId },
      select: { status: true },
    });
    expect(row.status).toBe('active');
    expect(rebuilt).toEqual([]);
  });

  it('refuses when the duplicate was itself merged away mid-flight', async () => {
    // The loser side is NOT redirect-followed on purpose: its content already
    // lives at some third entity, and re-targeting would drag that whole
    // unjudged entity into this merge.
    const canonical = await seedPlace('canonical-3', 'active');
    const duplicate = await seedPlace('duplicate-3', 'archived');

    await expect(
      service.mergeDuplicatePlace({
        canonical: canonical as never,
        duplicate: duplicate as never,
        canonicalUpdate: {},
        reason: 'integration test: merged-away duplicate refusal',
      }),
    ).rejects.toThrow(/already merged away under the identity lock/);
    expect(rebuilt).toEqual([]);
  });
});
