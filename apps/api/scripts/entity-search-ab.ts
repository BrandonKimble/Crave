import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { EntityTextSearchService } from '../src/modules/entity-text-search/entity-text-search.service';
import { rerankForAutocomplete } from '../src/modules/entity-text-search/autocomplete-rerank';
import { PrismaService } from '../src/prisma/prisma.service';

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
    const prisma = app.get(PrismaService);
    const types: EntityType[] = ['restaurant', 'food'] as EntityType[];

    const popularityFor = async (
      ids: string[],
    ): Promise<Map<string, number>> => {
      if (ids.length === 0) return new Map();
      const rows = await prisma.$queryRawUnsafe<
        { entity_id: string; pop: bigint }[]
      >(
        `SELECT e.entity_id,
                COALESCE((SELECT SUM(c.mention_count) FROM core_restaurant_items c
                          WHERE c.restaurant_id = e.entity_id OR c.food_id = e.entity_id), 0) AS pop
         FROM core_entities e WHERE e.entity_id = ANY($1::uuid[])`,
        ids,
      );
      return new Map(rows.map((r) => [r.entity_id, Number(r.pop)]));
    };

    for (const q of queries) {
      const [lexical, semantic, recall] = await Promise.all([
        search.searchEntities(q, types, LIMIT, { allowPhonetic: true }),
        search.searchByEmbedding(q, types, LIMIT),
        search.retrieveCandidates(q, types, LIMIT, { poolSize: 50 }),
      ]);
      const popularity = await popularityFor(recall.map((c) => c.entityId));
      const ranked = rerankForAutocomplete(recall, popularity);

      // Fallback-mode probe: did the dense (embedding) lane run, or did lexical
      // recall suffice? (autocomplete latency optimization.)
      const fb = await search.retrieveCandidates(q, types, LIMIT, {
        poolSize: 50,
        denseMode: 'fallback',
      });
      const denseRan = fb.some((c) => c.denseRank != null);

      out('');
      out(
        `════ "${q}"  [fallback: dense lane ${denseRan ? 'RAN' : 'SKIPPED'}] ════`,
      );
      out(
        '  LEXICAL                          │  EMBEDDING                       │  AUTOCOMPLETE (reranked)',
      );
      for (let i = 0; i < LIMIT; i++) {
        const l = lexical[i];
        const s = semantic[i];
        const a = ranked[i];
        const lStr = l
          ? `${l.name} [${l.type[0]}] ${l.similarity.toFixed(2)} ${l.evidence}`
          : '—';
        const sStr = s
          ? `${s.name} [${s.type[0]}] ${s.similarity.toFixed(3)}`
          : '—';
        const tier =
          a?.sparseEvidence === 'exact'
            ? 'exact'
            : a?.sparseEvidence === 'prefix'
              ? 'prefix'
              : 'rel';
        const aStr = a
          ? `${a.name} [${a.type[0]}] ${tier} pop=${a.popularity}`
          : '—';
        out(
          `  ${lStr.padEnd(32).slice(0, 32)} │  ${sStr.padEnd(32).slice(0, 32)} │  ${aStr}`,
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
