import { EntityType } from '@prisma/client';
import { Logger } from '@nestjs/common';
import { bootstrap, DEFAULT_MARKET_KEY } from './_shared';
import {
  EntityTextSearchService,
  RecallCandidate,
} from '../../src/modules/entity-text-search/entity-text-search.service';

/**
 * linker-decision-probe.ts — reproduce the EXACT current linker decision
 * (linkViaHybridRecall: exact-name→'exact'; else best-sparse ≥0.82→'fuzzy';
 * else unmatched) for a battery of real terms, and print the top-5 shortlist
 * with sparse/dense/rrf so we can see where dense/rrf would pick a BETTER
 * entity than the sparse-only 0.82 rule.
 *
 *   yarn workspace api ts-node scripts/search-harness/linker-decision-probe.ts
 */

const THRESHOLD = 0.82; // HYBRID_LINK_SIMILARITY_THRESHOLD

interface Case {
  term: string;
  type: EntityType;
  note: string;
}

const R = EntityType.restaurant;
const F = EntityType.food;

const CASES: Case[] = [
  // exact / near-exact restaurant names
  { term: 'joes pizza', type: R, note: 'exact-ish restaurant name' },
  { term: 'katzs delicatessen', type: R, note: 'exact-ish (apostrophe class)' },
  // typos
  { term: 'frankln', type: R, note: 'typo of Franklin (token typo)' },
  { term: 'shak shak', type: R, note: 'typo/near of Shake Shack' },
  { term: 'ramne', type: F, note: 'typo of ramen' },
  // shorthand / cryptic
  { term: 'bec', type: F, note: 'cryptic acronym (bacon egg cheese)' },
  { term: 'omakase', type: F, note: 'the omakase→Osaka junk-link risk' },
  // multi-word
  { term: 'pad thai', type: F, note: 'exact two-word dish' },
  { term: 'fried chicken sandwich', type: F, note: 'semantic multi-word' },
  { term: 'noodle soup', type: F, note: 'semantic (→ramen/pho/udon)' },
  // ambiguous / common
  { term: 'pizza', type: F, note: 'common food, many siblings' },
  { term: 'joes', type: R, note: 'ambiguous shorthand' },
];

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n - 1) + '…';
  return s + ' '.repeat(n - s.length);
}

function fmt(c: RecallCandidate): string {
  const s = c.sparseSimilarity;
  const d = c.denseCosine;
  const sTxt = s === null ? '  -  ' : s.toFixed(3);
  const dTxt = d === null ? '  -  ' : d.toFixed(3);
  return `${pad(c.name, 30)} sparse=${sTxt} [${pad(c.sparseEvidence ?? '-', 9)}] dense=${dTxt} rrf=${c.rrf.toFixed(4)}`;
}

async function main(): Promise<void> {
  const app = await bootstrap();
  try {
    const search = app.get(EntityTextSearchService);
    for (const cs of CASES) {
      const term = cs.term.trim().toLowerCase();
      // Pull with dense ALWAYS so we can SEE what dense/rrf would have offered,
      // even though the live linker runs denseMode:'none'.
      const cands = await search.retrieveCandidates(cs.term, [cs.type], 5, {
        marketKey: DEFAULT_MARKET_KEY,
        denseMode: 'always',
        poolSize: 60,
      });

      console.log(`\n\n######### "${cs.term}"  (${cs.note}) #########`);
      if (cands.length === 0) {
        console.log('  (no candidates) → LIVE DECISION: unmatched');
        continue;
      }
      cands.forEach((c, i) => console.log(`  ${i}. ${fmt(c)}`));

      // ---- reproduce the LIVE linker decision (denseMode:'none' path) ----
      // Note: retrieveCandidates order/shortlist is identical for sparse fields;
      // dense only ADDS candidates + reorders by rrf. The live rule reads only
      // sparseSimilarity + exact-name, so we compute over the same list.
      const exact = cands.find((c) => c.name.trim().toLowerCase() === term);
      let decision: string;
      if (exact) {
        decision = `EXACT → link ${exact.name} (conf 1)`;
      } else {
        const best = cands.reduce((a, b) =>
          (b.sparseSimilarity ?? 0) > (a.sparseSimilarity ?? 0) ? b : a,
        );
        const sim = best.sparseSimilarity ?? 0;
        decision =
          sim >= THRESHOLD
            ? `FUZZY ≥0.82 → link ${best.name} (sparse ${sim.toFixed(3)})`
            : `UNMATCHED (best sparse ${best.name}=${sim.toFixed(3)} < 0.82)`;
      }

      // ---- what DENSE-top / RRF-top would have picked ----
      const rrfTop = cands[0];
      const denseTop = cands
        .filter((c) => c.denseCosine !== null)
        .sort(
          (a, b) => (b.denseCosine as number) - (a.denseCosine as number),
        )[0];
      const sparseTop = cands
        .filter((c) => c.sparseSimilarity !== null)
        .sort(
          (a, b) =>
            (b.sparseSimilarity as number) - (a.sparseSimilarity as number),
        )[0];

      console.log(`  LIVE (sparse-only 0.82): ${decision}`);
      console.log(
        `  rrf-top=${rrfTop?.name ?? '-'} | dense-top=${denseTop?.name ?? '-'} | sparse-top=${sparseTop?.name ?? '-'}`,
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
