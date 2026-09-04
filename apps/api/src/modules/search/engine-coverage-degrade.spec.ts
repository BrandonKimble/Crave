/**
 * ONE DEGRADE CONTRACT (red team 2026-09-04 S-5): the coverage resolver
 * never throws — a failing PostGIS read answers EMPTY with `degraded: true`
 * so a consumer can count the outage under its policy. RED against the old
 * service: the error path returned a plain EMPTY with no flag, and the
 * consumer's catch — the only place the policy was logged — was unreachable.
 */
import { EngineCoverageService } from './engine-coverage.service';

const BOUNDS = {
  northEast: { lat: 30.4, lng: -97.6 },
  southWest: { lat: 30.1, lng: -97.9 },
};

describe('EngineCoverageService degrade contract', () => {
  it('a failing coverage read resolves (never rejects) to a DEGRADED empty coverage', async () => {
    const prisma = {
      $queryRaw: jest.fn(() => Promise.reject(new Error('postgis down'))),
    };
    const logger = {
      setContext: jest.fn().mockReturnThis(),
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const service = new EngineCoverageService(prisma as never, logger as never);
    await expect(
      service.resolveViewportCoverage(BOUNDS as never),
    ).resolves.toEqual({ share: 0, engines: [], degraded: true });
    expect(logger.warn).toHaveBeenCalled();
  });
});
