import { EntityType } from '@prisma/client';
import { Logger } from '@nestjs/common';
import { bootstrap, DEFAULT_MARKET_KEY } from './_shared';
import { AutocompleteService } from '../../src/modules/autocomplete/autocomplete.service';
import { EntityTextSearchService } from '../../src/modules/entity-text-search/entity-text-search.service';

/**
 * autocomplete-keystroke-probe.ts — drive the LIVE AutocompleteService for
 * per-keystroke prefix sequences (r→ra→ram→rame→ramen, etc.), dump the top-8
 * suggestions per fragment, and ALSO dump the raw shared-matcher recall lane
 * (retrieveCandidates) with per-candidate evidence + sparse/dense signal so a
 * smelly result can be attributed to lexical-fuzzy vs dense-semantic vs scoring.
 *
 *   yarn workspace api ts-node scripts/search-harness/autocomplete-keystroke-probe.ts
 */

const FOODS: EntityType[] = [EntityType.food, EntityType.restaurant];

const SEQUENCES: string[][] = [
  ['r', 'ra', 'ram', 'rame', 'ramen'],
  ['p', 'pa', 'par', 'parm'],
  ['t', 'ta', 'tac', 'taco'],
  ['s', 'su', 'sus', 'sush', 'sushi'],
  ['b', 'bu', 'bur', 'burg', 'burger'],
  ['pho'],
  ['pad'],
  ['dump'],
  ['chick'],
  ['noodl'],
];

function pad(s: string, n: number): string {
  const str = s ?? '';
  if (str.length >= n) return str.slice(0, n - 1) + '…';
  return str + ' '.repeat(n - str.length);
}

async function main(): Promise<void> {
  const app = await bootstrap();
  try {
    const ac = app.get(AutocompleteService);
    const textSearch = app.get(EntityTextSearchService);

    for (const seq of SEQUENCES) {
      console.log(
        `\n\n================= SEQUENCE: ${seq.join(' → ')} =================`,
      );
      for (const q of seq) {
        // Force cache-miss + no market (global) is NOT what mobile does; mobile
        // sends viewport → NYC market. Use DEFAULT_MARKET_KEY-equivalent by
        // passing userLocation so restaurant lane is market-scoped like prod.
        const resp = await ac.autocompleteEntities(
          {
            query: q,
            // NYC center → resolves to region-us-ny-new-york market (prod parity)
            userLocation: { latitude: 40.7128, longitude: -74.006 },
            limit: 8,
          } as never,
          undefined,
        );

        console.log(`\n----- "${q}" (len ${q.length}) -----`);
        console.log(
          `  querySuggestions: [${(resp.querySuggestions ?? []).join(', ')}]`,
        );
        if (resp.matches.length === 0) {
          console.log('  (no matches)');
        }
        resp.matches.forEach((m, i) => {
          console.log(
            `  ${String(i + 1).padStart(2)}. ${pad(m.name, 30)} ${pad(
              m.entityType,
              12,
            )} conf=${(m.confidence ?? 0).toFixed(2)} ${
              m.evidenceTier ? `[${m.evidenceTier}]` : ''
            }${m.matchType && m.matchType !== 'entity' ? ` <${m.matchType}>` : ''}`,
          );
        });

        // Raw recall lane attribution (what the shared matcher surfaced BEFORE
        // scoring/blend). Mirror the autocomplete call: dense 'always' at len>=3.
        const denseMode = q.length >= 3 ? 'always' : 'fallback';
        const cands = await textSearch.retrieveCandidates(q, FOODS, 12, {
          denseMode: denseMode as never,
          poolSize: 60,
        });
        console.log(`  --- raw recall (denseMode=${denseMode}) ---`);
        cands.slice(0, 10).forEach((c) => {
          const lanes: string[] = [];
          if (c.sparseRank !== null)
            lanes.push(
              `s#${c.sparseRank} ${c.sparseEvidence}=${(c.sparseSimilarity ?? 0).toFixed(2)}`,
            );
          if (c.denseRank !== null)
            lanes.push(
              `d#${c.denseRank} cos=${(c.denseCosine ?? 0).toFixed(2)}`,
            );
          console.log(
            `      ${pad(c.name, 30)} ${pad(c.type, 12)} ${lanes.join('  ')}`,
          );
        });
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
