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
import { DishKnowledgeSynthesisService } from '../src/modules/content-processing/entity-resolver/dish-knowledge-synthesis.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

/**
 * Manual lever for the dish-knowledge synthesis pass (the "manual script" the
 * service header always promised). Same service the 5AM worker cron runs —
 * this exists for the collection-freeze-audit rehearsal ("run e2e on the seed
 * corpus and eyeball") and for ad-hoc catch-up runs.
 *
 *   yarn workspace api ts-node scripts/run-dish-knowledge-synthesis.ts [--limit=20] [--apply]
 *
 * DRY-RUN BY DEFAULT: prints per-dish proposed ingredients + aliases, writes
 * NOTHING (no stamp, no ingredient entities). Pass --apply to persist.
 * Cost: one Gemini call per 20 dishes.
 */
async function main(): Promise<void> {
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 20;
  const apply = process.argv.includes('--apply');
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error(`--limit must be a positive integer`);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (m = '') => process.stdout.write(`${m}\n`);

  try {
    const service = app.get(DishKnowledgeSynthesisService);
    out(
      `dish-knowledge synthesis — limit=${limit} mode=${apply ? 'APPLY' : 'dry-run'}`,
    );
    const summary = await service.run({ limit, dryRun: !apply });
    out(
      `done: dishes=${summary.dishesProcessed} ingredientsLinked=${summary.ingredientsLinked} ` +
        `ingredientEntitiesCreated=${summary.ingredientEntitiesCreated} aliasesAdded=${summary.aliasesAdded}`,
    );
    if (!apply) {
      out(
        'dry-run: per-dish proposals were logged above (info level); nothing was written.',
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
