/**
 * ONE HOLD AT THE enrichPlace CHOKEPOINT (red team 2026-09-04 E-6) — against
 * a REAL Postgres.
 *
 * THE DEFECT: the worker-lane decline alarm was evaluated in enrichPlaceById
 * only, so the operator sweep (`enrich-restaurants.ts` →
 * enrichMissingPlaces → enrichPlace) never saw it; its private in-memory
 * tripwire could not arm under 20 judged attempts, so a `--limit=10` sweep
 * kept spending Places dollars and strikes while the worker lane was held on
 * the very same evidence.
 *
 * THE LAW: the hold is evaluated inside enrichPlace — the chokepoint every
 * entry shares — from the DURABLE decline window; batch drivers are a second
 * reader of the same verdict and HALT.
 *
 * The evidence is what the lane itself writes: `no_match` breadcrumbs with a
 * `failureAt` inside the trailing window. This spec seeds exactly that shape
 * (25 declines, the 08-20 disease in miniature) and proves:
 *   1. the operator sweep, fresh process, first entity: ZERO Google calls —
 *      it halts with GroundingSweepHaltError and the critical alert;
 *   2. the worker entry (enrichPlaceById) skips with the hold reason.
 *
 * RED (mutation): move the hold back into enrichPlaceById (or delete it from
 * enrichPlace) — proof 1 fails: the sweep calls Google on its first entity.
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
  mintPlace,
} from './grounding-integration.harness-spec';
import {
  GROUNDING_HOLD_SKIP_REASON,
  GroundingSweepHaltError,
} from './worker-lane-decline-alarm';

const TAG = `itest-hold-${randomUUID().slice(0, 6)}`;
const prisma = new PrismaClient();

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'grounding-hold-chokepoint.integration.spec requires DATABASE_URL (a dev database)',
    );
  }
});

afterAll(async () => {
  await cleanupTag(prisma, TAG);
  await prisma.$disconnect();
});

describe('the grounding decline hold at the enrichPlace chokepoint', () => {
  it('holds the operator sweep and the worker entry alike, from the durable window, before any Google call', async () => {
    // THE WINDOW: 25 entities the chooser declined in the last few minutes —
    // the breadcrumb shape recordNoMatchCandidates writes.
    const failureAt = new Date().toISOString();
    for (let i = 0; i < 25; i += 1) {
      const id = await mintPlace(prisma, { name: `${TAG} declined ${i}` });
      await prisma.$executeRawUnsafe(
        `UPDATE core_entities
            SET restaurant_metadata = jsonb_build_object(
                  'lastEnrichmentAttempt',
                  jsonb_build_object('status', 'no_match', 'failureAt', $2::text))
          WHERE entity_id = $1::uuid`,
        id,
        failureAt,
      );
    }
    // THE NEXT ENTITY IN LINE: untried, oldest — first in the sweep order.
    const nextId = await mintPlace(prisma, {
      name: `${TAG} next in line`,
      createdAt: '1990-01-01T00:00:00Z',
    });

    // A Google that refuses every call: the assertion IS zero spend.
    const google = new GoogleStub({});
    google.forbidAll();
    const chooser = new ChooserStub();
    const { service, alerts } = buildHarness({
      prisma,
      google,
      chooser,
      realHold: true,
    });

    // 1. The operator sweep — a fresh process reading the same window —
    //    halts on its first entity, loudly, having spent nothing.
    await expect(
      service.enrichMissingPlaces({ limit: 1 }),
    ).rejects.toBeInstanceOf(GroundingSweepHaltError);
    expect(google.autocompleteCalls).toEqual([]);
    expect(google.detailsCalls).toEqual([]);
    expect(chooser.hearings).toBe(0);
    expect(alerts.map((alert) => alert.kind)).toEqual(
      expect.arrayContaining([
        'grounding_worker_lane_held',
        'grounding_sweep_halted',
      ]),
    );

    // 2. The worker entry skips with the hold reason — same verdict.
    const viaWorker = await service.enrichPlaceById(nextId);
    expect(viaWorker.status).toBe('skipped');
    expect(viaWorker.reason).toBe(GROUNDING_HOLD_SKIP_REASON);
    expect(google.autocompleteCalls).toEqual([]);
  });
});
