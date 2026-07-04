import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { EntityEmbeddingReconcilerService } from '../src/modules/entity-text-search/entity-embedding-reconciler.service';

/**
 * Manually fill `core_entities.name_embedding` (pgvector) for the semantic recall
 * lane. This is a thin wrapper over the SAME reconciler the scheduled sweep uses
 * (EntityEmbeddingReconcilerService) — normal operation needs no manual run; use
 * this to force a pass or, with `--reembed`, re-embed ALL active searchable
 * entities after the entity-doc format changes.
 *
 *   yarn workspace api ts-node scripts/backfill-entity-embeddings.ts [--reembed]
 */
async function main(): Promise<void> {
  const reembed = process.argv.includes('--reembed');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const out = (m = '') => process.stdout.write(`${m}\n`);

  try {
    const reconciler = app.get(EntityEmbeddingReconcilerService);
    out(`Backfilling entity embeddings (reembed=${reembed})…`);
    const { embedded, remaining } = await reconciler.reconcilePending({
      reembedAll: reembed,
    });
    out(`Done. Embedded ${embedded}. Remaining missing/stale: ${remaining}`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
