import type { HomeFeedCity, HomeFeedResponse, HomeShelf, HomeShelfList } from './home-types';

/**
 * PURE home-feed normalization (hermetic-jest home — no api import).
 */
const normalizeCity = (raw: unknown): HomeFeedCity | null => {
  if (raw == null || typeof raw !== 'object') {
    return null;
  }
  const city = raw as { placeId?: unknown; name?: unknown };
  return typeof city.placeId === 'string' && typeof city.name === 'string'
    ? { placeId: city.placeId, name: city.name }
    : null;
};

const normalizeShelfList = (raw: unknown): HomeShelfList | null => {
  if (raw == null || typeof raw !== 'object') {
    return null;
  }
  const list = raw as Record<string, unknown>;
  if (typeof list.listId !== 'string' || typeof list.title !== 'string') {
    return null;
  }
  return {
    listId: list.listId,
    title: list.title,
    subtitle: typeof list.subtitle === 'string' ? list.subtitle : null,
    iconKey: typeof list.iconKey === 'string' ? list.iconKey : '',
    listType: typeof list.listType === 'string' ? list.listType : 'restaurant',
    itemCount: typeof list.itemCount === 'number' ? list.itemCount : 0,
    previewNames: Array.isArray(list.previewNames)
      ? list.previewNames.filter((name): name is string => typeof name === 'string')
      : [],
  };
};

const normalizeShelf = (raw: unknown): HomeShelf | null => {
  if (raw == null || typeof raw !== 'object') {
    return null;
  }
  const shelf = raw as Record<string, unknown>;
  // The API emits `key`; accept `shelfKey` too so the client vocabulary is stable.
  const shelfKey =
    typeof shelf.shelfKey === 'string'
      ? shelf.shelfKey
      : typeof shelf.key === 'string'
        ? shelf.key
        : null;
  if (shelfKey == null || typeof shelf.title !== 'string') {
    return null;
  }
  const lists = Array.isArray(shelf.lists)
    ? shelf.lists.map(normalizeShelfList).filter((list): list is HomeShelfList => list != null)
    : [];
  return { shelfKey, title: shelf.title, lists };
};

export const normalizeHomeFeedResponse = (raw: unknown): HomeFeedResponse => {
  if (raw == null || typeof raw !== 'object') {
    return { resolvedCity: null, shelves: [], liveCities: [] };
  }
  const payload = raw as Record<string, unknown>;
  const shelves = Array.isArray(payload.shelves)
    ? payload.shelves.map(normalizeShelf).filter((shelf): shelf is HomeShelf => shelf != null)
    : [];
  const liveCities = Array.isArray(payload.liveCities)
    ? payload.liveCities.map(normalizeCity).filter((city): city is HomeFeedCity => city != null)
    : [];
  return {
    resolvedCity: normalizeCity(payload.resolvedCity),
    shelves,
    liveCities,
  };
};
