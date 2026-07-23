import { EntityType } from '@prisma/client';
import { EntityTextSearchService } from '../../src/modules/entity-text-search/entity-text-search.service';
import { bootstrap, loadFixture, out, DEFAULT_MARKET_KEY } from './_shared';

/**
 * decider-shape-probe.ts — red-team probe (read-only).
 * Over the alias→canonical replay pairs, bucket every NON-exact decision by the
 * feature region the current decider uses, and measure per-region precision:
 *   A: topSim>=0.82                        (absolute floor)   -> links
 *   B: topSim in [0.5,0.82) & margin fires (runner>0)         -> links
 *   C: topSim in [0.5,0.82) & SINGLETON (runnerSim==0)        -> NO link today
 *   D: topSim in [0.5,0.82) & margin fails                    -> no link
 * Per-region: count, correct-target fraction (does top == expected entity),
 * plus sim distribution, so we can see if C is a recoverable dead-zone and
 * whether B's low-absolute fires are safe.
 */

const K = 5;
const POOL = 50;

async function main() {
  const app = await bootstrap();
  const search = app.get(EntityTextSearchService);
  const fixture = loadFixture();

  type Row = {
    term: string;
    expected: string;
    topId: string | null;
    topSim: number;
    runnerSim: number;
    evidence: string | null;
    region: string;
    correct: boolean;
  };
  const rows: Row[] = [];
  const ELIGIBLE = new Set(['exact', 'prefix', 'name', 'alias', 'fuzzy']);

  const pairs: { term: string; type: EntityType; expected: string }[] = [];
  for (const e of fixture.entities) {
    for (const a of e.aliases) {
      const t = a.trim().toLowerCase();
      if (t && t !== e.name.trim().toLowerCase()) {
        // single-edit typo perturbation: delete a middle char of the first token
        const words = t.split(/\s+/);
        if (words[0].length >= 5) {
          const w = words[0];
          const k = Math.floor(w.length / 2);
          words[0] = w.slice(0, k) + w.slice(k + 1);
          pairs.push({
            term: words.join(' '),
            type: e.type,
            expected: e.entityId,
          });
        }
      }
    }
  }
  out(`pairs: ${pairs.length}`);

  let i = 0;
  for (const p of pairs) {
    i++;
    if (i % 200 === 0) out(`...${i}`);
    const cands = await search.retrieveCandidates(p.term, [p.type], K, {
      denseMode: 'none',
      poolSize: POOL,
    });
    const exact = cands.find((c) => c.sparseEvidence === 'exact');
    if (exact) continue; // exact tier out of scope
    const eligible = cands
      .filter((c) => c.sparseEvidence && ELIGIBLE.has(c.sparseEvidence))
      .sort((a, b) => (b.sparseSimilarity ?? 0) - (a.sparseSimilarity ?? 0));
    const top = eligible[0];
    if (!top) continue;
    const topSim = top.sparseSimilarity ?? 0;
    const runnerSim = eligible[1]?.sparseSimilarity ?? 0;
    if (topSim < 0.5) continue;
    let region: string;
    if (topSim >= 0.82) region = 'A_abs';
    else if (runnerSim === 0) region = 'C_singleton';
    else if (topSim >= 1.3 * runnerSim) region = 'B_margin';
    else region = 'D_nolink';
    rows.push({
      term: p.term,
      expected: p.expected,
      topId: top.entityId,
      topSim,
      runnerSim,
      evidence: top.sparseEvidence ?? null,
      region,
      correct: top.entityId === p.expected,
    });
  }

  for (const r of ['A_abs', 'B_margin', 'C_singleton', 'D_nolink']) {
    const g = rows.filter((x) => x.region === r);
    const ok = g.filter((x) => x.correct).length;
    const sims = g.map((x) => x.topSim).sort((a, b) => a - b);
    const med = sims.length ? sims[Math.floor(sims.length / 2)] : 0;
    out(
      `${r}: n=${g.length} correct=${ok} (${g.length ? ((100 * ok) / g.length).toFixed(1) : 0}%) medianSim=${med.toFixed(3)}`,
    );
    // low-sim slice
    const low = g.filter((x) => x.topSim < 0.65);
    const lowOk = low.filter((x) => x.correct).length;
    out(`   sim<0.65: n=${low.length} correct=${lowOk}`);
    for (const x of g.filter((y) => !y.correct).slice(0, 6)) {
      out(
        `   WRONG "${x.term}" top=${x.topId?.slice(0, 8)} sim=${x.topSim.toFixed(3)} run=${x.runnerSim.toFixed(3)} ev=${x.evidence}`,
      );
    }
  }

  // Per-evidence-tier calibration view for region A+B+C combined
  out('\nper-evidence precision (all regions, topSim>=0.5):');
  for (const ev of ['prefix', 'name', 'alias', 'fuzzy']) {
    const g = rows.filter((x) => x.evidence === ev);
    const ok = g.filter((x) => x.correct).length;
    out(
      `  ${ev}: n=${g.length} correct=${ok} (${g.length ? ((100 * ok) / g.length).toFixed(1) : 0}%)`,
    );
  }
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
