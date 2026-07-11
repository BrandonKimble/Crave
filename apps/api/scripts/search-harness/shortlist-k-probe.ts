import { EntityTextSearchService } from '../../src/modules/entity-text-search/entity-text-search.service';
import { LLMService } from '../../src/modules/external-integrations/llm/llm.service';
import {
  bootstrap,
  loadFixture,
  out,
  DEFAULT_MARKET_KEY,
  type FixtureEntity,
} from './_shared';

/**
 * shortlist-k-probe.ts — value-census TEST #3: does LLM_MATCHER_SHORTLIST_K=8
 * (entity-resolution.service.ts, judge shortlist) leave real recall on the
 * table vs K=15?
 *
 * Ground truth: alias→canonical pairs from the frozen corpus — an alias is a
 * known same-entity surface form, i.e. exactly the "unmatched term whose true
 * entity exists" case the LLM-matcher tier handles. For each alias we run the
 * REAL recall core at K=15 (same args as performLlmMatches: type-scoped,
 * market-scoped for restaurants, denseMode 'always') and record the rank of
 * the true entity. A decision flip between K=8 and K=15 is only possible when
 * the true entity ranks 9-15; for those cases we run the ACTUAL batched judge
 * at both K values and count flips.
 *
 *   yarn workspace api ts-node scripts/search-harness/shortlist-k-probe.ts
 */

const K_BASE = 8;
const K_WIDE = 15;
const MAX_PAIRS = Number(process.env.MAX_PAIRS ?? 150);

async function main(): Promise<void> {
  const fixture = loadFixture();
  const pairs: { term: string; truth: FixtureEntity }[] = [];
  for (const e of fixture.entities) {
    if (e.type !== 'food' && e.type !== 'restaurant') continue;
    for (const alias of e.aliases) {
      const a = alias.trim().toLowerCase();
      if (!a || a === e.name.trim().toLowerCase()) continue;
      pairs.push({ term: a, truth: e });
    }
  }
  // Deterministic spread across the corpus.
  pairs.sort((x, y) => x.term.localeCompare(y.term));
  const step = Math.max(1, Math.floor(pairs.length / MAX_PAIRS));
  const sample = pairs.filter((_, i) => i % step === 0).slice(0, MAX_PAIRS);
  out(`alias pairs: ${pairs.length}, sampled: ${sample.length}`);

  const app = await bootstrap();
  try {
    const search = app.get(EntityTextSearchService, { strict: false });
    const llm = app.get(LLMService, { strict: false });

    const rankCounts = { r1: 0, r2to8: 0, r9to15: 0, absent: 0 };
    const nineToFifteen: {
      term: string;
      truth: FixtureEntity;
      candidates: { entityId: string; name: string }[];
    }[] = [];
    let base8Chars = 0;
    let wide15Chars = 0;

    for (const { term, truth } of sample) {
      const candidates = (await search.retrieveCandidates(
        term,
        [truth.type],
        K_WIDE,
        {
          marketKey: truth.type === 'restaurant' ? DEFAULT_MARKET_KEY : null,
          denseMode: 'always',
        },
      )) as { entityId: string; name: string }[];
      const rank =
        candidates.findIndex((c) => c.entityId === truth.entityId) + 1;
      base8Chars += JSON.stringify(candidates.slice(0, K_BASE)).length;
      wide15Chars += JSON.stringify(candidates).length;
      if (rank === 1) rankCounts.r1++;
      else if (rank >= 2 && rank <= K_BASE) rankCounts.r2to8++;
      else if (rank > K_BASE) {
        rankCounts.r9to15++;
        nineToFifteen.push({ term, truth, candidates });
        out(`  rank ${rank}: "${term}" -> ${truth.name} (${truth.type})`);
      } else rankCounts.absent++;
    }
    out(
      `ranks: r1=${rankCounts.r1} r2-8=${rankCounts.r2to8} r9-15=${rankCounts.r9to15} absent@15=${rankCounts.absent}`,
    );
    out(
      `shortlist payload chars: K=8 ${base8Chars}, K=15 ${wide15Chars} (+${(
        (wide15Chars / base8Chars - 1) *
        100
      ).toFixed(0)}% judge prompt candidates)`,
    );

    // Judge flip test on the only cases where K can change the verdict.
    if (nineToFifteen.length) {
      for (const K of [K_BASE, K_WIDE]) {
        const verdicts = await llm.matchEntitiesBatch({
          kind:
            nineToFifteen[0].truth.type === 'restaurant'
              ? 'restaurant'
              : 'food',
          items: nineToFifteen.map((c) => ({
            term: c.term,
            candidates: c.candidates
              .slice(0, K)
              .map((cand, i) => ({ id: i, name: cand.name })),
          })),
        });
        verdicts.forEach((v, i) => {
          const c = nineToFifteen[i];
          const picked =
            v.decision === 'match' && v.candidateId !== null
              ? c.candidates[v.candidateId]
              : null;
          out(
            `  K=${K} "${c.term}": ${v.decision} -> ${picked?.name ?? '-'} ${
              picked?.entityId === c.truth.entityId ? 'CORRECT' : ''
            }`,
          );
        });
      }
    } else {
      out(
        'no rank-9..15 cases: K=8 vs K=15 cannot flip any verdict on this corpus',
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
