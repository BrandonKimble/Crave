import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { FoodDedupeMergeService } from '../src/modules/content-processing/entity-resolver/food-dedupe-merge.service';

/**
 * Food dedupe-merge pass (see food-dedupe-merge.service.ts).
 *
 *   DEDUPE_DRY_RUN=1 yarn ts-node scripts/food-dedupe-merge.ts   # report only
 *   yarn ts-node scripts/food-dedupe-merge.ts                    # act
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const service = app.get(FoodDedupeMergeService);
    const summary = await service.run({
      dryRun: process.env.DEDUPE_DRY_RUN === '1',
      similarityFloor: Number(process.env.DEDUPE_SIMILARITY_FLOOR ?? 0.72),
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
