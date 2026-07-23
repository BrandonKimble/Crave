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
      noMatchAttemptThreshold: Number(process.env.JANITOR_THRESHOLD ?? 3),
      retryLimit: Number(process.env.JANITOR_RETRY_LIMIT ?? 25),
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
