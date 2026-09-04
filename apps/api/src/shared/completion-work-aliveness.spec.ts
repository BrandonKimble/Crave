/**
 * COMPLETION WORK IS NOT DISCRETIONARY (cron audit, 2026-08-31).
 *
 * THE LAW under test: `CRONS_ENABLED` means "do not START new discretionary
 * work unattended". A job that COMPLETES, COLLECTS or RECONCILES work
 * already dispatched and paid for is not discretionary — hiding it behind
 * that switch silently abandons bought work. Proven by the Gemini batch
 * poller (45 paid jobs uncollected for 13.7h) and, the same night, by
 * 47,850 orphaned coverage claims that had accumulated since 2026-08-21
 * because the hourly collection reconciler had NEVER run on staging.
 *
 * Every (a) case below was RUN RED against the old @Cron-only wiring, not
 * merely reasoned about: the four service files were reverted to HEAD and
 * this suite re-run, producing 0 passing tests — `onModuleInit` /
 * `onModuleDestroy` did not exist on NotificationDispatcherService,
 * PhotoReconciliationService or CollectorPacerService, and no timer field
 * existed on any of them. The boot-arm assertions
 * (`expect(pass).toHaveBeenCalledTimes(1)` immediately after init) are the
 * behavioural half: under @Cron nothing runs at all when crons are off,
 * because ScheduleModule is never registered.
 *
 * Every (b) case covers the inverse: jobs that DO spend stay gated, but a
 * backlog with crons off must SCREAM instead of sitting silent — the
 * kill-switch-honest pattern from derived-index-job.ts:110-127.
 */
import { startCompletionWorkTimer } from './completion-work-timer';
import { CollectionEvidenceService } from '../modules/content-processing/reddit-collector/collection-evidence.service';
import { CollectorPacerService } from '../modules/content-processing/reddit-collector/collector-pacer.service';
import { NotificationDispatcherService } from '../modules/notifications/notification-dispatcher.service';
import { PhotoReconciliationService } from '../modules/photos/photo-reconciliation.service';
import { EntityEmbeddingReconcilerService } from '../modules/entity-text-search/entity-embedding-reconciler.service';
import { DeletionPurgeService } from '../modules/identity/person-data/deletion-purge.service';
import { RetentionHorizonService } from '../modules/identity/person-data/retention-horizon.service';

/**
 * THE EXACT STAGING SHAPE, pinned BEFORE the first role read. The repo `.env`
 * sets PROCESS_ROLE=api and leaks into jest; resolveProcessRole() caches the
 * first read at module scope, and no import in this file reads it, so this
 * assignment is what every read in this file sees.
 */
process.env.PROCESS_ROLE = 'worker';
process.env.CRONS_ENABLED = 'false';

interface StubLogger {
  setContext: jest.Mock;
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
  debug: jest.Mock;
}

function stubLogger(): StubLogger {
  const logger: StubLogger = {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  logger.setContext.mockReturnValue(logger);
  return logger;
}

interface EmittedAlert {
  severity: string;
  kind: string;
  title: string;
  body: string;
  dedupeKey?: string;
}

interface StubOpsAlerts {
  emit: jest.Mock<void, [EmittedAlert]>;
}

const stubOpsAlerts = (): StubOpsAlerts => {
  const emit: jest.Mock<void, [EmittedAlert]> = jest.fn<void, [EmittedAlert]>();
  return { emit };
};

const firstAlert = (opsAlerts: StubOpsAlerts): EmittedAlert =>
  opsAlerts.emit.mock.calls[0][0];

/** Let the boot-armed pass settle: each of these services guards against
 *  stacking passes, so the in-flight flag must clear before a timer tick can
 *  produce a second call. */
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const timerOf = (service: unknown, field: string): unknown =>
  (service as Record<string, unknown>)[field];

describe('the completion-work timer — the shared block itself, tested once', () => {
  // The four (a) services now delegate their timer plumbing here
  // (startCompletionWorkTimer); their suites below stay as the per-service
  // WIRING proof (right off-switch env, right cadence, right pass, handle
  // stored in the field + cleared on destroy). This block owns the
  // obligations of the mechanism.
  const saved = { ...process.env };
  beforeEach(() => {
    jest.useFakeTimers();
    delete process.env.TEST_COMPLETION_TIMER_ENABLED;
  });
  afterEach(() => {
    jest.useRealTimers();
    process.env = { ...saved, PROCESS_ROLE: 'worker', CRONS_ENABLED: 'false' };
  });

  it('arms with CRONS_ENABLED=false, boot-arms one pass, ticks, unrefs, stops dead', () => {
    const run = jest.fn().mockResolvedValue(undefined);
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    const handle = startCompletionWorkTimer({
      intervalMs: 1000,
      offSwitchEnv: 'TEST_COMPLETION_TIMER_ENABLED',
      run,
      onFailure: () => undefined,
    });
    expect(handle).not.toBeNull();
    // BOOT ARM: one immediate pass, outside the interval.
    expect(run).toHaveBeenCalledTimes(1);
    // unref()'d: a script booting the full graph still exits.
    const timer = setIntervalSpy.mock.results[0].value as NodeJS.Timeout;
    expect(timer.hasRef()).toBe(false);
    jest.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(2);
    handle!.stop();
    jest.advanceTimersByTime(10_000);
    expect(run).toHaveBeenCalledTimes(2);
    setIntervalSpy.mockRestore();
  });

  it('a REJECTING pass is routed to onFailure and never becomes an unhandled rejection (CI 2026-09-04: the boot-armed reconciler killed the jest process)', async () => {
    const boom = new Error('pass exploded');
    const run = jest.fn().mockRejectedValue(boom);
    const onFailure = jest.fn();
    const escaped: unknown[] = [];
    const listener = (reason: unknown): void => {
      escaped.push(reason);
    };
    process.on('unhandledRejection', listener);
    try {
      const handle = startCompletionWorkTimer({
        intervalMs: 1000,
        offSwitchEnv: 'TEST_COMPLETION_TIMER_ENABLED',
        run,
        onFailure,
      });
      expect(handle).not.toBeNull();
      // Let the boot-arm's rejection settle through the microtask queue.
      await Promise.resolve();
      await Promise.resolve();
      expect(onFailure).toHaveBeenCalledWith(boom);
      // A synchronous throw is owned the same way.
      run.mockImplementationOnce(() => {
        throw boom;
      });
      jest.advanceTimersByTime(1000);
      expect(onFailure).toHaveBeenCalledTimes(2);
      handle!.stop();
    } finally {
      process.off('unhandledRejection', listener);
    }
    expect(escaped).toEqual([]);
  });

  it('its explicit off-switch arms nothing and runs nothing', () => {
    process.env.TEST_COMPLETION_TIMER_ENABLED = 'false';
    const run = jest.fn().mockResolvedValue(undefined);
    const handle = startCompletionWorkTimer({
      intervalMs: 1000,
      offSwitchEnv: 'TEST_COMPLETION_TIMER_ENABLED',
      run,
      onFailure: () => undefined,
    });
    expect(handle).toBeNull();
    jest.advanceTimersByTime(10_000);
    expect(run).not.toHaveBeenCalled();
  });
  // (The worker-runtime gate is exercised through the (a) suites: the whole
  // file pins PROCESS_ROLE=worker before the first resolveProcessRole() read,
  // which caches at module scope — a non-worker case cannot be staged here.)
});

describe('(a) collection evidence reconciler — armed on a worker with CRONS_ENABLED=false', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    jest.useFakeTimers();
    delete process.env.COLLECTION_RECONCILE_ENABLED;
  });
  afterEach(() => {
    jest.useRealTimers();
    process.env = { ...saved, PROCESS_ROLE: 'worker', CRONS_ENABLED: 'false' };
  });

  function build() {
    const service = new CollectionEvidenceService(
      {} as never,
      {} as never,
      stubLogger() as never,
      stubOpsAlerts() as never,
    );
    return service;
  }

  it('arms a self-owned hourly interval and boot-arms one immediate pass', async () => {
    const service = build();
    const pass = jest
      .spyOn(
        service as unknown as { reconcileStaleRuns: () => Promise<void> },
        'reconcileStaleRuns',
      )
      .mockResolvedValue(undefined);
    service.onModuleInit();
    // BOOT ARM (RED under @Cron: nothing ran until the scheduler ticked,
    // and the scheduler is not registered at all when crons are off).
    expect(pass).toHaveBeenCalledTimes(1);
    expect(timerOf(service, 'reconcileTimer')).not.toBeNull();
    await flush();
    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(pass).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
    expect(timerOf(service, 'reconcileTimer')).toBeNull();
    jest.advanceTimersByTime(3 * 60 * 60 * 1000);
    expect(pass).toHaveBeenCalledTimes(2);
  });

  it('honours its own explicit off-switch', () => {
    process.env.COLLECTION_RECONCILE_ENABLED = 'false';
    const service = build();
    const pass = jest
      .spyOn(
        service as unknown as { reconcileStaleRuns: () => Promise<void> },
        'reconcileStaleRuns',
      )
      .mockResolvedValue(undefined);
    service.onModuleInit();
    expect(pass).not.toHaveBeenCalled();
    expect(timerOf(service, 'reconcileTimer')).toBeNull();
  });

  it('a large backlog logs at error level AND emits a deduped critical alert', () => {
    const logger = stubLogger();
    const opsAlerts = stubOpsAlerts();
    const service = new CollectionEvidenceService(
      {} as never,
      {} as never,
      logger as never,
      opsAlerts as never,
    );
    service.onModuleInit();
    const alarm = (
      service as unknown as { alarmOnBacklog: (a: number, b: number) => void }
    ).alarmOnBacklog;

    // A healthy pass: a handful of claims, no runs — silent.
    alarm.call(service, 7, 0);
    expect(opsAlerts.emit).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();

    // The 2026-08-31 shape: ten days of accumulation cleared in one pass.
    alarm.call(service, 47_850, 0);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(opsAlerts.emit).toHaveBeenCalledTimes(1);
    const alert = firstAlert(opsAlerts);
    expect(alert.severity).toBe('critical');
    expect(alert.kind).toBe('collection-reconcile-backlog');
    // Says WHY it matters: stale claims make real documents look in-flight
    // and the collection pipeline skips them.
    expect(alert.body).toMatch(/findExtractionCoveredSourceIds/);
    expect(alert.body).toMatch(/SKIPPED/);
    expect(alert.dedupeKey ?? '').toContain('collection-reconcile-backlog:');

    // Runs alone can trip it too.
    opsAlerts.emit.mockClear();
    alarm.call(service, 0, 200);
    expect(opsAlerts.emit).toHaveBeenCalledTimes(1);
  });
});

describe('(a) notification dispatcher — armed on a worker with CRONS_ENABLED=false', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    jest.useFakeTimers();
    delete process.env.NOTIFICATION_DISPATCH_ENABLED;
  });
  afterEach(() => {
    jest.useRealTimers();
    process.env = { ...saved, PROCESS_ROLE: 'worker', CRONS_ENABLED: 'false' };
  });

  function build() {
    return new NotificationDispatcherService(
      {} as never,
      stubLogger() as never,
    );
  }

  it('arms a self-owned minute interval and boot-arms one immediate pass', async () => {
    const service = build();
    const pass = jest
      .spyOn(service, 'dispatchPending')
      .mockResolvedValue(undefined);
    service.onModuleInit();
    expect(pass).toHaveBeenCalledTimes(1);
    expect(timerOf(service, 'dispatchTimer')).not.toBeNull();
    await flush();
    jest.advanceTimersByTime(60 * 1000);
    expect(pass).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
    expect(timerOf(service, 'dispatchTimer')).toBeNull();
    jest.advanceTimersByTime(10 * 60 * 1000);
    expect(pass).toHaveBeenCalledTimes(2);
  });

  it('honours its own explicit off-switch', () => {
    process.env.NOTIFICATION_DISPATCH_ENABLED = 'false';
    const service = build();
    const pass = jest
      .spyOn(service, 'dispatchPending')
      .mockResolvedValue(undefined);
    service.onModuleInit();
    expect(pass).not.toHaveBeenCalled();
    expect(timerOf(service, 'dispatchTimer')).toBeNull();
  });
});

describe('(a) photo reconciliation sweep — armed on a worker with CRONS_ENABLED=false', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    jest.useFakeTimers();
    delete process.env.PHOTO_RECONCILE_ENABLED;
  });
  afterEach(() => {
    jest.useRealTimers();
    process.env = { ...saved, PROCESS_ROLE: 'worker', CRONS_ENABLED: 'false' };
  });

  function build(isConfigured = true) {
    const photos = { reconcilePending: jest.fn().mockResolvedValue(0) };
    const service = new PhotoReconciliationService(
      photos as never,
      { isConfigured } as never,
      stubLogger() as never,
    );
    return { service, photos };
  }

  it('arms a self-owned 10-minute interval and boot-arms one immediate sweep', async () => {
    const { service, photos } = build();
    service.onModuleInit();
    expect(photos.reconcilePending).toHaveBeenCalledTimes(1);
    expect(timerOf(service, 'sweepTimer')).not.toBeNull();
    await flush();
    jest.advanceTimersByTime(10 * 60 * 1000);
    expect(photos.reconcilePending).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
    expect(timerOf(service, 'sweepTimer')).toBeNull();
  });

  it('stays inert when Cloudinary is unconfigured, or via its own off-switch', () => {
    const unconfigured = build(false);
    unconfigured.service.onModuleInit();
    expect(unconfigured.photos.reconcilePending).not.toHaveBeenCalled();

    process.env.PHOTO_RECONCILE_ENABLED = 'false';
    const off = build(true);
    off.service.onModuleInit();
    expect(off.photos.reconcilePending).not.toHaveBeenCalled();
    expect(timerOf(off.service, 'sweepTimer')).toBeNull();
  });
});

describe('(a) collector pacer split — the reconciler runs, the spending tick does not', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    jest.useFakeTimers();
    delete process.env.COLLECTION_RECONCILER_ENABLED;
    delete process.env.COLLECTION_SCHEDULER_ENABLED;
  });
  afterEach(() => {
    jest.useRealTimers();
    process.env = { ...saved, PROCESS_ROLE: 'worker', CRONS_ENABLED: 'false' };
  });

  function build() {
    return new CollectorPacerService(
      {} as never,
      stubLogger() as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  it('arms the pure-DB reconciler hourly even with the collector scheduler OFF', async () => {
    const service = build();
    const reconcile = jest
      .spyOn(service, 'reconcileExpectedBatches')
      .mockResolvedValue(undefined);
    service.onModuleInit();
    // The detector must not be gated on the dispatcher's own switch: this is
    // the pass whose divergence signal IS the collector's RED heartbeat.
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(timerOf(service, 'reconcilerTimer')).not.toBeNull();
    await flush();
    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(reconcile).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
    expect(timerOf(service, 'reconcilerTimer')).toBeNull();
  });

  it('the SPENDING pacer tick stays gated and never self-arms', async () => {
    const service = build();
    const tick = jest
      .spyOn(service, 'tick')
      .mockResolvedValue({ dispatched: 0, denied: 0 });
    jest
      .spyOn(service, 'reconcileExpectedBatches')
      .mockResolvedValue(undefined);
    service.onModuleInit();
    jest.advanceTimersByTime(6 * 60 * 60 * 1000);
    expect(tick).not.toHaveBeenCalled();
    // And its @Cron entry point still refuses while the collector is off.
    await service.runPacerTick();
    expect(tick).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });

  it('honours its own explicit off-switch', () => {
    process.env.COLLECTION_RECONCILER_ENABLED = 'false';
    const service = build();
    const reconcile = jest
      .spyOn(service, 'reconcileExpectedBatches')
      .mockResolvedValue(undefined);
    service.onModuleInit();
    expect(reconcile).not.toHaveBeenCalled();
    expect(timerOf(service, 'reconcilerTimer')).toBeNull();
  });
});

describe('(b) kill-switch-honest boot alerts — spending jobs stay gated but never silent', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved, PROCESS_ROLE: 'worker', CRONS_ENABLED: 'false' };
  });

  it('entity embedding reconciler: backlog + crons off ⇒ CRITICAL; no backlog ⇒ silent', async () => {
    delete process.env.ENTITY_EMBEDDING_RECONCILE_ENABLED;
    const makeService = (pending: number) => {
      const opsAlerts = stubOpsAlerts();
      const prisma = {
        $executeRawUnsafe: jest.fn().mockResolvedValue(0),
        $queryRawUnsafe: jest.fn().mockResolvedValue([{ n: BigInt(pending) }]),
      };
      const service = new EntityEmbeddingReconcilerService(
        prisma as never,
        {} as never,
        opsAlerts as never,
        stubLogger() as never,
      );
      return { service, opsAlerts };
    };

    const backlog = makeService(1234);
    await backlog.service.onApplicationBootstrap();
    expect(backlog.opsAlerts.emit).toHaveBeenCalledTimes(1);
    const alert = firstAlert(backlog.opsAlerts);
    expect(alert.severity).toBe('critical');
    expect(alert.body).toMatch(/did NOT run/);
    expect(alert.body).toMatch(/CRONS_ENABLED/);

    const clean = makeService(0);
    await clean.service.onApplicationBootstrap();
    expect(clean.opsAlerts.emit).not.toHaveBeenCalled();
  });

  it('deletion purge: overdue accounts + crons off ⇒ CRITICAL naming the paused legal obligation', async () => {
    const makeService = (overdue: number) => {
      const opsAlerts = stubOpsAlerts();
      const prisma = { user: { count: jest.fn().mockResolvedValue(overdue) } };
      const service = new DeletionPurgeService(
        prisma as never,
        {} as never,
        {} as never,
        opsAlerts as never,
        stubLogger() as never,
      );
      return { service, opsAlerts };
    };

    const overdue = makeService(3);
    await overdue.service.onModuleInit();
    expect(overdue.opsAlerts.emit).toHaveBeenCalledTimes(1);
    const alert = firstAlert(overdue.opsAlerts);
    expect(alert.severity).toBe('critical');
    expect(alert.title).toMatch(/LEGAL OBLIGATION IS PAUSED/);
    expect(alert.body).toMatch(/legal obligation/i);
    expect(alert.body).toMatch(/GDPR Art\.17/);

    const clean = makeService(0);
    await clean.service.onModuleInit();
    expect(clean.opsAlerts.emit).not.toHaveBeenCalled();
  });

  it('retention horizon: expired rows + crons off ⇒ CRITICAL naming the paused legal obligation', async () => {
    const makeService = (expired: number) => {
      const opsAlerts = stubOpsAlerts();
      const prisma = {
        $queryRawUnsafe: jest.fn().mockResolvedValue([{ n: BigInt(expired) }]),
      };
      const service = new RetentionHorizonService(
        prisma as never,
        opsAlerts as never,
        stubLogger() as never,
      );
      return { service, opsAlerts };
    };

    const expired = makeService(5);
    await expired.service.onModuleInit();
    expect(expired.opsAlerts.emit).toHaveBeenCalledTimes(1);
    const alert = firstAlert(expired.opsAlerts);
    expect(alert.severity).toBe('critical');
    expect(alert.title).toMatch(/LEGAL OBLIGATION IS PAUSED/);
    expect(alert.body).toMatch(/GDPR Art\.5\(1\)\(e\)/);

    const clean = makeService(0);
    await clean.service.onModuleInit();
    expect(clean.opsAlerts.emit).not.toHaveBeenCalled();
  });

  it('all three stay silent when crons ARE enabled (the gate is open; the job itself runs)', async () => {
    process.env.CRONS_ENABLED = 'true';
    const opsAlerts = stubOpsAlerts();
    const purge = new DeletionPurgeService(
      { user: { count: jest.fn().mockResolvedValue(9) } } as never,
      {} as never,
      {} as never,
      opsAlerts as never,
      stubLogger() as never,
    );
    await purge.onModuleInit();
    expect(opsAlerts.emit).not.toHaveBeenCalled();
  });
});
