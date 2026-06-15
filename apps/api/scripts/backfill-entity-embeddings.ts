import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { EmbeddingService } from '../src/modules/external-integrations/llm/embedding.service';
import { buildEntityDoc } from '../src/modules/entity-text-search/entity-doc';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Backfill `core_entities.name_embedding` (pgvector) for the semantic recall lane.
 * Embeds the rich entity doc (name + aliases + type) for every searchable entity
 * (restaurant / food / *_attribute). By default only fills NULLs (catch-up for new
 * entities); pass `--reembed` to re-embed ALL (e.g. after the doc format changes).
 * Idempotent; re-runnable.
 *
 *   yarn workspace api ts-node scripts/backfill-entity-embeddings.ts [--reembed]
 */
const BATCH = 100;

function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}

async function main(): Promise<void> {
  const reembed = process.argv.includes('--reembed');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const out = (m = '') => process.stdout.write(`${m}\n`);

  try {
    const prisma = app.get(PrismaService);
    const embeddings = app.get(EmbeddingService);

    const rows = await prisma.$queryRawUnsafe<
      { entity_id: string; name: string; type: EntityType; aliases: string[] }[]
    >(
      `SELECT entity_id, name, type, aliases FROM core_entities
       WHERE type IN ('restaurant','food','food_attribute','restaurant_attribute')
         AND status = 'active'
         ${reembed ? '' : 'AND name_embedding IS NULL'}
       ORDER BY entity_id`,
    );
    out(`Backfilling ${rows.length} entity embeddings (reembed=${reembed})…`);

    const embedWithRetry = async (names: string[]): Promise<number[][]> => {
      for (let attempt = 1; ; attempt++) {
        try {
          return await embeddings.embed(names, 'RETRIEVAL_DOCUMENT');
        } catch (e) {
          if (attempt >= 5) throw e;
          const waitMs = 2000 * attempt;
          out(
            `  retry ${attempt} after error: ${e instanceof Error ? e.message : e}`,
          );
          await new Promise((r) => setTimeout(r, waitMs));
        }
      }
    };

    let done = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const vectors = await embedWithRetry(
        batch.map((r) => buildEntityDoc(r.name, r.aliases)),
      );
      await prisma.$transaction(
        batch.map((r, j) =>
          prisma.$executeRawUnsafe(
            `UPDATE core_entities SET name_embedding = $1::vector WHERE entity_id = $2::uuid`,
            toVectorLiteral(vectors[j]),
            r.entity_id,
          ),
        ),
      );
      done += batch.length;
      out(`  ${done}/${rows.length}`);
    }

    const remaining = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM core_entities WHERE name_embedding IS NULL AND type IN ('restaurant','food','food_attribute','restaurant_attribute') AND status='active'`,
    );
    out(`Done. Remaining NULL embeddings: ${remaining[0].n}`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
