import Bull from 'bull';
import { resolveAppEnv, bullPrefixFor } from '../config/app-env';
import { isWorkerRuntime } from '../utils/process-role';
import {
  guardSpendBearingQueuesAtBoot,
  BootSpendGuardVerdict,
  QueueBacklogPort,
} from './worker-boot-spend-guard';

/**
 * The Redis half of the worker-boot spend guard: real Bull clients, opened
 * before Nest exists and closed the moment the verdict is in.
 *
 * The Redis coordinates and the Bull prefix are derived from the SAME
 * `bullPrefixFor(resolveAppEnv())` + `REDIS_*` env the app's
 * `BullModule.forRootAsync` uses (config/configuration.ts). A drift here
 * would have this guard inspecting one environment's queues while the worker
 * drains another's — the exact class of bug F420 fixed in job-control.ts.
 */
const bullConnectionOptions = (): Bull.QueueOptions => ({
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  prefix: bullPrefixFor(resolveAppEnv()),
});

export const createBullQueueBacklogPort = (
  open: (name: string) => Bull.Queue = (name) =>
    new Bull(name, bullConnectionOptions()),
): QueueBacklogPort & { closeAll: () => Promise<void> } => {
  const opened = new Map<string, Bull.Queue>();
  const queueFor = (name: string): Bull.Queue => {
    const existing = opened.get(name);
    if (existing) return existing;
    const created = open(name);
    opened.set(name, created);
    return created;
  };

  return {
    async countPreBootBacklog(queueName, bootAt) {
      // waiting + paused + delayed = everything that WILL be handed to a
      // processor. 'active' is excluded deliberately: a job another live
      // worker is mid-way through is not this worker's fossil to freeze.
      const jobs = await queueFor(queueName).getJobs([
        'waiting',
        'paused',
        'delayed',
      ]);
      return jobs.filter((job) => Number(job?.timestamp) < bootAt).length;
    },
    async isPaused(queueName) {
      return queueFor(queueName).isPaused();
    },
    async pause(queueName) {
      // GLOBAL pause (isLocal=false): Bull RENAMEs the wait list, so the
      // pause lives in Redis and outlives this process. Nothing else makes
      // "a human resumes deliberately" true across a restart loop.
      await queueFor(queueName).pause(false, true);
    },
    async closeAll() {
      await Promise.allSettled(
        Array.from(opened.values()).map((queue) => queue.close()),
      );
      opened.clear();
    },
  };
};

/**
 * Call this from `main.ts` BEFORE `NestFactory.create`. `@nestjs/bull` begins
 * consuming during module init, so this is the last moment at which "before
 * any spend-bearing job is drained" is provable.
 *
 * API-only runtimes never consume queues, so there is nothing to guard.
 * Never throws: a guard that can crash the boot is a worse outage than the
 * spend it prevents (and its own fail-closed path already pauses).
 */
export const runWorkerBootSpendGuard = async (): Promise<
  BootSpendGuardVerdict[]
> => {
  if (!isWorkerRuntime()) return [];
  const port = createBullQueueBacklogPort();
  try {
    return await guardSpendBearingQueuesAtBoot({
      port,
      bootAt: Date.now(),
    });
  } catch (error) {
    console.error('[BOOT-SPEND-GUARD] guard failed to run', error);
    return [];
  } finally {
    await port.closeAll();
  }
};
