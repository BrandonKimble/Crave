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
 * and double-spending vendor pools. Scripts call `stopCronsForScript(app)`
 * immediately after createApplicationContext; a lockdown spec
 * (shared/testing/script-containment.spec.ts) fails on any that forget.
 *
 * THE APP itself needs nothing here (audit 2026-08-02, F412). A
 * `stopCronsUnlessWorker(app)` used to be called from main.ts and introduced
 * there as "ONE chokepoint for which process runs scheduled work" — but since
 * the Railway cutover it had been an EMPTY function, so the sentence was
 * false and a future reader adding cron logic would have added it to a no-op.
 * The real chokepoint is the ScheduleModule gate in app.module.ts; its
 * hard-won explanation moved there, next to the decision it explains.
 */
import { INestApplicationContext } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';

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
 * Script chokepoint: a script is NEVER the scheduled worker, regardless of
 * PROCESS_ROLE (which defaults to 'all' — exactly why scripts used to boot
 * live crons). Call this right after createApplicationContext, before any
 * awaited work gives a cron its first tick.
 */
export const stopCronsForScript = (app: INestApplicationContext): void => {
  stopAllRegisteredCrons(app, 'script runtime');
};
