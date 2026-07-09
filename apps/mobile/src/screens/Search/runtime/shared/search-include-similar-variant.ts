import type { FoodResult, RestaurantResult, SearchResponse } from '../../../../types';

// "Include similar" page-1 zero-network flip (owner's design, plans/search-flow-plan.md
// context): page-1 responses carry the exact result set in `dishes`/`restaurants` plus the
// prefetched dense-sibling sets in `similarDishes`/`similarRestaurants`. The FIRST flip on
// page 1 therefore swaps between two locally-derivable variants of the SAME committed
// response:
//   ON  → union (exact ∪ similar), pure Crave-Score order, `similar*` arrays retained so
//         the flip back is also local.
//   OFF → exact-only rows (`exactMatch !== false`), with the dropped siblings moved back
//         into the `similar*` arrays so a later re-flip is still local.
// Rows are tagged by the API: `exactMatch === false` marks a dense sibling.

const resolveOrderingScore = (row: { craveScore: number; craveScoreExact?: number }): number =>
  typeof row.craveScoreExact === 'number' && Number.isFinite(row.craveScoreExact)
    ? row.craveScoreExact
    : typeof row.craveScore === 'number' && Number.isFinite(row.craveScore)
      ? row.craveScore
      : Number.NEGATIVE_INFINITY;

// Merge two already-ordered (Crave-Score desc) lists into one Crave-Score-desc list.
// A classic two-pointer merge keeps the API's own ordering within each list (stable) and
// only interleaves across lists — we deliberately do NOT blind re-sort the API arrays.
const mergeByCraveScoreDesc = <T extends { craveScore: number; craveScoreExact?: number }>(
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
    (response.similarRestaurants?.length ?? 0) > 0 ||
    (response.dishes ?? []).some(isSimilarRow) ||
    (response.restaurants ?? []).some(isSimilarRow)
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
  const restaurants = response.restaurants ?? [];
  const rowsContainSimilar = dishes.some(isSimilarRow) || restaurants.some(isSimilarRow);

  if (includeSimilar) {
    if (rowsContainSimilar) {
      // Rows already hold the union (e.g. the response was requested with
      // includeSimilar=true) — nothing to merge.
      return response;
    }
    const similarDishes = response.similarDishes ?? [];
    const similarRestaurants = response.similarRestaurants ?? [];
    const unionDishes = mergeByCraveScoreDesc(
      dishes,
      similarDishes.map((row) => ({ ...row, exactMatch: false }) as FoodResult),
      (row) => row.connectionId
    );
    const unionRestaurants = mergeByCraveScoreDesc(
      restaurants,
      similarRestaurants.map((row) => ({ ...row, exactMatch: false }) as RestaurantResult),
      (row) => row.restaurantId
    );
    return {
      ...response,
      dishes: unionDishes,
      restaurants: unionRestaurants,
      metadata: {
        ...response.metadata,
        totalFoodResults:
          (response.metadata?.totalFoodResults ?? dishes.length) +
          (unionDishes.length - dishes.length),
        totalRestaurantResults:
          (response.metadata?.totalRestaurantResults ?? restaurants.length) +
          (unionRestaurants.length - restaurants.length),
      },
    };
  }

  if (!rowsContainSimilar) {
    // Rows are already exact-only.
    return response;
  }
  const exactDishes = dishes.filter((row) => !isSimilarRow(row));
  const exactRestaurants = restaurants.filter((row) => !isSimilarRow(row));
  const droppedDishes = dishes.filter(isSimilarRow);
  const droppedRestaurants = restaurants.filter(isSimilarRow);
  return {
    ...response,
    dishes: exactDishes,
    restaurants: exactRestaurants,
    // Keep both sets in the session: the dropped siblings go back into the similar
    // arrays so the next flip ON is also zero-network.
    similarDishes: response.similarDishes?.length ? response.similarDishes : droppedDishes,
    similarRestaurants: response.similarRestaurants?.length
      ? response.similarRestaurants
      : droppedRestaurants,
    metadata: {
      ...response.metadata,
      totalFoodResults:
        (response.metadata?.totalFoodResults ?? dishes.length) -
        (dishes.length - exactDishes.length),
      totalRestaurantResults:
        (response.metadata?.totalRestaurantResults ?? restaurants.length) -
        (restaurants.length - exactRestaurants.length),
    },
  };
};
