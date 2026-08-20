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
import { ItemDedupeMergeService } from '../src/modules/content-processing/entity-resolver/food-dedupe-merge.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

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
  stopCronsForScript(app);
  try {
    const service = app.get(ItemDedupeMergeService);
    const summary = await service.run({
      // Dry-run by DEFAULT (red team 2026-08-19): a destructive default on
      // a self-declared deletion-candidate script was the worst pairing in
      // the directory — acting now requires the explicit --apply every
      // other writer uses.
      dryRun: !process.argv.includes('--apply'),
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
