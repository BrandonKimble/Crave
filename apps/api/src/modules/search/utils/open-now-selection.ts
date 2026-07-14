// OPEN-NOW filter-before-paginate (the ideal shape). The bug this replaces: the list
// executor fetched page-1 (top-N by score) and THEN filtered to open — so an open
// restaurant ranked below the page was invisible, and the reported total was the
// post-filter page count (pagination dead). The map's coverage layer filters the WHOLE
// viewport set, so the two diverged (e.g. 22 open pins vs 1 card).
//
// The fix: compute openness over the FULL ranked candidate set FIRST, then paginate the
// open subset. This pure selector is the seam — it takes candidates already ordered by the
// query's ranking (each carrying its resolved openness) and returns the page of open ids +
// the true open total. The executor resolves `isOpen` per candidate with the same
// evaluateOperatingStatus it already uses, so list openness == coverage openness by
// construction.

export interface OpenNowCandidate {
  restaurantId: string;
  /** true = open, false = closed, null = unsupported (no hours data). */
  isOpen: boolean | null;
}

export interface OpenNowPageSelection {
  /** Open restaurant ids for the requested page, in ranked order. */
  pageIds: string[];
  /** All open restaurant ids in ranked order (feeds parity checks / map alignment). */
  openIds: string[];
  /** True open total across the whole candidate set — the value pagination must use. */
  total: number;
  /** Candidates carrying hours data (isOpen !== null). Zero ⇒ the filter is inapplicable
   *  and the caller should gracefully fall back to the unfiltered page (matches the legacy
   *  "no row supported ⇒ don't filter" degradation). */
  supportedCount: number;
}

/**
 * Select the open-now page from ranked candidates. Filter-before-paginate: keep candidates
 * whose openness resolved to `true` (dropping closed AND unsupported, matching the executor's
 * open-now post-filter semantics), preserve the incoming rank order, then slice the page.
 * Deduplicates by restaurantId defensively (the candidate query is DISTINCT ON restaurant,
 * but the selector must not double-count if that ever changes).
 */
export const selectOpenNowRestaurantPage = (
  candidatesInRankOrder: readonly OpenNowCandidate[],
  pagination: { skip: number; take: number },
): OpenNowPageSelection => {
  const openIds: string[] = [];
  const seen = new Set<string>();
  let supportedCount = 0;

  for (const candidate of candidatesInRankOrder) {
    if (candidate.isOpen !== null) {
      supportedCount += 1;
    }
    if (candidate.isOpen !== true) {
      continue;
    }
    if (seen.has(candidate.restaurantId)) {
      continue;
    }
    seen.add(candidate.restaurantId);
    openIds.push(candidate.restaurantId);
  }

  const skip = Math.max(0, pagination.skip);
  const take = Math.max(0, pagination.take);
  const pageIds = openIds.slice(skip, skip + take);

  return {
    pageIds,
    openIds,
    total: openIds.length,
    supportedCount,
  };
};
