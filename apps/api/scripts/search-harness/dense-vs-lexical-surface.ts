import { EntityType } from '@prisma/client';
import { Logger } from '@nestjs/common';
import { bootstrap, DEFAULT_MARKET_KEY } from './_shared';
import { EntityTextSearchService } from '../../src/modules/entity-text-search/entity-text-search.service';
import { SearchEntityExpansionService } from '../../src/modules/search/search-entity-expansion.service';

/**
 * dense-vs-lexical-surface.ts — for each realistic user query, show side by side
 * what the DENSE lane would surface (searchByEmbedding) vs what the LEXICAL EXPAND
 * tier would surface (expandEntitiesByText). Prints DENSE-ONLY (dense shows,
 * lexical misses), LEXICAL-ONLY, and BOTH — so we can judge, from a hungry user's
 * perspective, which set of options you'd actually rather see.
 *
 *   yarn ts-node scripts/search-harness/dense-vs-lexical-surface.ts
 */
const QUERIES = [
  // category nouns (dense should shine — surface the members)
  'pasta',
  'dumpling',
  'sushi',
  'taco',
  'curry',
  'noodles',
  'sandwich',
  'dessert',
  // specific dishes
  'chicken parm',
  'pad thai',
  'pho',
  'ramen',
  'fried chicken sandwich',
  'burger',
  // modified / cross-word
  'spicy noodles',
  'cold dessert',
];
const K = 15;

async function main(): Promise<void> {
  const app = await bootstrap();
  try {
    const dense = app.get(EntityTextSearchService);
    const expand = app.get(SearchEntityExpansionService);

    for (const q of QUERIES) {
      const denseHits = await dense.searchByEmbedding(q, [EntityType.food], K, {
        marketKey: DEFAULT_MARKET_KEY,
      });
      const lexHits = await expand.expandEntitiesByText({
        terms: [q],
        entityTypes: [EntityType.food],
        limit: K,
      });

      const denseById = new Map(denseHits.map((h) => [h.entityId, h]));
      const lexIds = new Set(lexHits.map((h) => h.entityId));
      const denseOnly = denseHits.filter((h) => !lexIds.has(h.entityId));
      const both = denseHits.filter((h) => lexIds.has(h.entityId));
      const lexOnly = lexHits.filter((h) => !denseById.has(h.entityId));

      console.log(`\n\n========== "${q}" ==========`);
      console.log(`  DENSE-ONLY (dense shows, lexical misses):`);
      for (const h of denseOnly)
        console.log(`    ${h.similarity.toFixed(3)}  ${h.name}`);
      console.log(`  BOTH:`);
      for (const h of both)
        console.log(`    ${h.similarity.toFixed(3)}  ${h.name}`);
      console.log(`  LEXICAL-ONLY (lexical shows, dense misses):`);
      for (const h of lexOnly) console.log(`    ${h.name}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
