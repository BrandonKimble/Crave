import { useQuery } from '@tanstack/react-query';
import {
  favoriteListsService,
  type FavoriteListDetail,
  type FavoriteListSummary,
  type FavoriteListType,
  type FavoriteListVisibility,
} from '../services/favorite-lists';

export const favoriteListKeys = {
  all: ['favorite-lists'] as const,
  list: (listType?: FavoriteListType, visibility?: FavoriteListVisibility) =>
    ['favorite-lists', listType ?? 'all', visibility ?? 'all'] as const,
  detail: (listId: string) => ['favorite-list', listId] as const,
};

export const useFavoriteLists = (params: {
  listType?: FavoriteListType;
  visibility?: FavoriteListVisibility;
  enabled?: boolean;
}) => {
  const enabled = params.enabled ?? true;
  return useQuery<FavoriteListSummary[]>({
    queryKey: favoriteListKeys.list(params.listType, params.visibility),
    queryFn: () => favoriteListsService.list(params),
    enabled,
    staleTime: 1000 * 20,
  });
};

export const useFavoriteListDetail = (listId: string | null, enabled = true) =>
  useQuery<FavoriteListDetail>({
    queryKey: listId ? favoriteListKeys.detail(listId) : ['favorite-list', 'none'],
    queryFn: () => {
      if (!listId) {
        throw new Error('Missing listId');
      }
      return favoriteListsService.get(listId);
    },
    enabled: Boolean(listId) && enabled,
    staleTime: 1000 * 10,
  });
