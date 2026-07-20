import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { EmbeddingService } from '../src/modules/external-integrations/llm/embedding.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Pre-warm the query-embedding cache so the always-on dense autocomplete lane is
 * instant for real traffic from the first keystroke. Sources (bounded, the part
 * that matters): every active entity name + its aliases, plus the top historical
 * search queries. Embeddings are immutable, so this is safe to re-run (already-
 * cached terms are skipped) and ideal to run on deploy + on a periodic refresh.
 *
 *   yarn workspace api ts-node scripts/warm-query-embedding-cache.ts [topQueries=2000]
 */
async function main(): Promise<void> {
  const topQueries = Number(process.argv[2] ?? 2000);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const out = (m = '') => process.stdout.write(`${m}\n`);
  try {
    const embeddings = app.get(EmbeddingService);
    const prisma = app.get(PrismaService);

    const entityRows = await prisma.$queryRawUnsafe<
      { name: string; aliases: string[] }[]
    >(
      `SELECT name, COALESCE(aliases, '{}') AS aliases
       FROM core_entities
       WHERE status = 'active' AND name_embedding IS NOT NULL`,
    );
    // Phase C: search history lives on the signals ledger (kind='search',
    // subject_text = the normalized query term).
    const queryRows = await prisma.$queryRawUnsafe<{ query_text: string }[]>(
      `SELECT subject_text AS query_text
       FROM signals
       WHERE kind = 'search'
         AND subject_text IS NOT NULL AND length(trim(subject_text)) >= 3
       GROUP BY subject_text
       ORDER BY count(*) DESC
       LIMIT $1`,
      topQueries,
    );

    const terms = [
      ...entityRows.flatMap((r) => [r.name, ...(r.aliases ?? [])]),
      ...queryRows.map((r) => r.query_text),
    ];
    out(
      `warming ${terms.length} terms (${entityRows.length} entities + aliases, ${queryRows.length} top queries)…`,
    );

    const result = await embeddings.warmQueryCache(terms);
    out(
      `done: ${result.embedded} embedded, ${result.alreadyCached} already cached.`,
    );
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
