/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
/**
 * §2 Tier-2 polygon promotion queue fixtures (plans/geo-demand-foundation-
 * rebuild.md §2 "earned moments"): idempotent enqueue, governed drain
 * (scarce denial = typed not-now, stays queued; consumed-draw miss =
 * attempts++), census two-step (cheap geometry-id fetch then scarce
 * polygon), raw-SQL polygon persist, header-answer frequency memory.
 */
import type { PlaceGeometryPromotion } from '@prisma/client';

import { PlacesPromotionService } from './places-promotion.service';

const PLACE_ID = '00000000-0000-4000-8000-000000000001';
const PLACE_ID_2 = '00000000-0000-4000-8000-000000000002';

const logger: any = {
  setContext: () => logger,
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

function makePlaceRow(overrides: Record<string, unknown> = {}) {
  return {
    placeId: PLACE_ID,
    name: 'Wolfe City',
    providerLevelCode: 'Municipality',
    countryCode: 'US',
    subdivisionCode: 'TX',
    county: 'Hunt',
    // Docket #1: the census lane is gone — every enqueueable place is a
    // mirrored vendor entity carrying its geometry id, with an anchor
    // (the P4 centroid coupling guarantees one).
    provider: 'tomtom',
    providerPlaceId: 'geo-wolfe',
    centroidLat: '33.37',
    centroidLng: '-96.07',
    promotedAt: null,
    ...overrides,
  };
}

/**
 * TYPED ON THE PRODUCTION ROW (F4950). This builder used to be
 * `Record<string, unknown>` and omitted `missAttempts` entirely, so every
 * test ran with `item.missAttempts === undefined`: `undefined + 1` is `NaN`,
 * `NaN >= MISS_ATTEMPTS_BEFORE_RETIRE` is `false`, and BOTH retirement
 * branches (the vendor-miss ceiling and the unusable-answer ceiling) were
 * unreachable in the whole suite — setting the constant to 999 reddened
 * nothing. `PlaceGeometryPromotion` makes `missAttempts` non-optional, so
 * the compiler now refuses the omission and the counter starts at the
 * column's own default, EXPLICITLY.
 */
function makeQueueRow(
  overrides: Partial<PlaceGeometryPromotion> = {},
): PlaceGeometryPromotion {
  return {
    placeId: PLACE_ID,
    trigger: 'poll_created',
    enqueuedAt: new Date('2026-07-01T00:00:00Z'),
    promotedAt: null,
    missAttempts: 0,
    attempts: 0,
    lastAttemptAt: null,
    refusedAt: null,
    providerBoundaryId: null,
    campaignId: null,
    ...overrides,
  };
}

const POLYGON_GEOJSON = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [0, 1],
            [1, 1],
            [0, 0],
          ],
        ],
      },
    },
  ],
};

/**
 * A fetchPolygon test double that HONOURS THE DRAW CONTRACT (F350): the real
 * adapter's draw is announced by the governor exactly once per ADMITTED draw,
 * on the success path AND on the transport-error path. A mock that resolves
 * without announcing models a vendor call that never cost anything, which is
 * precisely the blindness the finding was about — so every double for an
 * admitted draw goes through here. A POOL DENIAL is not an admitted draw and
 * deliberately does NOT use this.
 */
function answeringPolygon(result: unknown): jest.Mock {
  return jest.fn((_geometryId: string, onDrawConsumed?: () => void) => {
    onDrawConsumed?.();
    return Promise.resolve(result);
  });
}

/** An admitted draw that dies in transport: announced, then thrown. */
function erroringPolygon(error: Error): jest.Mock {
  return jest.fn((_geometryId: string, onDrawConsumed?: () => void) => {
    onDrawConsumed?.();
    return Promise.reject(error);
  });
}

function makeHarness(options: {
  queueRows?: PlaceGeometryPromotion[];
  place?: Record<string, unknown> | null;
  hasGeometryAlready?: boolean;
  resolveGeometryId?: jest.Mock;
  fetchPolygon?: jest.Mock;
  /** Wave-6 item 1b: pg_try_advisory_lock outcome (default acquired). */
  lockAcquired?: boolean;
  /** §24 Task 3: optional campaign-envelope mock (isDispatchable/recordSpend). */
  spendCampaigns?: { isDispatchable: jest.Mock; recordSpend: jest.Mock };
  /** Anchor-containment guard outcome (default: the polygon covers it). */
  polygonCoversAnchor?: boolean;
  /** Entity exclusivity: another place already holds this geometry id. */
  entityClaimedByPlaceId?: string;
}) {
  const executeRawCalls: Array<{ sql: string; values: unknown[] }> = [];
  const prisma = {
    $executeRaw: jest.fn().mockImplementation((query: any) => {
      executeRawCalls.push({ sql: query.sql ?? '', values: query.values });
      return Promise.resolve(1);
    }),
    $queryRaw: jest.fn().mockImplementation((query: any) => {
      const sql: string = query.sql ?? '';
      if (sql.includes('pg_try_advisory_lock')) {
        return Promise.resolve([{ locked: options.lockAcquired ?? true }]);
      }
      if (sql.includes('pg_advisory_unlock')) {
        return Promise.resolve([{ unlocked: true }]);
      }
      if (sql.includes('FROM place_geometry_promotions')) {
        return Promise.resolve(options.queueRows ?? []);
      }
      // P4: the derived-extent read (ST_YMin/... FROM place_geometries) —
      // answered from the fixture place's legacy bbox fields, which model the
      // sketch ground's envelope (the production invariant).
      if (sql.includes('AS bbox_min_lat')) {
        const pl: any = options.place ?? {};
        return Promise.resolve(
          pl.bboxMinLat != null
            ? [
                {
                  bbox_min_lat: Number(pl.bboxMinLat),
                  bbox_min_lng: Number(pl.bboxMinLng),
                  bbox_max_lat: Number(pl.bboxMaxLat),
                  bbox_max_lng: Number(pl.bboxMaxLng),
                },
              ]
            : [],
        );
      }
      // Entity exclusivity probe — MUST be matched before the generic
      // place_geometries branch below (both queries name that table).
      if (sql.includes('provider_boundary_id =')) {
        return Promise.resolve(
          options.entityClaimedByPlaceId
            ? [{ placeId: options.entityClaimedByPlaceId }]
            : [],
        );
      }
      if (sql.includes('FROM place_geometries')) {
        return Promise.resolve(
          options.hasGeometryAlready ? [{ placeId: PLACE_ID }] : [],
        );
      }
      // Anchor-containment guard: does the returned polygon cover the
      // place's own interior anchor? Default true (the honest case).
      if (sql.includes('ST_Covers')) {
        return Promise.resolve([{ ok: options.polygonCoversAnchor ?? true }]);
      }
      return Promise.resolve([]);
    }),
    $transaction: jest
      .fn()
      .mockImplementation((ops: unknown[]) =>
        Promise.all(ops as Array<Promise<unknown>>),
      ),
    place: {
      findUnique: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            options.place === undefined ? makePlaceRow() : options.place,
          ),
        ),
      update: jest.fn().mockResolvedValue({}),
    },
    placeGeometryPromotion: {
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  const probe = {
    probe: jest.fn(),
    resolveGeometryId:
      options.resolveGeometryId ??
      jest.fn().mockResolvedValue({ kind: 'ok', geometryId: 'geo-wolfe' }),
    fetchPolygon:
      options.fetchPolygon ??
      answeringPolygon({ kind: 'ok', geojson: POLYGON_GEOJSON }),
  };
  const service = new PlacesPromotionService(
    prisma as never,
    probe as never,
    logger,
    options.spendCampaigns as never,
  );
  return { service, prisma, probe, executeRawCalls };
}

describe('PlacesPromotionService — §2 earned-moment queue', () => {
  describe('enqueue (idempotent)', () => {
    it('inserts with the conflict-no-op + already-promoted guards', async () => {
      const { service, executeRawCalls } = makeHarness({});
      await service.enqueue(PLACE_ID, 'poll_created');
      expect(executeRawCalls).toHaveLength(1);
      const { sql, values } = executeRawCalls[0];
      expect(sql).toContain('INSERT INTO place_geometry_promotions');
      // Idempotency: queued OR promoted rows are conflict no-ops.
      expect(sql).toContain('ON CONFLICT (place_id) DO NOTHING');
      // The fallback-provider guard is DELETED with the fallback lane
      // (2026-08-01) — every place is a vendor mirror and may earn an
      // outline.
      expect(sql).not.toContain('fallback');
      // §2.6: "already promoted" = an OUTLINE-grade row (provider_boundary_id
      // set). Every place has a geometry row now, so bare row existence must
      // NOT gate the enqueue — a sketch envelope still earns its outline.
      expect(sql).toContain('place_geometries');
      expect(sql).toContain('provider_boundary_id IS NOT NULL');
      expect(sql).not.toContain('geometry IS NOT NULL');
      expect(values).toContain('poll_created');
      // The queue row carries its SPEND CAMPAIGN (red-team 2026-08-01): the
      // TomTom pools are per-MINUTE rate windows, so a campaign envelope is
      // the only budget ceiling a bulk run can have.
      expect(sql).toContain('campaign_id');
    });

    it('a BIRTH promotes THE NEWBORN only — targeted row select, never the whole-queue drain (red-team 2026-08-01: a backlogged drain ran ~83min of spacing and processed the newborn LAST)', async () => {
      const { service, prisma } = makeHarness({});
      const drainSpy = jest.spyOn(service, 'drainQueue');
      prisma.$queryRaw.mockResolvedValueOnce([{ locked: true }]); // advisory lock
      prisma.$queryRaw.mockResolvedValueOnce([]); // targeted select: newborn already promoted/absent
      prisma.$queryRaw.mockResolvedValueOnce([{ unlocked: true }]);
      await service.enqueue(PLACE_ID, 'birth');
      // The whole-queue drain must NOT run on the birth path.
      expect(drainSpy).not.toHaveBeenCalled();
      // The targeted select is scoped to the newborn's own row.
      const targeted = prisma.$queryRaw.mock.calls
        .map((call) => call[0])
        .map((q) => (q?.sql ?? String(q)) as string)
        .find((sql) => sql.includes('FROM place_geometry_promotions'));
      expect(targeted).toContain('place_id = ');
      expect(targeted).not.toContain('ORDER BY enqueued_at');
      expect(targeted).not.toContain('LIMIT');
    });

    it('a bulk_seed enqueue carries its campaign and does NOT promote inline', async () => {
      const { service, prisma, executeRawCalls } = makeHarness({});
      const drainSpy = jest.spyOn(service, 'drainQueue');
      await service.enqueue(PLACE_ID, 'bulk_seed', 'camp-1');
      const { values } = executeRawCalls[0];
      expect(values).toContain('bulk_seed');
      expect(values).toContain('camp-1');
      // Only 'birth' promotes synchronously — a bulk mint must never spend
      // inline, and it must never trigger the whole-queue drain either.
      expect(drainSpy).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('re-enqueue is a no-op by construction and enqueue never throws', async () => {
      const { service, prisma } = makeHarness({});
      await service.enqueue(PLACE_ID, 'poll_created');
      await service.enqueue(PLACE_ID, 'header_answers');
      // Both hit the same conflict-guarded statement — the DB dedupes.
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);

      prisma.$executeRaw.mockRejectedValueOnce(new Error('db down'));
      await expect(
        service.enqueue(PLACE_ID, 'poll_created'),
      ).resolves.toBeUndefined();
    });
  });

  describe('drain — governed scarce flow', () => {
    it('scarce denial is a typed not-now: row untouched (NOT an attempt) and the pass stops', async () => {
      const fetchPolygon = jest.fn().mockResolvedValue({ kind: 'denied' });
      const { service, prisma } = makeHarness({
        queueRows: [makeQueueRow(), makeQueueRow({ placeId: PLACE_ID_2 })],
        fetchPolygon,
      });
      await service.drainQueue(new Date('2026-07-20T00:00:00Z'));
      // First item hit the scarce boundary; the hardClosed month pool means
      // nothing behind it admits either — exactly ONE draw attempted.
      expect(fetchPolygon).toHaveBeenCalledTimes(1);
      // Denial ≠ attempt: no attempts increment, no promotion stamp — and
      // docket #1: no cheap-step cache write exists anymore (the geometry id
      // IS the place's identity, carried from birth).
      expect(prisma.placeGeometryPromotion.update).not.toHaveBeenCalled();
      expect(prisma.place.update).not.toHaveBeenCalled();
    });

    it('a tomtom-provider place skips the cheap step: providerPlaceId IS the geometry id (§1)', async () => {
      const resolveGeometryId = jest.fn();
      const fetchPolygon = answeringPolygon({
        kind: 'ok',
        geojson: POLYGON_GEOJSON,
      });
      const { service } = makeHarness({
        queueRows: [makeQueueRow()],
        place: makePlaceRow({ provider: 'tomtom', providerPlaceId: 'geo-t' }),
        resolveGeometryId,
        fetchPolygon,
      });
      await service.drainQueue(new Date('2026-07-20T00:00:00Z'));
      expect(resolveGeometryId).not.toHaveBeenCalled();
      expect(fetchPolygon).toHaveBeenCalledWith('geo-t', expect.any(Function));
    });

    it('a consumed-draw miss increments the MISS counter (a fault is not a miss) and the item stays queued', async () => {
      const fetchPolygon = answeringPolygon({ kind: 'miss' });
      const { service, prisma } = makeHarness({
        queueRows: [makeQueueRow({ providerBoundaryId: 'geo-cached' })],
        fetchPolygon,
      });
      const now = new Date('2026-07-20T00:00:00Z');
      await service.drainQueue(now);
      expect(prisma.placeGeometryPromotion.update).toHaveBeenCalledWith({
        where: { placeId: PLACE_ID },
        // A MISS is the vendor saying it has no polygon for this id — the
        // only evidence that may retire a row. `attempts` also rises (it is
        // the fault counter) but the CEILING reads missAttempts, so two
        // transport errors can no longer terminally refuse a good row.
        data: {
          attempts: { increment: 1 },
          missAttempts: { increment: 1 },
          lastAttemptAt: now,
        },
      });
      // Never promoted.
      expect(prisma.place.update).not.toHaveBeenCalled();
    });

    /**
     * THE RETIREMENT CEILING, F4950. Before the fixture builder was typed,
     * `missAttempts` was never set, so `item.missAttempts + 1` was `NaN` and
     * `NaN >= MISS_ATTEMPTS_BEFORE_RETIRE` was false in EVERY test: the
     * ceiling that exists to stop a permanently-unsatisfiable row drawing a
     * scarce polygon every hour forever was unreachable, and setting the
     * constant to 999 reddened nothing. These two cases straddle it, so the
     * VALUE is pinned and not just the branch.
     */
    it('the ceiling FIRES: the miss that reaches MISS_ATTEMPTS_BEFORE_RETIRE retires the row terminally', async () => {
      const fetchPolygon = answeringPolygon({ kind: 'miss' });
      const { service, prisma } = makeHarness({
        // Two prior vendor misses; this draw is the third ask.
        queueRows: [
          makeQueueRow({ providerBoundaryId: 'geo-cached', missAttempts: 2 }),
        ],
        fetchPolygon,
      });
      const now = new Date('2026-07-20T00:00:00Z');
      await service.drainQueue(now);
      // recordRefusal, not recordMiss: refusedAt is stamped (terminal — the
      // drain never selects the row again) and missAttempts is NOT bumped,
      // because there is nothing left to count toward.
      expect(prisma.placeGeometryPromotion.update).toHaveBeenCalledWith({
        where: { placeId: PLACE_ID },
        data: {
          attempts: { increment: 1 },
          lastAttemptAt: now,
          refusedAt: now,
        },
      });
      const calls = prisma.placeGeometryPromotion.update.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;
      expect(calls.filter((c) => 'missAttempts' in c[0].data)).toHaveLength(0);
    });

    it('the ceiling does NOT fire one miss early — the row below it stays queued and countable', async () => {
      const fetchPolygon = answeringPolygon({ kind: 'miss' });
      const { service, prisma } = makeHarness({
        queueRows: [
          makeQueueRow({ providerBoundaryId: 'geo-cached', missAttempts: 1 }),
        ],
        fetchPolygon,
      });
      const now = new Date('2026-07-20T00:00:00Z');
      await service.drainQueue(now);
      expect(prisma.placeGeometryPromotion.update).toHaveBeenCalledWith({
        where: { placeId: PLACE_ID },
        data: {
          attempts: { increment: 1 },
          missAttempts: { increment: 1 },
          lastAttemptAt: now,
        },
      });
      const calls = prisma.placeGeometryPromotion.update.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;
      expect(calls.filter((c) => 'refusedAt' in c[0].data)).toHaveLength(0);
    });

    it('the ROW-SCOPED-FAULT ceiling fires on the same count (the second retirement branch)', async () => {
      const { service, prisma } = makeHarness({
        queueRows: [
          makeQueueRow({ providerBoundaryId: 'geo-stale', missAttempts: 2 }),
        ],
        fetchPolygon: jest.fn((_id: string, onDrawConsumed?: () => void) => {
          onDrawConsumed?.();
          return Promise.resolve({
            kind: 'failed' as const,
            reason: 'tomtom_geometry_id_not_echoed',
            scope: 'row' as const,
          });
        }),
      });
      const now = new Date('2026-07-20T00:00:00Z');
      await service.drainQueue(now);
      expect(prisma.placeGeometryPromotion.update).toHaveBeenCalledWith({
        where: { placeId: PLACE_ID },
        data: {
          attempts: { increment: 1 },
          lastAttemptAt: now,
          refusedAt: now,
        },
      });
    });

    it('success persists the polygon via the place_geometries raw-SQL shape and stamps BOTH promotion timestamps', async () => {
      const { service, prisma, executeRawCalls } = makeHarness({
        queueRows: [makeQueueRow({ providerBoundaryId: 'geo-cached' })],
      });
      const now = new Date('2026-07-20T00:00:00Z');
      await service.drainQueue(now);

      const persist = executeRawCalls.find((call) =>
        call.sql.includes('INSERT INTO place_geometries'),
      );
      expect(persist).toBeDefined();
      // WHAT the pipeline does is proven against real PostGIS in
      // places-ground-persist.integration.spec (union of ALL features, invalid
      // rings made valid, upsert, centroid coupling, malformed payload lands
      // nothing). The token list that used to sit here — ST_GeomFromGeoJSON,
      // ST_UnaryUnion, ST_Multi, ON CONFLICT — could not tell "unions
      // everything" from "unions the first", which is a bug this module
      // actually had. What is worth asserting HERE is that the drain reached
      // the persist with the polygon it was handed.
      expect(persist!.values).toContain(JSON.stringify(POLYGON_GEOJSON));

      // P4 COMPLETE (2026-07-30): there is NO bbox writeback — the columns
      // are gone; every consumer derives the envelope from this ground at the
      // moment of use. What the ground write DOES couple is the
      // REPRESENTATIVE POINT (the abstraction's second face: a derived value
      // is written only by the write of its source): centroid :=
      // ST_PointOnSurface(ground) whenever the written ground does not cover
      // the stored point.
      expect(
        executeRawCalls.some((call) => call.sql.includes('bbox_min_lat')),
      ).toBe(false);
      const derive = executeRawCalls.find((call) =>
        call.sql.includes('UPDATE places p SET'),
      );
      // That the point actually MOVES to the new ground is the integration
      // spec's third case; here we only assert the coupling write happens on
      // the same path as the ground write.
      expect(derive).toBeDefined();

      // Promotion stamped on the queue row AND places.promoted_at.
      expect(prisma.placeGeometryPromotion.update).toHaveBeenCalledWith({
        where: { placeId: PLACE_ID },
        data: { promotedAt: now, providerBoundaryId: 'geo-cached' },
      });
      // Docket #4: places.promoted_at is dropped — only the QUEUE row is
      // stamped (asserted above); no places write happens.
      expect(prisma.place.update).not.toHaveBeenCalled();
    });

    it('a ROW-SCOPED fault counts toward retirement and does NOT stop the queue', async () => {
      // THE HEAD-OF-LINE REGRESSION. The first P5 fix routed every fault to
      // 'stop'; an id the vendor never echoes is permanent, so one such row at
      // the head of an oldest-first queue burned a scarce draw every hour
      // forever and blocked every place behind it.
      const { service, prisma } = makeHarness({
        queueRows: [makeQueueRow({ providerBoundaryId: 'geo-stale' })],
        fetchPolygon: jest.fn((_id: string, onDrawConsumed?: () => void) => {
          onDrawConsumed?.();
          return Promise.resolve({
            kind: 'failed' as const,
            reason: 'tomtom_geometry_id_not_echoed',
            scope: 'row' as const,
          });
        }),
      });
      await service.drainQueue(new Date('2026-07-20T00:00:00Z'));
      // recordMiss increments BOTH counters; recordAttempt (the systemic
      // path) increments only `attempts`. The presence of missAttempts is
      // therefore the exact observable that separates the two — the first
      // version of this assertion used expect.anything() and passed for BOTH
      // scopes, which is a lying test.
      const calls = prisma.placeGeometryPromotion.update.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;
      const missCalls = calls.filter((c) => 'missAttempts' in c[0].data);
      expect(missCalls).toHaveLength(1);
      expect(missCalls[0][0].data).toMatchObject({
        attempts: { increment: 1 },
        missAttempts: { increment: 1 },
      });
    });

    it('a raced pre-existing polygon just stamps promotion — no draws', async () => {
      const fetchPolygon = jest.fn();
      const resolveGeometryId = jest.fn();
      const { service, prisma } = makeHarness({
        queueRows: [makeQueueRow()],
        hasGeometryAlready: true,
        fetchPolygon,
        resolveGeometryId,
      });
      const now = new Date('2026-07-20T00:00:00Z');
      await service.drainQueue(now);
      expect(fetchPolygon).not.toHaveBeenCalled();
      expect(resolveGeometryId).not.toHaveBeenCalled();
      // Docket #4: places.promoted_at is dropped — only the QUEUE row is
      // stamped (asserted above); no places write happens.
      expect(prisma.place.update).not.toHaveBeenCalled();
    });

    it('the drain retries every tick and NEVER re-selects a refused row (docket #2: month-as-backoff is dead)', async () => {
      const { service, prisma } = makeHarness({ queueRows: [] });
      await service.drainQueue(new Date('2026-07-20T00:00:00Z'));
      const drainSelect = prisma.$queryRaw.mock.calls
        .map((call: any[]) => call[0])
        .find((query: any) =>
          String(query.sql ?? '').includes('ORDER BY enqueued_at ASC'),
        );
      expect(drainSelect).toBeDefined();
      // Refusal is terminal; transient failures just wait for the next tick
      // (the per-minute pool bounds a runaway, not the calendar).
      expect(String(drainSelect.sql)).toContain('refused_at IS NULL');
      expect(String(drainSelect.sql)).not.toContain("date_trunc('month'");
      expect(String(drainSelect.sql)).toContain('promoted_at IS NULL');
    });
  });

  describe('campaign envelope metering (§24 Task 3)', () => {
    it('a consumed-draw MISS still meters its draws into the campaign — real spend never escapes the envelope', async () => {
      // Cheap step resolves (1 cheap draw), scarce step misses (1 scarce
      // draw): the item is NOT promoted, but both draws hit the vendor and
      // must be metered against the campaign budget.
      const fetchPolygon = answeringPolygon({ kind: 'miss' });
      const spendCampaigns = {
        isDispatchable: jest.fn().mockResolvedValue(true),
        recordSpend: jest.fn().mockResolvedValue(undefined),
      };
      const { service, prisma } = makeHarness({
        queueRows: [makeQueueRow({ campaignId: 'camp-1' })],
        fetchPolygon,
        spendCampaigns,
      });
      await service.drainQueue(new Date('2026-07-20T00:00:00Z'));
      // Not promoted (miss path)…
      expect(prisma.place.update).not.toHaveBeenCalled();
      // …but the campaign was still charged for the consumed draws.
      expect(spendCampaigns.recordSpend).toHaveBeenCalledTimes(1);
      const [campaignId, , micros] = spendCampaigns.recordSpend.mock.calls[0];
      expect(campaignId).toBe('camp-1');
      expect(micros).toBeGreaterThan(0);
    });

    it('F350: a TRANSPORT-ERRORED draw is charged to the campaign — the gap the pool debited and the envelope could not see', async () => {
      // The draw was ADMITTED (the governor debited the pool and announced
      // it); the vendor then died in transport. The item is not promoted and
      // the pass stops — but real prepaid credit was drawn, so the envelope
      // must be charged. Before F350 this asserted nothing because the
      // envelope was incremented off the RETURNED kind, which an error has
      // none of. Reverting the callback threading makes this go RED.
      const fetchPolygon = erroringPolygon(new Error('ECONNRESET'));
      const spendCampaigns = {
        isDispatchable: jest.fn().mockResolvedValue(true),
        recordSpend: jest.fn().mockResolvedValue(undefined),
      };
      const { service, prisma } = makeHarness({
        queueRows: [makeQueueRow({ campaignId: 'camp-1' })],
        fetchPolygon,
        spendCampaigns,
      });
      await service.drainQueue(new Date('2026-07-20T00:00:00Z'));
      expect(prisma.place.update).not.toHaveBeenCalled();
      expect(spendCampaigns.recordSpend).toHaveBeenCalledTimes(1);
      const [campaignId, , micros] = spendCampaigns.recordSpend.mock.calls[0];
      expect(campaignId).toBe('camp-1');
      expect(micros).toBeGreaterThan(0);
    });

    it('ENTITY EXCLUSIVITY: a vendor entity already claimed by another place is refused BEFORE the scarce draw', async () => {
      // Glen Echo Park MO (pop ~160) sits inside Normandy; TomTom models ONE
      // municipality covering both, so both interior anchors honestly resolve
      // to the same entity. The second claimant must stay sketch-grade rather
      // than wear Normandy's outline — and must not spend a polygon draw
      // discovering that.
      const fetchPolygon = answeringPolygon({
        kind: 'ok',
        geojson: POLYGON_GEOJSON,
      });
      const { service, prisma } = makeHarness({
        queueRows: [makeQueueRow()],
        place: makePlaceRow({ centroidLat: 38.7, centroidLng: -90.29 }),
        entityClaimedByPlaceId: PLACE_ID_2,
        fetchPolygon,
      });
      await service.drainQueue(new Date('2026-07-20T00:00:00Z'));
      // Refused before spending: no polygon fetched, never promoted.
      expect(fetchPolygon).not.toHaveBeenCalled();
      expect(prisma.place.update).not.toHaveBeenCalled();
    });

    it('ANCHOR CONTAINMENT: a polygon that does not cover the place anchor is rejected AT ANY SIZE', async () => {
      // RED-proof for the guard that replaced the span-ratio heuristic. The
      // old check only caught polygons under 20% of the stored bbox on BOTH
      // axes, so a wrong entity of COMPARABLE size passed. Here the polygon
      // is the same size as the place and still must be refused, because it
      // does not contain the point we asked about.
      const { service, prisma } = makeHarness({
        queueRows: [makeQueueRow()],
        place: makePlaceRow({
          centroidLat: 33.0,
          centroidLng: -96.0,
          bboxMinLat: 0,
          bboxMinLng: 0,
          bboxMaxLat: 1,
          bboxMaxLng: 1,
        }),
        polygonCoversAnchor: false,
      });
      await service.drainQueue(new Date('2026-07-20T00:00:00Z'));
      // Rejected: never stamped as promoted, cached id cleared for a re-resolve.
      expect(prisma.place.update).not.toHaveBeenCalled();
      // Docket #2: the rejection is TERMINAL — refused_at is stamped and the
      // row is never re-selected (no id-clearing re-spend cycle).
      const refused = prisma.placeGeometryPromotion.update.mock.calls.find(
        (call: any) => call[0].data.refusedAt instanceof Date,
      );
      expect(refused).toBeDefined();
    });

    it('ANCHOR CONTAINMENT: a polygon covering the anchor is accepted (the guard is not just "reject everything")', async () => {
      const { service, prisma } = makeHarness({
        queueRows: [makeQueueRow()],
        place: makePlaceRow({
          centroidLat: 33.0,
          centroidLng: -96.0,
          bboxMinLat: 0,
          bboxMinLng: 0,
          bboxMaxLat: 1,
          bboxMaxLng: 1,
        }),
        polygonCoversAnchor: true,
      });
      await service.drainQueue(new Date('2026-07-20T00:00:00Z'));
      // Accepted: the QUEUE row is stamped promoted (docket #4: the places
      // copy of promoted_at is dropped — it had zero readers).
      expect(prisma.placeGeometryPromotion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            promotedAt: new Date('2026-07-20T00:00:00Z'),
          }),
        }),
      );
    });

    // NAME CORRECTED (F372): this asserts METERING, and recordSpend fires on
    // both the promoted and the rejected branch — so it survives removal of
    // the wrong-entity guard entirely. It is a sound metering test that was
    // wearing a guard test's name. The wrong-entity GUARD itself is proven by
    // the anchor-containment cases above, which assert the refusal.
    it('a non-promoting exit still meters its draws into the campaign (metering, NOT the wrong-entity guard)', async () => {
      // Docket #1: the only wrong-entity test left is the ANCHOR guard (the
      // anchorless span heuristic died with the census lane). The polygon
      // does not cover the place's own anchor → rejected ('attempted') after
      // the scarce draw — and that consumed draw must still be metered.
      const fetchPolygon = answeringPolygon({
        kind: 'ok',
        geojson: POLYGON_GEOJSON,
      });
      const spendCampaigns = {
        isDispatchable: jest.fn().mockResolvedValue(true),
        recordSpend: jest.fn().mockResolvedValue(undefined),
      };
      const { service, prisma } = makeHarness({
        queueRows: [makeQueueRow({ campaignId: 'camp-1' })],
        polygonCoversAnchor: false,
        fetchPolygon,
        spendCampaigns,
      });
      await service.drainQueue(new Date('2026-07-20T00:00:00Z'));
      expect(prisma.place.update).not.toHaveBeenCalled();
      expect(spendCampaigns.recordSpend).toHaveBeenCalledTimes(1);
      expect(spendCampaigns.recordSpend.mock.calls[0][2]).toBeGreaterThan(0);
    });

    it('a non-dispatchable campaign skips the item without any draw or spend', async () => {
      const fetchPolygon = jest.fn();
      const resolveGeometryId = jest.fn();
      const spendCampaigns = {
        isDispatchable: jest.fn().mockResolvedValue(false),
        recordSpend: jest.fn(),
      };
      const { service } = makeHarness({
        queueRows: [makeQueueRow({ campaignId: 'camp-1' })],
        fetchPolygon,
        resolveGeometryId,
        spendCampaigns,
      });
      await service.drainQueue(new Date('2026-07-20T00:00:00Z'));
      expect(fetchPolygon).not.toHaveBeenCalled();
      expect(resolveGeometryId).not.toHaveBeenCalled();
      expect(spendCampaigns.recordSpend).not.toHaveBeenCalled();
    });
  });

  describe('cross-process drain lock (wave-6 item 1b)', () => {
    it('skips the whole pass when pg_try_advisory_lock is not acquired — no reads, no draws', async () => {
      const fetchPolygon = jest.fn();
      const resolveGeometryId = jest.fn();
      const { service, prisma } = makeHarness({
        queueRows: [makeQueueRow()],
        lockAcquired: false,
        fetchPolygon,
        resolveGeometryId,
      });
      await service.drainQueue(new Date('2026-07-20T00:00:00Z'));
      // Only the lock probe ran — the due read never happened.
      const sqls = prisma.$queryRaw.mock.calls.map((call: any[]) =>
        String(call[0].sql ?? ''),
      );
      expect(sqls.some((sql) => sql.includes('pg_try_advisory_lock'))).toBe(
        true,
      );
      expect(sqls.some((sql) => sql.includes('ORDER BY enqueued_at'))).toBe(
        false,
      );
      expect(fetchPolygon).not.toHaveBeenCalled();
      expect(resolveGeometryId).not.toHaveBeenCalled();
      // A losing lock never unlocks (it holds nothing to release).
      expect(sqls.some((sql) => sql.includes('pg_advisory_unlock'))).toBe(
        false,
      );
    });

    it('releases the advisory lock in finally — even when the vendor throws mid-pass', async () => {
      const fetchPolygon = erroringPolygon(new Error('vendor down'));
      const { service, prisma } = makeHarness({
        queueRows: [makeQueueRow({ providerBoundaryId: 'geo-cached' })],
        fetchPolygon,
      });
      // The transport throw records the attempt and ends the pass ('stop'),
      // so drainQueue resolves; the unlock must still have been issued.
      await service.drainQueue(new Date('2026-07-20T00:00:00Z'));
      const sqls = prisma.$queryRaw.mock.calls.map((call: any[]) =>
        String(call[0].sql ?? ''),
      );
      expect(sqls.some((sql) => sql.includes('pg_advisory_unlock'))).toBe(true);
    });
  });

  // The header-answer describe was DELETED with noteHeaderAnswer (docket #1):
  // the attention memory earned polygons that now arrive at birth.
});
