import type { SearchResponse } from '../../../types';

const mergeById = <T extends Record<string, unknown>>(
  existing: T[],
  incoming: T[],
  getKey: (item: T) => string
): T[] => {
  if (!existing.length) {
    return incoming.slice();
  }
  const seen = new Set(existing.map((item) => getKey(item)));
  const merged = existing.slice();
  for (const item of incoming) {
    const key = getKey(item);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(item);
  }
  return merged;
};

export const mergeSearchResponses = (
  previous: SearchResponse | null,
  incoming: SearchResponse,
  append: boolean
): SearchResponse => {
  if (!append || !previous) {
    return incoming;
  }

  const mergedFood = mergeById(
    previous.food ?? [],
    incoming.food ?? [],
    (item) => item.connectionId
  );
  const mergedRestaurants = mergeById(
    previous.restaurants ?? [],
    incoming.restaurants ?? [],
    (item) => item.restaurantId
  );

  return {
    ...incoming,
    food: mergedFood,
    restaurants: mergedRestaurants,
    metadata: {
      ...previous.metadata,
      ...incoming.metadata,
    },
  };
};
