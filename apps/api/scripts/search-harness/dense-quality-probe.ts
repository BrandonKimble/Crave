import { EntityType } from '@prisma/client';
import { Logger } from '@nestjs/common';
import { bootstrap, DEFAULT_MARKET_KEY } from './_shared';
import { EntityTextSearchService } from '../../src/modules/entity-text-search/entity-text-search.service';

/**
 * dense-quality-probe.ts — is the EMBEDDING lane actually good at semantic ranking?
 * Runs PURE dense recall (searchByEmbedding, no lexical) for semantic queries and
 * dumps the top hits by cosine. If the top rows are semantically relevant with a
 * clear score gradient, the embedding is good and closeness can lean on it. If the
 * top rows are junk / flat, the embedding is weak. Run AFTER the null-embedding
 * back-fill (else the pool is polluted).
 *
 *   yarn workspace api ts-node scripts/search-harness/dense-quality-probe.ts
 */
const QUERIES = [
  'breakfast sandwich',
  'bacon egg and cheese',
  'noodle soup',
  'spicy noodle dish',
  'italian pasta',
  'cold sweet dessert',
  'fried chicken sandwich',
];

async function main(): Promise<void> {
  const app = await bootstrap();
  try {
    const search = app.get(EntityTextSearchService);
    for (const q of QUERIES) {
      const dense = await search.searchByEmbedding(q, [EntityType.food], 12, {
        marketKey: DEFAULT_MARKET_KEY,
      });
      console.log(
        `\n=== DENSE-only "${q}"  (top ${dense.length} by cosine, no lexical) ===`,
      );
      for (const m of dense) {
        console.log(`  ${m.similarity.toFixed(3)}  ${m.name}`);
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
