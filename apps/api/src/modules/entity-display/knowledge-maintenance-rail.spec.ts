import { KnowledgeMaintenanceService } from './knowledge-maintenance.service';
import type { LabelSweepService, SweepResult } from './label-sweep.service';
import type { VocabularyGenerator } from './vocabulary-generator';
import type { ConceptSatisfiesService } from '../content-processing/entity-resolver/concept-satisfies.service';
import type { AdvisoryLockService } from '../../shared/advisory-lock/advisory-lock.service';
import type { RestaurantNameCensusService } from '../content-processing/entity-resolver/restaurant-name-census.service';

/**
 * THE RAIL'S WAITING CONTRACT (red team 2026-08-12): locale sweeps are
 * independent, so the nightly runs them CONCURRENTLY under one shared
 * deadline sized to the rail's own period — and one locale's failure never
 * starves the locales after it or the satisfies pass.
 *
 * Mutation proofs: revert runPass to the old `for … await` loop and the
 * concurrency test fails (locale B never starts before A resolves); drop
 * `deadlineAt` from the sweep call and the deadline test fails; restore the
 * single try/catch around the whole pass and the isolation test fails
 * (satisfies is skipped after a locale rejects).
 */
describe('knowledge maintenance rail — concurrent, isolated, deadlined', () => {
  const sweepResult = (locale: string): SweepResult => ({
    locale,
    due: 0,
    requested: 0,
    generated: 0,
    written: 0,
    autoApproved: 0,
    surfacesOffered: 0,
    surfacesBanked: 0,
    surfacesWonOnAppeal: 0,
    surfacesBlocked: 0,
    unanswered: 0,
  });

  const advisoryLock = {
    withAdvisoryLock: jest.fn(async (_key: number, fn: () => Promise<void>) => {
      await fn();
      return { acquired: true, result: undefined };
    }),
  } as unknown as AdvisoryLockService;

  function build(overrides: {
    locales: string[];
    sweep: jest.Mock;
    satisfies?: jest.Mock;
    census?: jest.Mock;
  }) {
    const satisfies = overrides.satisfies ?? jest.fn().mockResolvedValue({});
    const census =
      overrides.census ??
      jest.fn().mockResolvedValue({
        scanned: 0,
        alreadyDecided: 0,
        docket: 0,
        refusedByBudget: false,
        hearing: null,
      });
    const service = new KnowledgeMaintenanceService(
      {
        sweepLocales: () => overrides.locales,
        sweep: overrides.sweep,
      } as unknown as LabelSweepService,
      {} as VocabularyGenerator,
      { run: satisfies } as unknown as ConceptSatisfiesService,
      advisoryLock,
      { run: census } as unknown as RestaurantNameCensusService,
    );
    return { service, satisfies, census };
  }

  it('locale sweeps run CONCURRENTLY — the second starts before the first resolves', async () => {
    const started: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const sweep = jest.fn(async (locale: string) => {
      started.push(locale);
      if (locale === 'en') {
        // 'en' resolves ONLY once 'es' has started. A serial loop deadlocks
        // here forever; the test would time out — so a passing run IS the
        // proof of overlap.
        await firstGate;
      } else {
        releaseFirst();
      }
      return sweepResult(locale);
    });
    const { service } = build({ locales: ['en', 'es'], sweep });
    await service.runOnce('manual');
    expect(started).toEqual(['en', 'es']);
  }, 5000);

  it('every sweep receives the SAME deadline, sized to the rail period (24h)', async () => {
    const before = Date.now();
    const sweep = jest.fn((locale: string, options: { deadlineAt?: number }) =>
      Promise.resolve(sweepResult(options ? locale : locale)),
    );
    const { service } = build({ locales: ['en', 'es'], sweep });
    await service.runOnce('manual');
    const deadlines = sweep.mock.calls.map((call) => call[1].deadlineAt);
    expect(deadlines).toHaveLength(2);
    expect(deadlines[0]).toBe(deadlines[1]);
    const dayMs = 24 * 60 * 60 * 1000;
    expect(deadlines[0]).toBeGreaterThanOrEqual(before + dayMs);
    expect(deadlines[0]).toBeLessThanOrEqual(Date.now() + dayMs);
  });

  it('one locale failing is ISOLATED — the other locale and satisfies still run', async () => {
    const sweep = jest.fn((locale: string) => {
      if (locale === 'en')
        return Promise.reject(new Error('en generator exploded'));
      return Promise.resolve(sweepResult(locale));
    });
    const satisfies = jest.fn().mockResolvedValue({ judged: 0 });
    const { service } = build({ locales: ['en', 'es'], sweep, satisfies });
    await service.runOnce('manual');
    expect(sweep).toHaveBeenCalledTimes(2);
    expect(satisfies).toHaveBeenCalledTimes(1);
  });

  /**
   * STEP 3 — the restaurant-name census (flywheel arming 2026-08-30): its
   * OWN default-off flag under the rail, gated both ways, failures isolated.
   * Mutation proofs: flip the flag's fallback to true and the default-off
   * test fails; move the census call above the try/catch and the isolation
   * test fails.
   */
  describe('restaurant-name census step', () => {
    const FLAG = 'RESTAURANT_NAME_CENSUS_ENABLED';
    let saved: string | undefined;
    beforeEach(() => {
      saved = process.env[FLAG];
      delete process.env[FLAG];
    });
    afterEach(() => {
      if (saved === undefined) delete process.env[FLAG];
      else process.env[FLAG] = saved;
    });

    it('DEFAULT OFF: with no flag set, the census never runs even when the rail does', async () => {
      const sweep = jest.fn((locale: string) =>
        Promise.resolve(sweepResult(locale)),
      );
      const { service, census } = build({ locales: ['en'], sweep });
      await service.runOnce('manual');
      expect(census).not.toHaveBeenCalled();
    });

    it('armed: RESTAURANT_NAME_CENSUS_ENABLED=true runs the census, applying (dryRun:false)', async () => {
      process.env[FLAG] = 'true';
      const sweep = jest.fn((locale: string) =>
        Promise.resolve(sweepResult(locale)),
      );
      const { service, census } = build({ locales: ['en'], sweep });
      await service.runOnce('manual');
      expect(census).toHaveBeenCalledWith({ dryRun: false });
    });

    it('a census failure is ISOLATED — the rail still completes', async () => {
      process.env[FLAG] = 'true';
      const sweep = jest.fn((locale: string) =>
        Promise.resolve(sweepResult(locale)),
      );
      const census = jest.fn().mockRejectedValue(new Error('court down'));
      const { service } = build({ locales: ['en'], sweep, census });
      await expect(service.runOnce('manual')).resolves.toBeUndefined();
      expect(census).toHaveBeenCalledTimes(1);
    });
  });
});
