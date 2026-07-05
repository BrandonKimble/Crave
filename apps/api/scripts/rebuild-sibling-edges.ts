import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { EntitySiblingEdgeBuilderService } from '../src/modules/entity-text-search/entity-sibling-edge-builder.service';

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
  const out = (m = '') => process.stdout.write(`${m}\n`);

  try {
    const builder = app.get(EntitySiblingEdgeBuilderService);
    out('Rebuilding sibling edges…');
    const { anchors, edges } = await builder.rebuildAll();
    out(`Done: ${anchors} anchors → ${edges} edges.`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
