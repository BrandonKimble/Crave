/**
 * @script-class: probe
 * @finding: NOT YET BANKED — record what this probe answered, or delete it.
 *
 * A banked probe's value is the RECORDED RESULT, kept so the finding stays
 * reproducible. This one has no runner and no written-down finding: the
 * F414 sweep (2026-08-02) could establish the first fact mechanically but
 * not the second, and inventing one would be worse than leaving it visible.
 * Until a finding is written here, this file is a deletion candidate.
 */
import 'dotenv/config';
process.env.PROCESS_ROLE = 'all';
process.env.LLM_BATCH_POLL_ENABLED = 'false';

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SpendAnalyticsService } from '../src/modules/external-integrations/shared/spend-analytics.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

/**
 * One-off / on-demand runner for the nightly spend-rate refresh
 * (SpendAnalyticsService.refreshUnitCosts) — same code the worker cron runs
 * at 03:40. Point DATABASE_URL at the target DB. Useful right after
 * deploying new rate classes, when an estimate needs rates the nightly
 * hasn't published yet.
 */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const analytics = app.get(SpendAnalyticsService);
  const rows = await analytics.refreshUnitCosts();
  for (const row of rows) {
    process.stdout.write(
      `${row.workClass} / ${row.unit}: ${row.microUsdPerUnit.toFixed(4)} (n=${row.sampleUnits})\n`,
    );
  }
  await app.close();
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
