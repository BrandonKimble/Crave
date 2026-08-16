import type { FoodResult, RestaurantResult, SearchResponse } from '../../../../types';

// "Include similar" page-1 zero-network flip (owner's design, plans/search-flow-plan.md
// context): page-1 responses carry the exact result set in `dishes`/`places` plus the
// prefetched dense-sibling sets in `similarDishes`/`similarPlaces`. The FIRST flip on
// page 1 therefore swaps between two locally-derivable variants of the SAME committed
// response:
//   ON  → union (exact ∪ similar), pure Crave-Score order, `similar*` arrays retained so
//         the flip back is also local.
//   OFF → exact-only rows (`exactMatch !== false`), with the dropped siblings moved back
//         into the `similar*` arrays so a later re-flip is still local.
// Rows are tagged by the API: `exactMatch === false` marks a dense sibling.

const resolveOrderingScore = (row: {
  craveScore: number | null;
  craveScoreExact?: number;
}): number =>
  typeof row.craveScoreExact === 'number' && Number.isFinite(row.craveScoreExact)
    ? row.craveScoreExact
    : typeof row.craveScore === 'number' && Number.isFinite(row.craveScore)
      ? row.craveScore
      : Number.NEGATIVE_INFINITY;

// Merge two already-ordered (Crave-Score desc) lists into one Crave-Score-desc list.
// A classic two-pointer merge keeps the API's own ordering within each list (stable) and
// only interleaves across lists — we deliberately do NOT blind re-sort the API arrays.
const mergeByCraveScoreDesc = <T extends { craveScore: number | null; craveScoreExact?: number }>(
  primary: T[],
  secondary: T[],
  keyOf: (row: T) => string
): T[] => {
  const seen = new Set(primary.map(keyOf));
  const dedupedSecondary = secondary.filter((row) => !seen.has(keyOf(row)));
  const merged: T[] = [];
  let i = 0;
  let j = 0;
  while (i < primary.length || j < dedupedSecondary.length) {
    if (j >= dedupedSecondary.length) {
      merged.push(primary[i++]);
      continue;
    }
    if (i >= primary.length) {
      merged.push(dedupedSecondary[j++]);
      continue;
    }
    // Ties go to the exact (primary) row — exact wins the position.
    if (resolveOrderingScore(primary[i]) >= resolveOrderingScore(dedupedSecondary[j])) {
      merged.push(primary[i++]);
    } else {
      merged.push(dedupedSecondary[j++]);
    }
  }
  return merged;
};

const isSimilarRow = (row: { exactMatch?: boolean }): boolean => row.exactMatch === false;

export const hasIncludeSimilarLocalData = (response: SearchResponse | null): boolean => {
  if (response == null) {
    return false;
  }
  return (
    (response.similarDishes?.length ?? 0) > 0 ||
    (response.similarPlaces?.length ?? 0) > 0 ||
    (response.dishes ?? []).some(isSimilarRow) ||
    (response.places ?? []).some(isSimilarRow)
  );
};

// Returns the response variant for the requested toggle state, or null when the flip
// cannot be served locally (no similar data anywhere on the committed response).
// Returning the INPUT response (same reference) is valid and means "already in the
// requested state" — the caller treats that as a net-zero local swap (re-reveal only).
export const buildIncludeSimilarVariantResponse = (
  response: SearchResponse,
  includeSimilar: boolean
): SearchResponse | null => {
  if (!hasIncludeSimilarLocalData(response)) {
    return null;
  }
  const dishes = response.dishes ?? [];
  const places = response.places ?? [];
  const rowsContainSimilar = dishes.some(isSimilarRow) || places.some(isSimilarRow);

  if (includeSimilar) {
    if (rowsContainSimilar) {
      // Rows already hold the union (e.g. the response was requested with
      // includeSimilar=true) — nothing to merge.
      return response;
    }
    const similarDishes = response.similarDishes ?? [];
    const similarPlaces = response.similarPlaces ?? [];
    const unionDishes = mergeByCraveScoreDesc(
      dishes,
      similarDishes.map((row) => ({ ...row, exactMatch: false }) as FoodResult),
      (row) => row.connectionId
    );
    const unionRestaurants = mergeByCraveScoreDesc(
      places,
      similarPlaces.map((row) => ({ ...row, exactMatch: false }) as RestaurantResult),
      (row) => row.placeId
    );
    return {
      ...response,
      dishes: unionDishes,
      places: unionRestaurants,
      metadata: {
        ...response.metadata,
        totalItemResults:
          (response.metadata?.totalItemResults ?? dishes.length) +
          (unionDishes.length - dishes.length),
        totalPlaceResults:
          (response.metadata?.totalPlaceResults ?? places.length) +
          (unionRestaurants.length - places.length),
      },
    };
  }

  if (!rowsContainSimilar) {
    // Rows are already exact-only.
    return response;
  }
  const exactDishes = dishes.filter((row) => !isSimilarRow(row));
  const exactRestaurants = places.filter((row) => !isSimilarRow(row));
  const droppedDishes = dishes.filter(isSimilarRow);
  const droppedRestaurants = places.filter(isSimilarRow);
  return {
    ...response,
    dishes: exactDishes,
    places: exactRestaurants,
    // Keep both sets in the session: the dropped siblings go back into the similar
    // arrays so the next flip ON is also zero-network.
    similarDishes: response.similarDishes?.length ? response.similarDishes : droppedDishes,
    similarPlaces: response.similarPlaces?.length ? response.similarPlaces : droppedRestaurants,
    metadata: {
      ...response.metadata,
      totalItemResults:
        (response.metadata?.totalItemResults ?? dishes.length) -
        (dishes.length - exactDishes.length),
      totalPlaceResults:
        (response.metadata?.totalPlaceResults ?? places.length) -
        (places.length - exactRestaurants.length),
    },
  };
};
