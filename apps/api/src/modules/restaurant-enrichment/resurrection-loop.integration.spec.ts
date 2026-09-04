/**
 * THE RESURRECTION LOOP ENDS (red team 2026-09-04 E-4, option A) — against a
 * REAL Postgres.
 *
 * THE DEFECT: an active restaurant whose chooser lands on a Google place
 * already owned by an ARCHIVED, redirect-free restaurant fell past the free
 * pre-details merge (it required an ACTIVE owner), paid the full-SKU details
 * call, hit the P2002 collision, and the merge lock refused the archived
 * canonical — status 'error', no strike, no alarm, and the next mention
 * paid autocomplete + details again. Forever.
 *
 * THE LAW: an archived owner without a redirect is the same business coming
 * back. It is REVIVED and absorbs the newcomer as a ledgered place merge —
 * one entity, the paid place row never re-bought.
 *
 * PROOFS:
 *   1. the first mention merges WITHOUT a details call (the pre-check does
 *      it) — the archived owner is active again, the newcomer redirects to
 *      it, and both the place_merge and place_grounding verdicts are on the
 *      ledger and executed;
 *   2. THE LOOP TERMINATES: a second mention of either entity makes ZERO
 *      Google calls (Google is forbidden outright for that half).
 *
 * RED (mutation): make resolvePlaceOwnerForMerge treat an archived owner as
 * 'none' (the old law) — proof 1 fails (status 'error', one details call
 * paid, the owner still archived).
 *
 * Run: yarn test:db (needs DATABASE_URL — a dev database, never prod).
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  buildHarness,
  ChooserStub,
  cleanupTag,
  type EnrichDriveable,
  GoogleStub,
  groundAt,
  loadPlace,
  mintPlace,
  redirectOf,
  verdict,
} from './grounding-integration.harness-spec';
import { placeGroundingLane } from './place-grounding-lane';

const TAG = `itest-resurrection-${randomUUID().slice(0, 6)}`;
const prisma = new PrismaClient();

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'resurrection-loop.integration.spec requires DATABASE_URL (a dev database)',
    );
  }
});

afterAll(async () => {
  await cleanupTag(prisma, TAG);
  await prisma.$disconnect();
});

describe('an archived, redirect-free place owner revives and absorbs the newcomer', () => {
  it('merges on the first mention without a details call, and the second mention costs nothing', async () => {
    const placeId = `${TAG}-place`;
    const google = new GoogleStub({
      [placeId]: { name: `${TAG} Cuba Bakery & Cafe` },
    });
    const chooser = new ChooserStub();
    const { service, prisma: db } = buildHarness({ prisma, google, chooser });

    // The archived owner: a janitor-closed / GC'd / rejected-shadow row that
    // still holds its paid place row and has NO redirect.
    const ownerId = await mintPlace(db, {
      name: `${TAG} Cuba Bakery & Cafe`,
      status: 'archived',
    });
    await groundAt(db, ownerId, placeId);
    // The newcomer: a live mention under another name.
    const newcomerId = await mintPlace(db, {
      name: `${TAG} Cuba Cafe`,
      status: 'active',
    });

    const first = await (service as unknown as EnrichDriveable).enrichPlace(
      await loadPlace(db, newcomerId),
      { sourceText: 'best cubano in town at cuba cafe on burnet' },
    );

    // Merged, not errored — and merged for free: one autocomplete, one
    // hearing, ZERO details calls.
    expect(first.status).toBe('updated');
    expect(first.entityId).toBe(ownerId);
    expect(google.autocompleteCalls).toHaveLength(1);
    expect(chooser.hearings).toBe(1);
    expect(google.detailsCalls).toEqual([]);

    // The owner is back; the newcomer is its merge loser with a redirect.
    const owner = await loadPlace(db, ownerId);
    expect(owner.status).toBe('active');
    expect(owner.locations.map((row) => row.googlePlaceId)).toEqual([placeId]);
    const newcomer = await loadPlace(db, newcomerId);
    expect(newcomer.status).toBe('archived');
    expect(await redirectOf(db, newcomerId)).toBe(ownerId);

    // Both hearings are on the ledger and executed.
    const mergeVerdict = await verdict(
      db,
      'place_merge',
      `place|${newcomerId}|${ownerId}`,
    );
    expect(mergeVerdict?.outcome).toBe('merge');
    expect(mergeVerdict?.executed_at).not.toBeNull();
    const groundingVerdict = await verdict(
      db,
      'place_grounding',
      placeGroundingLane.canonicalClaimKey({
        kind: 'grounding',
        placeEntityId: newcomerId,
        googlePlaceId: placeId,
      }),
    );
    expect(groundingVerdict?.outcome).toBe('selected');
    expect(groundingVerdict?.executed_at).not.toBeNull();

    // THE LOOP TERMINATES: Google is forbidden, and a second mention of
    // either side is answered from the database alone.
    google.forbidAll();
    const againNewcomer = await service.enrichPlaceById(newcomerId);
    expect(againNewcomer.status).toBe('skipped');
    expect(againNewcomer.reason).toBe('archived');
    const againOwner = await service.enrichPlaceById(ownerId);
    expect(againOwner.status).toBe('skipped');
    expect(againOwner.reason).toContain('already has place-backed');
    expect(chooser.hearings).toBe(1);
  });

  it('follows the redirect instead when the archived owner was merged away', async () => {
    const placeId = `${TAG}-redirected-place`;
    const google = new GoogleStub({
      [placeId]: { name: `${TAG} Redirected Taqueria` },
    });
    const chooser = new ChooserStub();
    const { service, prisma: db } = buildHarness({ prisma, google, chooser });

    const loserId = await mintPlace(db, {
      name: `${TAG} Redirected Taqueria`,
      status: 'archived',
    });
    await groundAt(db, loserId, placeId);
    const winnerId = await mintPlace(db, {
      name: `${TAG} Redirected Taqueria Winner`,
      status: 'active',
    });
    await db.$executeRawUnsafe(
      `INSERT INTO entity_redirects (from_entity_id, to_entity_id) VALUES ($1::uuid, $2::uuid)`,
      loserId,
      winnerId,
    );
    const newcomerId = await mintPlace(db, {
      name: `${TAG} Redirected Taq`,
      status: 'active',
    });

    const result = await (service as unknown as EnrichDriveable).enrichPlace(
      await loadPlace(db, newcomerId),
      { sourceText: 'tacos' },
    );
    expect(result.status).toBe('updated');
    expect(result.entityId).toBe(winnerId);
    expect(google.detailsCalls).toEqual([]);
    // The merged-away loser is NOT revived — its evidence lives at the winner.
    expect((await loadPlace(db, loserId)).status).toBe('archived');
    expect(await redirectOf(db, newcomerId)).toBe(winnerId);
  });
});
