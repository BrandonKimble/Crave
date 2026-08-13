/**
 * THE REPLAY-PRIOR COMPARABILITY GUARD (estimator ideal shape, 2026-08-12),
 * extracted pure so it is testable: a per-doc rate from the last completed
 * replay transfers only when that replay covered the SAME community set, or
 * its scale is within 2x of the quote being built — fixed per-run costs
 * amortize differently across scales, and community mix changes doc size.
 * reextract-estimate.ts is the one consumer; on `usable: false` it falls
 * back to the trailing-window rates and prints `reason`.
 */
export function replayPriorUsable(params: {
  priorName: string;
  priorDocs: number;
  thisCommunities: readonly string[];
  docCount: number;
}): { usable: boolean; reason: string | null } {
  const { priorName, priorDocs, thisCommunities, docCount } = params;
  if (!(priorDocs > 0)) {
    return { usable: false, reason: 'prior has no doc count' };
  }
  const priorCommunities = (
    priorName.match(/^reextract:(.+):v[^:]+$/)?.[1]?.split('+') ?? []
  )
    .map((value) => value.trim())
    .filter(Boolean)
    .sort();
  const sorted = [...thisCommunities].sort();
  const sameCommunitySet =
    priorCommunities.length > 0 &&
    priorCommunities.length === sorted.length &&
    priorCommunities.every((community, i) => community === sorted[i]);
  if (sameCommunitySet) return { usable: true, reason: null };
  const scaleRatio =
    docCount > 0 ? Math.max(priorDocs / docCount, docCount / priorDocs) : 0;
  if (scaleRatio > 0 && scaleRatio <= 2) return { usable: true, reason: null };
  return {
    usable: false,
    reason:
      `last completed replay (${priorName}, ${priorDocs} docs) matches ` +
      `neither this community set (${sorted.join(',')}) nor this scale ` +
      `(${docCount} docs, ratio ${scaleRatio.toFixed(1)}x > 2x)`,
  };
}
