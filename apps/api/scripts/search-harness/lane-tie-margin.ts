import { EntityType } from '@prisma/client';
import { Logger } from '@nestjs/common';
import { bootstrap, DEFAULT_MARKET_KEY } from './_shared';
import { EntityTextSearchService } from '../../src/modules/entity-text-search/entity-text-search.service';

/**
 * lane-tie-margin.ts — quantify two things the closeness/co-inclusion decision
 * depends on:
 *  1) LEXICAL tie-mass: how many top-K lexical candidates share the SAME
 *     sparseSimilarity (fuzzy trigram scores collapse to a few discrete values,
 *     so lexical rank inside a tie is arbitrary). If tie-mass is high, lexical
 *     cannot margin — it has no gradient to rank siblings by.
 *  2) DENSE knee: is there a sharp drop (a margin to cut on) between the true
 *     entity/siblings and the rest, or a smooth gradient (no knee => can't margin)?
 *
 *   yarn workspace api ts-node scripts/search-harness/lane-tie-margin.ts
 */
const FOODS = [EntityType.food, EntityType.food_attribute];
const CASES: { q: string; types: EntityType[] }[] = [
  { q: 'spicy noodles', types: FOODS },
  { q: 'fried chicken sandwich', types: FOODS },
  { q: 'noodle soup', types: FOODS },
  { q: 'breakfast sandwich', types: FOODS },
  { q: 'margherita pizza', types: FOODS },
  { q: 'ramen', types: FOODS },
  { q: 'roll', types: FOODS },
  { q: 'egg', types: FOODS },
];

async function main(): Promise<void> {
  const app = await bootstrap();
  try {
    const search = app.get(EntityTextSearchService);
    for (const cs of CASES) {
      const cands = await search.retrieveCandidates(cs.q, cs.types, 60, {
        denseMode: 'always',
        poolSize: 60,
      });
      // lexical tie analysis: bucket by sparseSimilarity value among lexical hits
      const lex = cands
        .filter((c) => c.sparseRank !== null)
        .slice()
        .sort((a, b) => (a.sparseRank as number) - (b.sparseRank as number));
      const scoreBuckets = new Map<string, number>();
      for (const c of lex) {
        const k = (c.sparseSimilarity ?? 0).toFixed(3);
        scoreBuckets.set(k, (scoreBuckets.get(k) ?? 0) + 1);
      }
      const distinctLexScores = scoreBuckets.size;
      const biggestTie = Math.max(0, ...Array.from(scoreBuckets.values()));

      // dense knee: sorted dense cosines, print top-12 deltas
      const dense = cands
        .filter((c) => c.denseRank !== null)
        .slice()
        .sort((a, b) => (a.denseRank as number) - (b.denseRank as number))
        .slice(0, 12)
        .map((c) => c.denseCosine ?? 0);
      const deltas = dense
        .map((v, i) => (i === 0 ? 0 : dense[i - 1] - v))
        .map((d) => d.toFixed(3));

      console.log(`\n=== "${cs.q}" ===`);
      console.log(
        `  LEXICAL: ${lex.length} hits, ${distinctLexScores} distinct scores, biggest single-score tie = ${biggestTie} candidates`,
      );
      console.log(
        `    score histogram: ${Array.from(scoreBuckets.entries())
          .map(([s, n]) => `${s}×${n}`)
          .join('  ')}`,
      );
      console.log(
        `  DENSE top-12 cosine: ${dense.map((v) => v.toFixed(3)).join(' ')}`,
      );
      console.log(`  DENSE step deltas:   ${deltas.slice(1).join('  ')}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
