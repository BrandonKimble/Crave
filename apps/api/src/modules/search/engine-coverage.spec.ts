import 'reflect-metadata';
import {
  EngineCoverageService,
  viewportEnvelopeSql,
} from './engine-coverage.service';

// ENGINE-COVERAGE (markets extermination leg 2): coverage = engine territory
// ground coverage of the viewport — §5 (territory = derived union of member
// grounds, never stored) through the §2.6 ground law (ONE geometry column;
// clip + area against it, no fallback arm). Output is the raw share + the
// engines present; NO thresholds live here (§16).

function createLogger() {
  const logger = {
    setContext: () => logger,
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return logger;
}

const BOUNDS = {
  northEast: { lat: 30.4, lng: -97.6 },
  southWest: { lat: 30.1, lng: -97.9 },
};

const ENGINE_A = '11111111-1111-1111-1111-111111111111';
const ENGINE_B = '22222222-2222-2222-2222-222222222222';

function createService(rows: unknown[]) {
  const prisma = { $queryRaw: jest.fn().mockResolvedValue(rows) };
  const service = new EngineCoverageService(
    prisma as never,
    createLogger() as never,
  );
  return { service, prisma };
}

describe('EngineCoverageService.resolveViewportCoverage', () => {
  it('returns the union share plus per-engine shares, sorted by share', async () => {
    const { service, prisma } = createService([
      { engineId: ENGINE_A, name: 'austin', share: 0.2, totalShare: 0.85 },
      { engineId: ENGINE_B, name: 'new-york', share: 0.7, totalShare: 0.85 },
    ]);
    const coverage = await service.resolveViewportCoverage(BOUNDS);
    expect(coverage.share).toBe(0.85);
    expect(coverage.engines).toEqual([
      { engineId: ENGINE_B, name: 'new-york', share: 0.7 },
      { engineId: ENGINE_A, name: 'austin', share: 0.2 },
    ]);
    // ONE round trip — the recursive territory CTE + clip runs as one query.
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('the query judges GROUND: territory grounds are unioned per engine and clipped to the view (overlap-correct), with the GiST prefilter', async () => {
    const { service, prisma } = createService([]);
    await service.resolveViewportCoverage(BOUNDS);
    const call = prisma.$queryRaw.mock.calls[0] as unknown as [{ sql: string }];
    const sql = call[0].sql;
    // §5: territory = member places + DAG descendants, derived at read.
    expect(sql).toContain('unnest(e.member_place_ids)');
    expect(sql).toContain('ANY(p.parent_place_ids)');
    // §2.6: ONE ground column; union-then-measure so overlapping member
    // grounds never double-count; && is the §2.5(c) candidate prefilter.
    expect(sql).toContain('place_geometries');
    expect(sql).toContain('ST_Union(ST_Intersection(pg.geometry, v.g))');
    expect(sql).toContain('pg.geometry && v.g');
    // No market shape anywhere near the judgment.
    expect(sql).not.toContain('market');
  });

  it('no engine ground in view → the uncovered state {share 0, engines []}', async () => {
    const { service } = createService([]);
    await expect(service.resolveViewportCoverage(BOUNDS)).resolves.toEqual({
      share: 0,
      engines: [],
    });
  });

  it('degenerate or missing bounds resolve uncovered WITHOUT querying', async () => {
    const { service, prisma } = createService([]);
    await expect(service.resolveViewportCoverage(null)).resolves.toEqual({
      share: 0,
      engines: [],
    });
    await expect(
      service.resolveViewportCoverage({
        northEast: { lat: 30.1, lng: -97.6 },
        southWest: { lat: 30.1, lng: -97.6 },
      } as never),
    ).resolves.toEqual({ share: 0, engines: [] });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('never throws — a query failure degrades to uncovered (search must not fail on coverage)', async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('pg')) };
    const service = new EngineCoverageService(
      prisma as never,
      createLogger() as never,
    );
    await expect(service.resolveViewportCoverage(BOUNDS)).resolves.toEqual({
      share: 0,
      engines: [],
    });
  });

  it('shares are clamped to [0,1] (float slop from planar area math must not leak)', async () => {
    const { service } = createService([
      {
        engineId: ENGINE_A,
        name: 'austin',
        share: 1.0000001,
        totalShare: -0.1,
      },
    ]);
    const coverage = await service.resolveViewportCoverage(BOUNDS);
    expect(coverage.share).toBe(0);
    expect(coverage.engines[0].share).toBe(1);
  });
});

describe('viewportEnvelopeSql (wrap-aware view ground)', () => {
  it('a plain viewport is one envelope', () => {
    const sql = viewportEnvelopeSql(BOUNDS);
    expect(sql?.sql ?? '').toContain('ST_MakeEnvelope');
    expect(sql?.sql ?? '').not.toContain('ST_Union');
  });

  it('an antimeridian crossing (SW.lng > NE.lng) is the union of two arms, never one seam-spanning rectangle', () => {
    const sql = viewportEnvelopeSql({
      northEast: { lat: 40, lng: -170 },
      southWest: { lat: 30, lng: 170 },
    } as never);
    expect(sql?.sql ?? '').toContain('ST_Union');
  });
});
