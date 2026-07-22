/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
/**
 * §2 Tier-2 polygon promotion queue fixtures (plans/geo-demand-foundation-
 * rebuild.md §2 "earned moments"): idempotent enqueue, governed drain
 * (scarce denial = typed not-now, stays queued; consumed-draw miss =
 * attempts++), census two-step (cheap geometry-id fetch then scarce
 * polygon), raw-SQL polygon persist, header-answer frequency memory.
 */
import {
  HEADER_ANSWER_MEMORY_TTL_MS,
  PlacesPromotionService,
} from './places-promotion.service';

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
    provider: 'census',
    providerPlaceId: '4880032',
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
}) {
  const executeRawCalls: Array<{ sql: string; values: unknown[] }> = [];
  const prisma = {
    $executeRaw: jest.fn().mockImplementation((query: any) => {
      executeRawCalls.push({ sql: query.sql ?? '', values: query.values });
      return Promise.resolve(1);
    }),
    $queryRaw: jest.fn().mockImplementation((query: any) => {
      const sql: string = query.sql ?? '';
      if (sql.includes('FROM place_geometry_promotions')) {
        return Promise.resolve(options.queueRows ?? []);
      }
      if (sql.includes('FROM place_geometries')) {
        return Promise.resolve(
          options.hasGeometryAlready ? [{ placeId: PLACE_ID }] : [],
        );
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
  );
  return { service, prisma, probe, executeRawCalls };
}

describe('PlacesPromotionService — §2 earned-moment queue', () => {
  describe('enqueue (idempotent)', () => {
    it('inserts with the conflict-no-op + fallback + already-promoted guards', async () => {
      const { service, executeRawCalls } = makeHarness({});
      await service.enqueue(PLACE_ID, 'poll_created');
      expect(executeRawCalls).toHaveLength(1);
      const { sql, values } = executeRawCalls[0];
      expect(sql).toContain('INSERT INTO place_geometry_promotions');
      // Idempotency: queued OR promoted rows are conflict no-ops.
      expect(sql).toContain('ON CONFLICT (place_id) DO NOTHING');
      // §17c fallback mints never enqueue (no vendor geometry exists).
      expect(sql).toContain("provider <> 'fallback'");
      // A place that already holds a polygon is already promoted.
      expect(sql).toContain('place_geometries');
      expect(values).toContain('poll_created');
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
      // Denial ≠ attempt: no attempts increment, no promotion stamp.
      expect(prisma.placeGeometryPromotion.update).toHaveBeenCalledTimes(1);
      // (the one update is the providerBoundaryId cache from the cheap step)
      expect(
        prisma.placeGeometryPromotion.update.mock.calls[0][0].data,
      ).toEqual({ providerBoundaryId: 'geo-wolfe' });
      expect(prisma.place.update).not.toHaveBeenCalled();
    });

    it('census-seeded place runs the two-step: cheap geometry-id fetch, cached, then the scarce draw', async () => {
      const resolveGeometryId = jest
        .fn()
        .mockResolvedValue({ kind: 'ok', geometryId: 'geo-wolfe' });
      const fetchPolygon = jest
        .fn()
        .mockResolvedValue({ kind: 'ok', geojson: POLYGON_GEOJSON });
      const { service, prisma } = makeHarness({
        queueRows: [makeQueueRow()],
        resolveGeometryId,
        fetchPolygon,
      });
      await service.drainQueue(new Date('2026-07-20T00:00:00Z'));
      // Step 1: county-qualified identity tuple (§1) — GEOID is NOT a
      // TomTom geometry id.
      expect(resolveGeometryId).toHaveBeenCalledWith({
        name: 'Wolfe City',
        county: 'Hunt',
        subdivisionCode: 'TX',
        countryCode: 'US',
        providerLevelCode: 'Municipality',
      });
      // The resolved id is cached on the queue row (a later scarce denial
      // never re-spends the cheap draw).
      expect(prisma.placeGeometryPromotion.update).toHaveBeenCalledWith({
        where: { placeId: PLACE_ID },
        data: { providerBoundaryId: 'geo-wolfe' },
      });
      // Step 2: the scarce polygon draw uses the resolved id.
      expect(fetchPolygon).toHaveBeenCalledWith('geo-wolfe');
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

    it('cheap-pool denial on the id step stops the pass without an attempt', async () => {
      const resolveGeometryId = jest.fn().mockResolvedValue({ kind: 'denied' });
      const fetchPolygon = jest.fn();
      const { service, prisma } = makeHarness({
        queueRows: [makeQueueRow(), makeQueueRow({ placeId: PLACE_ID_2 })],
        resolveGeometryId,
        fetchPolygon,
      });
      await service.drainQueue(new Date('2026-07-20T00:00:00Z'));
      expect(resolveGeometryId).toHaveBeenCalledTimes(1);
      expect(fetchPolygon).not.toHaveBeenCalled();
      expect(prisma.placeGeometryPromotion.update).not.toHaveBeenCalled();
    });

    it('a consumed-draw miss increments attempts (no cap) and the item stays queued', async () => {
      const fetchPolygon = jest.fn().mockResolvedValue({ kind: 'miss' });
      const { service, prisma } = makeHarness({
        queueRows: [makeQueueRow({ providerBoundaryId: 'geo-cached' })],
        fetchPolygon,
      });
      const now = new Date('2026-07-20T00:00:00Z');
      await service.drainQueue(now);
      expect(prisma.placeGeometryPromotion.update).toHaveBeenCalledWith({
        where: { placeId: PLACE_ID },
        data: { attempts: { increment: 1 }, lastAttemptAt: now },
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

      // §2.5(c): the index derives from truth — the places bbox widens to
      // the landed polygon's envelope (grow-only; COALESCE seeds a bbox-less
      // coarse row's first index presence).
      const widen = executeRawCalls.find((call) =>
        call.sql.includes('ST_XMin'),
      );
      expect(widen).toBeDefined();
      expect(widen!.sql).toContain('GREATEST');
      expect(widen!.sql).toContain('LEAST');

      // Promotion stamped on the queue row AND places.promoted_at.
      expect(prisma.placeGeometryPromotion.update).toHaveBeenCalledWith({
        where: { placeId: PLACE_ID },
        data: { promotedAt: now, providerBoundaryId: 'geo-cached' },
      });
      expect(prisma.place.update).toHaveBeenCalledWith({
        where: { placeId: PLACE_ID },
        data: { promotedAt: now },
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
      expect(prisma.place.update).toHaveBeenCalledWith({
        where: { placeId: PLACE_ID },
        data: { promotedAt: now },
      });
    });

    it('the month-window backoff clause rides the drain read (K4 pool window = the backoff clock)', async () => {
      const { service, prisma } = makeHarness({ queueRows: [] });
      await service.drainQueue(new Date('2026-07-20T00:00:00Z'));
      const drainSelect = prisma.$queryRaw.mock.calls[0][0];
      expect(String(drainSelect.sql)).toContain(
        "date_trunc('month', last_attempt_at)",
      );
      expect(String(drainSelect.sql)).toContain('promoted_at IS NULL');
      expect(String(drainSelect.sql)).toContain('ORDER BY enqueued_at ASC');
    });
  });

  describe('header-answer frequency (§2(e))', () => {
    it('first answer remembers, second within the TTL enqueues, later answers stop hitting the DB', async () => {
      const { service, prisma } = makeHarness({});
      service.noteHeaderAnswer(PLACE_ID);
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      service.noteHeaderAnswer(PLACE_ID);
      // fire-and-forget → flush microtasks
      await Promise.resolve();
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      const insert = prisma.$executeRaw.mock.calls[0][0];
      expect(insert.values).toContain('header_answers');
      // Hot header place: no further DB hits per request.
      service.noteHeaderAnswer(PLACE_ID);
      service.noteHeaderAnswer(PLACE_ID);
      await Promise.resolve();
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('the memory TTL reuses the §2 30d region-observation constant (one knob)', () => {
      expect(HEADER_ANSWER_MEMORY_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
    });
  });
});
