import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProjectionRebuildService } from '../src/modules/content-processing/reddit-collector/projection-rebuild.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

/**
 * One-time backfill for the Crave Score v3 decay-ready mention ledger.
 *
 * `core_restaurant_item_mentions` is populated by `projection-rebuild` going
 * forward, but normal ingestion only rebuilds the restaurants that changed — so
 * on first deploy (and any time the table is reset) it would be empty for every
 * restaurant that hasn't been re-ingested since, and the scorer would read 0
 * endorsement for their dishes. Run this once after the migration to do a full
 * projection rebuild over every restaurant, which writes the records.
 *
 *   yarn crave-score:backfill-mentions
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  try {
    const prisma = app.get(PrismaService);
    const projection = app.get(ProjectionRebuildService);

    const rows = await prisma.$queryRaw<Array<{ entity_id: string }>>`
      SELECT entity_id FROM core_entities WHERE type = 'restaurant'
    `;
    const ids = rows.map((row) => row.entity_id);
    const BATCH = 200;
    const startedAt = Date.now();

    for (let i = 0; i < ids.length; i += BATCH) {
      await projection.rebuildForRestaurants(ids.slice(i, i + BATCH));
      console.log(
        `projection rebuilt ${Math.min(i + BATCH, ids.length)}/${ids.length}`,
      );
    }

    const [counts] = await prisma.$queryRaw<Array<{ recs: bigint }>>`
      SELECT COUNT(*) AS recs FROM core_restaurant_item_mentions
    `;
    console.log(
      `done: ${ids.length} restaurants, ${Number(counts.recs)} mention records, ${Date.now() - startedAt}ms`,
    );
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
