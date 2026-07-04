import { EntityType } from '@prisma/client';
import { Logger } from '@nestjs/common';
import { bootstrap, DEFAULT_MARKET_KEY } from './_shared';
import { EntityTextSearchService } from '../../src/modules/entity-text-search/entity-text-search.service';

/**
 * coinclusion-poison-check.ts — the MERGE GATE for the closeness co-inclusion rule
 * (plans/search-system-ideal.md B). The rule co-includes a sibling entity with the
 * winner iff its sparseEvidence ∈ {exact, prefix, name}. `prefix` is the plausible
 * poisoner: "ice" → "iceberg lettuce", "bar" → "barbacoa". This probe runs the
 * high-collision short-token set through the matcher and prints exactly which
 * candidates each gate ({exact,prefix,name} vs the tighter {exact,name}) would
 * co-include, so we can SEE whether prefix leaks non-siblings before shipping.
 *
 *   yarn workspace api ts-node scripts/search-harness/coinclusion-poison-check.ts
 */
const TOKENS = [
  'ice',
  'roll',
  'chai',
  'bar',
  'egg',
  'tea',
  'ramen',
  'chicken parm',
];
const LOOSE = new Set(['exact', 'prefix', 'name']);
const TIGHT = new Set(['exact', 'name']);

async function main(): Promise<void> {
  const app = await bootstrap();
  try {
    const search = app.get(EntityTextSearchService);
    for (const t of TOKENS) {
      const cands = await search.retrieveCandidates(
        t,
        [EntityType.food, EntityType.food_attribute],
        25,
        { marketKey: DEFAULT_MARKET_KEY, denseMode: 'none', poolSize: 80 },
      );
      const loose = cands.filter(
        (c) => c.sparseEvidence && LOOSE.has(c.sparseEvidence),
      );
      const tight = cands.filter(
        (c) => c.sparseEvidence && TIGHT.has(c.sparseEvidence),
      );
      const prefixOnly = loose.filter((c) => c.sparseEvidence === 'prefix');
      console.log(
        `\n=== "${t}"  loose{exact,prefix,name}=${loose.length}  tight{exact,name}=${tight.length}  prefix-only=${prefixOnly.length} ===`,
      );
      for (const c of loose) {
        const flag = c.sparseEvidence === 'prefix' ? '  <-- PREFIX' : '';
        console.log(
          `  [${c.sparseEvidence}] ${c.name} (sparse=${(c.sparseSimilarity ?? 0).toFixed(3)})${flag}`,
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
