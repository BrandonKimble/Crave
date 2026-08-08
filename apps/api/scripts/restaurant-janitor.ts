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
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { RestaurantJanitorService } from '../src/modules/restaurant-enrichment/restaurant-janitor.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

/**
 * Restaurant lifecycle janitor (see restaurant-janitor.service.ts).
 *
 *   JANITOR_DRY_RUN=1 yarn ts-node scripts/restaurant-janitor.ts   # report only
 *   yarn ts-node scripts/restaurant-janitor.ts                     # act
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  try {
    const janitor = app.get(RestaurantJanitorService);
    const summary = await janitor.run({
      dryRun: process.env.JANITOR_DRY_RUN === '1',
      movedRetryLimit: Number(process.env.JANITOR_RETRY_LIMIT ?? 25),
    });
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
