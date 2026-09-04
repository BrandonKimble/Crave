/**
 * A GOOGLE REDIRECT IS GOOGLE'S OWN VERDICT (red team 2026-09-04 E-3,
 * option A) — against a REAL Postgres.
 *
 * THE DEFECT: the janitor's moved arm forced a full re-enrichment of the
 * restaurant — autocomplete + chooser + full-SKU details — which minted a
 * SECOND location row for the new place id and left the moved row standing
 * with its flag, so the same redirect was re-bought every week, forever.
 *
 * THE LAW: one details call on the NEW place id, the location row rewritten
 * IN PLACE (same locationId, new google id, moved flag cleared), the
 * entity's Google snapshot re-stated, the verdict ledgered. No judge, no
 * autocomplete, once.
 *
 * PROOFS:
 *   1. exactly ONE getPlaceDetails call, for the new id; autocomplete never;
 *   2. still exactly ONE location row for the entity — the same row —
 *      now carrying the new id, the new address, no moved flag, and still
 *      the entity's primary;
 *   3. the entity's googlePlaces snapshot names the new place, and the
 *      grounding ledger holds the executed redirect verdict;
 *   4. a second pass costs nothing: the row no longer selects (no moved
 *      flag) and followMovedPlace on it makes no Google call.
 *
 * RED (mutation): make followMovedPlace delegate to
 * enrichPlaceById(placeId, { force: true }) (the old arm) — proof 1 fails
 * (autocomplete is called) and proof 2 fails (a second row appears).
 *
 * Run: yarn test:db (needs DATABASE_URL — a dev database, never prod).
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  buildHarness,
  ChooserStub,
  cleanupTag,
  GoogleStub,
  groundAt,
  loadPlace,
  mintPlace,
  verdict,
} from './grounding-integration.harness-spec';
import { placeGroundingLane } from './place-grounding-lane';

const TAG = `itest-moved-${randomUUID().slice(0, 6)}`;
const prisma = new PrismaClient();

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'moved-place-follow.integration.spec requires DATABASE_URL (a dev database)',
    );
  }
});

afterAll(async () => {
  await cleanupTag(prisma, TAG);
  await prisma.$disconnect();
});

describe('following a moved-place redirect', () => {
  it('rewrites the location row in place with ONE details call and no second row', async () => {
    const oldPlaceId = `${TAG}-old`;
    const newPlaceId = `${TAG}-new`;
    const google = new GoogleStub({
      [newPlaceId]: {
        name: `${TAG} Moved Diner`,
        formattedAddress: '900 New Ave, Austin, TX 78702, USA',
        latitude: 30.28,
        longitude: -97.72,
      },
    });
    const chooser = new ChooserStub();
    const {
      service,
      prisma: db,
      extractions,
    } = buildHarness({
      prisma,
      google,
      chooser,
    });

    const entityId = await mintPlace(db, { name: `${TAG} Moved Diner` });
    const locationId = await groundAt(db, entityId, oldPlaceId, {
      movedPlaceId: newPlaceId,
      businessStatus: 'CLOSED_PERMANENTLY',
      address: '1 Old Rd, Austin, TX 78701, USA',
    });
    const before = await loadPlace(db, entityId);
    expect(before.locations).toHaveLength(1);

    const result = await service.followMovedPlace(before.locations[0]);
    expect(result.status).toBe('updated');
    expect(result.placeId).toBe(newPlaceId);

    // ONE details call, for the NEW id; no name search, no hearing.
    expect(google.detailsCalls).toEqual([newPlaceId]);
    expect(google.autocompleteCalls).toEqual([]);
    expect(chooser.hearings).toBe(0);

    // The SAME row, rewritten: new id, new address, flag cleared, still
    // primary; no second row minted.
    const after = await loadPlace(db, entityId);
    expect(after.locations).toHaveLength(1);
    const row = after.locations[0];
    expect(row.locationId).toBe(locationId);
    expect(row.googlePlaceId).toBe(newPlaceId);
    expect(row.movedPlaceId).toBeNull();
    expect(row.businessStatus).toBe('OPERATIONAL');
    expect(row.address).toBe('900 New Ave, Austin, TX 78702, USA');
    expect(row.isPrimary).toBe(true);
    expect(after.primaryLocationId).toBe(locationId);

    // The entity's Google snapshot names the new listing; the cuisine
    // fingerprint is re-fed (types may have changed with the listing).
    const snapshot = (after.placeMetadata as Record<string, unknown>)
      .googlePlaces as Record<string, unknown>;
    expect(snapshot.placeId).toBe(newPlaceId);
    expect(after.address).toBe('900 New Ave, Austin, TX 78702, USA');
    expect(extractions).toEqual([entityId]);

    // Google's verdict is on the grounding ledger, executed.
    const ledgered = await verdict(
      db,
      'place_grounding',
      placeGroundingLane.canonicalClaimKey({
        kind: 'grounding',
        placeEntityId: entityId,
        googlePlaceId: newPlaceId,
      }),
    );
    expect(ledgered?.outcome).toBe('selected');
    expect(ledgered?.executed_at).not.toBeNull();

    // A second pass costs nothing: the row no longer carries a moved flag,
    // so the janitor's arm does not select it, and following it directly
    // is a skip with no Google call.
    google.forbidAll();
    const movedRows = await db.placeLocation.findMany({
      where: { placeId: entityId, movedPlaceId: { not: null } },
    });
    expect(movedRows).toEqual([]);
    const again = await service.followMovedPlace(row);
    expect(again.status).toBe('skipped');
    expect(google.detailsCalls).toEqual([newPlaceId]);
  });

  it('merges into the owner when the redirect target already belongs to another restaurant', async () => {
    const oldPlaceId = `${TAG}-old2`;
    const sharedPlaceId = `${TAG}-shared`;
    const google = new GoogleStub({
      [sharedPlaceId]: { name: `${TAG} Shared Bistro` },
    });
    const chooser = new ChooserStub();
    const { service, prisma: db } = buildHarness({ prisma, google, chooser });

    const ownerId = await mintPlace(db, { name: `${TAG} Shared Bistro` });
    await groundAt(db, ownerId, sharedPlaceId);
    const moverId = await mintPlace(db, { name: `${TAG} Shared Bistro Old` });
    await groundAt(db, moverId, oldPlaceId, { movedPlaceId: sharedPlaceId });

    const mover = await loadPlace(db, moverId);
    const result = await service.followMovedPlace(mover.locations[0]);
    expect(result.status).toBe('updated');
    expect(google.detailsCalls).toEqual([sharedPlaceId]);
    expect(google.autocompleteCalls).toEqual([]);

    // One entity: the mover is the owner's merge loser; the dead listing's
    // row is gone (its successor row already lives on the owner).
    expect((await loadPlace(db, moverId)).status).toBe('archived');
    const owner = await loadPlace(db, ownerId);
    expect(owner.locations.map((row) => row.googlePlaceId)).toEqual([
      sharedPlaceId,
    ]);
    const mergeVerdict = await verdict(
      db,
      'place_merge',
      `place|${moverId}|${ownerId}`,
    );
    expect(mergeVerdict?.executed_at).not.toBeNull();
  });
});
