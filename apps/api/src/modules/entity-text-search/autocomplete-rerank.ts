import { RecallCandidate } from './entity-text-search.service';

export interface RankedAutocompleteMatch extends RecallCandidate {
  popularity: number;
}

/**
 * Autocomplete Stage-2 reranker (feature-based, v1).
 *
 * Orders the shared recall shortlist for type-ahead. The policy is genuine
 * autocomplete semantics, NOT tunable weights:
 *   1. exact name/alias match → top (you typed the name)
 *   2. prefix match → next (you're typing the start of a name — the type-ahead case)
 *   3. everything else → by the recall RRF score (already fuses both lanes,
 *      rank-based, scale-free)
 * with **popularity** as the within-tier tiebreak (the well-known entity wins).
 *
 * No score blending across scales, no hand-tuned multipliers. When click data
 * exists this is the slot for a learned ranker (LambdaMART/GBDT over the same
 * features: evidence, rrf, sparse/dense rank, popularity) — the interface is
 * already feature-shaped.
 */
export function rerankForAutocomplete(
  candidates: RecallCandidate[],
  popularityById: Map<string, number>,
): RankedAutocompleteMatch[] {
  const tier = (c: RecallCandidate): number => {
    if (c.sparseEvidence === 'exact') return 0;
    if (c.sparseEvidence === 'prefix') return 1;
    return 2;
  };
  const pop = (id: string): number => popularityById.get(id) ?? 0;

  return candidates
    .map((c) => ({ ...c, popularity: pop(c.entityId) }))
    .sort((a, b) => {
      const ta = tier(a);
      const tb = tier(b);
      if (ta !== tb) return ta - tb;
      // exact/prefix tiers: most popular first (type "shake" → Shake Shack).
      if (ta <= 1) return b.popularity - a.popularity;
      // relevance tier: best fusion first, popularity breaks ties.
      if (b.rrf !== a.rrf) return b.rrf - a.rrf;
      return b.popularity - a.popularity;
    });
}
