import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { EntityTextSearchService } from '../src/modules/entity-text-search/entity-text-search.service';

/**
 * P1.4 4.A — shared recall core inspection.
 *
 * Shows, per probe query, the two recall lanes (lexical FTS/trigram/phonetic vs
 * the pgvector semantic lane) and the RRF-fused `retrieveCandidates` shortlist —
 * the shared recall core that all three consumers will sit on top of. RRF is
 * rank-based and untuned (no weights/knobs); ordering here is RECALL, not final
 * relevance (that's the per-consumer Stage-2 reranker).
 *
 *   yarn workspace api ts-node scripts/entity-search-ab.ts "bacon egg and cheese" "shake shack"
 */
const DEFAULT_QUERIES = [
  'BEC',
  'bacon egg and cheese',
  'fried chicken sando',
  'pork bun',
  'soup dumplings',
  'spicy tuna roll',
  'matcha latte',
  'shake shack',
];

const LIMIT = 6;

async function main(): Promise<void> {
  const queries = process.argv.slice(2).length
    ? process.argv.slice(2)
    : DEFAULT_QUERIES;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const out = (m = '') => process.stdout.write(`${m}\n`);

  try {
    const search = app.get(EntityTextSearchService);
    const types: EntityType[] = ['restaurant', 'food'] as EntityType[];

    for (const q of queries) {
      const [lexical, semantic, recall] = await Promise.all([
        search.searchEntities(q, types, LIMIT, { allowPhonetic: true }),
        search.searchByEmbedding(q, types, LIMIT),
        search.retrieveCandidates(q, types, LIMIT, { poolSize: 50 }),
      ]);

      out('');
      out(`════ "${q}" ════`);
      out(
        '  LEXICAL                          │  EMBEDDING                       │  RRF RECALL (core)',
      );
      for (let i = 0; i < LIMIT; i++) {
        const l = lexical[i];
        const s = semantic[i];
        const r = recall[i];
        const lStr = l
          ? `${l.name} [${l.type[0]}] ${l.similarity.toFixed(2)} ${l.evidence}`
          : '—';
        const sStr = s
          ? `${s.name} [${s.type[0]}] ${s.similarity.toFixed(3)}`
          : '—';
        const src = r
          ? `${r.sparseRank != null ? 'L' : ''}${r.denseRank != null ? 'E' : ''}`
          : '';
        const rStr = r
          ? `${r.name} [${r.type[0]}] (${src}) rrf=${r.rrf.toFixed(4)}`
          : '—';
        out(
          `  ${lStr.padEnd(32).slice(0, 32)} │  ${sStr.padEnd(32).slice(0, 32)} │  ${rStr}`,
        );
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
