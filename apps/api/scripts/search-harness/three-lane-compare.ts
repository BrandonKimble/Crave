import { EntityType } from '@prisma/client';
import { Logger } from '@nestjs/common';
import { bootstrap, DEFAULT_MARKET_KEY } from './_shared';
import {
  EntityTextSearchService,
  RecallCandidate,
} from '../../src/modules/entity-text-search/entity-text-search.service';

/**
 * three-lane-compare.ts — per-query, compare the top-K ordering under
 *   (a) pure DENSE   (sort candidates by denseRank)
 *   (b) pure LEXICAL (sort candidates by sparseRank)
 *   (c) RRF-COMBINED (the retrieveCandidates return order)
 * all drawn from the SAME candidate pool (one denseMode:'always' call), so the
 * only thing that differs is the ordering rule. Prints top-8 of each lane
 * side-by-side with the raw per-lane signal, so we can judge by inspection which
 * ordering puts the right entity/siblings on top and where each fails.
 *
 *   yarn workspace api ts-node scripts/search-harness/three-lane-compare.ts
 */

interface QueryCase {
  q: string;
  types: EntityType[];
  note: string;
}

const FOODS = [EntityType.food, EntityType.food_attribute];

const CASES: QueryCase[] = [
  // --- semantic / cross-word (lexical should struggle, dense should shine) ---
  {
    q: 'spicy noodles',
    types: FOODS,
    note: 'cross-word semantic (→kimchi/dan dan?)',
  },
  { q: 'noodle soup', types: FOODS, note: 'semantic (→ramen/pho/udon)' },
  {
    q: 'fried chicken sandwich',
    types: FOODS,
    note: 'semantic (→katsu sando)',
  },
  {
    q: 'cold sweet dessert',
    types: FOODS,
    note: 'pure semantic, no lexical overlap',
  },
  {
    q: 'breakfast sandwich',
    types: FOODS,
    note: 'semantic (→BEC / egg sandwich)',
  },
  // --- exact / near-exact name (lexical should nail it) ---
  { q: 'ramen', types: FOODS, note: 'exact-ish common name' },
  { q: 'pad thai', types: FOODS, note: 'exact two-word dish' },
  { q: 'margherita pizza', types: FOODS, note: 'exact compound' },
  // --- cryptic / short tokens (dense weak per owner note) ---
  { q: 'bec', types: FOODS, note: 'cryptic acronym (bacon egg cheese)' },
  { q: 'bar', types: FOODS, note: 'short token, prefix-poison risk' },
  { q: 'egg', types: FOODS, note: 'short token' },
  { q: 'roll', types: FOODS, note: 'short token, many siblings' },
  // --- typo (lexical fuzzy/levenshtein should recover) ---
  { q: 'ramne', types: FOODS, note: 'typo of ramen' },
  { q: 'chikn sandwich', types: FOODS, note: 'typo cross-word' },
  // --- restaurant lane ---
  { q: 'joes pizza', types: [EntityType.restaurant], note: 'restaurant name' },
];

const TOPK = 8;

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n - 1) + '…';
  return s + ' '.repeat(n - s.length);
}

function orderByLane(
  cands: RecallCandidate[],
  lane: 'dense' | 'sparse' | 'rrf',
): RecallCandidate[] {
  if (lane === 'rrf') return cands; // already RRF-sorted
  if (lane === 'dense') {
    return cands
      .filter((c) => c.denseRank !== null)
      .slice()
      .sort((a, b) => (a.denseRank as number) - (b.denseRank as number));
  }
  return cands
    .filter((c) => c.sparseRank !== null)
    .slice()
    .sort((a, b) => (a.sparseRank as number) - (b.sparseRank as number));
}

function fmtRow(c: RecallCandidate, lane: 'dense' | 'sparse' | 'rrf'): string {
  const name = pad(c.name, 26);
  if (lane === 'dense') {
    return `${name} d=${(c.denseCosine ?? 0).toFixed(3)}`;
  }
  if (lane === 'sparse') {
    return `${name} s=${(c.sparseSimilarity ?? 0).toFixed(3)} [${c.sparseEvidence ?? '-'}]`;
  }
  // rrf: show which lanes contributed
  const lanes: string[] = [];
  if (c.sparseRank !== null) lanes.push(`s#${c.sparseRank}`);
  if (c.denseRank !== null) lanes.push(`d#${c.denseRank}`);
  return `${name} rrf=${c.rrf.toFixed(4)} (${lanes.join(',')})`;
}

async function main(): Promise<void> {
  const app = await bootstrap();
  try {
    const search = app.get(EntityTextSearchService);
    for (const cs of CASES) {
      const cands = await search.retrieveCandidates(cs.q, cs.types, 50, {
        denseMode: 'always',
        poolSize: 60,
      });
      const dense = orderByLane(cands, 'dense').slice(0, TOPK);
      const sparse = orderByLane(cands, 'sparse').slice(0, TOPK);
      const rrf = orderByLane(cands, 'rrf').slice(0, TOPK);

      console.log(`\n\n########## "${cs.q}"  (${cs.note}) ##########`);
      console.log(
        `pool=${cands.length}  sparseHits=${cands.filter((c) => c.sparseRank !== null).length}  denseHits=${cands.filter((c) => c.denseRank !== null).length}`,
      );
      console.log(
        `${pad('DENSE-only', 40)} | ${pad('LEXICAL-only', 46)} | RRF-combined`,
      );
      for (let i = 0; i < TOPK; i++) {
        const d = dense[i] ? fmtRow(dense[i], 'dense') : '';
        const s = sparse[i] ? fmtRow(sparse[i], 'sparse') : '';
        const r = rrf[i] ? fmtRow(rrf[i], 'rrf') : '';
        console.log(`${pad(d, 40)} | ${pad(s, 46)} | ${r}`);
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
