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
import { AppModule } from '../src/app.module';
import { PlaceEntityMergeService } from '../src/modules/restaurant-enrichment/restaurant-entity-merge.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

/**
 * Manual lever for the same-name duplicate sweep. THE rule lives in ONE
 * place — RestaurantEntityMergeService.sweepSameNameDuplicates (evidence
 * hierarchy: shared place/owned domain merge; two distinct owned domains
 * hold; else metro overlap; aggregator domains never count) — this script
 * only invokes it. Report by default; --apply to execute.
 *
 *   yarn workspace api ts-node scripts/merge-duplicate-restaurants.ts [--apply]
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (m = '') => process.stdout.write(`${m}\n`);

  try {
    const result = await app
      .get(PlaceEntityMergeService)
      .sweepSameNameDuplicates({ apply });
    for (const d of result.decisions) {
      out(
        `${d.verdict.toUpperCase().padEnd(5)} ${d.name}` +
          (d.verdict === 'merge'
            ? ` (${d.duplicateId} -> ${d.canonicalId})`
            : ''),
      );
    }
    out(
      `\n${apply ? 'APPLIED' : 'dry-run'}: merged=${result.merged} held=${result.held}`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
