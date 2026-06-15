import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { EmbeddingService } from '../src/modules/external-integrations/llm/embedding.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Backfill `core_entities.name_embedding` (pgvector) for the semantic recall lane.
 * Embeds every searchable entity (restaurant / food / *_attribute) whose embedding
 * is NULL — so it is both the one-time backfill and the catch-up for new entities
 * until an embed-on-create hook lands. Idempotent; re-runnable.
 *
 *   yarn workspace api ts-node scripts/backfill-entity-embeddings.ts
 */
const BATCH = 100;

function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const out = (m = '') => process.stdout.write(`${m}\n`);

  try {
    const prisma = app.get(PrismaService);
    const embeddings = app.get(EmbeddingService);

    const rows = await prisma.$queryRawUnsafe<
      { entity_id: string; name: string }[]
    >(
      `SELECT entity_id, name FROM core_entities
       WHERE name_embedding IS NULL
         AND type IN ('restaurant','food','food_attribute','restaurant_attribute')
         AND status = 'active'
       ORDER BY entity_id`,
    );
    out(`Backfilling ${rows.length} entity embeddings…`);

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
      const vectors = await embedWithRetry(batch.map((r) => r.name));
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
