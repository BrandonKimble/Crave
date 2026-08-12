import { KnowledgeMaintenanceService } from './knowledge-maintenance.service';
import type { LabelSweepService, SweepResult } from './label-sweep.service';
import type { VocabularyGenerator } from './vocabulary-generator';
import type { ConceptSatisfiesService } from '../content-processing/entity-resolver/concept-satisfies.service';
import type { AdvisoryLockService } from '../../shared/advisory-lock/advisory-lock.service';

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
  }) {
    const satisfies = overrides.satisfies ?? jest.fn().mockResolvedValue({});
    const service = new KnowledgeMaintenanceService(
      {
        sweepLocales: () => overrides.locales,
        sweep: overrides.sweep,
      } as unknown as LabelSweepService,
      {} as VocabularyGenerator,
      { run: satisfies } as unknown as ConceptSatisfiesService,
      advisoryLock,
    );
    return { service, satisfies };
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
});
