import type { SearchNotice } from '../../../../types';
import { resolveSearchNoticeText } from '../../match-explain-strings';

export type OnDemandNoticeMetadata = {
  onDemandQueued?: boolean;
  onDemandEtaMs?: number;
  engineCoverageShare?: number;
  /** WHY THIS MATCHED (2026-08-30): set by the server only when specific
   *  words STARVED here AND a hunt was queued — the precise, friendlier
   *  story ("nothing here mentions 'patio' yet") that takes precedence
   *  over the generic growing-coverage line. */
  searchNotice?: SearchNotice;
};

// ENGINE-COVERAGE re-key (markets extermination leg 2), pure decision core:
// the notice judges the raw engine-coverage SHARE — covered ⇔ some engine
// territory ground intersects the viewport (share > 0). The election fields
// (marketResolutionStatus / candidateLocalityName / collectableMarketKeys)
// are DEAD; area naming is the CLIENT verdict, full stop (one naming
// authority, 2026-08-08 — the server's displayPlaceName fallback died with
// the header cutover; before the store's first commit the copy says
// "this area", which a later commit cannot contradict).
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

  // Starved words + queued hunt: the server named EXACTLY which of the
  // user's words found nothing here — say that, in their own words, instead
  // of the generic growing-coverage paragraph.
  const starvedText = resolveSearchNoticeText(metadata.searchNotice);
  if (starvedText) {
    return starvedText;
  }

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
    const areaLabel = verdictAreaLabel ?? 'this area';
    const searchLabel = onDemandNoticeQuery ? ` for ${onDemandNoticeQuery}` : '';
    const suffix = etaText ? ` Check back in ${etaText}.` : ' Check back soon.';
    return `Your search${searchLabel} is helping us grow coverage in ${areaLabel}. More searches like this help us learn what people want here.${suffix} Create a poll to get answers faster.`;
  }
  if (!coveredByEngines) {
    // UNCOVERED state (no engine territory ground in view — the old
    // "no collectable market" arm, re-keyed): same growth copy. The
    // election's multi-market "zoom out" arm died with the election —
    // there is no tie state in ground coverage.
    const areaLabel = verdictAreaLabel;
    if (areaLabel) {
      const searchLabel = onDemandNoticeQuery ? ` for ${onDemandNoticeQuery}` : '';
      return `Your search${searchLabel} is helping us grow coverage in ${areaLabel}. More searches like this help us learn what people want here. Check back soon, or create a poll to get answers faster.`;
    }
  }
  return null;
};
