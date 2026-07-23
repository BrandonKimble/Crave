/**
 * ONE implementation of "stop every registered @Cron in this process" —
 * the chokepoint main.ts's bootstrap always had, extracted so SCRIPT
 * processes get the same guarantee.
 *
 * WHY (wave-6 item 1a): every `NestFactory.createApplicationContext(AppModule)`
 * script boots the FULL module graph, which registers all ~20 @Cron jobs and
 * starts them ticking. A long-running script (seed-us-places, seed-coarse-
 * polygons, any vendor-drawing backfill) then silently runs the hourly crons
 * IN ADDITION to the real worker on :3000 — double-draining governed queues
 * and double-spending vendor pools. main.ts already stopped crons for
 * non-worker runtimes, but only inside bootstrap(); scripts never went
 * through it. Scripts call `stopCronsForScript(app)` immediately after
 * createApplicationContext; main.ts calls `stopCronsUnlessWorker(app)`.
 */
import { INestApplicationContext } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { isWorkerRuntime } from './process-role';

const stopAllRegisteredCrons = (
  app: INestApplicationContext,
  runtimeLabel: string,
): void => {
  let schedulerRegistry: SchedulerRegistry;
  try {
    schedulerRegistry = app.get(SchedulerRegistry);
  } catch {
    // Module graph without ScheduleModule (slim CLI modules) — no crons
    // exist in this process, nothing to stop.
    return;
  }
  const cronJobs = schedulerRegistry.getCronJobs();
  for (const job of cronJobs.values()) {
    void job.stop();
  }
  console.log(`[CRON] Stopped ${cronJobs.size} cron jobs (${runtimeLabel})`);
};

/**
 * main.ts bootstrap chokepoint: non-worker processes stop every registered
 * @Cron at boot. Covers all current and future crons by construction — no
 * per-service isWorkerRuntime guards to remember (with multiple dynos,
 * per-process in-flight latches would otherwise fire the same job on every
 * dyno).
 */
export const stopCronsUnlessWorker = (app: INestApplicationContext): void => {
  if (isWorkerRuntime()) {
    return;
  }
  stopAllRegisteredCrons(app, 'non-worker runtime');
};

/**
 * Script chokepoint: a script is NEVER the scheduled worker, regardless of
 * PROCESS_ROLE (which defaults to 'all' — exactly why scripts used to boot
 * live crons). Call this right after createApplicationContext, before any
 * awaited work gives a cron its first tick.
 */
export const stopCronsForScript = (app: INestApplicationContext): void => {
  stopAllRegisteredCrons(app, 'script runtime');
};
