/**
 * @script-class: probe
 * @finding: per-term linker decision + top-5 shortlist. NOTE (F1260): re-synced to the
 * live predicate in src/modules/search/linker-decision.ts.
 */
import { EntityType } from '@prisma/client';
import { Logger } from '@nestjs/common';
import {
  LINK_ELIGIBLE_EVIDENCE,
  linkerAdmits,
} from '../../src/modules/search/evidence-admission';
import { bootstrap, DEFAULT_MARKET_KEY } from './_shared';
import {
  EntityTextSearchService,
  RecallCandidate,
} from '../../src/modules/entity-text-search/entity-text-search.service';

/**
 * linker-decision-probe.ts — reproduce the EXACT current linker decision
 * (exact-name→'exact'; else the IMPORTED `linkerAdmits` predicate;
 * else unmatched) for a battery of real terms, and print the top-5 shortlist
 * with sparse/dense/rrf so we can see where dense/rrf would pick a BETTER
 * entity than the lexical-only decision.
 *
 *   yarn workspace api ts-node scripts/search-harness/linker-decision-probe.ts
 */

interface Case {
  term: string;
  type: EntityType;
  note: string;
}

const R = EntityType.place;
const F = EntityType.item;

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
        // F1260: the decision is the IMPORTED one. This probe used to spell
        // `sim >= 0.82` and call it "the live rule" after the service had
        // moved to calibrated per-tier floors + margin.
        const eligible = cands
          .filter(
            (c) =>
              c.sparseEvidence != null &&
              LINK_ELIGIBLE_EVIDENCE.has(c.sparseEvidence),
          )
          .sort(
            (a, b) => (b.sparseSimilarity ?? 0) - (a.sparseSimilarity ?? 0),
          );
        const best = eligible[0] ?? cands[0];
        const sim = best?.sparseSimilarity ?? 0;
        const admits =
          eligible[0] != null &&
          linkerAdmits({
            topSim: sim,
            runnerSim: eligible[1]?.sparseSimilarity ?? 0,
            eligibleCount: eligible.length,
            tier: eligible[0].sparseEvidence ?? null,
          });
        decision = admits
          ? `LINK ${best.name} (sparse ${sim.toFixed(3)}, tier ${best.sparseEvidence})`
          : `UNMATCHED (best sparse ${best?.name ?? '-'}=${sim.toFixed(3)})`;
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

      console.log(`  LIVE (imported linkerAdmits): ${decision}`);
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
