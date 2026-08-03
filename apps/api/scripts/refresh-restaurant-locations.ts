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
import { RestaurantLocationEnrichmentService } from '../src/modules/restaurant-enrichment/restaurant-location-enrichment.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

/**
 * Volatile-data refresh for already-enriched locations, on the lean refresh
 * field mask (no atmosphere fields → cheaper SKU than first enrichment).
 *
 *   REFRESH_OLDER_THAN_DAYS=30 REFRESH_LIMIT=100 \
 *     yarn ts-node scripts/refresh-restaurant-locations.ts
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  try {
    const service = app.get(RestaurantLocationEnrichmentService);
    const summary = await service.refreshStaleLocations({
      olderThanDays: Number(process.env.REFRESH_OLDER_THAN_DAYS ?? 30),
      limit: Number(process.env.REFRESH_LIMIT ?? 100),
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
