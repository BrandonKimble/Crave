import { GeminiBatchService } from './gemini-batch.service';

/**
 * POLLER ALIVENESS + STALL ALARM (incident 2026-08-31: 45 batch jobs sat
 * 'submitted' for 13.7h on the staging worker because the poller was an
 * @Cron and ScheduleModule is not registered when CRONS_ENABLED is off).
 *
 * THE LAW under test: CRONS_ENABLED means "do not START new discretionary
 * work unattended". Collecting results of work already dispatched and PAID
 * FOR is not discretionary — the batch rail's completion half must be
 * alive whenever the worker runtime is alive, independent of the cron
 * switch.
 *
 * Spec (a) below was RED against the old @Cron-only wiring (the service
 * had no onModuleInit and never armed a timer of its own), and is GREEN
 * against the self-owned interval.
 */

const HOUR_MS = 60 * 60 * 1000;

function stubLogger() {
  return {
    setContext: jest.fn().mockReturnThis(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

interface JobFixture {
  jobId: string;
  status: string;
  updatedAt: Date;
  purpose: string;
}

/** Prisma stub whose findMany APPLIES the where clause to a fixture set —
 *  so the spec proves the stall query's shape (status-in + updatedAt-lt),
 *  not just that some callback ran. */
function buildService(jobs: JobFixture[] = []) {
  const findMany = jest.fn().mockImplementation(
    (args: {
      where: {
        status?: { in?: string[] };
        updatedAt?: { lt?: Date };
        OR?: unknown;
      };
    }) => {
      const statuses = args.where.status?.in;
      const cutoff = args.where.updatedAt?.lt;
      if (!statuses || !cutoff) return Promise.resolve([]);
      return Promise.resolve(
        jobs.filter(
          (job) => statuses.includes(job.status) && job.updatedAt < cutoff,
        ),
      );
    },
  );
  const prisma = {
    llmBatchJob: {
      findMany,
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const opsAlerts = { emit: jest.fn() };
  const service = new GeminiBatchService(
    prisma as never,
    stubLogger() as never,
    { record: jest.fn() } as never,
    { assertGeminiSpendOpen: jest.fn() } as never,
    { registerBreachReaper: jest.fn() } as never,
    opsAlerts as never,
    {
      warnIfUncontractedCaller: jest.fn(),
      batchTransportOps: () => ({}),
    } as never,
  );
  return { service, prisma, opsAlerts };
}

describe('(a) poller aliveness — the exact staging shape (worker, CRONS_ENABLED=false)', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    jest.useFakeTimers();
    // The exact staging worker shape the 2026-08-31 incident ran under.
    process.env.CRONS_ENABLED = 'false';
    process.env.PROCESS_ROLE = 'worker';
    delete process.env.LLM_BATCH_POLL_ENABLED;
    // PROCESS_ROLE is read through resolveProcessRole()'s lazy module-level
    // cache; this file makes no role read before onModuleInit, so setting
    // the env here is what the first read caches.
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = { ...savedEnv };
  });

  it('arms a self-owned 5-minute poll interval in onModuleInit and ticks poll()', () => {
    const { service } = buildService();
    const pollSpy = jest
      .spyOn(service, 'poll')
      .mockResolvedValue(undefined as never);
    // RED against the old wiring: the @Cron-only service had NO
    // onModuleInit member at all — this call itself was the failure.
    (service as unknown as { onModuleInit: () => void }).onModuleInit();
    expect(
      (service as unknown as { pollTimer: unknown }).pollTimer,
    ).not.toBeNull();
    expect(pollSpy).not.toHaveBeenCalled();
    jest.advanceTimersByTime(5 * 60 * 1000);
    expect(pollSpy).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(5 * 60 * 1000);
    expect(pollSpy).toHaveBeenCalledTimes(2);
    void service.onModuleDestroy();
  });

  it('runs the stall sweep once at boot, outside the poll loop', () => {
    const { service } = buildService();
    const stallSpy = jest
      .spyOn(service, 'checkForStalledJobs')
      .mockResolvedValue(undefined);
    (service as unknown as { onModuleInit: () => void }).onModuleInit();
    // Boot arm: fires immediately, before any interval tick — this is the
    // arm that can scream even when the poll loop itself is dead.
    expect(stallSpy).toHaveBeenCalledTimes(1);
    void service.onModuleDestroy();
  });

  it('honours the explicit off-switch (LLM_BATCH_POLL_ENABLED=false) — no timer, no boot sweep', () => {
    process.env.LLM_BATCH_POLL_ENABLED = 'false';
    const { service } = buildService();
    const stallSpy = jest.spyOn(service, 'checkForStalledJobs');
    (service as unknown as { onModuleInit: () => void }).onModuleInit();
    expect((service as unknown as { pollTimer: unknown }).pollTimer).toBeNull();
    expect(stallSpy).not.toHaveBeenCalled();
  });

  it('shutdown clears the interval', () => {
    const { service } = buildService();
    (service as unknown as { onModuleInit: () => void }).onModuleInit();
    void service.onModuleDestroy();
    expect((service as unknown as { pollTimer: unknown }).pollTimer).toBeNull();
    jest.advanceTimersByTime(30 * 60 * 1000);
    // No stray ticks after destroy.
  });
});

describe('(b) stall alarm — aged non-terminal jobs scream; fresh and terminal do not', () => {
  it('emits a CRITICAL deduped alert (per job per UTC day) for an aged non-terminal job only', async () => {
    const now = Date.now();
    const jobs: JobFixture[] = [
      // The incident shape: submitted, untouched for 13.7h.
      {
        jobId: 'job-stalled',
        status: 'submitted',
        updatedAt: new Date(now - 13.7 * HOUR_MS),
        purpose: 'collection',
      },
      // Fresh non-terminal: inside the 2h threshold — must NOT alarm.
      {
        jobId: 'job-fresh',
        status: 'submitted',
        updatedAt: new Date(now - 30 * 60 * 1000),
        purpose: 'collection',
      },
      // Terminal jobs, however old: done work never alarms.
      {
        jobId: 'job-ingested',
        status: 'ingested',
        updatedAt: new Date(now - 100 * HOUR_MS),
        purpose: 'collection',
      },
      {
        jobId: 'job-failed',
        status: 'failed',
        updatedAt: new Date(now - 100 * HOUR_MS),
        purpose: 'collection',
      },
    ];
    const { service, opsAlerts } = buildService(jobs);
    await service.checkForStalledJobs();

    expect(opsAlerts.emit).toHaveBeenCalledTimes(1);
    const alert = (opsAlerts.emit.mock.calls[0] as unknown[])[0] as {
      severity: string;
      kind: string;
      title: string;
      body: string;
      dedupeKey: string;
    };
    expect(alert.severity).toBe('critical');
    expect(alert.kind).toBe('llm-batch-stall');
    expect(alert.body).toContain('job-stalled');
    expect(alert.body).toContain('submitted');
    // The two real causes, named for the responder.
    expect(alert.body).toMatch(/nothing is polling/i);
    expect(alert.body).toMatch(/wedged/i);
    // Dedupe: one page per job per UTC day, not one per 5-minute tick.
    const utcDay = new Date().toISOString().slice(0, 10);
    expect(alert.dedupeKey).toBe(`llm-batch-stall:job-stalled:${utcDay}`);
  });

  it('never throws even when the DB read fails (alarming must not break the poll)', async () => {
    const { service, prisma, opsAlerts } = buildService();
    prisma.llmBatchJob.findMany.mockRejectedValue(new Error('db down'));
    await expect(service.checkForStalledJobs()).resolves.toBeUndefined();
    expect(opsAlerts.emit).not.toHaveBeenCalled();
  });
});
