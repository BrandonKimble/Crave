export type OnDemandNoticeMetadata = {
  onDemandQueued?: boolean;
  onDemandEtaMs?: number;
  displayMarketName?: string | null;
  engineCoverageShare?: number;
};

// ENGINE-COVERAGE re-key (markets extermination leg 2), pure decision core:
// the notice judges the raw engine-coverage SHARE — covered ⇔ some engine
// territory ground intersects the viewport (share > 0). The election fields
// (marketResolutionStatus / candidateLocalityName / collectableMarketKeys)
// are DEAD; area naming is verdict-first with the catalog-derived
// displayMarketName as the strictly-pre-first-commit fallback.
export const resolveOnDemandNoticeText = ({
  metadata,
  verdictAreaLabel,
  onDemandNoticeQuery,
}: {
  metadata: OnDemandNoticeMetadata;
  verdictAreaLabel: string | null;
  onDemandNoticeQuery: string;
}): string | null => {
  const engineCoverageShare =
    typeof metadata.engineCoverageShare === 'number' &&
    Number.isFinite(metadata.engineCoverageShare)
      ? metadata.engineCoverageShare
      : 0;
  const coveredByEngines = engineCoverageShare > 0;
  const displayName =
    typeof metadata.displayMarketName === 'string' && metadata.displayMarketName.trim()
      ? metadata.displayMarketName.trim()
      : null;

  if (metadata.onDemandQueued) {
    const etaMs = metadata.onDemandEtaMs;
    let etaText: string | null = null;
    if (etaMs && Number.isFinite(etaMs) && etaMs > 0) {
      const totalMinutes = Math.round(etaMs / 60000);
      if (totalMinutes < 60) {
        etaText = `${totalMinutes} min`;
      } else {
        const hours = Math.ceil(totalMinutes / 60);
        etaText = hours === 1 ? 'about 1 hour' : `about ${hours} hours`;
      }
    }
    const areaLabel = verdictAreaLabel ?? displayName ?? 'this area';
    const searchLabel = onDemandNoticeQuery ? ` for ${onDemandNoticeQuery}` : '';
    const suffix = etaText ? ` Check back in ${etaText}.` : ' Check back soon.';
    return `Your search${searchLabel} is helping us grow coverage in ${areaLabel}. More searches like this help us learn what people want here.${suffix} Create a poll to get answers faster.`;
  }
  if (!coveredByEngines) {
    // UNCOVERED state (no engine territory ground in view — the old
    // "no collectable market" arm, re-keyed): same growth copy. The
    // election's multi-market "zoom out" arm died with the election —
    // there is no tie state in ground coverage.
    const areaLabel = verdictAreaLabel ?? displayName;
    if (areaLabel) {
      const searchLabel = onDemandNoticeQuery ? ` for ${onDemandNoticeQuery}` : '';
      return `Your search${searchLabel} is helping us grow coverage in ${areaLabel}. More searches like this help us learn what people want here. Check back soon, or create a poll to get answers faster.`;
    }
  }
  return null;
};
