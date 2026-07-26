import type { UserListSummary } from '../../services/user-lists';
import type { ListsSortMode } from './runtime/lists-home-controls-store';

/**
 * Wave-2 §2: system defaults are REGULAR lists — one uniform ordering, no
 * pinned prefix. Favorites-as-kind exception (Liked-Songs model): the ONE
 * kind='favorites' list (when it exists) is PINNED FIRST under every sort
 * mode; the four signup-default kinds keep the uniform ordering.
 */
export const sortListsForDisplay = (
  lists: readonly UserListSummary[],
  sortMode: ListsSortMode
): UserListSummary[] => {
  const sorted =
    sortMode === 'custom'
      ? [...lists].sort((a, b) => a.position - b.position)
      : [...lists].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
  const favoritesIndex = sorted.findIndex((list) => list.kind === 'favorites');
  if (favoritesIndex > 0) {
    const [favorites] = sorted.splice(favoritesIndex, 1);
    sorted.unshift(favorites);
  }
  return sorted;
};
