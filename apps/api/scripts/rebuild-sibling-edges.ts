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
import { EntitySiblingEdgeBuilderService } from '../src/modules/entity-text-search/entity-sibling-edge-builder.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

/**
 * Manually rebuild `derived_entity_sibling_edges` (dense co-inclusion siblings).
 * Thin wrapper over the SAME builder the daily 4AM cron uses
 * (EntitySiblingEdgeBuilderService.rebuildAll) — use after a bulk embedding
 * backfill, after changing FETCH_N/PERSIST_N, or for the first population.
 *
 *   yarn workspace api ts-node scripts/rebuild-sibling-edges.ts
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (m = '') => process.stdout.write(`${m}\n`);

  try {
    const builder = app.get(EntitySiblingEdgeBuilderService);
    out('Rebuilding sibling edges…');
    // runNow(), not the builder's own rebuild: a manual rebuild gets the SAME
    // law as the cron — disable flag, in-flight guard, and the zero-output
    // critical alert. null = the guard declined (flag off / already running).
    const result = await builder.runNow();
    if (!result) {
      out('Skipped: the rebuild guard declined (disable flag or in-flight).');
      return;
    }
    out(`Done: ${result.input} anchors → ${result.output} edges.`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
