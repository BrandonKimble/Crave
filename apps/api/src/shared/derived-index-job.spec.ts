/**
 * THE DERIVED-INDEX LAW, proven at the base class.
 *
 * Two executed-proven findings live here:
 *   1. The law is UNBYPASSABLE — a subclass's rebuildAll() is protected, and
 *      the only public driver (runNow) routes through runGuarded. The
 *      compile-level half is the @ts-expect-error below: it FAILS THE BUILD
 *      if anyone re-widens rebuildAll to public.
 *   2. The kill-switch is HONEST — the boot self-heal respects the scheduler
 *      gate, and when gated off with an empty table it still SCREAMS.
 */
import { DerivedIndexJob } from './derived-index-job';
import type { EmitOpsAlertParams } from '../modules/external-integrations/shared/ops-alerts.service';
import { EntitySiblingEdgeBuilderService } from '../modules/entity-text-search/entity-sibling-edge-builder.service';
import { NameContainmentEdgeBuilderService } from '../modules/entity-text-search/name-containment-edge-builder.service';
import { OpenIntervalsBuilderService } from '../modules/search/open-intervals-builder.service';
import { EntityLexiconBuilderService } from '../modules/entity-text-search/entity-lexicon-builder.service';

describe('DerivedIndexJob: no subclass can be driven around the guard', () => {
  it('rebuildAll is NOT public on any subclass that has one (compile-level)', () => {
    const sibling = {} as EntitySiblingEdgeBuilderService;
    const containment = {} as NameContainmentEdgeBuilderService;
    // @ts-expect-error rebuildAll is protected — drive it with runNow().
    void sibling.rebuildAll;
    // @ts-expect-error rebuildAll is protected — drive it with runNow().
    void containment.rebuildAll;
    expect(true).toBe(true);
  });

  it('every subclass exposes exactly one public driver: runNow (compile-level)', () => {
    const drivers: Array<() => Promise<unknown>> = [
      // Typing each subclass into the base-class driver signature is the
      // consistency assertion: a subclass that renamed or dropped runNow, or
      // one that stopped extending DerivedIndexJob, fails to compile here.
      ...(
        [
          {} as EntitySiblingEdgeBuilderService,
          {} as NameContainmentEdgeBuilderService,
          {} as OpenIntervalsBuilderService,
          {} as EntityLexiconBuilderService,
        ] as DerivedIndexJob[]
      ).map((job) => () => job.runNow()),
    ];
    expect(drivers).toHaveLength(4);
  });
});

class TestJob extends DerivedIndexJob {
  protected readonly logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    setContext: jest.fn(),
  } as never;
  protected readonly derivedTable = 'derived_test_table';
  protected readonly disableFlagEnv = '';
  protected readonly alert = {
    kind: 'test_table_empty',
    title: 'Test table empty',
    consequence: 'Nothing real dies; this is a fixture.',
  };
  public rebuildCalls = 0;
  public rebuildResult = { input: 10, output: 10 };

  protected rebuild(): Promise<{ input: number; output: number }> {
    this.rebuildCalls += 1;
    return Promise.resolve(this.rebuildResult);
  }
}

const makeJob = (empty: boolean) => {
  const emit = jest.fn<void, [EmitOpsAlertParams]>();
  const prisma = {
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ empty }]),
  } as never;
  const job = new TestJob(prisma, { emit } as never);
  return { job, emit };
};

describe('DerivedIndexJob boot self-heal honours the cron kill-switch', () => {
  const originalCrons = process.env.CRONS_ENABLED;
  const originalRole = process.env.PROCESS_ROLE;

  afterEach(() => {
    process.env.CRONS_ENABLED = originalCrons;
    process.env.PROCESS_ROLE = originalRole;
    jest.resetModules();
  });

  const setCrons = (enabled: boolean) => {
    process.env.PROCESS_ROLE = 'worker';
    // process-role caches the ROLE, not the flag, so CRONS_ENABLED is live.
    process.env.CRONS_ENABLED = enabled ? 'true' : 'false';
  };

  it('crons ON + table EMPTY → rebuilds, no alert', async () => {
    setCrons(true);
    const { job, emit } = makeJob(true);
    await job.onModuleInit();
    expect(job.rebuildCalls).toBe(1);
    expect(emit).not.toHaveBeenCalled();
  });

  it('crons ON + table POPULATED → no rebuild, no alert', async () => {
    setCrons(true);
    const { job, emit } = makeJob(false);
    await job.onModuleInit();
    expect(job.rebuildCalls).toBe(0);
    expect(emit).not.toHaveBeenCalled();
  });

  it('crons OFF + table EMPTY → NO rebuild, but a critical alert', async () => {
    setCrons(false);
    const { job, emit } = makeJob(true);
    await job.onModuleInit();
    expect(job.rebuildCalls).toBe(0);
    expect(emit).toHaveBeenCalledTimes(1);
    const payload = emit.mock.calls[0][0];
    expect(payload.severity).toBe('critical');
    expect(payload.kind).toBe('test_table_empty');
    // The operator must learn BOTH facts: it is empty, and nothing is coming.
    expect(payload.body).toContain('EMPTY');
    expect(payload.body).toContain('crons disabled');
  });

  it('crons OFF + table POPULATED → silent, nothing to say', async () => {
    setCrons(false);
    const { job, emit } = makeJob(false);
    await job.onModuleInit();
    expect(job.rebuildCalls).toBe(0);
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('runNow carries the law', () => {
  it('emits the zero-output scream for a manual run, like the cron does', async () => {
    const { job, emit } = makeJob(false);
    job.rebuildResult = { input: 17_000, output: 0 };
    const result = await job.runNow();
    expect(result).toEqual({ input: 17_000, output: 0 });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0].severity).toBe('critical');
  });

  it('returns the counts of a healthy run', async () => {
    const { job, emit } = makeJob(false);
    await expect(job.runNow()).resolves.toEqual({ input: 10, output: 10 });
    expect(emit).not.toHaveBeenCalled();
  });
});
