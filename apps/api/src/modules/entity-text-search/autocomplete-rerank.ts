import { RecallCandidate } from './entity-text-search.service';

export interface RankedAutocompleteMatch extends RecallCandidate {
  popularity: number;
}

/**
 * Autocomplete Stage-2 reranker (feature-based, v1).
 *
 * Orders the shared recall shortlist for type-ahead. The policy is genuine
 * autocomplete semantics:
 *   1. exact name/alias match → top (you typed the name)
 *   2. prefix match → next (you're typing the start of a name — the type-ahead case)
 *   3. everything else → by the **actual match strength** (`max(denseCosine,
 *      sparseSimilarity)`) — the real relevance signal the recall already computed
 * with log-damped **popularity** as a deep within-tier tiebreak.
 *
 * Why scores, not RRF: RRF is a RECALL fusion (rank-only, scale-free) — good for
 * GATHERING the shortlist, but it discards the cosine magnitude, so ranking on it
 * collapses strong and weak matches into one band and lets a noisy popularity
 * tiebreak pick the top result. Stage-2 ranking uses the score directly. This is
 * the slot for a learned ranker (LambdaMART/GBDT over evidence + cosine +
 * sparse/dense rank + popularity) once click data exists.
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
  // Best available relevance evidence for a candidate.
  const relevance = (c: RecallCandidate): number =>
    Math.max(c.denseCosine ?? 0, c.sparseSimilarity ?? 0);
  // Log-damp so 1-vs-0 mentions isn't treated as decisively as 50-vs-0.
  const pop = (id: string): number => Math.log1p(popularityById.get(id) ?? 0);

  return candidates
    .map((c) => ({ ...c, popularity: popularityById.get(c.entityId) ?? 0 }))
    .sort((a, b) => {
      const ta = tier(a);
      const tb = tier(b);
      if (ta !== tb) return ta - tb;
      // exact/prefix tiers: most popular first (type "shake" → Shake Shack).
      if (ta <= 1) return pop(b.entityId) - pop(a.entityId);
      // relevance tier: strongest actual match first; popularity deep-tiebreaks.
      const ra = relevance(a);
      const rb = relevance(b);
      if (Math.abs(rb - ra) > 1e-6) return rb - ra;
      return pop(b.entityId) - pop(a.entityId);
    });
}
