/**
 * ONE ANSWER TO "IS THIS DOMAIN OWNED?" (red team 2026-09-04 E-7) — against a
 * REAL Postgres.
 *
 * THE DEFECT: the enrichment-time domain merge ran its own status-free query
 * for same-domain twins, so an ARCHIVED, redirect-free oldest twin was
 * picked as canonical and the merge refused under its lock AFTER the
 * grounding had committed: the restaurant was grounded but reported as an
 * error, and never got secondary-location expansion or cuisine extraction.
 * The nightly sweep, meanwhile, answered "owned?" from active rows only.
 *
 * THE LAW: `ownedDomainCluster(domain)` — ACTIVE carriers, redirect-resolved
 * — is the one reading both doors take; and the post-grounding tail runs
 * whatever the merge court says.
 *
 * PROOFS:
 *   1. with an archived redirect-free oldest twin and an active younger one,
 *      enrichment merges into the ACTIVE twin — status 'updated', both the
 *      expansion and the cuisine extraction enqueued;
 *   2. the cluster is redirect-resolved: an archived carrier merged away
 *      counts through its live winner, and `domainIsOwned` (the sweep's
 *      reading) is the same cluster's verdict;
 *   3. a merge REFUSAL after grounding leaves the grounding intact and still
 *      runs the tail (the court's stand-in refuses; the row stays grounded).
 *
 * RED (mutation): restore the status-free findMany in
 * mergeIntoCanonicalDomainEntityIfNeeded — proof 1 fails (status 'error',
 * the tail never enqueued).
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
} from './grounding-integration.harness-spec';

const TAG = `itest-domain-${randomUUID().slice(0, 6)}`;
const prisma = new PrismaClient();

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'owned-domain-cluster.integration.spec requires DATABASE_URL (a dev database)',
    );
  }
});

afterAll(async () => {
  await cleanupTag(prisma, TAG);
  await prisma.$disconnect();
});

describe('the owned-domain cluster, shared by both merge doors', () => {
  it('merges a grounded newcomer into the ACTIVE same-domain twin, never the archived tombstone, and runs the tail', async () => {
    const domain = `${TAG}-brand.com`.toLowerCase();
    const placeId = `${TAG}-place`;
    const google = new GoogleStub({
      [placeId]: {
        name: `${TAG} Brand Kitchen`,
        websiteUri: `https://${domain}/menu`,
      },
    });
    const chooser = new ChooserStub();
    const {
      service,
      prisma: db,
      expansions,
      extractions,
    } = buildHarness({
      prisma,
      google,
      chooser,
    });

    // The oldest carrier is an archived, redirect-free tombstone.
    const tombstoneId = await mintPlace(db, {
      name: `${TAG} Brand Kitchen`,
      status: 'archived',
      canonicalDomain: domain,
      createdAt: '2020-01-01T00:00:00Z',
    });
    // The younger carrier is live.
    const liveTwinId = await mintPlace(db, {
      name: `${TAG} Brand Kitchen Downtown`,
      status: 'active',
      canonicalDomain: domain,
      createdAt: '2021-01-01T00:00:00Z',
    });
    await groundAt(db, liveTwinId, `${TAG}-twin-place`);
    const newcomerId = await mintPlace(db, {
      name: `${TAG} Brand Kitchen`,
      status: 'active',
      createdAt: '2022-01-01T00:00:00Z',
    });

    const result = await (service as unknown as EnrichDriveable).enrichPlace(
      await loadPlace(db, newcomerId),
      { sourceText: 'brand kitchen is great' },
    );
    expect(result.status).toBe('updated');
    expect(result.mergedInto).toBe(liveTwinId);

    expect((await loadPlace(db, tombstoneId)).status).toBe('archived');
    expect(await redirectOf(db, newcomerId)).toBe(liveTwinId);
    const liveTwin = await loadPlace(db, liveTwinId);
    expect(liveTwin.locations.map((row) => row.googlePlaceId).sort()).toEqual(
      [placeId, `${TAG}-twin-place`].sort(),
    );
    // The tail ran on the merged-into entity.
    expect(expansions).toEqual([liveTwinId]);
    expect(extractions).toEqual([liveTwinId]);
  });

  it("is redirect-resolved and is the sweep's own answer", async () => {
    const domain = `${TAG}-chain.com`.toLowerCase();
    const google = new GoogleStub({});
    const { merge, prisma: db } = buildHarness({
      prisma,
      google,
      chooser: new ChooserStub(),
    });
    // An archived carrier merged away into a winner that does not (yet)
    // carry the domain itself.
    const loserId = await mintPlace(db, {
      name: `${TAG} Chain House`,
      status: 'archived',
      canonicalDomain: domain,
    });
    const winnerId = await mintPlace(db, {
      name: `${TAG} Chain House Central`,
      status: 'active',
    });
    await db.$executeRawUnsafe(
      `INSERT INTO entity_redirects (from_entity_id, to_entity_id) VALUES ($1::uuid, $2::uuid)`,
      loserId,
      winnerId,
    );
    const cluster = await merge.ownedDomainCluster(domain);
    expect(cluster.members.map((member) => member.entityId)).toEqual([
      winnerId,
    ]);
    expect(cluster.owned).toBe(true);
    expect(await merge.domainIsOwned(domain)).toBe(true);
    // A stranger under the same domain breaks ownership for both readers.
    expect(
      await merge.domainIsOwned(domain, [`${TAG} Totally Other Taco`]),
    ).toBe(false);
    expect(
      (await merge.ownedDomainCluster(domain, [`${TAG} Totally Other Taco`]))
        .owned,
    ).toBe(false);
  });

  it('keeps the grounding and runs the tail when the merge court refuses', async () => {
    const domain = `${TAG}-refused.com`.toLowerCase();
    const placeId = `${TAG}-refused-place`;
    const google = new GoogleStub({
      [placeId]: {
        name: `${TAG} Refused Grill`,
        websiteUri: `https://${domain}/`,
      },
    });
    const harness = buildHarness({
      prisma,
      google,
      chooser: new ChooserStub(),
    });
    const { service, prisma: db, expansions, extractions, alerts } = harness;
    // The court refuses this pair (a concurrent merge archived the canonical
    // under the lock, say) — stand-in for mergeDuplicatePlace.
    harness.merge.mergeDuplicatePlace = () =>
      Promise.reject(
        new Error(
          'merge refused: canonical is not active under the identity lock',
        ),
      );

    const twinId = await mintPlace(db, {
      name: `${TAG} Refused Grill`,
      status: 'active',
      canonicalDomain: domain,
      createdAt: '2020-01-01T00:00:00Z',
    });
    await groundAt(db, twinId, `${TAG}-refused-twin-place`);
    const newcomerId = await mintPlace(db, {
      name: `${TAG} Refused Grill North`,
      status: 'active',
    });

    const result = await (service as unknown as EnrichDriveable).enrichPlace(
      await loadPlace(db, newcomerId),
      { sourceText: 'grill' },
    );
    expect(result.status).toBe('updated');
    expect(result.mergedInto).toBeUndefined();
    const newcomer = await loadPlace(db, newcomerId);
    expect(newcomer.status).toBe('active');
    expect(newcomer.locations.map((row) => row.googlePlaceId)).toEqual([
      placeId,
    ]);
    expect(expansions).toEqual([newcomerId]);
    expect(extractions).toEqual([newcomerId]);
    expect(alerts.map((alert) => alert.kind)).toContain(
      'domain_merge_refused_after_grounding',
    );
  });
});
