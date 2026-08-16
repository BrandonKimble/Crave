import { VocabularyMaintenanceService } from './vocabulary-maintenance.service';
import type { JudgedVocabularyService } from './judged-vocabulary.service';
import type { AdvisoryLockService } from '../../../shared/advisory-lock/advisory-lock.service';

/**
 * THE VERDICT-CACHE POLL MUST TICK ON THE API PROCESS (foundation red team
 * #1, 2026-08-15). ScheduleModule.forRoot() is registered only under
 * `isSchedulerRuntime()`, so an @Interval on `refreshCache` was dead on
 * exactly the process A6 exists for: the api, whose cache goes stale while
 * the worker buys verdicts. The rail now starts a plain setInterval in
 * onModuleInit, ungated by the scheduler runtime. These specs boot the
 * service in a NON-scheduler context (PROCESS_ROLE=api) and observe the
 * tick — the proof the decorator could never give.
 */
describe('VocabularyMaintenanceService refresh poll', () => {
  const CACHE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

  let originalRole: string | undefined;
  let originalFlag: string | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
    originalRole = process.env.PROCESS_ROLE;
    originalFlag = process.env.VOCABULARY_MAINTENANCE_ENABLED;
    // A NON-scheduler runtime: PROCESS_ROLE=api never registers
    // ScheduleModule, which is the exact context the finding is about.
    process.env.PROCESS_ROLE = 'api';
    delete process.env.VOCABULARY_MAINTENANCE_ENABLED;
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalRole === undefined) delete process.env.PROCESS_ROLE;
    else process.env.PROCESS_ROLE = originalRole;
    if (originalFlag === undefined) {
      delete process.env.VOCABULARY_MAINTENANCE_ENABLED;
    } else {
      process.env.VOCABULARY_MAINTENANCE_ENABLED = originalFlag;
    }
  });

  const build = () => {
    const refreshIfChanged = jest.fn().mockResolvedValue(false);
    const vocabulary = {
      refreshIfChanged,
      drainPending: jest.fn(),
    } as unknown as JudgedVocabularyService;
    const advisoryLock = {
      withAdvisoryLock: jest.fn(),
    } as unknown as AdvisoryLockService;
    const service = new VocabularyMaintenanceService(vocabulary, advisoryLock);
    return { service, refreshIfChanged };
  };

  it('ticks refreshCache on a non-scheduler (api) runtime', async () => {
    const { service, refreshIfChanged } = build();
    service.onModuleInit();
    expect(refreshIfChanged).not.toHaveBeenCalled();

    jest.advanceTimersByTime(CACHE_REFRESH_INTERVAL_MS);
    // Let the async tick settle.
    await Promise.resolve();
    expect(refreshIfChanged).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(CACHE_REFRESH_INTERVAL_MS);
    await Promise.resolve();
    expect(refreshIfChanged).toHaveBeenCalledTimes(2);

    service.onModuleDestroy();
  });

  it('honours VOCABULARY_MAINTENANCE_ENABLED=false (no timer at all)', () => {
    process.env.VOCABULARY_MAINTENANCE_ENABLED = 'false';
    const { service, refreshIfChanged } = build();
    service.onModuleInit();
    jest.advanceTimersByTime(CACHE_REFRESH_INTERVAL_MS * 3);
    expect(refreshIfChanged).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });

  it('stops ticking after onModuleDestroy', async () => {
    const { service, refreshIfChanged } = build();
    service.onModuleInit();
    jest.advanceTimersByTime(CACHE_REFRESH_INTERVAL_MS);
    await Promise.resolve();
    expect(refreshIfChanged).toHaveBeenCalledTimes(1);

    service.onModuleDestroy();
    jest.advanceTimersByTime(CACHE_REFRESH_INTERVAL_MS * 3);
    await Promise.resolve();
    expect(refreshIfChanged).toHaveBeenCalledTimes(1);
  });
});
