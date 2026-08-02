/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
/**
 * §2 Tier-2 polygon promotion queue fixtures (plans/geo-demand-foundation-
 * rebuild.md §2 "earned moments"): idempotent enqueue, governed drain
 * (scarce denial = typed not-now, stays queued; consumed-draw miss =
 * attempts++), census two-step (cheap geometry-id fetch then scarce
 * polygon), raw-SQL polygon persist, header-answer frequency memory.
 */
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

function makeQueueRow(overrides: Record<string, unknown> = {}) {
  return {
    placeId: PLACE_ID,
    trigger: 'poll_created',
    enqueuedAt: new Date('2026-07-01T00:00:00Z'),
    promotedAt: null,
    attempts: 0,
    lastAttemptAt: null,
    providerBoundaryId: null,
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

function makeHarness(options: {
  queueRows?: Array<Record<string, unknown>>;
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
      jest.fn().mockResolvedValue({ kind: 'ok', geojson: POLYGON_GEOJSON }),
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
      const fetchPolygon = jest
        .fn()
        .mockResolvedValue({ kind: 'ok', geojson: POLYGON_GEOJSON });
      const { service } = makeHarness({
        queueRows: [makeQueueRow()],
        place: makePlaceRow({ provider: 'tomtom', providerPlaceId: 'geo-t' }),
        resolveGeometryId,
        fetchPolygon,
      });
      await service.drainQueue(new Date('2026-07-20T00:00:00Z'));
      expect(resolveGeometryId).not.toHaveBeenCalled();
      expect(fetchPolygon).toHaveBeenCalledWith('geo-t');
    });

    it('a consumed-draw miss increments the MISS counter (a fault is not a miss) and the item stays queued', async () => {
      const fetchPolygon = jest.fn().mockResolvedValue({ kind: 'miss' });
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
      // Mirror of the live-proven legacy bootstrap ST_ pipeline (§1: the
      // geometry column lives outside prisma — raw SQL only).
      expect(persist!.sql).toContain('ST_GeomFromGeoJSON');
      expect(persist!.sql).toContain('ST_UnaryUnion');
      expect(persist!.sql).toContain('ST_Multi');
      expect(persist!.sql).toContain('ON CONFLICT (place_id) DO UPDATE');
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
      expect(derive).toBeDefined();
      expect(derive!.sql).toContain(
        'centroid_lat = ST_Y(ST_PointOnSurface(g.geometry))',
      );
      expect(derive!.sql).toContain('NOT ST_Covers(g.geometry');

      // Promotion stamped on the queue row AND places.promoted_at.
      expect(prisma.placeGeometryPromotion.update).toHaveBeenCalledWith({
        where: { placeId: PLACE_ID },
        data: { promotedAt: now, providerBoundaryId: 'geo-cached' },
      });
      // Docket #4: places.promoted_at is dropped — only the QUEUE row is
      // stamped (asserted above); no places write happens.
      expect(prisma.place.update).not.toHaveBeenCalled();
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
      const fetchPolygon = jest.fn().mockResolvedValue({ kind: 'miss' });
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
      const [campaignId, micros] = spendCampaigns.recordSpend.mock.calls[0];
      expect(campaignId).toBe('camp-1');
      expect(micros).toBeGreaterThan(0);
    });

    it('ENTITY EXCLUSIVITY: a vendor entity already claimed by another place is refused BEFORE the scarce draw', async () => {
      // Glen Echo Park MO (pop ~160) sits inside Normandy; TomTom models ONE
      // municipality covering both, so both interior anchors honestly resolve
      // to the same entity. The second claimant must stay sketch-grade rather
      // than wear Normandy's outline — and must not spend a polygon draw
      // discovering that.
      const fetchPolygon = jest
        .fn()
        .mockResolvedValue({ kind: 'ok', geojson: POLYGON_GEOJSON });
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

    it('a wrong-entity rejection meters its draws into the campaign', async () => {
      // Docket #1: the only wrong-entity test left is the ANCHOR guard (the
      // anchorless span heuristic died with the census lane). The polygon
      // does not cover the place's own anchor → rejected ('attempted') after
      // the scarce draw — and that consumed draw must still be metered.
      const fetchPolygon = jest
        .fn()
        .mockResolvedValue({ kind: 'ok', geojson: POLYGON_GEOJSON });
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
      expect(spendCampaigns.recordSpend.mock.calls[0][1]).toBeGreaterThan(0);
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
      const fetchPolygon = jest
        .fn()
        .mockRejectedValue(new Error('vendor down'));
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
