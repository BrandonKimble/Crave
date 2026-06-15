import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { EntityTextSearchService } from '../src/modules/entity-text-search/entity-text-search.service';
import { EmbeddingService } from '../src/modules/external-integrations/llm/embedding.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * P1.4 increment 4.1 — embedding-recall A/B for entity search.
 *
 * Compares the current lexical matcher (EntityTextSearchService: prefix + FTS +
 * trigram + phonetic) against a semantic embedding kNN, side by side, on a set of
 * probe queries. Answers "do embeddings get us toward Google-level suggestions,
 * and for which query shapes?" before deciding whether to add a semantic lane.
 *
 * Non-disruptive: reads only, embeds the corpus in-memory (no new infra).
 *
 *   yarn workspace api ts-node scripts/entity-search-ab.ts "bacon egg and cheese" "BEC" "fried chicken sando"
 */
const DEFAULT_QUERIES = [
  'BEC',
  'bacon egg and cheese',
  'fried chicken sando',
  'pork bun',
  'soup dumplings',
  'spicy tuna roll',
  'matcha latte',
  'shake shack', // lexical proper-noun control
];

const LIMIT = 6;

function cosine(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

async function main(): Promise<void> {
  const queries = process.argv.slice(2).length
    ? process.argv.slice(2)
    : DEFAULT_QUERIES;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const out = (m = '') => process.stdout.write(`${m}\n`);

  try {
    const prisma = app.get(PrismaService);
    const search = app.get(EntityTextSearchService);
    const embeddings = app.get(EmbeddingService);

    // Load + embed the searchable corpus (restaurants + foods) once, in-memory.
    const rows = await prisma.entity.findMany({
      where: { type: { in: ['restaurant', 'food'] }, status: 'active' },
      select: { entityId: true, name: true, type: true },
    });
    out(`Embedding ${rows.length} entities (RETRIEVAL_DOCUMENT)…`);
    const docVecs = await embeddings.embed(
      rows.map((r) => r.name),
      'RETRIEVAL_DOCUMENT',
    );

    const types: EntityType[] = ['restaurant', 'food'] as EntityType[];

    for (const q of queries) {
      const [lexical, [qVec]] = await Promise.all([
        search.searchEntities(q, types, LIMIT, { allowPhonetic: true }),
        embeddings.embed([q], 'RETRIEVAL_QUERY'),
      ]);
      const semantic = rows
        .map((r, i) => ({ r, score: cosine(qVec, docVecs[i]) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, LIMIT);

      out('');
      out(`════ "${q}" ════`);
      out('  LEXICAL (current matcher)            │  EMBEDDING (semantic kNN)');
      for (let i = 0; i < LIMIT; i++) {
        const l = lexical[i];
        const s = semantic[i];
        const lStr = l
          ? `${l.name} [${l.type[0]}] ${l.similarity.toFixed(2)} ${l.evidence}`
          : '—';
        const sStr = s
          ? `${s.r.name} [${s.r.type[0]}] ${s.score.toFixed(3)}`
          : '—';
        out(`  ${lStr.padEnd(36).slice(0, 36)} │  ${sStr}`);
      }
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
